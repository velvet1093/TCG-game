import { test } from "node:test";
import assert from "node:assert/strict";
import { OPENROUTER_DEFAULT_MODEL, requestOpenRouterDraft } from "../public/ai-draft.js";

const draft = { name: "Other name", faction: "tide", cost: 2, attack: 20, health: 60, active1: { name: "Wave Edge", concept: "", effects: ["hit"] }, active2: { name: "Undertow Toll", concept: "", effects: ["hit", "drain"] }, ability: "haste", flavor: "A storm follows." };
const reply = () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(draft) } }] });

test("OpenRouter gets a structured brief and the returned card keeps its field locks", async () => {
  const locked = { name: "Wave Runner", attack: 40, rarity: "legendary" };
  const brief = { name: locked.name, faction: "tide", rarity: locked.rarity, concept: "An apprentice surfer", locked };
  const result = await requestOpenRouterDraft(brief, {
    apiKey: " sample-key ",
    request: async (url, options) => {
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, "Bearer sample-key");
      assert.doesNotMatch(options.body, /sample-key/);
      const sent = JSON.parse(options.body);
      assert.equal(sent.model, OPENROUTER_DEFAULT_MODEL);
      assert.equal(sent.model, "google/gemini-3.5-flash-lite");
      assert.equal(sent.provider.require_parameters, true);
      assert.equal(sent.response_format.json_schema.strict, true);
      assert.ok(sent.response_format.json_schema.schema.required.includes("active2"));
      assert.deepEqual(sent.response_format.json_schema.schema.properties.rarity.enum, ["common", "uncommon", "rare", "legendary"]);
      assert.match(sent.messages[0].content, /legendary \(minimum 4 Pulse, \+100 unit stat budget\)/);
      assert.equal(sent.messages[1].content.length, 1);
      assert.deepEqual(JSON.parse(sent.messages[1].content[0].text), brief);
      return reply();
    },
  });
  assert.deepEqual(result, { ...draft, name: "Wave Runner", rarity: "legendary", attack: 40, cost: 4 });
});

test("OpenRouter accepts a model ID and sends artwork only when included", async () => {
  const art = "data:image/webp;base64,AA==";
  await requestOpenRouterDraft({ concept: "A unit", art, locked: {} }, {
    apiKey: "sample-key",
    model: "author/custom-model:free",
    request: async (_, options) => {
      const sent = JSON.parse(options.body);
      assert.equal(sent.model, "author/custom-model:free");
      assert.deepEqual(sent.messages[1].content[1], { type: "image_url", image_url: { url: art } });
      return reply();
    },
  });
});

test("OpenRouter requests only ability fields for ability-only drafts", async () => {
  const brief = { kind: "item", mode: "abilities", name: "Field Dressing", locked: {}, current: { cost: 1 } };
  const result = await requestOpenRouterDraft(brief, {
    apiKey: "sample-key",
    request: async (_, options) => {
      const sent = JSON.parse(options.body);
      assert.deepEqual(sent.response_format.json_schema.schema.required, ["itemEffect", "recognizedCharacter"]);
      assert.deepEqual(JSON.parse(sent.messages[1].content[0].text).current, { cost: 1 });
      return Response.json({ choices: [{ message: { content: '{"itemEffect":"heal-core","cost":6}' } }] });
    },
  });
  assert.deepEqual(result, { itemEffect: "heal-ally" });
});

test("OpenRouter surfaces credit, model, and malformed response errors", async () => {
  const brief = { concept: "A unit", locked: {} };
  const noCredits = { apiKey: "sample-key", request: async () => new Response(null, { status: 402 }) };
  await assert.rejects(requestOpenRouterDraft(brief, noCredits), /insufficient credits/);
  await assert.rejects(requestOpenRouterDraft(brief, {
    ...noCredits, request: async () => Response.json({ error: { code: 404 } }),
  }), /model ID/);
  await assert.rejects(requestOpenRouterDraft(brief, {
    ...noCredits, request: async () => Response.json({ choices: [{ message: { content: "bad JSON" } }] }),
  }), /usable card draft/);
});
