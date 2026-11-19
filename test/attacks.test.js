import { test } from "node:test";
import assert from "node:assert/strict";
import { attackIssue, attackPulse, emptyAttack } from "../public/attacks.js";
import { fitEffectDraft, STARTER_CARDS, STARTER_DECK, RIVAL_DECK } from "../public/cards.js";
import { act, createGame } from "../public/engine.js";
import { draftSchemaFor, normalizeDraft } from "../public/ai-draft.js";

const example = { name: "Clockwork Eclipse", concept: "Stops time, then hits the opponent.", effects: [] };

test("effect-only drafts preserve attack names, concepts, and locks", () => {
  const locked = { ...example, name: "Ward Window", effects: ["mend"] };
  const drafted = fitEffectDraft({}, { active1: example, active2: locked }, { active2: locked });
  assert.deepEqual(drafted.active1, { ...example, effects: ["hit", "stun"] });
  assert.deepEqual(drafted.active2, locked);
  assert.equal(attackPulse(drafted.active1), 2);
  assert.match(attackIssue({ ...example, effects: ["drain"] }), /needs a lane damage effect/);
  assert.match(attackIssue({ ...example, effects: ["heavy", "hit"] }), /one lane damage effect/);
  assert.deepEqual(draftSchemaFor({ mode: "effects" }).properties.active1.required, ["effects"]);
});

test("a composed attack deals lane damage, spends Pulse and stuns for one turn", () => {
  const game = createGame(STARTER_CARDS, STARTER_DECK, RIVAL_DECK);
  const [player, rival] = game.sides;
  player.board[0] = {
    card: { ...STARTER_CARDS[0], active1: { ...example, effects: ["hit", "stun"] } }, ready: true, health: 20,
  };
  const opponent = STARTER_CARDS.find((card) => card.id === "sprout");
  rival.board[0] = { card: opponent, ready: true, health: opponent.health };
  assert.equal(act(game, 0, { type: "skill", lane: 0, skill: "active1" }), "");
  assert.equal(rival.board[0].health, 40);
  assert.equal(player.pulse, 0);
  assert.match(game.log.join(" "), /Clockwork Eclipse/);
  act(game, 0, { type: "end" });
  assert.match(act(game, 1, { type: "skill", lane: 0, skill: "active1" }), /needs to ready/);
  act(game, 1, { type: "end" });
  act(game, 0, { type: "end" });
  assert.equal(rival.board[0].ready, true);
});

test("AI drafts keep user-supplied names and surface identified characters", () => {
  const result = { name: "Generic Hero", recognizedCharacter: "Example Hero", faction: "veil",
    cost: 3, attack: 30, health: 30, active1: { ...example, effects: ["hit", "stun"] },
    active2: emptyAttack(), ability: "guard", flavor: "The clock stops before the bell rings." };
  const inferred = normalizeDraft(result, {});
  assert.equal(inferred.name, "Example Hero");
  assert.equal(inferred.recognizedCharacter, "Example Hero");
  assert.equal(inferred.active1.name, example.name);
  const explicit = normalizeDraft(result, { character: "Chosen Character", locked: { name: "Moonlit Visitor" } });
  assert.equal(explicit.name, "Moonlit Visitor");
  assert.equal(explicit.recognizedCharacter, "Chosen Character");
  assert.equal(normalizeDraft(result, { character: "Chosen Character" }).name, "Chosen Character");
});
