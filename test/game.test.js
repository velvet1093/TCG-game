import { test } from "node:test";
import assert from "node:assert/strict";
import { STARTER_CARDS, STARTER_DECK, RIVAL_DECK, cardIssues, deckIssue, templateDraft } from "../public/cards.js";
import { act, createGame, playRival } from "../public/engine.js";

const start = () => createGame(STARTER_CARDS, STARTER_DECK, RIVAL_DECK, () => 0.999);
const unit = (id, ready = true) => {
  const card = STARTER_CARDS.find((item) => item.id === id);
  return { card, health: card.health, ready };
};

test("starter cards and decks follow the same rules as custom cards", () => {
  for (const card of STARTER_CARDS) assert.deepEqual(cardIssues(card), [], card.name);
  assert.equal(deckIssue(STARTER_DECK, STARTER_CARDS), "");
  assert.equal(deckIssue(RIVAL_DECK, STARTER_CARDS), "");
  assert.match(deckIssue(Array(15).fill("foam"), STARTER_CARDS), /3 copies/);
  assert.match(deckIssue(STARTER_DECK.slice(1), STARTER_CARDS), /15 cards/);
  assert.match(cardIssues({ ...STARTER_CARDS[0], attack: 7 })[0], /budget/);
});

test("offline drafts fit the card budget across roles and factions", () => {
  for (const concept of ["fire speed", "wood tank", "tiny ice medic", "giant shadow healer", "water scout", ""]) {
    const draft = templateDraft({ concept, locked: { name: "My Card" } });
    assert.equal(draft.name, "My Card");
    assert.deepEqual(cardIssues(draft), []);
  }
});

test("Quick fill uses a locked name as context and preserves locked values", () => {
  const locked = { name: "Forest Guardian", attack: 5, flavor: "" };
  const draft = templateDraft({ name: locked.name, locked });
  assert.equal(draft.name, locked.name);
  assert.equal(draft.faction, "grove");
  assert.equal(draft.ability, "guard");
  assert.equal(draft.attack, 5);
  assert.equal(draft.flavor, "");
  assert.deepEqual(cardIssues(draft), []);
  assert.notEqual(templateDraft({ name: locked.name }).name, locked.name);
});

test("Quick fill drafts around fixed stats and identifies impossible locks", () => {
  const locked = { cost: 1, attack: 3 };
  const draft = templateDraft({ concept: "forest guard", locked });
  assert.deepEqual({ cost: draft.cost, attack: draft.attack, health: draft.health, ability: draft.ability },
    { cost: 1, attack: 3, health: 1, ability: "basic" });
  assert.deepEqual(cardIssues(draft), []);
  assert.throws(() => templateDraft({ locked: { cost: 1, attack: 3, ability: "guard" } }), /locked values exceed/);
  assert.throws(() => templateDraft({ locked: { name: "" } }), /locked card name/);
});

test("deploy and strike charge Pulse and respect unit readiness", () => {
  const game = start();
  const [player, rival] = game.sides;
  player.hand = [unit("bell").card, unit("cinder").card];
  assert.equal(player.pulse, 2);
  assert.match(act(game, 0, { type: "deploy", lane: 0, hand: 0 }), /more Pulse/);
  assert.equal(act(game, 0, { type: "deploy", lane: 0, hand: 1 }), "");
  assert.equal(player.pulse, 0);
  assert.equal(act(game, 0, { type: "strike", lane: 0 }), "");
  assert.equal(rival.core, 18);
  assert.match(act(game, 0, { type: "strike", lane: 0 }), /ready/);
  assert.match(act(game, 1, { type: "end" }), /your turn/);
});

test("strikes apply return damage and Ward and grant one Chain bonus", () => {
  const game = start();
  const [player, rival] = game.sides;
  player.board = [unit("bell"), unit("cinder"), unit("bell")];
  rival.board[0] = unit("breakwater");
  act(game, 0, { type: "strike", lane: 0 });
  assert.equal(rival.board[0].health, 1);
  assert.equal(player.board[0].health, 2);
  act(game, 0, { type: "strike", lane: 1 });
  act(game, 0, { type: "strike", lane: 2 });
  assert.equal(player.pulse, 3);
  assert.equal(rival.core, 14);
});

test("shift exhausts the unit and validates adjacency and occupancy", () => {
  const game = start();
  const [player] = game.sides;
  player.board[0] = unit("bell");
  assert.match(act(game, 0, { type: "shift", lane: 0, to: 2 }), /neighboring/);
  assert.equal(act(game, 0, { type: "shift", lane: 0, to: 1 }), "");
  assert.equal(player.board[0], null);
  assert.equal(player.board[1].ready, false);
  assert.match(act(game, 0, { type: "strike", lane: 1 }), /ready/);
  act(game, 0, { type: "end" });
  act(game, 1, { type: "end" });
  assert.equal(player.board[1].ready, true);
  assert.equal(player.pulse, 3);
});

test("Spark removes defeated units and a lethal Core strike ends the duel", () => {
  const game = start();
  const [player, rival] = game.sides;
  rival.board[0] = unit("foam");
  player.hand = [unit("matchstick").card];
  act(game, 0, { type: "deploy", lane: 0, hand: 0 });
  assert.equal(rival.board[0], null);
  assert.equal(player.board[0].ready, false);
  player.board[1] = unit("bell");
  rival.core = 3;
  act(game, 0, { type: "strike", lane: 1 });
  assert.equal(game.winner, 0);
  assert.match(act(game, 0, { type: "end" }), /ended/);
});

test("the rival plays legal turns and fatigue breaks empty-deck stalemates", () => {
  const game = start();
  act(game, 0, { type: "end" });
  playRival(game);
  assert.equal(game.turn, 0);
  assert.equal(game.round, 2);
  assert.ok(game.sides[1].board.some(Boolean));
  game.sides[0].deck = [];
  game.sides[0].core = 1;
  act(game, 0, { type: "end" });
  act(game, 1, { type: "end" });
  assert.equal(game.winner, 1);
});
