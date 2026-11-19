import { draftFlavor } from "./lore.js";
import { ATTACK_SLOTS, attackIssue, emptyAttack, fitAttack, readAttack, resolveAttackEffects, sameAttack } from "./attacks.js";

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

export const RARITIES = {
  common: { name: "Common", minPulse: 1, bonus: 0 },
  uncommon: { name: "Uncommon", minPulse: 2, bonus: 1 },
  rare: { name: "Rare", minPulse: 3, bonus: 2 },
  legendary: { name: "Legendary", minPulse: 4, bonus: 3 },
};

export const ITEM_EFFECTS = {
  draw: { name: "Draw", target: "self", cost: 1, rarity: "common", amount: 1, text: "Draw 1 card from your deck." },
  "heal-ally": { name: "Mend Unit", target: "ally", cost: 1, rarity: "common", amount: 3, text: "Restore 3 HP to one injured allied unit." },
  "damage-enemy": { name: "Blast Unit", target: "enemy", cost: 2, rarity: "uncommon", amount: 2, text: "Deal 2 damage to one rival unit." },
  "heal-core": { name: "Restore Core", target: "self", cost: 2, rarity: "uncommon", amount: 3, text: "Restore 3 health to your Core." },
  "damage-core": { name: "Sabotage Core", target: "rival", cost: 3, rarity: "rare", amount: 2, text: "Deal 2 damage to the rival Core." },
};

export const LIMITS = { deck: 15, copies: 3, core: 20, lanes: 3 };
export const EVOLUTION_TURNS = 3;
export const unitStage = (card) => card.stage ?? 1;
export const evolvesFrom = (card, prior) => !isItem(card) && !isItem(prior) &&
  Boolean(card.evolvesFrom) && card.evolvesFrom === prior.id && unitStage(card) === unitStage(prior) + 1;

export function evolutionIssue(card, cards) {
  if (!isItem(card)) {
    const stage = unitStage(card);
    if (![1, 2, 3].includes(stage)) return "Choose a stage from 1 to 3.";
    if (stage > 1 && !cards.some((prior) => prior.id !== card.id && evolvesFrom(card, prior))) {
      return `Choose the Stage ${stage - 1} unit this card evolves from.`;
    }
  }
  const dependent = card.id && cards.find((next) => !isItem(next) && next.evolvesFrom === card.id && !evolvesFrom(next, card));
  return dependent ? `${dependent.name} evolves from this unit. Change that link before changing this card’s type or stage.` : "";
}
export const CARD_FIELDS = ["name", "faction", "rarity", "cost", "attack", "health", ...ATTACK_SLOTS, "ability", "flavor"];
export const ITEM_FIELDS = ["name", "faction", "rarity", "cost", "itemEffect", "flavor"];
export const UNIT_SKILL_FIELDS = [...ATTACK_SLOTS, "ability"];
export const isItem = (card) => card?.kind === "item";
export const cardFields = (kind) => kind === "item" ? ITEM_FIELDS : CARD_FIELDS;
export const abilityFields = (kind) => kind === "item" ? ["itemEffect"] : UNIT_SKILL_FIELDS;
export function draftFields(kind, mode) {
  if (mode === "effects") return ATTACK_SLOTS;
  return mode === "abilities" ? abilityFields(kind) : cardFields(kind);
}

export const FIELD_LABELS = {
  name: "Card name", faction: "Element", rarity: "Rarity", cost: "Pulse cost", attack: "Attack",
  health: "Health", active1: "Attack 1", active2: "Attack 2", ability: "Passive skill", flavor: "Flavor text",
  itemEffect: "Item effect",
};
const statRanges = { cost: [1, 6], attack: [1, 7], health: [1, 9] };
const validRarity = (rarity) => typeof rarity === "string" && Object.hasOwn(RARITIES, rarity);
export function rarityOf(card) {
  return card.rarity ?? (isItem(card) ? ITEM_EFFECTS[card.itemEffect]?.rarity : undefined) ?? "common";
}

export function minimumPulse(card) {
  const rarity = rarityOf(card);
  return Math.max(validRarity(rarity) ? RARITIES[rarity].minPulse : 1,
    isItem(card) ? ITEM_EFFECTS[card.itemEffect]?.cost ?? 1 : 1);
}

export function itemEffectFits(itemEffect, rarity) {
  return validRarity(rarity) && Object.hasOwn(ITEM_EFFECTS, itemEffect) &&
    RARITIES[rarity].minPulse >= RARITIES[ITEM_EFFECTS[itemEffect].rarity].minPulse;
}

export function statBudget(cost, rarity = "common") {
  return cost * 2 + 2 + (validRarity(rarity) ? RARITIES[rarity].bonus : 0);
}

function draftRarities(preferred, locked) {
  const tier = RARITIES[preferred].minPulse;
  const candidates = locked.rarity ? [locked.rarity] : Object.keys(RARITIES)
    .sort((a, b) => Math.abs(RARITIES[a].minPulse - tier) - Math.abs(RARITIES[b].minPulse - tier));
  return candidates.filter((rarity) => RARITIES[rarity].minPulse <= (locked.cost ?? statRanges.cost[1]));
}

function fieldIssue(field, value) {
  if (field === "name" && (typeof value !== "string" || !value.trim() || value.length > 44)) {
    return "Enter a name of 1–44 characters.";
  }
  if (field === "faction" && (typeof value !== "string" || !Object.hasOwn(FACTIONS, value))) return "Choose an element.";
  if (field === "rarity" && !validRarity(value)) return "Choose a rarity.";
  if (field === "ability" && (typeof value !== "string" || !Object.hasOwn(ABILITIES, value))) return "Choose a passive skill.";
  if (field === "itemEffect" && (typeof value !== "string" || !Object.hasOwn(ITEM_EFFECTS, value))) return "Choose an item effect.";
  if (ATTACK_SLOTS.includes(field)) return attackIssue(value);
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
  const rarity = rarityOf(card);
  const issues = cardFields(card.kind).map((field) => fieldIssue(field, field === "rarity" ? rarity : card[field])).filter(Boolean);
  if (issues.length === 0 && card.cost < minimumPulse(card)) {
    issues.push(`This card needs at least ${minimumPulse(card)} Pulse.`);
  }
  if (isItem(card)) {
    if (Object.hasOwn(ITEM_EFFECTS, card.itemEffect) && !itemEffectFits(card.itemEffect, rarity)) {
      const effect = ITEM_EFFECTS[card.itemEffect];
      issues.push(`${effect.name} requires ${RARITIES[effect.rarity].name} rarity or higher.`);
    }
    return issues;
  }
  if (sameAttack(card.active1, card.active2)) issues.push("Give the two attacks different names.");
  if (issues.length === 0 && card.attack + card.health + ABILITIES[card.ability].weight > statBudget(card.cost, rarity)) {
    issues.push("Reduce the stats, raise the rarity, or increase the Pulse cost to stay within budget.");
  }
  return issues;
}

export function lockedCardIssue(locked, kind = "unit") {
  for (const field of cardFields(kind)) {
    if (!Object.hasOwn(locked, field)) continue;
    const issue = fieldIssue(field, locked[field]);
    if (issue) return `Check the locked ${FIELD_LABELS[field].toLowerCase()}. ${issue}`;
  }
  const rarities = draftRarities(locked.rarity ?? "common", locked);
  if (!rarities.length) return `${RARITIES[locked.rarity].name} needs at least ${RARITIES[locked.rarity].minPulse} Pulse. Unlock rarity or cost.`;
  if (kind === "item") {
    const effect = ITEM_EFFECTS[locked.itemEffect];
    if (!effect) return "";
    if (locked.rarity && !itemEffectFits(locked.itemEffect, locked.rarity)) {
      return `${effect.name} requires ${RARITIES[effect.rarity].name} rarity or higher. Unlock the effect or rarity.`;
    }
    if (locked.cost < minimumPulse({ kind, itemEffect: locked.itemEffect, rarity: locked.rarity })) {
      return `${effect.name} needs at least ${minimumPulse({ kind, itemEffect: locked.itemEffect, rarity: locked.rarity })} Pulse. Unlock the effect or cost.`;
    }
    return "";
  }
  if (sameAttack(locked.active1, locked.active2)) {
    return "Unlock one of the attacks with the same name.";
  }
  const minimum = (locked.attack ?? 1) + (locked.health ?? 1) + (ABILITIES[locked.ability]?.weight ?? 0);
  if (rarities.every((rarity) => minimum > statBudget(locked.cost ?? 6, rarity))) {
    return "The locked values exceed the stat budget. Unlock a stat, ability, rarity, or Pulse cost.";
  }
  return "";
}

function fitUnitSkills(card, locked) {
  const skills = { ability: locked.ability ?? card.ability };
  for (const field of ATTACK_SLOTS) {
    skills[field] = Object.hasOwn(locked, field) ? readAttack(locked[field]) : fitAttack(card[field]);
  }
  if (sameAttack(skills.active1, skills.active2)) {
    skills[Object.hasOwn(locked, "active2") ? "active1" : "active2"] = emptyAttack();
  }
  return skills;
}

export function fitEffectDraft(draft, current, locked) {
  return Object.fromEntries(ATTACK_SLOTS.map((slot) => {
    const move = readAttack(current?.[slot]);
    return [slot, Object.hasOwn(locked, slot) ? move
      : { ...move, effects: resolveAttackEffects(move, draft?.[slot]?.effects) }];
  }));
}

function itemEffectChoices(itemEffect, locked) {
  if (locked.itemEffect) return [itemEffect];
  const fallback = { "heal-core": "heal-ally", "damage-core": "damage-enemy" };
  return [...new Set([itemEffect, fallback[itemEffect], "draw"].filter(Boolean))];
}

export function fitAbilityDraft(draft, { kind = "unit", locked = {}, current = {} } = {}) {
  const issue = lockedCardIssue(locked, kind);
  if (issue) throw new Error(issue);
  if (kind === "item") {
    const itemEffect = locked.itemEffect ?? draft.itemEffect;
    const invalid = fieldIssue("itemEffect", itemEffect);
    if (invalid) throw new Error(invalid);
    const rarity = rarityOf({ ...current, kind });
    const compatible = itemEffectChoices(itemEffect, locked).find((effect) =>
      itemEffectFits(effect, rarity) && minimumPulse({ kind, rarity, itemEffect: effect }) <= (current.cost || 1));
    if (!compatible) throw new Error("Check the item's rarity and play cost, or unlock the item effect.");
    return { itemEffect: compatible };
  }
  const skills = fitUnitSkills(draft, locked);
  const invalid = UNIT_SKILL_FIELDS.map((field) => fieldIssue(field, skills[field])).find(Boolean);
  if (invalid) throw new Error(invalid);
  const remaining = statBudget(current.cost, rarityOf(current)) - current.attack - current.health;
  if (!Object.hasOwn(locked, "ability") && ABILITIES[skills.ability].weight > remaining) {
    const alternatives = { guard: "heal", haste: "ping", draw: "heal" };
    skills.ability = remaining >= 1 ? alternatives[skills.ability] ?? "basic" : "basic";
  }
  return skills;
}

// Keep the proposed ability and rarity when possible. Trim unlocked stats
// before raising an unlocked cost.
export function fitDraft(draft, locked = {}, kind = draft.kind ?? "unit") {
  const issue = lockedCardIssue(locked, kind);
  if (issue) throw new Error(issue);
  const card = Object.fromEntries(cardFields(kind).map((key) => [key, locked[key] ?? draft[key]]));
  if (kind === "item") card.kind = "item";
  card.rarity = rarityOf(card);
  const invalidRarity = fieldIssue("rarity", card.rarity);
  if (invalidRarity) throw new Error(invalidRarity);
  const rarities = draftRarities(card.rarity, locked);
  if (kind === "item") {
    const invalid = fieldIssue("itemEffect", card.itemEffect);
    if (invalid) throw new Error(invalid);
    for (const itemEffect of itemEffectChoices(card.itemEffect, locked)) {
      for (const rarity of rarities) {
        if (!itemEffectFits(itemEffect, rarity)) continue;
        const fitted = { ...card, rarity, itemEffect };
        fitted.cost = locked.cost ?? Math.min(6, Math.max(minimumPulse(fitted), card.cost));
        if (!cardIssues(fitted).length) return fitted;
      }
    }
    throw new Error(cardIssues(card)[0] || "Couldn’t generate a valid item.");
  }
  Object.assign(card, fitUnitSkills(card, locked));
  for (const [key, [min, max]] of Object.entries(statRanges)) {
    if (Number.isInteger(card[key])) card[key] = Math.min(max, Math.max(min, card[key]));
  }
  const minAttack = locked.attack ?? 1;
  const minHealth = locked.health ?? 1;
  const abilities = Object.hasOwn(locked, "ability") ? [locked.ability] : [...new Set([card.ability, "basic"])];
  const costs = Object.hasOwn(locked, "cost") ? [locked.cost] : [1, 2, 3, 4, 5, 6].filter((cost) => cost >= card.cost);
  for (const ability of abilities) {
    if (!Object.hasOwn(ABILITIES, ability)) continue;
    for (const rarity of rarities) {
      for (const cost of costs) {
        if (cost < RARITIES[rarity].minPulse) continue;
        const room = statBudget(cost, rarity) - ABILITIES[ability].weight;
        if (room < minAttack + minHealth) continue;
        const attack = Math.min(card.attack, room - minHealth);
        const health = Math.min(card.health, room - attack);
        const fitted = { ...card, rarity, cost, attack, health, ability };
        if (cardIssues(fitted).length === 0) return fitted;
      }
    }
  }
  throw new Error(cardIssues(card)[0] || "Couldn’t generate a valid card.");
}

const sampleMoves = {
  matchstick: ["Ember Bite"], cinder: ["Courier's Cut"], bell: ["Bronze Knuckles"],
  sun: ["Sunline Cut", "High Noon Draw", ["heavy"]], emberglass: ["Furnace Fist"],
  foam: ["Foam Dart"], ferryman: ["Oar Hook", "Moonpool Toll", ["hit", "drain"]], breakwater: ["Breakwater Blade"],
  mist: ["Ribbon Slip"], tidevault: ["Undertow Jaws"], sprout: ["Twig Snap"], cedar: ["Cedar Staff"],
  heron: ["Reed Beak"], ivy: ["Root Lash", "New Growth", ["mend"]], veilcat: ["Paper Claw"], mask: ["Mask Shard"],
  silk: ["Silk Needle"], gate: ["Gate Sigil"], static: ["Static Jab", "Rail Arc", ["hit", "splash"]],
  rime: ["Rime Dart", "Icebreaker Dive", ["heavy"]], basalt: ["Basalt Maul", "Repack Mortar", ["mend"]],
  beacon: ["Beacon Ray", "Gather First Light", ["hit", "drain"]], copper: ["Copper Wrench", "Switchyard Arc", ["hit", "splash"]],
};

const sample = (id, name, faction, cost, attack, health, ability, flavor) => {
  const [first, second, effects] = sampleMoves[id];
  return { id, name, faction, cost, attack, health, ability, flavor, art: "",
    active1: { name: first, concept: "", effects: ["hit"] },
    active2: second ? { name: second, concept: "", effects } : emptyAttack() };
};
const item = (id, name, faction, itemEffect, flavor) =>
  ({ id, name, faction, kind: "item", cost: ITEM_EFFECTS[itemEffect].cost, itemEffect, flavor, art: "" });

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
  sample("static", "Static Runner", "storm", 2, 3, 1, "haste", "She reads the lightning by the gaps it leaves in the city lights."),
  sample("rime", "Rimeglass Pilot", "frost", 3, 3, 3, "guard", "The runways are marked with bells. Snow can bury paint, but it can't bury a sound."),
  sample("basalt", "Basalt Waykeeper", "stone", 3, 2, 4, "guard", "Every traveler leaves a pebble at the pass. By winter, the pile is taller than the gate."),
  sample("beacon", "Firstlight Keeper", "dawn", 3, 3, 4, "heal", "At sunrise they open the lighthouse shutters one at a time, starting with the smallest."),
  sample("copper", "Copperline Mechanic", "alloy", 2, 2, 2, "draw", "She can hear a loose rivet from the other end of a moving train."),
  item("dispatch", "Harbor Dispatch", "tide", "draw", "The harbor master seals every letter twice. The first seal is for the rain."),
  item("patch", "Mossweave Patch", "grove", "heal-ally", "The dressings are cut from river moss at low tide and kept wet until needed."),
  item("flare", "Signal Flare", "ember", "damage-enemy", "One flare means clear the track. Two means someone already missed the first."),
  item("flask", "Dawn Flask", "dawn", "heal-core", "The lighthouse keeper leaves one flask unopened for whoever takes the watch."),
  item("charge", "Relay Charge", "storm", "damage-core", "The electricians listen for the third click before trusting the line."),
];

export const STARTER_DECK = ["matchstick", "dispatch", "cinder", "static", "bell", "sun", "emberglass",
  "foam", "patch", "ferryman", "flare", "breakwater", "rime", "mist", "tidevault"];
export const RIVAL_DECK = ["sprout", "dispatch", "veilcat", "veilcat", "cedar", "copper", "mask", "flask",
  "heron", "beacon", "silk", "basalt", "gate", "charge", "ivy"];

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

const itemIdeas = [
  ["damage-core", "Relay Charge", "storm", /(?:enemy|rival|damage|attack|sabotage).{0,24}core|core.{0,24}(?:damage|enemy|rival|sabotage)/],
  ["heal-core", "Dawn Flask", "dawn", /(?:heal|restore|repair|mend).{0,24}core|core.{0,24}(?:heal|restore|repair|mend)/],
  ["heal-ally", "Mossweave Patch", "grove", /heal|mend|recover|restore|bandage|potion|medicine/],
  ["damage-enemy", "Signal Flare", "ember", /damage|enemy|rival|blast|flare|bomb|burn|strike/],
  ["draw", "Harbor Dispatch", "tide", /draw|dispatch|letter|map|scout|find/],
];

const moveMotifs = {
  ember: "Cinder", tide: "Undertow", grove: "Briar", veil: "Phantom", storm: "Voltage",
  frost: "Rime", stone: "Basalt", dawn: "Sunrise", alloy: "Copper",
};
const movePatterns = {
  lunge: ["Breakthrough", ["heavy"]], recover: ["Reprieve", ["mend"]],
  siphon: ["Toll", ["hit", "drain"]], sweep: ["Arc", ["hit", "splash"]],
};

export function templateDraft({ name = "", character = "", faction = "", rarity, concept = "", locked = {}, kind = "unit", mode, current, variant = 0 }) {
  const issue = lockedCardIssue(locked, kind);
  if (issue) throw new Error(issue);
  if (mode === "effects") return fitEffectDraft({}, current, locked);
  const contextName = locked.name ?? (character || name);
  const theme = `${concept} ${contextName} ${locked.flavor ?? ""}`.toLowerCase();
  const conceptText = concept.toLowerCase();
  const rarityHint = conceptText.match(/\b(uncommon|common|rare|legendary|mythic|boss)\b/)?.[1];
  const chosenRarity = locked.rarity ?? (rarityHint === "mythic" || rarityHint === "boss" ? "legendary" : rarityHint)
    ?? (validRarity(rarity) ? rarity : undefined);
  const fromConcept = themes.find(([, pattern]) => pattern.test(conceptText))?.[0];
  const fromTheme = themes.find(([, pattern]) => pattern.test(theme))?.[0];
  const chosenElement = locked.faction ?? fromConcept ?? (Object.hasOwn(FACTIONS, faction) ? faction : fromTheme);
  if (kind === "item") {
    const choice = locked.itemEffect ? itemIdeas.find(([id]) => id === locked.itemEffect)
      : itemIdeas.find(([, , , pattern]) => pattern.test(conceptText)) ??
        itemIdeas.find(([, , , pattern]) => pattern.test(theme)) ?? itemIdeas.at(-1);
    const [itemEffect, itemName, itemElement] = choice;
    if (mode === "abilities") return fitAbilityDraft({ itemEffect }, { kind, locked, current });
    const card = fitDraft({
      name: itemName, faction: chosenElement ?? itemElement,
      rarity: chosenRarity, cost: ITEM_EFFECTS[itemEffect].cost, itemEffect, flavor: "",
    }, locked, kind);
    if (!Object.hasOwn(locked, "flavor")) card.flavor = draftFlavor({ ...card, name: contextName || card.name }, concept, variant);
    return card;
  }
  const selected = chosenElement ?? "veil";
  const preset = archetypes[selected];
  const roles = [
    ["guard", "recover", /tank|guard|shield|defend/],
    ["haste", "lunge", /speed|fast|rush|quick/],
    ["heal", "siphon", /heal|restore|medic/],
    ["draw", "none", /draw|support|study|scout/],
    ["ping", "sweep", /blast|burn|damage|strike/],
  ];
  const role = roles.find(([, , pattern]) => pattern.test(conceptText)) ?? roles.find(([, , pattern]) => pattern.test(theme));
  const ability = locked.ability ?? role?.[0] ?? preset.ability;
  const motif = moveMotifs[selected];
  const pattern = movePatterns[role?.[1] ?? preset.active2];
  const skills = {
    ability,
    active1: { name: `${motif} ${variant % 2 ? "Counter" : "Cut"}`, concept: "", effects: ["hit"] },
    active2: pattern ? { name: `${motif} ${pattern[0]}`, concept: "", effects: pattern[1] } : emptyAttack(),
  };
  if (mode === "abilities") return fitAbilityDraft(skills, { kind, locked, current });
  const tier = draftRarities(chosenRarity ?? "common", locked)[0];
  const cost = locked.cost ?? Math.max(RARITIES[tier].minPulse,
    /legendary|boss|giant|powerful/.test(theme) ? 5 : /small|cheap|starter/.test(theme) ? 2 : 3);
  const stats = statBudget(cost, tier) - ABILITIES[ability].weight;
  const attack = Math.min(7, Math.max(1, Math.floor(stats / 2) + (ability === "haste" ? 1 : ability === "guard" ? -1 : 0)));
  const card = fitDraft({
    name: character || preset.name, faction: selected, rarity: tier, cost, attack, health: stats - attack,
    ...skills, flavor: "",
  }, locked);
  if (!Object.hasOwn(locked, "flavor")) card.flavor = draftFlavor({ ...card, name: contextName || card.name }, concept, variant);
  return card;
}
