import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeServer } from "../server.js";

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
    name: "Test Card", faction: "tide", cost: 2, attack: 3, health: 1, ability: "draw", flavor: "Moonfall.",
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
