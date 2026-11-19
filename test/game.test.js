import { test } from "node:test";
import assert from "node:assert/strict";
import { STARTER_CARDS, STARTER_DECK, RIVAL_DECK, cardIssues, deckIssue, templateDraft } from "../public/cards.js";
import { act, createGame, playRival } from "../public/engine.js";
import { activeAttacks, emptyAttack } from "../public/attacks.js";

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
  assert.match(cardIssues({ ...STARTER_CARDS[0], attack: 70 })[0], /budget/);
});

test("offline drafts fit the card budget across roles and factions", () => {
  for (const concept of ["fire speed", "wood tank", "tiny ice medic", "giant shadow healer", "water scout", ""]) {
    const draft = templateDraft({ concept, locked: { name: "My Card" } });
    assert.equal(draft.name, "My Card");
    assert.deepEqual(cardIssues(draft), []);
  }
});

test("Quick fill uses a locked name as context and preserves locked values", () => {
  const locked = { name: "Forest Guardian", attack: 50, flavor: "" };
  const draft = templateDraft({ name: locked.name, locked });
  assert.equal(draft.name, locked.name);
  assert.equal(draft.faction, "grove");
  assert.equal(draft.ability, "guard");
  assert.equal(draft.attack, 50);
  assert.equal(draft.flavor, "");
  assert.deepEqual(cardIssues(draft), []);
  assert.notEqual(templateDraft({ name: locked.name }).name, locked.name);
});

test("Quick fill drafts around fixed stats and identifies impossible locks", () => {
  const locked = { cost: 1, attack: 50 };
  const draft = templateDraft({ concept: "forest guard", locked });
  assert.deepEqual({ cost: draft.cost, attack: draft.attack, health: draft.health, ability: draft.ability },
    { cost: 1, attack: 50, health: 10, ability: "basic" });
  assert.deepEqual(cardIssues(draft), []);
  assert.throws(() => templateDraft({ locked: { cost: 1, attack: 50, ability: "guard" } }), /locked values exceed/);
  assert.throws(() => templateDraft({ locked: { name: "" } }), /locked card name/);
});

test("blank cards have no hidden attack and old saved skills migrate explicitly", () => {
  const { active1, active2, ...legacy } = STARTER_CARDS[0];
  assert.deepEqual(cardIssues(legacy), []);
  assert.deepEqual(activeAttacks(legacy), []);
  const old = activeAttacks({ ...legacy, active1: "strike" })[0];
  assert.deepEqual(old, { slot: "active1", name: "Strike", concept: "", effects: ["hit"] });
  assert.match(cardIssues({ ...legacy, active1, active2: active1 })[0], /different names/);
  const named = { name: "Thunder Spiral", concept: "A wide cut.", effects: ["hit", "splash"] };
  const draft = templateDraft({ concept: "storm rider", locked: { active2: named, ability: "draw" } });
  assert.deepEqual(draft.active2, named);
  assert.equal(draft.ability, "draw");
  assert.throws(() => templateDraft({ locked: { active1: named, active2: named } }), /same name/);
  assert.deepEqual(activeAttacks({ active1: emptyAttack(), active2: emptyAttack() }), []);
});

test("Quick fill uses elements and concrete settings in varied flavor text", () => {
  assert.equal(templateDraft({ concept: "snow pilgrim" }).faction, "frost");
  assert.equal(templateDraft({ concept: "copper mechanic" }).faction, "alloy");
  const brief = { name: "Temple Watch", concept: "a lightning guard at the shrine" };
  const first = templateDraft(brief);
  assert.equal(first.faction, "storm");
  assert.match(first.flavor, /shrine/i);
  assert.notEqual(first.flavor, templateDraft({ ...brief, variant: 1 }).flavor);
  assert.ok(first.flavor.length <= 140);
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
  assert.equal(rival.core, 280);
  assert.match(act(game, 0, { type: "strike", lane: 0 }), /ready/);
  assert.match(act(game, 1, { type: "end" }), /your turn/);
});

test("strikes apply return damage and Ward and grant one Chain bonus", () => {
  const game = start();
  const [player, rival] = game.sides;
  player.board = [unit("bell"), unit("cinder"), unit("bell")];
  rival.board[0] = unit("breakwater");
  act(game, 0, { type: "strike", lane: 0 });
  assert.equal(rival.board[0].health, 30);
  assert.equal(player.board[0].health, 40);
  act(game, 0, { type: "strike", lane: 1 });
  act(game, 0, { type: "strike", lane: 2 });
  assert.equal(player.pulse, 3);
  assert.equal(rival.core, 240);
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
  rival.board[0] = { ...unit("foam"), health: 10 };
  player.hand = [unit("matchstick").card];
  act(game, 0, { type: "deploy", lane: 0, hand: 0 });
  assert.equal(rival.board[0], null);
  assert.equal(player.board[0].ready, false);
  player.board[1] = unit("bell");
  rival.core = 30;
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
  game.sides[0].core = 10;
  act(game, 0, { type: "end" });
  act(game, 1, { type: "end" });
  assert.equal(game.winner, 1);
});

test("active skills use Pulse, enforce membership and consume a unit's action", () => {
  const game = start();
  const [player, rival] = game.sides;
  player.board[0] = unit("sun");
  assert.match(act(game, 0, { type: "skill", lane: 0, skill: "sweep" }), /isn’t on this card/);
  player.pulse = 0;
  assert.match(act(game, 0, { type: "skill", lane: 0, skill: "active2" }), /more Pulse/);
  player.pulse = 2;
  rival.board[0] = unit("tidevault");
  assert.equal(act(game, 0, { type: "skill", lane: 0, skill: "active2" }), "");
  assert.equal(player.pulse, 1);
  assert.equal(rival.board[0].health, 30);
  assert.match(act(game, 0, { type: "skill", lane: 0, skill: "active1" }), /ready/);
});

test("Sweep hits adjacent rival units and Recover heals without counting toward a chain", () => {
  const game = start();
  const [player, rival] = game.sides;
  player.board[1] = unit("static");
  player.board[2] = { ...unit("ivy"), health: 30 };
  rival.board[0] = { ...unit("foam"), health: 10 };
  rival.board[2] = unit("cedar");
  assert.equal(act(game, 0, { type: "skill", lane: 1, skill: "active2" }), "");
  assert.equal(rival.board[0], null);
  assert.equal(rival.board[2].health, 40);
  assert.equal(act(game, 0, { type: "skill", lane: 2, skill: "active2" }), "");
  assert.equal(player.board[2].health, 60);
  assert.equal(player.pulse, 0);
  assert.deepEqual(game.struck, [1]);
});
