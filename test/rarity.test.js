import { test } from "node:test";
import assert from "node:assert/strict";
import { cardIssues, fitAbilityDraft, fitDraft, lockedCardIssue, rarityOf, templateDraft } from "../public/cards.js";

const unit = { name: "Stormkeeper", faction: "storm", cost: 3, attack: 4, health: 4, ability: "guard", flavor: "" };
const item = { kind: "item", name: "Sealed Charge", faction: "alloy", cost: 3, itemEffect: "damage-core", flavor: "" };

test("unit rarity raises the stat budget and the minimum deploy cost", () => {
  assert.match(cardIssues(unit)[0], /budget/);
  assert.deepEqual(cardIssues({ ...unit, rarity: "rare" }), []);
  assert.match(cardIssues({ ...unit, rarity: "legendary" })[0], /at least 4 Pulse/);
  assert.equal(rarityOf(unit), "common");
});

test("item rarity gates effects while existing cards keep their play cost", () => {
  assert.equal(rarityOf(item), "rare");
  assert.deepEqual(cardIssues(item), []);
  assert.match(cardIssues({ ...item, rarity: "uncommon" })[0], /requires Rare/);
  assert.match(cardIssues({ ...item, rarity: "legendary" })[0], /at least 4 Pulse/);
  assert.match(lockedCardIssue({ rarity: "common", itemEffect: "damage-core" }, "item"), /requires Rare/);
  assert.match(lockedCardIssue({ rarity: "legendary", cost: 2 }), /Unlock rarity or cost/);
});

test("Quick fill and full drafts fit rarity around the supplied brief and locks", () => {
  const boss = templateDraft({ concept: "A legendary boss with a shield", rarity: "common" });
  assert.equal(boss.rarity, "legendary");
  assert.ok(boss.cost >= 4);
  assert.deepEqual(cardIssues(boss), []);
  const fixedStats = fitDraft({ ...unit, rarity: "common" }, { cost: 3, attack: 4, health: 4, ability: "guard" });
  assert.equal(fixedStats.rarity, "rare");
  const fixedCost = fitDraft({ ...unit, rarity: "legendary" }, { cost: 2 });
  assert.equal(fixedCost.rarity, "uncommon");
  assert.equal(fixedCost.cost, 2);
  const fixedTier = fitDraft(item, { rarity: "uncommon" });
  assert.equal(fixedTier.itemEffect, "damage-enemy");
  assert.equal(fixedTier.rarity, "uncommon");
});

test("ability-only drafts use the existing rarity for both card types", () => {
  const draft = { ability: "guard" };
  assert.equal(fitAbilityDraft(draft, { current: unit }).ability, "basic");
  assert.equal(fitAbilityDraft(draft, { current: { ...unit, rarity: "rare" } }).ability, "guard");
  assert.deepEqual(fitAbilityDraft(item, { kind: "item", current: item }), { itemEffect: "damage-core" });
  assert.deepEqual(fitAbilityDraft(item, { kind: "item", current: { ...item, rarity: "uncommon" } }),
    { itemEffect: "damage-enemy" });
});
