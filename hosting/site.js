import { readDraftRequest } from "../draft-request.js";
import { requestOpenRouterDraft } from "../public/ai-draft.js";

const json = (body, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

export function makeSite(assets, { fetchProvider = fetch } = {}) {
  let pending = 0;
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const signedIn = Boolean(request.headers.get("oai-authenticated-user-id"));
      const key = env.OPENROUTER_API_KEY;
      if (request.method === "GET" && url.pathname === "/api/status") {
        return json({ enabled: false, openRouter: Boolean(signedIn && key) });
      }
      if (request.method === "POST" && url.pathname === "/api/openrouter") {
        if (!signedIn || request.headers.get("Origin") !== url.origin) {
          return json({ error: "Open the signed-in Card Studio directly to draft with the saved key." }, 403);
        }
        if (!key) return json({ error: "OpenRouter is unavailable. Quick fill is available offline." }, 503);
        if (!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type") ?? "") || !request.body) {
          return json({ error: "Send a JSON card brief." }, 415);
        }
        if (pending >= 2) return json({ error: "The studio is busy. Try again shortly." }, 429);
        pending++;
        try {
          let input;
          try {
            input = await readDraftRequest(request.body);
          } catch (error) {
            return json({ error: error instanceof SyntaxError ? "The card brief is invalid." : error.message }, error.status ?? 400);
          }
          try {
            const draft = await requestOpenRouterDraft(input, { apiKey: key, model: input.model, request: fetchProvider });
            return json({ draft });
          } catch (error) {
            return json({ error: error.message }, 502);
          }
        } finally {
          pending--;
        }
      }
      if (request.method === "GET" && Object.hasOwn(assets, url.pathname)) {
        const { mime, body } = assets[url.pathname];
        return new Response(body, { headers: {
          "Content-Type": `${mime}; charset=utf-8`,
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        } });
      }
      return json({ error: "Page not found." }, 404);
    },
  };
}
