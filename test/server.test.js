import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeServer } from "../server.js";
import { emptyAttack } from "../public/attacks.js";

async function boot(t, options) {
  const server = makeServer(options).listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

const post = (url, brief, extraHeaders) => fetch(`${url}/api/draft`, {
  method: "POST", headers: { "Content-Type": "application/json", ...extraHeaders }, body: JSON.stringify(brief),
});

test("the game loads when the AI provider is disabled", async (t) => {
  const url = await boot(t, { apiKey: "" });
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Lanternwake Arena/);
  assert.deepEqual(await (await fetch(`${url}/api/status`)).json(), { enabled: false });
  assert.equal((await post(url, { concept: "Lantern mage" })).status, 503);
  assert.equal((await fetch(`${url}/.env`)).status, 404);
});

test("the server requests structured text with optional art and validates returned stats", async (t) => {
  let sent;
  const url = await boot(t, {
    apiKey: "test",
    request: async (_, { body }) => {
      sent = JSON.parse(body);
      const draft = { name: "Provider name", faction: "veil", cost: 2, attack: 4, health: 8, ability: "draw", flavor: "Moonfall." };
      return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(draft) }] }] });
    },
  });
  const reply = await post(url, { name: "Test Card", faction: "tide", concept: "Water mage" });
  assert.equal(reply.status, 200);
  assert.deepEqual((await reply.json()).draft, {
    name: "Test Card", faction: "tide", rarity: "common", cost: 2, attack: 3, health: 1, active1: emptyAttack(), active2: emptyAttack(), ability: "draw", flavor: "Moonfall.",
  });
  assert.equal(sent.text.format.strict, true);
  assert.equal(sent.store, false);
  assert.equal(sent.input[0].content.length, 1);
  const image = "data:image/png;base64,AA==";
  assert.equal((await post(url, { art: image })).status, 200);
  assert.equal(sent.input[0].content[1].image_url, image);
  assert.equal((await post(url, { art: "https://example.test/image" })).status, 400);
  assert.equal((await post(url, { concept: "Lantern mage" }, { Origin: "https://example.test" })).status, 403);
});

test("a provider error returns a usable studio error", async (t) => {
  const url = await boot(t, { apiKey: "test", request: async () => new Response(null, { status: 401 }) });
  const response = await post(url, { concept: "Moonwater mage" });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /Quick fill/);
});

test("the local provider drafts items without unit fields", async (t) => {
  const url = await boot(t, {
    apiKey: "test",
    request: async (_, { body }) => {
      const sent = JSON.parse(body);
      assert.deepEqual(sent.text.format.schema.required, ["name", "faction", "rarity", "cost", "itemEffect", "flavor", "recognizedCharacter"]);
      assert.equal(JSON.parse(sent.input[0].content[0].text).rarity, "rare");
      const draft = { name: "Flash Charge", faction: "ember", rarity: "rare", cost: 1, itemEffect: "damage-enemy", flavor: "One red fuse." };
      return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(draft) }] }] });
    },
  });
  const response = await post(url, { kind: "item", rarity: "rare", concept: "damage a rival unit", locked: {} });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).draft, {
    kind: "item", name: "Flash Charge", faction: "ember", rarity: "rare", cost: 3, itemEffect: "damage-enemy", flavor: "One red fuse.",
  });
});

test("AI receives the locks as context and fits its result around them", async (t) => {
  const requests = [];
  const url = await boot(t, {
    apiKey: "test",
    request: async (_, { body }) => {
      requests.push(JSON.parse(body));
      const draft = { name: "Provider Name", faction: "tide", cost: 1, attack: 1, health: 2, ability: "haste", flavor: "Sea breeze." };
      return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(draft) }] }] });
    },
  });
  const locked = { name: "Wind Herald", attack: 5, health: 4 };
  const reply = await post(url, { name: locked.name, locked });
  assert.equal(reply.status, 200);
  const { draft } = await reply.json();
  assert.deepEqual(Object.fromEntries(Object.keys(locked).map((key) => [key, draft[key]])), locked);
  assert.equal(draft.cost, 5);
  assert.deepEqual(JSON.parse(requests[0].input[0].content[0].text).locked, locked);
  assert.equal((await post(url, { concept: "Guardian", locked: { cost: 1, attack: 4 } })).status, 400);
  assert.equal(requests.length, 1);
  const unlocked = await post(url, { name: locked.name, locked: {} });
  assert.equal((await unlocked.json()).draft.name, "Provider Name");
});
