import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSite } from "../hosting/site.js";

const origin = "https://arena.example.test";
const env = { OPENROUTER_API_KEY: "mock-provider-secret" };
const identity = { "oai-authenticated-user-id": "test-owner" };
const request = (headers, body) => new Request(`${origin}/api/openrouter`, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});
const brief = { concept: "An evolved tide guard", stage: 2, locked: { rarity: "common" } };

test("hosted OpenRouter authenticates callers, uses the server secret and never returns it", async () => {
  let requests = 0;
  const site = makeSite({}, {
    fetchProvider: async (url, options) => {
      requests++;
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(options.headers.Authorization, "Bearer mock-provider-secret");
      const sent = JSON.parse(options.body);
      assert.equal(JSON.parse(sent.messages[1].content[0].text).stage, 2);
      const card = { name: "Tide Guard", faction: "tide", rarity: "common", cost: 3,
        attack: 40, health: 110, ability: "basic", flavor: "The river rose." };
      return Response.json({ choices: [{ message: { content: JSON.stringify(card) } }] });
    },
  });
  assert.deepEqual(await (await site.fetch(new Request(`${origin}/api/status`), env)).json(),
    { enabled: false, openRouter: false });
  const status = await site.fetch(new Request(`${origin}/api/status`, { headers: identity }), env);
  assert.deepEqual(await status.json(), { enabled: false, openRouter: true });
  assert.equal((await site.fetch(request({ Origin: origin }, brief), env)).status, 403);
  assert.equal((await site.fetch(request({ ...identity, Origin: "https://unrelated.test" }, brief), env)).status, 403);
  assert.equal((await site.fetch(request({ ...identity, Origin: origin }, brief), {})).status, 503);
  const result = await site.fetch(request({ ...identity, Origin: origin }, brief), env);
  assert.equal(result.status, 200);
  const text = await result.text();
  assert.doesNotMatch(text, /mock-provider-secret/);
  assert.equal(JSON.parse(text).draft.health, 110);
  assert.equal(requests, 1);
});
