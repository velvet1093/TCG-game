export const ATTACK_SLOTS = ["active1", "active2"];
export const ATTACK_EFFECTS = {
  hit: { label: "Lane damage", pulse: 0, text: "Deal base Attack damage across this lane." },
  heavy: { label: "Boosted lane damage", pulse: 1, text: "Deal base Attack +2 damage across this lane." },
  splash: { label: "Adjacent damage", pulse: 1, text: "Deal 1 damage to each adjacent enemy unit." },
  drain: { label: "Core drain", pulse: 1, text: "Restore 2 Core health if this move's lane hit deals damage." },
  mend: { label: "Self-heal", pulse: 1, text: "Restore up to 3 HP to this unit." },
  stun: { label: "Stun", pulse: 2, text: "The opposing unit in this lane skips its next action." },
  draw: { label: "Draw", pulse: 1, text: "Draw 1 card." },
};

const legacyAttacks = {
  strike: { name: "Strike", effects: ["hit"] },
  lunge: { name: "Lunge", effects: ["heavy"] },
  sweep: { name: "Sweep", effects: ["hit", "splash"] },
  siphon: { name: "Siphon", effects: ["hit", "drain"] },
  recover: { name: "Recover", effects: ["mend"] },
};

export const emptyAttack = () => ({ name: "", concept: "", effects: [] });

export function readAttack(value) {
  if (typeof value === "string") return Object.hasOwn(legacyAttacks, value) ? { concept: "", ...legacyAttacks[value] } : emptyAttack();
  return value ?? emptyAttack();
}

export function activeAttacks(card) {
  return ATTACK_SLOTS.map((slot) => ({ ...readAttack(card[slot]), slot }))
    .filter((move) => typeof move.name === "string" && move.name.trim() && Array.isArray(move.effects) && move.effects.length);
}

export function attackPulse(move) {
  return move.effects.reduce((sum, id) => sum + ATTACK_EFFECTS[id].pulse, 0);
}

export function attackIssue(value) {
  const move = readAttack(value);
  if (typeof move.name !== "string" || move.name.length > 44 || typeof move.concept !== "string" || move.concept.length > 160) {
    return "Keep the attack name within 44 characters and the concept within 160.";
  }
  if (!Array.isArray(move.effects) || move.effects.length > 2 ||
      move.effects.some((id) => typeof id !== "string" || !Object.hasOwn(ATTACK_EFFECTS, id))) {
    return "Choose up to two supported combat effects.";
  }
  if (!move.name.trim()) return move.concept.trim() || move.effects.length ? "Name the attack or clear its fields." : "";
  if (!move.effects.length) return "Choose a combat effect or use Auto-fill effects.";
  if (new Set(move.effects).size !== move.effects.length) return "Choose two different combat effects.";
  if (move.effects.includes("hit") && move.effects.includes("heavy")) return "Choose one lane damage effect.";
  if (move.effects.includes("drain") && !move.effects.some((id) => id === "hit" || id === "heavy")) {
    return "Core drain needs a lane damage effect.";
  }
  return "";
}

export function inferAttackEffects({ name, concept }) {
  const text = `${name} ${concept}`.toLowerCase();
  const effects = [];
  const leech = /drain|siphon|leech|steals? (?:health|life)|life steal/.test(text);
  if (/heavy|crush|burst|pierc|finisher|slash|cleave|blast|damage|punch|lunge|strike|\bhits?\b/.test(text) || leech) {
    effects.push(/heavy|crush|burst|finisher/.test(text) ? "heavy" : "hit");
  }
  if (leech) effects.push("drain");
  if (/stun|freeze|freezes|time stop|stops? time|paraly[sz]|cannot act|skip.*turn/.test(text)) effects.push("stun");
  if (/swe[ep]+|nearby|adjacent|all enem|shockwave|surrounding|area/.test(text)) effects.push("splash");
  if (/heal|recover|regenerat|mend|restore.*(?:health|hp|self)/.test(text)) effects.push("mend");
  if (/draw|pull a card|call a card/.test(text)) effects.push("draw");
  return effects.length ? effects.slice(0, 2) : ["hit"];
}

export function resolveAttackEffects(move, proposed) {
  if (!move.name.trim()) return [];
  const effects = Array.isArray(proposed) ? [...new Set(proposed
    .filter((id) => typeof id === "string" && Object.hasOwn(ATTACK_EFFECTS, id)))] : [];
  if (effects.includes("heavy") && effects.includes("hit")) effects.splice(effects.indexOf("hit"), 1);
  if (effects.includes("drain") && !effects.includes("hit") && !effects.includes("heavy")) effects.unshift("hit");
  if (effects.includes("drain") && effects.indexOf("drain") < 2) {
    const primary = effects.find((id) => id === "hit" || id === "heavy");
    return [primary, "drain"];
  }
  return effects.length ? effects.slice(0, 2) : inferAttackEffects(move);
}

export function fitAttack(value) {
  const move = readAttack(value);
  if (typeof move.name !== "string" || !move.name.trim()) return emptyAttack();
  const result = {
    name: move.name.trim().slice(0, 44),
    concept: typeof move.concept === "string" ? move.concept.trim().slice(0, 160) : "",
  };
  return { ...result, effects: resolveAttackEffects(result, move.effects) };
}

export function sameAttack(first, second) {
  const name = (value) => {
    const { name } = readAttack(value);
    return typeof name === "string" ? name.trim().toLowerCase() : "";
  };
  const a = name(first);
  return Boolean(a && a === name(second));
}
