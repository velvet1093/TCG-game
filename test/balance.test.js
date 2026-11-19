import { test } from "node:test";
import assert from "node:assert/strict";
import { cardIssues, migrateCollection, templateDraft } from "../public/cards.js";
import { normalizeDraft } from "../public/ai-draft.js";

const base = { id: "tester", name: "Moon Guard", faction: "veil", stage: 1, rarity: "common",
  cost: 3, attack: 30, health: 60, ability: "basic", flavor: "" };

test("stage and rarity allow stronger units while enforcing the 1,000 HP ceiling", () => {
  assert.deepEqual(cardIssues(base), []);
  assert.match(cardIssues({ ...base, health: 100 })[0], /90 HP/);
  assert.deepEqual(cardIssues({ ...base, health: 110, rarity: "rare" }), []);
  assert.deepEqual(cardIssues({ ...base, health: 110, stage: 2 }), []);
  const boss = { ...base, stage: 3, rarity: "legendary", cost: 6, health: 1000 };
  assert.deepEqual(cardIssues(boss), []);
  assert.match(cardIssues({ ...boss, cost: 5 })[0], /budget/);
  assert.match(cardIssues({ ...boss, health: 1010 })[0], /1000/);
});

test("drafts take the creator's stage into account for stats and discard model-supplied stages", () => {
  const brief = { concept: "A healing tide unit", locked: { rarity: "common" } };
  const first = templateDraft({ ...brief, stage: 1 });
  const second = templateDraft({ ...brief, stage: 2 });
  assert.ok(first.health < 100);
  assert.ok(second.attack > first.attack && second.health > first.health);
  assert.deepEqual(cardIssues({ ...second, stage: 2 }), []);
  const model = { ...base, stage: 1, evolvesFrom: "unrelated", health: 1000, rarity: "legendary", cost: 6 };
  const drafted = normalizeDraft(model, { stage: 3, locked: { health: 1000 } });
  assert.equal(drafted.health, 1000);
  assert.equal(Object.hasOwn(drafted, "stage"), false);
  assert.equal(Object.hasOwn(drafted, "evolvesFrom"), false);
});

test("collection migration rescales existing units once and preserves artwork, evolution links and deck", () => {
  const unit = { ...base, attack: 3, health: 6, art: "data:image/png;base64,AA==", stage: 2, evolvesFrom: "prior", locks: ["health"] };
  const item = { id: "patch", kind: "item", itemEffect: "heal-ally" };
  const old = { cards: [unit, item], deck: [unit.id, item.id] };
  const migrated = migrateCollection(old);
  assert.deepEqual(migrated.cards[0], { ...unit, attack: 30, health: 60 });
  assert.equal(migrated.cards[1], item);
  assert.equal(migrated.deck, old.deck);
  assert.equal(migrateCollection(migrated), migrated);
  assert.equal(old.cards[0].health, 6);
});
