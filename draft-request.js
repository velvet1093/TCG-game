import { FACTIONS, ITEM_EFFECTS, RARITIES, balanceStage, draftFields, lockedCardIssue } from "./public/cards.js";
import { readAttack } from "./public/attacks.js";

export async function readDraftRequest(body) {
  let size = 0;
  let json = "";
  const decoder = new TextDecoder();
  for await (const chunk of body) {
    size += chunk.length;
    if (size > 1_550_000) {
      const error = new Error("Artwork is too large for auto-fill.");
      error.status = 413;
      throw error;
    }
    json += decoder.decode(chunk, { stream: true });
  }
  const data = JSON.parse(json + decoder.decode());
  const trim = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const name = trim(data?.name, 44);
  const character = trim(data?.character, 80) || undefined;
  const concept = trim(data?.concept, 600);
  const faction = typeof data?.faction === "string" && Object.hasOwn(FACTIONS, data.faction) ? data.faction : "";
  const rarity = typeof data?.rarity === "string" && Object.hasOwn(RARITIES, data.rarity) ? data.rarity : undefined;
  const kind = data?.kind === "item" ? "item" : undefined;
  const stage = kind === "item" || data?.stage === undefined ? undefined : balanceStage(data.stage);
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
  const issue = lockedCardIssue(locked, kind, stage);
  if (issue) throw new Error(issue);
  const lockCount = Object.keys(locked).length;
  if (lockCount === fields.length) throw new Error("Unlock a field for auto-fill.");
  if (!mode && !name && !character && !concept && !faction && !rarity && !art && !lockCount) {
    throw new Error("Add a name, concept, element, rarity, artwork, or locked field first.");
  }
  return { name, character, concept, faction, rarity, art, locked, kind, stage, mode, current, model: trim(data?.model, 160) };
}
