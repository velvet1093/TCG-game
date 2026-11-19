import { test } from "node:test";
import assert from "node:assert/strict";
import { STARTER_CARDS, STARTER_DECK, RIVAL_DECK, evolutionIssue, unitStage } from "../public/cards.js";
import { act, createGame, evolutionTurnsLeft, playRival } from "../public/engine.js";
import { draftSchemaFor } from "../public/ai-draft.js";

const base = STARTER_CARDS.find(({ id }) => id === "foam");
const second = { ...base, id: "foam-two", name: "Foam Knight", stage: 2, evolvesFrom: base.id, cost: 3, health: 5, ability: "draw" };
const third = { ...base, id: "foam-three", name: "Foam Regent", stage: 3, evolvesFrom: second.id, cost: 4, health: 7 };
const start = () => createGame([...STARTER_CARDS, second, third], STARTER_DECK, RIVAL_DECK, () => 0.999);
const nextTurn = (game) => {
  assert.equal(act(game, 0, { type: "end" }), "");
  assert.equal(act(game, 1, { type: "end" }), "");
};

test("evolution links require adjacent stages and are outside the AI schema", () => {
  const cards = [base, second, third];
  assert.equal(unitStage(base), 1);
  assert.equal(evolutionIssue(second, cards), "");
  assert.equal(evolutionIssue(third, cards), "");
  assert.match(evolutionIssue({ ...third, evolvesFrom: base.id }, cards), /Choose the Stage 2 unit/);
  assert.match(evolutionIssue({ ...second, stage: 1 }, cards), /Foam Regent evolves from this unit/);
  assert.match(evolutionIssue({ ...base, kind: "item" }, cards), /Foam Knight evolves from this unit/);
  assert.match(evolutionIssue({ ...second, evolvesFrom: second.id }, cards), /Choose the Stage 1 unit/);
  const { properties } = draftSchemaFor({ kind: "unit" });
  assert.equal(Object.hasOwn(properties, "stage"), false);
  assert.equal(Object.hasOwn(properties, "evolvesFrom"), false);
});

test("units wait three owner turns per stage and keep damage and readiness when evolving", () => {
  const game = start();
  const [player] = game.sides;
  player.hand = [base, second, third];
  const deploy = { type: "deploy", lane: 0, hand: 0 };
  assert.match(act(game, 0, { ...deploy, hand: 1 }), /evolving its previous stage/);
  assert.equal(act(game, 0, deploy), "");
  const evolve = { type: "evolve", lane: 0, hand: 0 };
  assert.match(act(game, 0, evolve), /needs 3 more turns/);
  assert.match(act(game, 0, { ...evolve, hand: 1 }), /previous stage/);
  nextTurn(game);
  const unit = player.board[0];
  assert.equal(evolutionTurnsLeft(unit), 2);
  // Changing lanes does not reset time spent at the stage.
  assert.equal(act(game, 0, { type: "shift", lane: 0, to: 1 }), "");
  evolve.lane = 1;
  nextTurn(game);
  assert.match(act(game, 0, evolve), /needs 1 more turn/);
  unit.health--;
  unit.stunned = true;
  nextTurn(game);
  const charged = player.pulse;
  const deckSize = player.deck.length;
  player.pulse = second.cost - 1;
  assert.match(act(game, 0, evolve), /more Pulse/);
  player.pulse = charged;
  assert.equal(act(game, 0, evolve), "");
  assert.equal(player.pulse, charged - second.cost);
  assert.equal(player.deck.length, deckSize);
  assert.deepEqual(player.discard, [base]);
  assert.equal(player.board[1], unit);
  assert.equal(unit.card, second);
  assert.equal(unit.health, second.health - 1);
  assert.equal(unit.ready, false);
  assert.match(act(game, 0, evolve), /needs 3 more turns/);
  nextTurn(game);
  nextTurn(game);
  assert.match(act(game, 0, evolve), /needs 1 more turn/);
  nextTurn(game);
  assert.equal(act(game, 0, evolve), "");
  assert.equal(unit.card, third);
  assert.equal(unit.health, third.health - 1);
  assert.equal(unit.ready, true);
  assert.deepEqual(player.discard, [base, second]);
});

test("the rival evolves a linked unit and cannot deploy Stage 2 in an empty lane", () => {
  const game = start();
  const [, rival] = game.sides;
  rival.hand = [second];
  rival.deck = [];
  rival.board[1] = { card: base, ready: false, health: base.health, turnsAtStage: 1 };
  act(game, 0, { type: "end" });
  playRival(game);
  assert.deepEqual(rival.board.map((unit) => unit?.card.id), [undefined, base.id, undefined]);
  act(game, 0, { type: "end" });
  playRival(game);
  assert.equal(rival.board[1].card, second);
});
