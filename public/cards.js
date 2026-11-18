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

export function statBudget(cost) {
  return cost * 2 + 2;
}

export function cardIssues(card) {
  const issues = [];
  if (typeof card.name !== "string" || !card.name.trim() || card.name.length > 44) {
    issues.push("Enter a name of 1–44 characters.");
  }
  if (!Object.hasOwn(FACTIONS, card.faction)) issues.push("Choose a faction.");
  if (!Object.hasOwn(ABILITIES, card.ability)) issues.push("Choose an ability.");
  for (const [field, min, max] of [["cost", 1, 6], ["attack", 1, 7], ["health", 1, 9]]) {
    if (!Number.isInteger(card[field]) || card[field] < min || card[field] > max) {
      issues.push(`${field[0].toUpperCase() + field.slice(1)} must be ${min}–${max}.`);
    }
  }
  if (typeof card.flavor !== "string" || card.flavor.length > 140) {
    issues.push("Keep flavor text within 140 characters.");
  }
  if (issues.length === 0 && card.attack + card.health + ABILITIES[card.ability].weight > statBudget(card.cost)) {
    issues.push("Reduce the stats or increase the Pulse cost to stay within budget.");
  }
  return issues;
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

export function templateDraft({ name, faction, concept }) {
  const theme = concept.toLowerCase();
  const inferred = [
    ["ember", /fire|flame|ash|lava|blaze|sun/],
    ["tide", /water|ice|ocean|river|mist|wave/],
    ["grove", /tree|wood|nature|plant|forest|vine/],
    ["veil", /shadow|ghost|dark|void|moon/],
  ].find(([, pattern]) => pattern.test(theme));
  const selected = Object.hasOwn(FACTIONS, faction) ? faction : inferred?.[0] ?? "veil";
  const preset = archetypes[selected];
  const role = [
    ["guard", /tank|guard|shield|defend/],
    ["haste", /speed|fast|rush|quick/],
    ["heal", /heal|restore|medic/],
    ["draw", /draw|support|study|scout/],
    ["ping", /blast|burn|damage|strike/],
  ].find(([, pattern]) => pattern.test(theme));
  const ability = role?.[0] ?? preset.ability;
  const cost = /legendary|boss|giant|powerful/.test(theme) ? 5 : /small|cheap|starter/.test(theme) ? 2 : 3;
  const stats = statBudget(cost) - ABILITIES[ability].weight;
  const attack = Math.min(7, Math.max(1, Math.floor(stats / 2) + (ability === "haste" ? 1 : ability === "guard" ? -1 : 0)));
  return { name: name || preset.name, faction: selected, cost, attack, health: stats - attack, ability, flavor: preset.flavor };
}
