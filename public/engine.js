import { ABILITIES, EVOLUTION_TURNS, ITEM_EFFECTS, LIMITS, STAT_STEP, deckIssue, evolvesFrom, isItem, unitStage } from "./cards.js";
import { ATTACK_EFFECTS, activeAttacks, attackPulse, laneAttackDamage } from "./attacks.js";

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
  return { core: LIMITS.core, deck, hand: [], discard: [], board: Array(LIMITS.lanes).fill(null), pulse: 0, capacity: 0 };
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
    const playableUnit = (card) => card.cost <= 2 && !isItem(card) && unitStage(card) === 1;
    if (!side.hand.some(playableUnit)) {
      const preferred = side.deck.findLastIndex(playableUnit);
      const affordable = preferred === -1 && !side.hand.some((card) => isItem(card) && card.cost <= 2)
        ? side.deck.findLastIndex((card) => isItem(card) && card.cost <= 2) : preferred;
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
    if (unit) {
      unit.turnsAtStage = Math.min(EVOLUTION_TURNS, (unit.turnsAtStage ?? 0) + 1);
      unit.ready = !unit.stunned;
      unit.stunned = false;
    }
  }
  if (!opening && !side.deck.length) {
    side.core = Math.max(0, side.core - LIMITS.fatigue);
    log(game, `${labels[game.turn]} take ${LIMITS.fatigue} fatigue damage from an empty deck.`);
    checkWinner(game);
  } else if (!opening) {
    draw(side);
  }
  if (game.winner === null) log(game, `Round ${game.round} · ${game.turn === 0 ? "Your turn" : "Rival turn"}`);
}

function chosenAttack(unit, action) {
  const moves = activeAttacks(unit.card);
  return action.type === "strike" ? moves.find(({ effects }) => effects.length === 1 && effects[0] === "hit")
    : moves.find(({ slot }) => slot === action.skill);
}

const hitsLane = (effects) => effects.includes("hit") || effects.includes("heavy");
const ward = (unit) => unit?.card.ability === "guard" ? ABILITIES.guard.amount : 0;

function readyAttackIssue(game, sideIndex, action) {
  const { lane } = action;
  const side = game.sides[sideIndex];
  const rival = game.sides[1 - sideIndex];
  const unit = side.board[lane];
  if (!unit?.ready) return "That unit needs to ready.";
  const move = chosenAttack(unit, action);
  if (!move) return "That attack isn’t on this card.";
  if (side.pulse < attackPulse(move)) return "You need more Pulse.";
  const { effects } = move;
  if (hitsLane(effects) ||
      (effects.includes("splash") && (rival.board[lane - 1] || rival.board[lane + 1])) ||
      (effects.includes("mend") && unit.health < unit.card.health) ||
      (effects.includes("stun") && rival.board[lane] && !rival.board[lane].stunned) ||
      (effects.includes("draw") && side.deck.length)) return "";
  return "None of this attack’s effects can apply right now.";
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
    side.discard.push(unit.card);
    side.board[lane] = null;
  }
}

function itemIssue(game, sideIndex, { hand, lane }) {
  const side = game.sides[sideIndex];
  const rival = game.sides[1 - sideIndex];
  const card = side.hand[hand];
  if (!Number.isInteger(hand) || !isItem(card)) return "Choose an item from your hand.";
  if (card.cost > side.pulse) return "You need more Pulse.";
  const effect = ITEM_EFFECTS[card.itemEffect];
  if (!effect) return "This item has no effect.";
  if (card.itemEffect === "draw" && !side.deck.length) return "Your deck is empty.";
  if (card.itemEffect === "heal-core" && side.core >= LIMITS.core) return "Your Core is already at full health.";
  if (effect.target === "ally" || effect.target === "enemy") {
    const unit = (effect.target === "ally" ? side : rival).board[lane];
    if (!Number.isInteger(lane) || lane < 0 || lane >= LIMITS.lanes || !unit) {
      return effect.target === "ally" ? "Choose an injured allied unit." : "Choose a rival unit.";
    }
    if (effect.target === "ally" && unit.health >= unit.card.health) return "That unit is already at full health.";
  }
  return "";
}

export function evolutionTurnsLeft(unit) {
  return EVOLUTION_TURNS - (unit.turnsAtStage ?? 0);
}

export function actionIssue(game, sideIndex, action) {
  if (game.winner !== null) return "The duel has ended.";
  if (game.turn !== sideIndex) return "Wait for your turn.";
  if (action.type === "end") return "";
  if (action.type === "item") return itemIssue(game, sideIndex, action);
  if (!Number.isInteger(action.lane) || action.lane < 0 || action.lane >= LIMITS.lanes) return "Choose a lane.";
  const side = game.sides[sideIndex];
  if (action.type === "deploy" || action.type === "evolve") {
    const card = side.hand[action.hand];
    if (!Number.isInteger(action.hand) || !card) return "Choose a card from your hand.";
    if (isItem(card)) return "Play this item for its effect.";
    if (action.type === "evolve") {
      const unit = side.board[action.lane];
      if (!unit || !evolvesFrom(card, unit.card)) return "Choose this card’s previous stage.";
      const turns = evolutionTurnsLeft(unit);
      if (turns > 0) return `${unit.card.name} needs ${turns} more ${turns === 1 ? "turn" : "turns"} to evolve.`;
      return card.cost > side.pulse ? "You need more Pulse." : "";
    }
    if (unitStage(card) > 1) return "Play this card by evolving its previous stage.";
    if (side.board[action.lane]) return "That lane is occupied.";
    if (card.cost > side.pulse) return "You need more Pulse.";
    return "";
  }
  if (action.type === "strike" || action.type === "skill") return readyAttackIssue(game, sideIndex, action);
  if (action.type === "shift") {
    if (!side.board[action.lane]?.ready) return "That unit needs to ready.";
    if (!Number.isInteger(action.to) || action.to < 0 || action.to >= LIMITS.lanes ||
        Math.abs(action.to - action.lane) !== 1) return "Choose a neighboring lane.";
    return side.board[action.to] ? "That lane is occupied." : "";
  }
  return "Unknown action.";
}

function playAttack(game, sideIndex, action) {
  const { lane } = action;
  const side = game.sides[sideIndex];
  const rival = game.sides[1 - sideIndex];
  const unit = side.board[lane];
  const move = chosenAttack(unit, action);
  const { effects, name } = move;
  const target = rival.board[lane];
  unit.ready = false;
  side.pulse -= attackPulse(move);
  let damage = 0;
  if (hitsLane(effects)) {
    damage = Math.max(0, laneAttackDamage(unit.card.attack, effects) - ward(target));
    game.impact = { side: 1 - sideIndex, lane, amount: damage, core: !target };
    if (target) {
      const counter = Math.max(0, target.card.attack - ward(unit));
      target.health -= damage;
      unit.health -= counter;
      log(game, `${unit.card.name} uses ${name} on ${target.card.name} for ${damage} (${counter} returned).`);
      clearLane(game, side, lane);
      clearLane(game, rival, lane);
    } else {
      rival.core = Math.max(0, rival.core - damage);
      log(game, `${unit.card.name} uses ${name} on the Core for ${damage}.`);
    }
    if (!game.struck.includes(lane)) {
      game.struck.push(lane);
      if (game.struck.length === 2) {
        side.pulse++;
        log(game, "Chain bonus: +1 Pulse for striking in two lanes.");
      }
    }
  }
  if (effects.includes("splash")) {
    for (const adjacent of [lane - 1, lane + 1]) {
      const neighbor = rival.board[adjacent];
      if (!neighbor) continue;
      neighbor.health -= ATTACK_EFFECTS.splash.amount;
      log(game, `${name} deals ${ATTACK_EFFECTS.splash.amount} damage to ${neighbor.card.name}.`);
      clearLane(game, rival, adjacent);
    }
  }
  if (effects.includes("drain") && damage > 0) {
    const restored = Math.min(ATTACK_EFFECTS.drain.amount, LIMITS.core - side.core);
    side.core += restored;
    if (restored) log(game, `${name} restores ${restored} Core health.`);
  }
  if (effects.includes("mend") && side.board[lane] && unit.health < unit.card.health) {
    const restored = Math.min(ATTACK_EFFECTS.mend.amount, unit.card.health - unit.health);
    unit.health += restored;
    log(game, `${name} restores ${restored} HP to ${unit.card.name}.`);
  }
  if (effects.includes("stun") && rival.board[lane] && !rival.board[lane].stunned) {
    target.stunned = true;
    log(game, `${name} stuns ${target.card.name} for its next turn.`);
  }
  if (effects.includes("draw") && side.deck.length) {
    draw(side);
    log(game, `${unit.card.name} draws 1 card with ${name}.`);
  }
  checkWinner(game);
}

function playItem(game, sideIndex, { hand, lane }) {
  const side = game.sides[sideIndex];
  const rival = game.sides[1 - sideIndex];
  const [card] = side.hand.splice(hand, 1);
  const { amount } = ITEM_EFFECTS[card.itemEffect];
  side.pulse -= card.cost;
  side.discard.push(card);
  const source = card.name;
  switch (card.itemEffect) {
    case "draw":
      draw(side);
      log(game, `${source} draws 1 card for ${sideIndex === 0 ? "you" : "the rival"}.`);
      break;
    case "heal-ally": {
      const ally = side.board[lane];
      const restored = Math.min(amount, ally.card.health - ally.health);
      ally.health += restored;
      log(game, `${source} restores ${restored} HP to ${ally.card.name}.`);
      break;
    }
    case "damage-enemy": {
      const unit = rival.board[lane];
      unit.health -= amount;
      game.impact = { side: 1 - sideIndex, lane, amount, core: false };
      log(game, `${source} deals ${amount} damage to ${unit.card.name}.`);
      clearLane(game, rival, lane);
      break;
    }
    case "heal-core": {
      const restored = Math.min(amount, LIMITS.core - side.core);
      side.core += restored;
      log(game, `${source} restores ${restored} health to ${sideIndex === 0 ? "your" : "the rival"} Core.`);
      break;
    }
    case "damage-core":
      rival.core = Math.max(0, rival.core - amount);
      game.impact = { side: 1 - sideIndex, amount, core: true };
      log(game, `${source} deals ${amount} damage to ${sideIndex === 0 ? "the rival" : "your"} Core.`);
      checkWinner(game);
      break;
  }
}

export function act(game, sideIndex, action) {
  const issue = actionIssue(game, sideIndex, action);
  if (issue) return issue;
  const side = game.sides[sideIndex];
  const opponent = game.sides[1 - sideIndex];
  const { lane } = action;
  switch (action.type) {
    case "item":
      playItem(game, sideIndex, action);
      break;
    case "end":
      game.turn = 1 - sideIndex;
      if (game.turn === 0) game.round++;
      beginTurn(game);
      break;
    case "deploy": {
      const [card] = side.hand.splice(action.hand, 1);
      side.pulse -= card.cost;
      side.board[lane] = { card, health: card.health, ready: card.ability === "haste", turnsAtStage: 0 };
      log(game, `${labels[sideIndex]} deploy ${card.name} to lane ${lane + 1}.`);
      if (card.ability === "draw") draw(side);
      if (card.ability === "heal") side.core = Math.min(LIMITS.core, side.core + ABILITIES.heal.amount);
      if (card.ability === "ping" && opponent.board[lane]) {
        opponent.board[lane].health -= ABILITIES.ping.amount;
        clearLane(game, opponent, lane);
      }
      break;
    }
    case "evolve": {
      const [card] = side.hand.splice(action.hand, 1);
      const unit = side.board[lane];
      const damage = unit.card.health - unit.health;
      side.pulse -= card.cost;
      log(game, `${unit.card.name} evolves into ${card.name} in lane ${lane + 1}.`);
      side.discard.push(unit.card);
      unit.card = card;
      unit.health = Math.max(STAT_STEP, card.health - damage);
      unit.turnsAtStage = 0;
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
    case "strike":
    case "skill":
      playAttack(game, sideIndex, action);
      break;
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
      for (const move of activeAttacks(unit.card)) {
        const { slot, effects } = move;
        const action = { type: "skill", lane, skill: slot };
        if (actionIssue(game, 1, action)) continue;
        const power = laneAttackDamage(unit.card.attack, effects);
        const damage = Math.max(0, power - ward(target));
        let score = 0;
        if (power && !target) score = opponent.core <= power ? 100 : 8 + power / STAT_STEP;
        if (power && target) {
          const kills = damage >= target.health;
          const survives = target.card.attack - ward(unit) < unit.health;
          score = (kills ? 9 + target.card.cost : 1 + damage / STAT_STEP) - (survives ? 0 : 5 + unit.card.cost / 2);
        }
        if (effects.includes("mend")) score += Math.min(ATTACK_EFFECTS.mend.amount, unit.card.health - unit.health) / STAT_STEP;
        if (effects.includes("drain") && damage > 0) score += Math.min(ATTACK_EFFECTS.drain.amount, LIMITS.core - side.core) / STAT_STEP;
        if (effects.includes("stun") && target?.health > damage && !target.stunned) score += 2 + target.card.attack / (2 * STAT_STEP);
        if (effects.includes("draw") && side.deck.length) score += 3;
        if (effects.includes("splash")) {
          score += [opponent.board[lane - 1], opponent.board[lane + 1]]
            .reduce((total, neighbor) => total + (neighbor?.health <= ATTACK_EFFECTS.splash.amount ? 4 : neighbor ? 1.5 : 0), 0);
        }
        options.push({ score: score - attackPulse(move) * 0.8, action });
      }
      for (const to of [lane - 1, lane + 1]) {
        const action = { type: "shift", lane, to };
        if (target && !opponent.board[to] && !actionIssue(game, 1, action)) options.push({ score: 1, action });
      }
    }
    side.hand.forEach((card, hand) => {
      if (isItem(card) || card.cost > side.pulse) return;
      if (unit) {
        const action = { type: "evolve", lane, hand };
        if (!actionIssue(game, 1, action)) options.push({ score: 12, action });
      } else if (unitStage(card) === 1) {
        let score = 4 + card.cost + (target ? 0.5 : 0);
        if (card.ability === "haste" && !target) score += 3;
        if (card.ability === "ping" && target?.health <= ABILITIES.ping.amount) score += 6;
        if (card.ability === "heal" && side.core <= LIMITS.core - ABILITIES.heal.amount) score += 2;
        options.push({ score, action: { type: "deploy", lane, hand } });
      }
    });
  }
  side.hand.forEach((card, hand) => {
    if (!isItem(card)) return;
    const effect = ITEM_EFFECTS[card.itemEffect];
    const lanes = effect.target === "ally" || effect.target === "enemy" ? side.board.keys() : [undefined];
    for (const lane of lanes) {
      const action = { type: "item", hand, lane };
      if (actionIssue(game, 1, action)) continue;
      const ally = side.board[lane];
      const enemy = opponent.board[lane];
      const scores = {
        draw: side.hand.length <= 3 ? 5.5 : 2.8,
        "heal-ally": ally ? 1.5 + Math.min(effect.amount, ally.card.health - ally.health) / STAT_STEP : 0,
        "damage-enemy": enemy ? enemy.health <= effect.amount ? 8 + enemy.card.cost : 3 : 0,
        "heal-core": side.core <= LIMITS.core / 2 ? 8 : 2 + Math.min(effect.amount, LIMITS.core - side.core) / STAT_STEP,
        "damage-core": opponent.core <= effect.amount ? 100 : 3.5,
      };
      options.push({ score: scores[card.itemEffect], action });
    }
  });
  return options.filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
}

export function playRival(game) {
  while (game.turn === 1 && game.winner === null) {
    const action = rankBotActions(game)[0]?.action ?? { type: "end" };
    act(game, 1, action);
  }
}
