import { test } from "node:test";
import assert from "node:assert/strict";
import { STARTER_CARDS, STARTER_DECK, RIVAL_DECK, cardIssues, fitAbilityDraft, templateDraft } from "../public/cards.js";
import { act, actionIssue, createGame, playRival } from "../public/engine.js";

const getCard = (id) => STARTER_CARDS.find((card) => card.id === id);
const start = () => createGame(STARTER_CARDS, STARTER_DECK, RIVAL_DECK, () => 0.999);
const unit = (id, health = getCard(id).health) => ({ card: getCard(id), health, ready: true });

test("a draw item works on a full board without deploying and is discarded", () => {
  const game = start();
  const [player] = game.sides;
  const item = getCard("dispatch");
  player.hand = [item];
  player.board = [unit("sun"), unit("bell"), unit("foam")];
  const expected = player.deck.at(-1);
  assert.match(actionIssue(game, 0, { type: "deploy", lane: 0, hand: 0 }), /item/);
  assert.equal(act(game, 0, { type: "item", hand: 0 }), "");
  assert.deepEqual(player.hand, [expected]);
  assert.deepEqual(player.discard, [item]);
  assert.equal(player.pulse, 1);
  assert.equal(player.board.filter(Boolean).length, 3);
  player.hand = [item];
  player.deck = [];
  assert.match(act(game, 0, { type: "item", hand: 0 }), /deck is empty/);
  assert.deepEqual(player.hand, [item]);
  assert.equal(player.pulse, 1);
});

test("items use their correct target side and reject missing or full targets before spending", () => {
  const game = start();
  const [player, rival] = game.sides;
  player.hand = [getCard("patch"), getCard("flare")];
  player.pulse = 3;
  player.board[1] = unit("bell", 3);
  rival.board[0] = unit("foam");
  assert.match(act(game, 0, { type: "item", hand: 0, lane: 0 }), /allied unit/);
  assert.match(act(game, 0, { type: "item", hand: 1, lane: 1 }), /rival unit/);
  assert.equal(player.pulse, 3);
  assert.equal(act(game, 0, { type: "item", hand: 0, lane: 1 }), "");
  assert.equal(player.board[1].health, 4);
  assert.equal(rival.board[0].health, 1);
  assert.equal(act(game, 0, { type: "item", hand: 0, lane: 0 }), "");
  assert.equal(player.board[1].ready, true);
  assert.equal(rival.board[0], null);
  assert.deepEqual(rival.discard, [getCard("foam")]);
  assert.equal(player.pulse, 0);
});

test("Core effects are capped and the rival can use an item to win", () => {
  const game = start();
  const [player, rival] = game.sides;
  player.hand = [getCard("flask")];
  assert.match(act(game, 0, { type: "item", hand: 0 }), /full health/);
  player.core = 19;
  assert.equal(act(game, 0, { type: "item", hand: 0 }), "");
  assert.equal(player.core, 20);
  player.core = 2;
  act(game, 0, { type: "end" });
  rival.pulse = 3;
  rival.hand.unshift(getCard("charge"));
  playRival(game);
  assert.equal(player.core, 0);
  assert.equal(game.winner, 1);
  assert.ok(rival.discard.includes(getCard("charge")));
});

test("item drafts fit the effect price and skill-only drafts preserve scope and locks", () => {
  const item = templateDraft({ kind: "item", concept: "repair the core", locked: { name: "Lantern Oil" } });
  assert.equal(item.kind, "item");
  assert.equal(item.itemEffect, "heal-core");
  assert.equal(item.name, "Lantern Oil");
  assert.equal(item.cost, 2);
  assert.equal(Object.hasOwn(item, "attack"), false);
  assert.deepEqual(cardIssues(item), []);
  assert.match(cardIssues({ ...item, cost: 1 })[0], /at least 2 Pulse/);
  const abilities = templateDraft({ kind: "unit", mode: "abilities", concept: "fast fire duelist",
    current: { cost: 2, attack: 3, health: 1 }, locked: { active1: "strike" } });
  assert.deepEqual(abilities, { active1: "strike", active2: "lunge", ability: "haste" });
  assert.deepEqual(fitAbilityDraft({ itemEffect: "damage-core" }, { kind: "item", current: { cost: 2 } }),
    { itemEffect: "damage-enemy" });
});
