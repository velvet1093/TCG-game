import { ABILITIES, ACTIVE_SKILLS, CARD_FIELDS, FIELD_LABELS, FACTIONS, LIMITS, STARTER_CARDS, STARTER_DECK, RIVAL_DECK,
  activeSkills, cardIssues, deckIssue, fitDraft, lockedCardIssue, statBudget, templateDraft } from "./cards.js";
import { act, actionIssue, createGame, playRival } from "./engine.js";
import { OPENROUTER_DEFAULT_MODEL, requestOpenRouterDraft } from "./ai-draft.js";
import { draftFlavor } from "./lore.js";

const main = document.querySelector("#main");
const section = (id) => document.querySelector(`#${id}-template`).content.cloneNode(true);
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const blankCard = () => ({
  id: "", name: "", faction: "", cost: 2, attack: 2, health: 3, ability: "basic", active1: "strike", active2: "none",
  flavor: "", art: "", concept: "", shareArt: false, locks: [],
});
let file = blankCard();
let library = { cards: [], deck: [...STARTER_DECK] };
let database;
let writes = Promise.resolve();
let storageWarning = "";
let deckMessage = "";
let collectionElement = "";
let formMessage = "";
let draftMessage = "";
let loreVariant = 0;
let revision = 0;
let artJob = 0;
let artLoading = false;
let saving = false;
let drafting = false;
let aiAvailable;
let draftProvider;
let openRouterKey = "";
let openRouterModel = OPENROUTER_DEFAULT_MODEL;
let game;
let selection;
let arenaMessage = "";
let tab;

const catalog = () => [...STARTER_CARDS, ...library.cards];
const factionOf = (card) => Object.hasOwn(FACTIONS, card.faction) ? FACTIONS[card.faction] : null;
const abilityOf = (card) => Object.hasOwn(ABILITIES, card.ability) ? ABILITIES[card.ability] : ABILITIES.basic;
const mobile = matchMedia("(max-width: 610px)");
const lockedFields = () => Object.fromEntries(CARD_FIELDS.filter((key) => file.locks.includes(key)).map((key) => [key, file[key]]));
const selectedProvider = () => draftProvider ?? (aiAvailable ? "openai" : "openrouter");

function openStorage() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("lanternwake-arena", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("game");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function loadStorage() {
  try {
    database = await openStorage();
    const saved = await new Promise((resolve, reject) => {
      const read = database.transaction("game").objectStore("game").get("collection");
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    if (Array.isArray(saved?.cards) && Array.isArray(saved?.deck)) library = saved;
  } catch {
    storageWarning = "Browser storage is unavailable. Any new cards or deck changes will last for this session only.";
    database = undefined;
  }
}

function updateLibrary(update) {
  const result = writes.then(async () => {
    const next = update(library);
    if (next === library) return;
    if (database) {
      await new Promise((resolve, reject) => {
        const tx = database.transaction("game", "readwrite");
        tx.objectStore("game").put(next, "collection");
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
    }
    library = next;
  });
  writes = result.catch(() => {});
  return result;
}

function artMarkup(card) {
  const faction = factionOf(card);
  const validArt = typeof card.art === "string" && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(card.art);
  return validArt
    ? `<img class="card-art" src="${card.art}" alt="">`
    : `<span class="card-art placeholder" aria-hidden="true"><span>${faction?.icon ?? "✧"}</span></span>`;
}

function skillMarkup(id) {
  const skill = ACTIVE_SKILLS[id];
  return `<div class="card-skill"><div><strong>${skill.name}</strong><span class="skill-price" title="Pulse cost">✦ ${skill.pulse}</span></div>
    <p>${skill.text}</p></div>`;
}

function cardMarkup(card) {
  const faction = factionOf(card);
  const name = escapeHTML(card.name || "Untitled unit");
  const ability = abilityOf(card);
  return `<article class="game-card" style="--faction: ${faction?.color ?? "#bdc8d6"}">
    <header class="card-top"><div><span class="card-element">${faction?.icon ?? "✧"} ${faction?.name ?? "Unit"}</span><h3>${name}</h3></div>
      <span class="card-hp" title="Health">${escapeHTML(card.health || "–")} <small>HP</small></span></header>
    <div class="card-window">${artMarkup(card)}</div>
    <div class="card-body">
      <div class="card-stats"><span title="Attack">⚔ ${escapeHTML(card.attack || "–")} ATK</span><span title="Deploy cost">✦ ${escapeHTML(card.cost || "–")} Deploy</span></div>
      ${card.ability !== "basic" ? `<div class="card-skill passive"><div><strong>${ability.name}</strong><span>Passive</span></div><p>${ability.text}</p></div>` : ""}
      ${activeSkills(card).map(skillMarkup).join("")}
      ${card.flavor ? `<p class="flavor">${escapeHTML(card.flavor)}</p>` : ""}
    </div>
  </article>`;
}

function inspectCard(card) {
  const dialog = document.querySelector("#inspect-card");
  document.querySelector("#inspect-content").innerHTML = cardMarkup(card);
  dialog.showModal();
}

function render() {
  const previousTab = tab;
  tab = ["arena", "deck", "studio"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "arena";
  for (const link of document.querySelectorAll("[data-tab]")) {
    if (link.dataset.tab === tab) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.title = `${{ arena: "Duel arena", deck: "Deck", studio: "Card studio" }[tab]} · Lanternwake Arena`;
  if (tab === "arena") {
    main.replaceChildren(section("arena"));
    renderArena();
  } else if (tab === "deck") {
    renderDeck();
  } else {
    main.replaceChildren(section("studio"));
    mountStudio();
  }
  if (tab !== previousTab) window.scrollTo(0, 0);
}

function startDuel() {
  const cards = catalog();
  const issue = deckIssue(library.deck, cards);
  if (issue) {
    arenaMessage = `${issue} Finish your deck to start a duel.`;
  } else {
    game = createGame(cards, library.deck, RIVAL_DECK);
    selection = null;
    arenaMessage = "";
  }
  renderArena();
}

function impactMarkup(impact) {
  if (!impact || !impact.amount) return "";
  return `<span class="hit-fx" aria-hidden="true">−${impact.amount}</span>`;
}

function coreMarkup(side, index, impact) {
  const name = index === 0 ? "Your Core" : "Rival Core";
  return `<div class="core-side ${index === 0 ? "player-core" : "rival-core"}"><div class="core-label"><span class="core-icon" aria-hidden="true">◈</span>
    <div><h2>${name}</h2><span class="core-counts">${side.deck.length} deck · ${side.hand.length} hand</span></div></div>
    ${impactMarkup(impact?.core && impact.side === index ? impact : null)}
    <div class="core-health"><strong>${side.core}</strong><meter min="0" max="${LIMITS.core}" value="${side.core}" aria-label="${name} health"></meter></div></div>`;
}

function unitMarkup(unit, lane, own, action, impact) {
  if (!unit) return `<div class="empty-slot">${action || '<span aria-hidden="true">◇</span><span>Open</span>'}${impactMarkup(impact)}</div>`;
  const { card } = unit;
  const faction = factionOf(card);
  const selected = own && selection?.type === "unit" && selection.lane === lane;
  return `<div class="unit-slot">${impactMarkup(impact)}<button type="button" class="unit${selected ? " is-selected" : ""}"
    style="--faction: ${faction.color}" data-action="${own ? "select-unit" : "inspect-rival"}" data-lane="${lane}"
    aria-label="${own ? "Choose actions for" : "View"} ${escapeHTML(card.name)}, ${unit.health} health"${own ? ` aria-pressed="${selected}"` : ""}>
    <span class="unit-head"><span aria-hidden="true">${faction.icon}</span><strong>${escapeHTML(card.name)}</strong></span>
    <span class="unit-art-frame">${artMarkup(card)}</span>
    <span class="unit-stats"><span title="Attack">⚔ ${card.attack}</span><span class="unit-hp" title="Health">${unit.health} HP</span></span>
    ${own ? `<span class="ready-state ${unit.ready ? "is-ready" : ""}">${unit.ready ? "Ready" : "Exhausted"}</span>` : ""}
    </button></div>`;
}

function actionButton(label, action, lane) {
  return `<button type="button" class="place-unit" data-action="${action}" data-lane="${lane}" aria-label="${label} to lane ${lane + 1}">${label}</button>`;
}

function unitTrayMarkup(unit, lane) {
  const buttons = activeSkills(unit.card).map((id) => {
    const skill = ACTIVE_SKILLS[id];
    const issue = actionIssue(game, 0, { type: "skill", lane, skill: id });
    return `<button type="button" data-action="skill" data-lane="${lane}" data-skill="${id}" ${issue ? "disabled" : ""}>
      <span><strong>${skill.name}</strong><small>${issue || skill.text}</small></span><b class="skill-price">✦ ${skill.pulse}</b>
    </button>`;
  }).join("");
  const shift = [lane - 1, lane + 1].some((to) => !actionIssue(game, 0, { type: "shift", lane, to }));
  return `<div class="unit-tray"><div class="tray-heading"><strong>${escapeHTML(unit.card.name)}</strong>
    <button type="button" data-action="inspect-own" data-lane="${lane}">View card</button>
    ${shift ? `<button type="button" data-action="select-shift" data-lane="${lane}">Shift</button>` : ""}</div>
    ${buttons ? `<div class="skill-options">${buttons}</div>` : "<p>This unit has no active skills.</p>"}</div>`;
}

function renderArena(focus) {
  const arena = document.querySelector("#arena-game");
  if (!arena) return;
  if (!game) {
    arena.innerHTML = `<section class="panel welcome"><div class="arena-emblem" aria-hidden="true">◈</div>
      <h2>Enter the arena</h2><p>Face the rival in a three-lane duel.</p>
      <button type="button" class="primary" data-action="duel">Start duel</button>
      <p role="status">${escapeHTML(arenaMessage)}</p></section>`;
    return;
  }
  const [player, rival] = game.sides;
  const impact = game.impact;
  game.impact = null;
  const handScroll = arena.querySelector(".hand-rail")?.scrollLeft ?? 0;
  const logOpen = arena.querySelector(".combat-log")?.open ?? !mobile.matches;
  const selected = selection?.type === "deploy" ? player.hand[selection.hand] : null;
  const chosenUnit = selection?.type === "unit" ? player.board[selection.lane] : null;
  const result = game.winner === null ? "Your turn" : game.winner === 0 ? "Victory" : "Defeat";
  const lanes = player.board.map((unit, lane) => {
    const deploy = selection?.type === "deploy" && !actionIssue(game, 0, { ...selection, lane })
      ? actionButton("Deploy", "deploy", lane) : "";
    const shiftHere = selection?.type === "shift" && !actionIssue(game, 0, { ...selection, to: lane })
      ? actionButton("Move", "shift", lane) : "";
    const hit = impact?.lane === lane && !impact.core ? impact : null;
    return `<div class="lane"><span class="lane-title">Lane ${lane + 1}</span>
      ${unitMarkup(rival.board[lane], lane, false, "", hit?.side === 1 ? hit : null)}
      <div class="lane-divider" aria-hidden="true"><span>◇</span></div>
      ${unitMarkup(unit, lane, true, deploy || shiftHere, hit?.side === 0 ? hit : null)}</div>`;
  }).join("");
  const hand = player.hand.map((card, index) => {
    const active = selection?.type === "deploy" && selection.hand === index;
    return `<div class="hand-item${active ? " selected" : ""}${card.cost > player.pulse ? " unaffordable" : ""}">${cardMarkup(card)}
      <button type="button" class="hand-select" data-action="select-card" data-index="${index}" aria-label="Select ${escapeHTML(card.name)}" aria-pressed="${active}">${active ? "Selected" : "Select"}</button></div>`;
  }).join("");
  const guidance = selection?.type === "shift" ? "Choose an adjacent open lane." : selected
    ? selected.cost > player.pulse ? `${selected.name} needs ${selected.cost} Pulse to deploy.`
      : player.board.every(Boolean) ? "All three lanes are occupied." : `Deploy ${selected.name} to an open lane.`
    : "Tap a card to deploy or a unit to act.";
  const pulsePips = Array.from({ length: Math.max(player.capacity, player.pulse) }, (_, i) =>
    `<i class="${i < player.pulse ? "charged" : ""}"></i>`).join("");
  arena.innerHTML = `<div class="arena-layout"><div>
    <section class="panel battlefield" aria-label="Duel board">
      <div class="battle-status"><div><span>Round ${game.round}</span><strong>${result}</strong></div>
        <div class="pulse"><span class="pulse-pips" aria-hidden="true">${pulsePips}</span><strong>${player.pulse} / ${player.capacity} Pulse</strong></div></div>
      ${coreMarkup(rival, 1, impact)}<div class="lanes">${lanes}</div>${coreMarkup(player, 0, impact)}
      ${chosenUnit ? unitTrayMarkup(chosenUnit, selection.lane) : ""}
      <div class="turn-controls"><p role="status">${escapeHTML(arenaMessage || (!chosenUnit && game.winner === null ? guidance : ""))}</p>
        ${selected ? `<button type="button" data-action="inspect-hand" data-index="${selection.hand}">View card</button>` : ""}
        ${selection?.type === "shift" ? '<button type="button" data-action="cancel">Cancel</button>' : ""}
        <button type="button" class="primary" data-action="${game.winner === null ? "end" : "duel"}">${game.winner === null ? "End turn" : "Rematch"}</button></div>
    </section>
    <section class="hand"><div class="section-head"><h2>Your hand</h2><span>${player.hand.length} cards</span></div>
      ${hand ? `<div class="hand-rail">${hand}</div>` : "<p>Your hand is empty.</p>"}</section>
    </div><details class="panel combat-log" ${logOpen ? "open" : ""}><summary>Duel log</summary><ol>${game.log.map((entry) => `<li>${escapeHTML(entry)}</li>`).join("")}</ol></details></div>`;
  const rail = arena.querySelector(".hand-rail");
  if (rail) rail.scrollLeft = handScroll;
  if (focus) {
    const same = [...arena.querySelectorAll("[data-action]")].find((button) =>
      button.dataset.action === focus.action && button.dataset.lane === focus.lane &&
      button.dataset.index === focus.index && !button.disabled && button.offsetParent);
    (same ?? arena.querySelector('[data-action="end"]:enabled') ?? main.querySelector('[data-action="duel"]'))?.focus({ preventScroll: true });
  }
}

function handleArena(button) {
  const { action, lane, index, skill } = button.dataset;
  if (action === "duel") return startDuel();
  if (action === "rules") return document.querySelector("#rules").showModal();
  if (!game) return;
  if (action === "inspect-rival") return inspectCard(game.sides[1].board[Number(lane)].card);
  if (action === "inspect-own") return inspectCard(game.sides[0].board[Number(lane)].card);
  if (action === "inspect-hand") return inspectCard(game.sides[0].hand[Number(index)]);
  if (game.winner !== null && action === "select-unit") return inspectCard(game.sides[0].board[Number(lane)].card);
  if (game.winner !== null && action === "select-card") return inspectCard(game.sides[0].hand[Number(index)]);
  if (game.winner !== null) return;
  arenaMessage = "";
  if (action === "select-card") {
    const hand = Number(index);
    selection = selection?.type === "deploy" && selection.hand === hand ? null : { type: "deploy", hand };
  } else if (action === "select-unit") {
    selection = selection?.type === "unit" && selection.lane === Number(lane) ? null : { type: "unit", lane: Number(lane) };
  } else if (action === "select-shift") {
    selection = { type: "shift", lane: Number(lane) };
  } else if (action === "cancel") {
    selection = null;
  } else {
    const command = action === "deploy" ? { ...selection, lane: Number(lane) } :
      action === "shift" ? { ...selection, to: Number(lane) } : { type: action, lane: Number(lane), skill };
    arenaMessage = act(game, 0, command);
    if (!arenaMessage) {
      selection = null;
      if (action === "end") playRival(game);
    }
  }
  renderArena({ action, lane, index });
}

function renderDeck(focus) {
  const cards = catalog();
  const visibleCards = collectionElement ? cards.filter((card) => card.faction === collectionElement) : cards;
  const issue = deckIssue(library.deck, cards);
  const deckOpen = main.querySelector(".deck-details")?.open ?? !mobile.matches;
  const counts = new Map();
  for (const id of library.deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  main.innerHTML = `<section class="page-head"><div><h1>Deck &amp; collection</h1><p>Choose the 15 cards you want to bring to the arena.</p></div>
    <div class="head-actions"><a href="#studio" class="button primary">Create a card</a></div></section>
    <div class="deck-layout"><section><div class="section-head"><h2>Collection <small>${visibleCards.length} cards</small></h2>
      <select id="collection-element" aria-label="Filter collection by element"><option value="">All elements</option>
        ${Object.entries(FACTIONS).map(([id, element]) => `<option value="${id}" ${collectionElement === id ? "selected" : ""}>${element.name}</option>`).join("")}</select>
      </div><div class="collection-grid">${visibleCards.map((card) => {
        const id = escapeHTML(card.id);
        const name = escapeHTML(card.name);
        return `<div class="collection-item"><div class="collection-face">${cardMarkup(card)}
          <button type="button" class="card-inspect" data-action="inspect" data-id="${id}" aria-label="View ${name}"></button>
          </div><div class="collection-tools">
          <button type="button" data-action="add" data-id="${id}" aria-label="Add ${name}" ${library.deck.length >= LIMITS.deck || (counts.get(card.id) ?? 0) >= LIMITS.copies ? "disabled" : ""}>＋ Add</button>
          ${STARTER_CARDS.includes(card) ? "" : `<button type="button" data-action="edit" data-id="${id}" aria-label="Edit ${name}">Edit</button>`}</div></div>`;
      }).join("")}</div></section>
      <aside class="panel deck-panel"><details class="deck-details" ${deckOpen ? "open" : ""}>
        <summary class="deck-summary"><span>Active deck</span><strong>${library.deck.length} / ${LIMITS.deck}</strong></summary>
        <p>${escapeHTML(issue || "Ready to duel.")}</p>
        ${storageWarning ? `<p class="field-help">${escapeHTML(storageWarning)}</p>` : ""}
        <p role="status" class="field-help">${escapeHTML(deckMessage)}</p>
        <ul class="deck-list">${[...counts].map(([id, count]) => {
          const card = cards.find((item) => item.id === id);
          const name = escapeHTML(card?.name ?? "Missing card");
          return `<li><span class="deck-count">${count}×</span><span>${name}</span>
            <button type="button" data-action="remove" data-id="${escapeHTML(id)}" aria-label="Remove one ${name}">−</button></li>`;
        }).join("")}</ul>
        <button type="button" data-action="starter">Use starter deck</button>
      </details></aside></div>`;
  if (focus) {
    const candidate = [...main.querySelectorAll("[data-action]")].find((button) =>
      button.dataset.action === focus.action && button.dataset.id === focus.id && !button.disabled);
    (candidate ?? main.querySelector(".deck-list button") ?? main.querySelector('[data-action="starter"]'))?.focus({ preventScroll: true });
  }
}

async function handleDeck(button) {
  const { action, id } = button.dataset;
  if (action === "inspect") {
    const card = catalog().find((item) => item.id === id);
    if (card) inspectCard(card);
    return;
  }
  if (action === "edit") {
    const card = library.cards.find((item) => item.id === id);
    if (!card) return;
    replaceFile({ ...blankCard(), ...card });
    location.hash = "studio";
    return;
  }
  try {
    await updateLibrary((state) => {
      const deck = [...state.deck];
      if (action === "starter") return { ...state, deck: [...STARTER_DECK] };
      if (action === "add" && deck.length < LIMITS.deck &&
          deck.filter((item) => item === id).length < LIMITS.copies && catalog().some((card) => card.id === id)) {
        deck.push(id);
      } else if (action === "remove" && deck.includes(id)) {
        deck.splice(deck.indexOf(id), 1);
      } else return state;
      return { ...state, deck };
    });
    deckMessage = "";
  } catch {
    deckMessage = "Couldn’t save the deck. Check available browser storage and try again.";
  }
  if (tab === "deck") renderDeck({ action, id });
}

function replaceFile(next) {
  revision++;
  artJob++;
  artLoading = false;
  file = next;
  loreVariant = 0;
  formMessage = "";
  draftMessage = "";
}

function mountStudio() {
  const form = document.querySelector("#card-form");
  form.elements["openrouter-key"].value = openRouterKey;
  form.elements.openRouterModel.value = openRouterModel;
  form.elements.openRouterModel.placeholder = OPENROUTER_DEFAULT_MODEL;
  form.elements.faction.append(new Option("Choose element", ""));
  for (const [id, faction] of Object.entries(FACTIONS)) form.elements.faction.append(new Option(faction.name, id));
  for (const [id, ability] of Object.entries(ABILITIES)) form.elements.ability.append(new Option(ability.name, id));
  for (const field of ["active1", "active2"]) {
    for (const [id, skill] of Object.entries(ACTIVE_SKILLS)) form.elements[field].append(new Option(skill.name, id));
  }
  for (const field of CARD_FIELDS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "field-lock";
    button.dataset.action = "toggle-lock";
    button.dataset.field = field;
    button.setAttribute("aria-label", `Lock ${FIELD_LABELS[field].toLowerCase()} for auto-fill`);
    form.elements[field].before(button);
  }
  syncStudioFields();
}

function syncStudioFields() {
  const form = document.querySelector("#card-form");
  if (!form) return;
  for (const key of [...CARD_FIELDS, "concept"]) form.elements[key].value = file[key];
  form.elements.shareArt.checked = file.shareArt;
  updateStudio();
}

function updateStudio() {
  if (tab !== "studio" || !document.querySelector("#card-form")) return;
  document.querySelector("#preview").innerHTML = cardMarkup(file);
  document.querySelector("#mode").textContent = file.id ? "Edit card" : "Create a card";
  document.querySelector("#reset-form").hidden = !file.id;
  const remove = document.querySelector("#remove-art");
  remove.hidden = !file.art;
  remove.disabled = artLoading;
  document.querySelector("#art-status").textContent = artLoading ? "Preparing artwork…" : file.art ? "Artwork attached" : "JPEG, PNG, or WebP";
  const form = document.querySelector("#card-form");
  form.elements.shareArt.disabled = !file.art || artLoading;
  form.elements.shareArt.checked = file.shareArt;
  const save = document.querySelector("#save-card");
  save.disabled = saving || artLoading;
  save.textContent = saving ? "Saving…" : file.id ? "Save changes" : "Save to collection";
  updateDraftControls(form);
  for (const button of form.querySelectorAll(".field-lock")) {
    const locked = file.locks.includes(button.dataset.field);
    button.setAttribute("aria-pressed", String(locked));
    button.textContent = locked ? "Locked" : "Lock";
  }
  const ability = abilityOf(file);
  document.querySelector("#ability-help").textContent = ability.text;
  for (const field of ["active1", "active2"]) {
    const skill = ACTIVE_SKILLS[file[field]];
    document.querySelector(`#${field}-help`).textContent = skill?.pulse ? `${skill.pulse} Pulse · ${skill.text}` : skill?.text ?? "";
  }
  document.querySelector("#reroll-flavor").disabled = file.locks.includes("flavor");
  const spent = (Number(file.attack) || 0) + (Number(file.health) || 0) + ability.weight;
  const available = statBudget(Number(file.cost) || 0);
  const budget = document.querySelector("#budget");
  budget.textContent = `Stat budget ${spent} / ${available}`;
  budget.classList.toggle("over-budget", spent > available);
  document.querySelector("#form-status").textContent = formMessage || storageWarning;
}

function updateDraftControls(form) {
  const provider = selectedProvider();
  const router = provider === "openrouter";
  const ready = router ? Boolean(openRouterKey.trim()) : Boolean(aiAvailable);
  form.elements.draftProvider.querySelector('[value="openai"]').disabled = !aiAvailable;
  form.elements.draftProvider.value = provider;
  document.querySelector("#openrouter-settings").hidden = !router;
  document.querySelector("#draft-art-label").textContent = `Include artwork in the ${router ? "OpenRouter" : "OpenAI"} request`;
  const allLocked = file.locks.length === CARD_FIELDS.length;
  const ai = document.querySelector("#ai-fill");
  ai.disabled = drafting || artLoading || allLocked || !ready;
  ai.textContent = drafting ? "Drafting…" : "✦ AI auto-fill";
  const quick = document.querySelector("#quick-fill");
  quick.disabled = allLocked;
  ai.classList.toggle("primary", ready);
  quick.classList.toggle("primary", !ready);
  document.querySelector("#ai-status").textContent = allLocked ? "All fields are locked. Unlock one to draft it."
    : "Quick fill uses built-in templates and works without an API key.";
  document.querySelector("#draft-status").textContent = draftMessage;
}

async function readArtwork(artwork) {
  const job = ++artJob;
  revision++;
  artLoading = true;
  formMessage = "";
  updateStudio();
  let image;
  try {
    if (!["image/png", "image/jpeg", "image/webp"].includes(artwork.type) || artwork.size > 20_000_000) {
      throw new Error("Choose a JPEG, PNG, or WebP image under 20 MB.");
    }
    image = await createImageBitmap(artwork);
    const scale = Math.min(1, 900 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", 0.86);
    if (job !== artJob) return;
    if (!data.startsWith("data:image/") || data.length > 1_450_000) throw new Error("Couldn’t resize this artwork. Try a smaller image.");
    file.art = data;
    file.shareArt = false;
  } catch (error) {
    if (job === artJob) formMessage = error instanceof DOMException ? "Couldn’t read this image." : error.message;
  } finally {
    image?.close();
    if (job === artJob) {
      artLoading = false;
      const picker = document.querySelector('[name="artwork"]');
      if (picker) picker.value = "";
      updateStudio();
    }
  }
}

function applyDraft(draft, locked) {
  const result = fitDraft(draft, locked);
  revision++;
  for (const key of CARD_FIELDS) {
    if (!Object.hasOwn(locked, key)) file[key] = result[key];
  }
  syncStudioFields();
}

function draftBrief() {
  const locked = lockedFields();
  const issue = lockedCardIssue(locked);
  if (issue) throw new Error(issue);
  return { name: file.name.trim(), faction: file.faction, concept: file.concept.trim(), locked };
}

function quickFill() {
  try {
    const brief = draftBrief();
    applyDraft(templateDraft({ ...brief, variant: loreVariant++ }), brief.locked);
    draftMessage = "Quick fill applied. Review the draft before saving.";
  } catch (error) {
    draftMessage = error.message;
  }
  updateStudio();
}

async function autoFill() {
  const useRouter = selectedProvider() === "openrouter";
  if (drafting || !(useRouter ? openRouterKey.trim() : aiAvailable)) return;
  let brief;
  try {
    brief = { ...draftBrief(), art: file.shareArt ? file.art : "" };
  } catch (error) {
    draftMessage = error.message;
    updateStudio();
    return;
  }
  if (!brief.name && !brief.faction && !brief.concept && !brief.art && !Object.keys(brief.locked).length) {
    draftMessage = "Add a name, faction, or concept, lock a value, or choose to include artwork.";
    updateStudio();
    return;
  }
  const requestRevision = revision;
  drafting = true;
  draftMessage = "";
  updateStudio();
  try {
    let draft;
    if (useRouter) {
      draft = await requestOpenRouterDraft(brief, { apiKey: openRouterKey, model: openRouterModel });
    } else {
      const response = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "AI auto-fill is unavailable.");
      draft = data.draft;
    }
    if (revision !== requestRevision) return;
    applyDraft(draft, brief.locked);
    draftMessage = "AI draft applied. Review the fields before saving.";
  } catch (error) {
    if (revision === requestRevision) draftMessage = error.message || "AI auto-fill is unavailable.";
  } finally {
    drafting = false;
    updateStudio();
  }
}

async function saveCard(event) {
  event.preventDefault();
  if (saving || artLoading) return;
  const card = { ...file, name: file.name.trim(), flavor: file.flavor.trim() };
  card.id ||= crypto.randomUUID();
  delete card.concept;
  delete card.shareArt;
  const issue = cardIssues(card)[0];
  if (issue) {
    formMessage = issue;
    updateStudio();
    return;
  }
  const source = file;
  revision++;
  saving = true;
  updateStudio();
  try {
    await updateLibrary((state) => {
      const cards = state.cards.filter((item) => item.id !== card.id);
      return { ...state, cards: [...cards, card] };
    });
    if (file === source) {
      file.id = card.id;
      formMessage = storageWarning ? "Card added for this session. Browser storage is unavailable." :
        "Card saved. Find it in Deck & collection.";
    }
  } catch {
    if (file === source) formMessage = "Couldn’t save the card. Check browser storage and try again.";
  } finally {
    saving = false;
    updateStudio();
  }
}

main.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (tab === "arena") return handleArena(button);
  if (tab === "deck") return void handleDeck(button);
  switch (button.dataset.action) {
    case "toggle-lock": {
      const { field } = button.dataset;
      file.locks = file.locks.includes(field) ? file.locks.filter((key) => key !== field) : [...file.locks, field];
      revision++;
      draftMessage = "";
      updateStudio();
      break;
    }
    case "preview-card":
      document.querySelector("#dialog-preview").innerHTML = cardMarkup(file);
      document.querySelector("#card-preview-dialog").showModal();
      break;
    case "reset-form":
      replaceFile(blankCard());
      syncStudioFields();
      break;
    case "remove-art":
      revision++;
      file.art = "";
      file.shareArt = false;
      updateStudio();
      break;
    case "quick-fill":
      quickFill();
      break;
    case "reroll-flavor":
      revision++;
      file.flavor = draftFlavor(file, file.concept, ++loreVariant);
      formMessage = "New flavor text suggested.";
      syncStudioFields();
      break;
    case "ai-fill":
      void autoFill();
      break;
  }
});

main.addEventListener("input", (event) => {
  if (!event.target.form?.matches("#card-form")) return;
  const { id, name, value, type, checked, valueAsNumber } = event.target;
  if (name === "artwork") return;
  revision++;
  formMessage = "";
  draftMessage = "";
  if (id === "openrouter-key" || name === "openRouterModel") {
    draftProvider = "openrouter";
    if (id === "openrouter-key") openRouterKey = value;
    else openRouterModel = value;
    updateDraftControls(event.target.form);
    return;
  }
  if (name === "draftProvider") {
    draftProvider = value;
    file.shareArt = false;
    updateStudio();
    return;
  }
  file[name] = type === "checkbox" ? checked : type === "number" ? valueAsNumber : value;
  updateStudio();
});

main.addEventListener("change", (event) => {
  if (event.target.id === "collection-element") {
    collectionElement = event.target.value;
    renderDeck();
    document.querySelector("#collection-element").focus({ preventScroll: true });
  }
  if (event.target.matches('[name="artwork"]') && event.target.files[0]) void readArtwork(event.target.files[0]);
});

main.addEventListener("submit", (event) => {
  if (event.target.matches("#card-form")) void saveCard(event);
});

window.addEventListener("hashchange", render);
await loadStorage();
render();
fetch("/api/status").then((response) => response.json()).then(({ enabled }) => {
  aiAvailable = enabled;
  updateStudio();
}).catch(() => { aiAvailable = false; });
