import { draftFlavor } from "./lore.js";

export const FACTIONS = {
  ember: { name: "Ember", icon: "✦", color: "#fc896b" },
  tide: { name: "Tide", icon: "≋", color: "#72c7ef" },
  grove: { name: "Grove", icon: "❋", color: "#91cf83" },
  veil: { name: "Veil", icon: "◈", color: "#c1a3ff" },
  storm: { name: "Storm", icon: "ϟ", color: "#f2cb68" },
  frost: { name: "Frost", icon: "❄", color: "#a3e4f1" },
  stone: { name: "Stone", icon: "◆", color: "#dab28b" },
  dawn: { name: "Dawn", icon: "☼", color: "#ffdb91" },
  alloy: { name: "Alloy", icon: "⬡", color: "#bac6d7" },
};

export const ABILITIES = {
  basic: { name: "None", text: "No passive skill.", weight: 0 },
  haste: { name: "Rush", text: "Can act the turn it enters.", weight: 2 },
  guard: { name: "Ward", text: "Block the first point of damage from each opposing strike.", weight: 2 },
  draw: { name: "Insight", text: "On deploy, draw one card.", weight: 2 },
  heal: { name: "Renew", text: "On deploy, restore 2 Core health.", weight: 1 },
  ping: { name: "Spark", text: "On deploy, deal 1 damage to the opposing unit in this lane.", weight: 1 },
};

export const ACTIVE_SKILLS = {
  none: { name: "None", text: "Empty skill slot." },
  strike: { name: "Strike", pulse: 0, bonus: 0, text: "Strike across this lane." },
  lunge: { name: "Lunge", pulse: 1, bonus: 2, text: "Strike with +2 damage." },
  sweep: { name: "Sweep", pulse: 1, bonus: 0, text: "Strike and deal 1 damage to each adjacent rival unit." },
  siphon: { name: "Siphon", pulse: 1, bonus: 0, text: "Strike. If it deals damage, restore 2 Core health." },
  recover: { name: "Recover", pulse: 1, bonus: 0, text: "Restore 3 health to this injured unit." },
};

export const LIMITS = { deck: 15, copies: 3, core: 20, lanes: 3 };
export const CARD_FIELDS = ["name", "faction", "cost", "attack", "health", "active1", "active2", "ability", "flavor"];
export const FIELD_LABELS = {
  name: "Card name", faction: "Element", cost: "Deploy cost", attack: "Attack",
  health: "Health", active1: "Active skill 1", active2: "Active skill 2", ability: "Passive skill", flavor: "Flavor text",
};
const statRanges = { cost: [1, 6], attack: [1, 7], health: [1, 9] };
const skillDefaults = { active1: "strike", active2: "none" };

export function activeSkills(card) {
  return [card.active1 ?? skillDefaults.active1, card.active2 ?? skillDefaults.active2].filter((id) => id !== "none");
}

export function statBudget(cost) {
  return cost * 2 + 2;
}

function fieldIssue(field, value) {
  if (field === "name" && (typeof value !== "string" || !value.trim() || value.length > 44)) {
    return "Enter a name of 1–44 characters.";
  }
  if (field === "faction" && (typeof value !== "string" || !Object.hasOwn(FACTIONS, value))) return "Choose an element.";
  if (field === "ability" && (typeof value !== "string" || !Object.hasOwn(ABILITIES, value))) return "Choose a passive skill.";
  if (Object.hasOwn(skillDefaults, field) && (typeof value !== "string" || !Object.hasOwn(ACTIVE_SKILLS, value))) {
    return "Choose an active skill or leave the slot empty.";
  }
  if (field === "flavor" && (typeof value !== "string" || value.length > 140)) {
    return "Keep flavor text within 140 characters.";
  }
  if (Object.hasOwn(statRanges, field)) {
    const [min, max] = statRanges[field];
    if (!Number.isInteger(value) || value < min || value > max) return `${FIELD_LABELS[field]} must be ${min}–${max}.`;
  }
  return "";
}

export function cardIssues(card) {
  const issues = CARD_FIELDS.map((field) => fieldIssue(field, card[field] ?? skillDefaults[field])).filter(Boolean);
  if (card.active1 && card.active1 !== "none" && card.active1 === card.active2) issues.push("Choose two different active skills.");
  if (issues.length === 0 && card.attack + card.health + ABILITIES[card.ability].weight > statBudget(card.cost)) {
    issues.push("Reduce the stats or increase the Pulse cost to stay within budget.");
  }
  return issues;
}

export function lockedCardIssue(locked) {
  for (const field of CARD_FIELDS) {
    if (!Object.hasOwn(locked, field)) continue;
    const issue = fieldIssue(field, locked[field]);
    if (issue) return `Check the locked ${FIELD_LABELS[field].toLowerCase()}. ${issue}`;
  }
  if (locked.active1 && locked.active1 !== "none" && locked.active1 === locked.active2) {
    return "Unlock a duplicate active skill.";
  }
  const minimum = (locked.attack ?? 1) + (locked.health ?? 1) + (ABILITIES[locked.ability]?.weight ?? 0);
  if (minimum > statBudget(locked.cost ?? 6)) {
    return "The locked values exceed the stat budget. Unlock a stat, ability, or Pulse cost.";
  }
  return "";
}

// Fit the proposed card around the locks. Prefer the proposed ability, then
// the proposed cost. Trim unlocked stats before raising an unlocked cost.
export function fitDraft(draft, locked = {}) {
  const issue = lockedCardIssue(locked);
  if (issue) throw new Error(issue);
  const card = Object.fromEntries(CARD_FIELDS.map((key) => [key, Object.hasOwn(locked, key) ? locked[key] : draft[key] ?? skillDefaults[key]]));
  if (card.active1 === card.active2 && card.active1 !== "none") {
    const unlocked = Object.hasOwn(locked, "active2") ? "active1" : "active2";
    card[unlocked] = unlocked === "active1" && card.active2 !== "strike" ? "strike" : "none";
  }
  for (const [key, [min, max]] of Object.entries(statRanges)) {
    if (Number.isInteger(card[key])) card[key] = Math.min(max, Math.max(min, card[key]));
  }
  const minAttack = locked.attack ?? 1;
  const minHealth = locked.health ?? 1;
  const abilities = Object.hasOwn(locked, "ability") ? [locked.ability] : [...new Set([card.ability, "basic"])];
  const costs = Object.hasOwn(locked, "cost") ? [locked.cost] : [1, 2, 3, 4, 5, 6].filter((cost) => cost >= card.cost);
  for (const ability of abilities) {
    if (!Object.hasOwn(ABILITIES, ability)) continue;
    for (const cost of costs) {
      const room = statBudget(cost) - ABILITIES[ability].weight;
      if (room < minAttack + minHealth) continue;
      const attack = Math.min(card.attack, room - minHealth);
      const health = Math.min(card.health, room - attack);
      const fitted = { ...card, cost, attack, health, ability };
      if (cardIssues(fitted).length === 0) return fitted;
    }
  }
  throw new Error(cardIssues(card)[0] || "Couldn’t generate a valid card.");
}

const sample = (id, name, faction, cost, attack, health, ability, flavor, active2 = "none") =>
  ({ id, name, faction, cost, attack, health, ability, flavor, active1: "strike", active2, art: "" });

export const STARTER_CARDS = [
  sample("matchstick", "Matchstick Familiar", "ember", 1, 1, 2, "ping", "A little blaze goes a long way."),
  sample("cinder", "Cinder Courier", "ember", 2, 2, 2, "haste", "By the time the lantern swings, she is gone."),
  sample("bell", "Bellforge Brawler", "ember", 3, 4, 4, "basic", "The bells remember every blow."),
  sample("sun", "Sunspoke Duelist", "ember", 4, 5, 4, "ping", "One flash. Then the silence.", "lunge"),
  sample("emberglass", "Emberglass Oni", "ember", 5, 5, 5, "haste", "They heard it laugh through the furnace door."),
  sample("foam", "Foamglass Scout", "tide", 1, 1, 1, "draw", "Even the smallest ripple carries a message."),
  sample("ferryman", "Moonpool Ferryman", "tide", 2, 2, 3, "heal", "The river grants passage to those who listen.", "siphon"),
  sample("breakwater", "Breakwater Ronin", "tide", 3, 2, 4, "guard", "He stays until every boat is home."),
  sample("mist", "Mistcoil Dancer", "tide", 4, 4, 4, "draw", "Watch the ribbon and miss the blade."),
  sample("tidevault", "Tidevault Leviathan", "tide", 6, 5, 7, "guard", "Its shadow darkens both shores."),
  sample("sprout", "Lantern Sprout", "grove", 1, 1, 3, "basic", "It holds the path until dawn."),
  sample("cedar", "Cedar Oathkeeper", "grove", 2, 1, 3, "guard", "The forest gives its word through her."),
  sample("heron", "Verdant Heron", "grove", 3, 3, 4, "heal", "Spring follows a single beat of its wings."),
  sample("ivy", "Ivybound Colossus", "grove", 5, 3, 7, "guard", "The garden learned to walk.", "recover"),
  sample("veilcat", "Paperveil Cat", "veil", 1, 1, 1, "haste", "It always takes the shorter shadow."),
  sample("mask", "Mask Archivist", "veil", 2, 1, 3, "draw", "Every mask has a story it refuses to tell."),
  sample("silk", "Silkstep Phantom", "veil", 3, 3, 3, "haste", "Midnight is only the start of her route."),
  sample("gate", "Keeper of the Violet Gate", "veil", 4, 3, 5, "guard", "On the far side, the stars look different."),
  sample("static", "Static Runner", "storm", 2, 3, 1, "haste", "She reads the lightning by the gaps it leaves in the city lights.", "sweep"),
  sample("rime", "Rimeglass Pilot", "frost", 3, 3, 3, "guard", "The runways are marked with bells. Snow can bury paint, but it can't bury a sound.", "lunge"),
  sample("basalt", "Basalt Waykeeper", "stone", 3, 2, 4, "guard", "Every traveler leaves a pebble at the pass. By winter, the pile is taller than the gate.", "recover"),
  sample("beacon", "Firstlight Keeper", "dawn", 3, 3, 4, "heal", "At sunrise they open the lighthouse shutters one at a time, starting with the smallest.", "siphon"),
  sample("copper", "Copperline Mechanic", "alloy", 2, 2, 2, "draw", "She can hear a loose rivet from the other end of a moving train.", "sweep"),
];

export const STARTER_DECK = ["matchstick", "matchstick", "cinder", "static", "bell", "sun", "emberglass",
  "foam", "foam", "ferryman", "ferryman", "breakwater", "rime", "mist", "tidevault"];
export const RIVAL_DECK = ["sprout", "sprout", "veilcat", "veilcat", "cedar", "copper", "mask", "mask",
  "heron", "beacon", "silk", "basalt", "gate", "gate", "ivy"];

export function deckIssue(deck, cards) {
  if (!Array.isArray(deck) || deck.length !== LIMITS.deck) return `A deck needs exactly ${LIMITS.deck} cards.`;
  const counts = new Map();
  for (const id of deck) {
    if (!cards.some((card) => card.id === id)) return "The deck contains a missing card.";
    const count = (counts.get(id) ?? 0) + 1;
    if (count > LIMITS.copies) return `A deck can contain up to ${LIMITS.copies} copies of any card.`;
    counts.set(id, count);
  }
  return "";
}

const archetypes = {
  ember: { name: "Cinder Vanguard", ability: "ping", active2: "lunge" },
  tide: { name: "Moonwater Envoy", ability: "draw", active2: "siphon" },
  grove: { name: "Wildbloom Sentinel", ability: "guard", active2: "recover" },
  veil: { name: "Twilight Herald", ability: "haste", active2: "siphon" },
  storm: { name: "Thunderline Runner", ability: "haste", active2: "sweep" },
  frost: { name: "Rimeglass Pilot", ability: "guard", active2: "lunge" },
  stone: { name: "Basalt Waykeeper", ability: "guard", active2: "recover" },
  dawn: { name: "Firstlight Keeper", ability: "heal", active2: "siphon" },
  alloy: { name: "Copperline Mechanic", ability: "draw", active2: "sweep" },
};

const themes = [
  ["storm", /\b(storm|thunder|lightning|static|tempest)\b/],
  ["frost", /\b(frost|ice|snow|rime|glacier|winter)\b/],
  ["stone", /\b(stone|rock|earth|quarry|basalt|mountain)\b/],
  ["dawn", /\b(dawn|sunrise|radiance|light|sunlight|lighthouse)\b/],
  ["alloy", /\b(alloy|metal|steel|copper|machine|engine|robot|mechanic)\b/],
  ["ember", /\b(fire|flame|ash|lava|blaze|sun|ember|cinder)\b/],
  ["tide", /\b(water|ocean|river|mist|wave|tide|sea|harbor)\b/],
  ["grove", /\b(tree|wood|nature|plant|forest|vine|grove|cedar)\b/],
  ["veil", /\b(shadow|ghost|dark|void|moon|veil|midnight)\b/],
];

export function templateDraft({ name = "", faction = "", concept = "", locked = {}, variant = 0 }) {
  const issue = lockedCardIssue(locked);
  if (issue) throw new Error(issue);
  const contextName = locked.name ?? name;
  const theme = `${concept} ${contextName} ${locked.flavor ?? ""}`.toLowerCase();
  const fromConcept = themes.find(([, pattern]) => pattern.test(concept.toLowerCase()))?.[0];
  const fromTheme = themes.find(([, pattern]) => pattern.test(theme))?.[0];
  const selected = locked.faction ?? fromConcept ?? (Object.hasOwn(FACTIONS, faction) ? faction : fromTheme ?? "veil");
  const preset = archetypes[selected];
  const roles = [
    ["guard", "recover", /tank|guard|shield|defend/],
    ["haste", "lunge", /speed|fast|rush|quick/],
    ["heal", "siphon", /heal|restore|medic/],
    ["draw", "none", /draw|support|study|scout/],
    ["ping", "sweep", /blast|burn|damage|strike/],
  ];
  const role = roles.find(([, , pattern]) => pattern.test(theme));
  const ability = locked.ability ?? role?.[0] ?? preset.ability;
  const cost = locked.cost ?? (/legendary|boss|giant|powerful/.test(theme) ? 5 : /small|cheap|starter/.test(theme) ? 2 : 3);
  const stats = statBudget(cost) - ABILITIES[ability].weight;
  const attack = Math.min(7, Math.max(1, Math.floor(stats / 2) + (ability === "haste" ? 1 : ability === "guard" ? -1 : 0)));
  const card = fitDraft({
    name: preset.name, faction: selected, cost, attack, health: stats - attack,
    ability, active1: "strike", active2: role?.[1] ?? preset.active2, flavor: "",
  }, locked);
  if (!Object.hasOwn(locked, "flavor")) card.flavor = draftFlavor({ ...card, name: contextName || card.name }, concept, variant);
  return card;
}
