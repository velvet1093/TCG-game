import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { FACTIONS, ITEM_EFFECTS, RARITIES, draftFields, lockedCardIssue } from "./public/cards.js";
import { readAttack } from "./public/attacks.js";
import { draftInstructionsFor, draftSchemaFor, draftText, normalizeDraft } from "./public/ai-draft.js";

const assets = {
  "/": ["index.html", "text/html"],
  "/app.js": ["app.js", "text/javascript"],
  "/ai-draft.js": ["ai-draft.js", "text/javascript"],
  "/attacks.js": ["attacks.js", "text/javascript"],
  "/cards.js": ["cards.js", "text/javascript"],
  "/engine.js": ["engine.js", "text/javascript"],
  "/lore.js": ["lore.js", "text/javascript"],
  "/styles.css": ["styles.css", "text/css"],
};

function respond(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

async function readDraftRequest(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_550_000) {
      const error = new Error("Artwork is too large for auto-fill.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const trim = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const name = trim(data?.name, 44);
  const character = trim(data?.character, 80) || undefined;
  const concept = trim(data?.concept, 600);
  const faction = typeof data?.faction === "string" && Object.hasOwn(FACTIONS, data.faction) ? data.faction : "";
  const rarity = typeof data?.rarity === "string" && Object.hasOwn(RARITIES, data.rarity) ? data.rarity : undefined;
  const kind = data?.kind === "item" ? "item" : undefined;
  const mode = data?.mode === "abilities" ? "abilities" : data?.mode === "effects" && kind !== "item" ? "effects" : undefined;
  const fields = draftFields(kind, mode);
  const currentAttack = (value) => {
    const move = readAttack(value);
    return { name: trim(move.name, 44), concept: trim(move.concept, 160) };
  };
  const current = mode ? {
    rarity: typeof data.current?.rarity === "string" && Object.hasOwn(RARITIES, data.current.rarity) ? data.current.rarity : rarity,
    itemEffect: kind === "item" && typeof data.current?.itemEffect === "string" && Object.hasOwn(ITEM_EFFECTS, data.current.itemEffect)
      ? data.current.itemEffect : undefined,
    cost: Number.isInteger(data.current?.cost) ? data.current.cost : undefined,
    attack: kind !== "item" && Number.isInteger(data.current?.attack) ? data.current.attack : undefined,
    health: kind !== "item" && Number.isInteger(data.current?.health) ? data.current.health : undefined,
    flavor: trim(data.current?.flavor, 140),
    active1: kind !== "item" ? currentAttack(data.current?.active1) : undefined,
    active2: kind !== "item" ? currentAttack(data.current?.active2) : undefined,
  } : undefined;
  const art = typeof data?.art === "string" ? data.art : "";
  if (art && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(art)) {
    throw new Error("Use JPEG, PNG, or WebP artwork.");
  }
  let locked;
  if (data?.locked === undefined) {
    // Clients predating the lock controls treated a supplied name or faction as fixed.
    locked = mode ? {} : { ...(name && { name }), ...(faction && { faction }) };
  } else {
    if (!data.locked || Array.isArray(data.locked) || typeof data.locked !== "object" ||
        Object.keys(data.locked).some((key) => !fields.includes(key))) {
      throw new Error("Choose valid card fields to lock.");
    }
    locked = data.locked;
  }
  const issue = lockedCardIssue(locked, kind);
  if (issue) throw new Error(issue);
  const lockCount = Object.keys(locked).length;
  if (lockCount === fields.length) throw new Error("Unlock a field for auto-fill.");
  if (!mode && !name && !character && !concept && !faction && !rarity && !art && !lockCount) {
    throw new Error("Add a name, concept, element, rarity, artwork, or locked field first.");
  }
  return { name, character, concept, faction, rarity, art, locked, kind, mode, current };
}

async function requestDraft(input, { apiKey, model, request }) {
  const text = draftText(input);
  const content = [{ type: "input_text", text }];
  if (input.art) content.push({ type: "input_image", image_url: input.art, detail: "low" });
  const response = await request("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      model,
      store: false,
      instructions: draftInstructionsFor(input),
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "arena_card", strict: true, schema: draftSchemaFor(input) } },
      max_output_tokens: 800,
    }),
  });
  if (!response.ok) throw new Error("Provider error");
  const body = await response.json();
  if (body.status !== "completed") throw new Error("Incomplete model response");
  const output = body.output?.flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text").map((part) => part.text).join("");
  return normalizeDraft(JSON.parse(output), input);
}

export function makeServer({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || "gpt-4.1-mini",
  request = fetch,
} = {}) {
  let activeDrafts = 0;
  return createServer(async (req, res) => {
    const path = req.url?.split("?")[0];
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://openrouter.ai; frame-ancestors 'none'; base-uri 'none'");
    if (req.method === "GET" && Object.hasOwn(assets, path)) {
      const [file, type] = assets[path];
      try {
        const body = await readFile(new URL(`./public/${file}`, import.meta.url));
        res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
        res.end(body);
      } catch {
        respond(res, 500, { error: "Unable to load the game." });
      }
      return;
    }
    if (req.method === "GET" && path === "/api/status") return respond(res, 200, { enabled: Boolean(apiKey) });
    if (req.method !== "POST" || path !== "/api/draft") return respond(res, 404, { error: "Page not found." });
    const origin = req.headers.origin;
    if (origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(origin)) {
      return respond(res, 403, { error: "Open the card studio directly to use AI auto-fill." });
    }
    if (!apiKey) return respond(res, 503, { error: "AI auto-fill needs an API key. Quick fill is available offline." });
    if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) {
      return respond(res, 415, { error: "Send a JSON card brief." });
    }
    if (activeDrafts >= 2) return respond(res, 429, { error: "The studio is busy. Try again shortly." });
    activeDrafts++;
    try {
      let input;
      try {
        input = await readDraftRequest(req);
      } catch (error) {
        return respond(res, error.status ?? 400, {
          error: error instanceof SyntaxError ? "The card brief is invalid." : error.message,
        });
      }
      try {
        return respond(res, 200, { draft: await requestDraft(input, { apiKey, model, request }) });
      } catch {
        return respond(res, 502, { error: "AI auto-fill couldn’t complete this draft. Try again or use Quick fill." });
      }
    } finally {
      activeDrafts--;
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 3000);
  makeServer().listen(port, host, () => console.log(`Lanternwake Arena · http://${host}:${port}`));
}
