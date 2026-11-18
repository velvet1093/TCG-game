import { LIMITS, deckIssue } from "./cards.js";

const labels = ["You", "Rival"];
const logLimit = 35;

function shuffle(cards, random) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createSide(deck) {
  return { core: LIMITS.core, deck, hand: [], board: Array(LIMITS.lanes).fill(null), pulse: 0, capacity: 0 };
}

function log(game, message) {
  game.log.unshift(message);
  game.log.length = Math.min(game.log.length, logLimit);
}

function draw(side) {
  if (side.deck.length) side.hand.push(side.deck.pop());
}

export function createGame(cards, playerDeck, rivalDeck, random = Math.random) {
  const issue = deckIssue(playerDeck, cards) || deckIssue(rivalDeck, cards);
  if (issue) throw new Error(issue);
  const sides = [playerDeck, rivalDeck].map((deck) =>
    createSide(shuffle(deck.map((id) => cards.find((card) => card.id === id)), random)));
  for (const side of sides) {
    for (let i = 0; i < 4; i++) draw(side);
    if (side.hand.every((card) => card.cost > 2)) {
      const affordable = side.deck.findLastIndex((card) => card.cost <= 2);
      if (affordable !== -1) {
        [side.deck[affordable], side.hand[3]] = [side.hand[3], side.deck[affordable]];
      }
    }
  }
  const game = { sides, turn: 0, round: 1, winner: null, struck: [], log: [] };
  beginTurn(game, { opening: true });
  return game;
}

function beginTurn(game, { opening = false } = {}) {
  const side = game.sides[game.turn];
  side.capacity = Math.min(6, game.round + 1);
  side.pulse = side.capacity;
  game.struck = [];
  for (const unit of side.board) {
    if (unit) unit.ready = true;
  }
  if (!opening && !side.deck.length) {
    side.core = Math.max(0, side.core - 1);
    log(game, `${labels[game.turn]} take 1 fatigue damage from an empty deck.`);
    checkWinner(game);
  } else if (!opening) {
    draw(side);
  }
  if (game.winner === null) log(game, `Round ${game.round} · ${game.turn === 0 ? "Your turn" : "Rival turn"}`);
}

function checkWinner(game) {
  if (game.sides[0].core <= 0 || game.sides[1].core <= 0) {
    game.winner = game.sides[0].core > 0 ? 0 : 1;
    log(game, game.winner === 0 ? "Victory! The rival Core falls." : "Defeat. Your Core falls.");
  }
}

function clearLane(game, side, lane) {
  const unit = side.board[lane];
  if (unit && unit.health <= 0) {
    log(game, `${unit.card.name} was defeated.`);
    side.board[lane] = null;
  }
}

export function actionIssue(game, sideIndex, action) {
  if (game.winner !== null) return "The duel has ended.";
  if (game.turn !== sideIndex) return "Wait for your turn.";
  if (action.type === "end") return "";
  if (!Number.isInteger(action.lane) || action.lane < 0 || action.lane >= LIMITS.lanes) return "Choose a lane.";
  const side = game.sides[sideIndex];
  if (action.type === "deploy") {
    const card = side.hand[action.hand];
    if (!Number.isInteger(action.hand) || !card) return "Choose a card from your hand.";
    if (side.board[action.lane]) return "That lane is occupied.";
    if (card.cost > side.pulse) return "You need more Pulse.";
    return "";
  }
  if (action.type === "strike") return side.board[action.lane]?.ready ? "" : "That unit needs to ready.";
  if (action.type === "shift") {
    if (!side.board[action.lane]?.ready) return "That unit needs to ready.";
    if (!Number.isInteger(action.to) || action.to < 0 || action.to >= LIMITS.lanes ||
        Math.abs(action.to - action.lane) !== 1) return "Choose a neighboring lane.";
    return side.board[action.to] ? "That lane is occupied." : "";
  }
  return "Unknown action.";
}

export function act(game, sideIndex, action) {
  const issue = actionIssue(game, sideIndex, action);
  if (issue) return issue;
  const side = game.sides[sideIndex];
  const opponent = game.sides[1 - sideIndex];
  const { lane } = action;
  switch (action.type) {
    case "end":
      game.turn = 1 - sideIndex;
      if (game.turn === 0) game.round++;
      beginTurn(game);
      break;
    case "deploy": {
      const [card] = side.hand.splice(action.hand, 1);
      side.pulse -= card.cost;
      side.board[lane] = { card, health: card.health, ready: card.ability === "haste" };
      log(game, `${labels[sideIndex]} deploy ${card.name} to lane ${lane + 1}.`);
      if (card.ability === "draw") draw(side);
      if (card.ability === "heal") side.core = Math.min(LIMITS.core, side.core + 2);
      if (card.ability === "ping" && opponent.board[lane]) {
        opponent.board[lane].health--;
        clearLane(game, opponent, lane);
      }
      break;
    }
    case "shift": {
      const unit = side.board[lane];
      unit.ready = false;
      side.board[action.to] = unit;
      side.board[lane] = null;
      log(game, `${unit.card.name} shifts to lane ${action.to + 1}.`);
      break;
    }
    case "strike": {
      const unit = side.board[lane];
      const target = opponent.board[lane];
      unit.ready = false;
      if (target) {
        const damage = unit.card.attack - Number(target.card.ability === "guard");
        const counter = target.card.attack - Number(unit.card.ability === "guard");
        target.health -= damage;
        unit.health -= counter;
        log(game, `${unit.card.name} strikes ${target.card.name} for ${damage} (${counter} returned).`);
        clearLane(game, side, lane);
        clearLane(game, opponent, lane);
      } else {
        opponent.core = Math.max(0, opponent.core - unit.card.attack);
        log(game, `${unit.card.name} hits the Core for ${unit.card.attack}.`);
      }
      if (!game.struck.includes(lane)) {
        game.struck.push(lane);
        if (game.struck.length === 2) {
          side.pulse++;
          log(game, "Chain bonus: +1 Pulse for striking in two lanes.");
        }
      }
      checkWinner(game);
      break;
    }
  }
  return "";
}

function rankBotActions(game) {
  const [opponent, side] = game.sides;
  const options = [];
  for (let lane = 0; lane < LIMITS.lanes; lane++) {
    const unit = side.board[lane];
    const target = opponent.board[lane];
    if (unit?.ready) {
      let score = opponent.core <= unit.card.attack ? 100 : 8 + unit.card.attack;
      if (target) {
        const kills = unit.card.attack - Number(target.card.ability === "guard") >= target.health;
        const survives = target.card.attack - Number(unit.card.ability === "guard") < unit.health;
        score = (kills ? 9 + target.card.cost : 3) - (survives ? 0 : 5 + unit.card.cost / 2);
      }
      options.push({ score, action: { type: "strike", lane } });
      for (const to of [lane - 1, lane + 1]) {
        const action = { type: "shift", lane, to };
        if (target && !opponent.board[to] && !actionIssue(game, 1, action)) options.push({ score: 1, action });
      }
    }
    if (!unit) {
      side.hand.forEach((card, hand) => {
        if (card.cost > side.pulse) return;
        let score = 4 + card.cost + (target ? 0.5 : 0);
        if (card.ability === "haste" && !target) score += 3;
        if (card.ability === "ping" && target?.health === 1) score += 6;
        if (card.ability === "heal" && side.core <= 18) score += 2;
        options.push({ score, action: { type: "deploy", lane, hand } });
      });
    }
  }
  return options.filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
}

export function playRival(game) {
  while (game.turn === 1 && game.winner === null) {
    const action = rankBotActions(game)[0]?.action ?? { type: "end" };
    act(game, 1, action);
  }
}
