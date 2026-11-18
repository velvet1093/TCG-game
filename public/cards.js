export const FACTIONS = {
  ember: { name: "Ember", icon: "✦", color: "#ff745f" },
  tide: { name: "Tide", icon: "≋", color: "#6dd5f1" },
  grove: { name: "Grove", icon: "❋", color: "#95da9e" },
  veil: { name: "Veil", icon: "◈", color: "#c1a3ff" },
};

export const ABILITIES = {
  basic: { name: "Standard", text: "No special effect.", weight: 0 },
  haste: { name: "Rush", text: "Can strike the turn it enters.", weight: 2 },
  guard: { name: "Ward", text: "Block the first point of damage from each opposing strike.", weight: 2 },
  draw: { name: "Insight", text: "On deploy, draw one card.", weight: 2 },
  heal: { name: "Renew", text: "On deploy, restore 2 Core health.", weight: 1 },
  ping: { name: "Spark", text: "On deploy, deal 1 damage to the opposing unit in this lane.", weight: 1 },
};

export const LIMITS = { deck: 15, copies: 3, core: 20, lanes: 3 };
export const CARD_FIELDS = ["name", "faction", "cost", "attack", "health", "ability", "flavor"];
export const FIELD_LABELS = {
  name: "Card name", faction: "Faction", cost: "Pulse cost", attack: "Attack",
  health: "Health", ability: "Ability", flavor: "Flavor text",
};
const statRanges = { cost: [1, 6], attack: [1, 7], health: [1, 9] };

export function statBudget(cost) {
  return cost * 2 + 2;
}

function fieldIssue(field, value) {
  if (field === "name" && (typeof value !== "string" || !value.trim() || value.length > 44)) {
    return "Enter a name of 1–44 characters.";
  }
  if (field === "faction" && (typeof value !== "string" || !Object.hasOwn(FACTIONS, value))) return "Choose a faction.";
  if (field === "ability" && (typeof value !== "string" || !Object.hasOwn(ABILITIES, value))) return "Choose an ability.";
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
  const issues = CARD_FIELDS.map((field) => fieldIssue(field, card[field])).filter(Boolean);
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
  const card = Object.fromEntries(CARD_FIELDS.map((key) => [key, Object.hasOwn(locked, key) ? locked[key] : draft[key]]));
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

const sample = (id, name, faction, cost, attack, health, ability, flavor) =>
  ({ id, name, faction, cost, attack, health, ability, flavor, art: "" });

export const STARTER_CARDS = [
  sample("matchstick", "Matchstick Familiar", "ember", 1, 1, 2, "ping", "A little blaze goes a long way."),
  sample("cinder", "Cinder Courier", "ember", 2, 2, 2, "haste", "By the time the lantern swings, she is gone."),
  sample("bell", "Bellforge Brawler", "ember", 3, 4, 4, "basic", "The bells remember every blow."),
  sample("sun", "Sunspoke Duelist", "ember", 4, 5, 4, "ping", "One flash. Then the silence."),
  sample("emberglass", "Emberglass Oni", "ember", 5, 5, 5, "haste", "They heard it laugh through the furnace door."),
  sample("foam", "Foamglass Scout", "tide", 1, 1, 1, "draw", "Even the smallest ripple carries a message."),
  sample("ferryman", "Moonpool Ferryman", "tide", 2, 2, 3, "heal", "The river grants passage to those who listen."),
  sample("breakwater", "Breakwater Ronin", "tide", 3, 2, 4, "guard", "He stays until every boat is home."),
  sample("mist", "Mistcoil Dancer", "tide", 4, 4, 4, "draw", "Watch the ribbon and miss the blade."),
  sample("tidevault", "Tidevault Leviathan", "tide", 6, 5, 7, "guard", "Its shadow darkens both shores."),
  sample("sprout", "Lantern Sprout", "grove", 1, 1, 3, "basic", "It holds the path until dawn."),
  sample("cedar", "Cedar Oathkeeper", "grove", 2, 1, 3, "guard", "The forest gives its word through her."),
  sample("heron", "Verdant Heron", "grove", 3, 3, 4, "heal", "Spring follows a single beat of its wings."),
  sample("ivy", "Ivybound Colossus", "grove", 5, 3, 7, "guard", "The garden learned to walk."),
  sample("veilcat", "Paperveil Cat", "veil", 1, 1, 1, "haste", "It always takes the shorter shadow."),
  sample("mask", "Mask Archivist", "veil", 2, 1, 3, "draw", "Every mask has a story it refuses to tell."),
  sample("silk", "Silkstep Phantom", "veil", 3, 3, 3, "haste", "Midnight is only the start of her route."),
  sample("gate", "Keeper of the Violet Gate", "veil", 4, 3, 5, "guard", "On the far side, the stars look different."),
];

export const STARTER_DECK = ["matchstick", "matchstick", "cinder", "cinder", "bell", "sun", "emberglass",
  "foam", "foam", "ferryman", "ferryman", "breakwater", "breakwater", "mist", "tidevault"];
export const RIVAL_DECK = ["sprout", "sprout", "veilcat", "veilcat", "cedar", "cedar", "mask", "mask",
  "heron", "heron", "silk", "silk", "gate", "gate", "ivy"];

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
  ember: { name: "Cinder Vanguard", ability: "ping", flavor: "The first spark lights the way." },
  tide: { name: "Moonwater Envoy", ability: "draw", flavor: "Listen closely when the tide turns." },
  grove: { name: "Wildbloom Sentinel", ability: "guard", flavor: "Nothing moves while the roots hold." },
  veil: { name: "Twilight Herald", ability: "haste", flavor: "The hour between shadows belongs to them." },
};

export function templateDraft({ name = "", faction = "", concept = "", locked = {} }) {
  const issue = lockedCardIssue(locked);
  if (issue) throw new Error(issue);
  const theme = `${concept} ${locked.name ?? name} ${locked.flavor ?? ""}`.toLowerCase();
  const elements = [
    ["ember", /fire|flame|ash|lava|blaze|sun|ember/],
    ["tide", /water|ice|ocean|river|mist|wave|tide/],
    ["grove", /tree|wood|nature|plant|forest|vine|grove/],
    ["veil", /shadow|ghost|dark|void|moon|veil/],
  ];
  const fromConcept = elements.find(([, pattern]) => pattern.test(concept.toLowerCase()))?.[0];
  const fromTheme = elements.find(([, pattern]) => pattern.test(theme))?.[0];
  const selected = locked.faction ?? fromConcept ?? (Object.hasOwn(FACTIONS, faction) ? faction : fromTheme ?? "veil");
  const preset = archetypes[selected];
  const role = [
    ["guard", /tank|guard|shield|defend/],
    ["haste", /speed|fast|rush|quick/],
    ["heal", /heal|restore|medic/],
    ["draw", /draw|support|study|scout/],
    ["ping", /blast|burn|damage|strike/],
  ].find(([, pattern]) => pattern.test(theme));
  const ability = locked.ability ?? role?.[0] ?? preset.ability;
  const cost = locked.cost ?? (/legendary|boss|giant|powerful/.test(theme) ? 5 : /small|cheap|starter/.test(theme) ? 2 : 3);
  const stats = statBudget(cost) - ABILITIES[ability].weight;
  const attack = Math.min(7, Math.max(1, Math.floor(stats / 2) + (ability === "haste" ? 1 : ability === "guard" ? -1 : 0)));
  return fitDraft({ name: preset.name, faction: selected, cost, attack, health: stats - attack, ability, flavor: preset.flavor }, locked);
}
