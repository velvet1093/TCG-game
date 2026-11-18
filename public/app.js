import { ABILITIES, CARD_FIELDS, FACTIONS, LIMITS, STARTER_CARDS, STARTER_DECK, RIVAL_DECK,
  cardIssues, deckIssue, statBudget, templateDraft } from "./cards.js";
import { act, actionIssue, createGame, playRival } from "./engine.js";

const main = document.querySelector("#main");
const section = (id) => document.querySelector(`#${id}-template`).content.cloneNode(true);
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const blankCard = () => ({
  id: "", name: "", faction: "", cost: 2, attack: 2, health: 3, ability: "basic",
  flavor: "", art: "", concept: "", shareArt: false,
});
let file = blankCard();
let library = { cards: [], deck: [...STARTER_DECK] };
let database;
let writes = Promise.resolve();
let storageWarning = "";
let deckMessage = "";
let formMessage = "";
let revision = 0;
let artJob = 0;
let artLoading = false;
let saving = false;
let drafting = false;
let aiAvailable;
let game;
let selection;
let arenaMessage = "";
let tab;

const catalog = () => [...STARTER_CARDS, ...library.cards];
const factionOf = (card) => Object.hasOwn(FACTIONS, card.faction) ? FACTIONS[card.faction] : null;
const abilityOf = (card) => Object.hasOwn(ABILITIES, card.ability) ? ABILITIES[card.ability] : ABILITIES.basic;

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
    : `<div class="card-art placeholder" aria-hidden="true"><span>${faction?.icon ?? "✧"}</span></div>`;
}

function cardMarkup(card) {
  const faction = factionOf(card);
  const name = escapeHTML(card.name || "Untitled unit");
  const ability = abilityOf(card);
  return `<article class="game-card" style="--faction: ${faction?.color ?? "#aaa0ba"}">
    <div class="card-top"><span>${faction?.icon ?? "✧"} ${faction?.name ?? "Choose faction"}</span><span class="cost" title="Pulse cost">${escapeHTML(card.cost || "–")}</span></div>
    ${artMarkup(card)}
    <div class="card-body"><h3>${name}</h3>
    <div class="card-ability"><strong>${ability.name}</strong><p>${ability.text}</p></div>
    ${card.flavor ? `<p class="flavor">${escapeHTML(card.flavor)}</p>` : ""}
    <div class="card-stats"><span title="Attack">⚔ ${escapeHTML(card.attack || "–")}</span><span title="Health">♥ ${escapeHTML(card.health || "–")}</span></div></div>
  </article>`;
}

function render() {
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

function coreMarkup(side, index) {
  const name = index === 0 ? "Your Core" : "Rival Core";
  return `<div class="core-side"><div class="core-label"><span class="core-icon" aria-hidden="true">◈</span>
    <div><h2>${name}</h2><span>${side.deck.length} in deck · ${side.hand.length} in hand</span></div></div>
    <div class="core-health"><strong>${side.core}</strong><meter min="0" max="${LIMITS.core}" value="${side.core}" aria-label="${name} health"></meter></div></div>`;
}

function unitMarkup(unit, lane, own) {
  if (!unit) return `<div class="empty-slot">${own ? "Empty slot" : "Open lane"}</div>`;
  const { card } = unit;
  const faction = factionOf(card);
  return `<div class="unit" style="--faction: ${faction.color}">${artMarkup(card)}
    <div class="unit-info"><strong>${escapeHTML(card.name)}</strong>
    <span>${abilityOf(card).name} · ⚔ ${card.attack} · ♥ ${unit.health}</span></div>
    ${own ? `<button type="button" data-action="strike" data-lane="${lane}" ${unit.ready && game.winner === null ? "" : "disabled"}>${unit.ready ? "Strike" : "Exhausted"}</button>` : ""}
  </div>`;
}

function actionButton(label, action, lane, issue) {
  return `<button type="button" data-action="${action}" data-lane="${lane}" ${issue ? `disabled title="${escapeHTML(issue)}"` : ""}>${label}</button>`;
}

function renderArena(focus) {
  const arena = document.querySelector("#arena-game");
  if (!arena) return;
  if (!game) {
    arena.innerHTML = `<section class="panel welcome"><div class="arena-emblem" aria-hidden="true">✦</div>
      <h2>Enter the arena</h2><p>Challenge the rival with your active deck.</p>
      <button type="button" class="primary" data-action="duel">Start duel</button>
      <p role="status">${escapeHTML(arenaMessage)}</p></section>`;
    return;
  }
  const [player, rival] = game.sides;
  const result = game.winner === null ? "Your turn" : game.winner === 0 ? "Victory" : "Defeat";
  const lanes = player.board.map((unit, lane) => {
    const deploy = selection?.type === "deploy"
      ? actionButton("Deploy here", "deploy", lane, actionIssue(game, 0, { ...selection, lane })) : "";
    const shiftHere = selection?.type === "shift"
      ? actionButton("Shift here", "shift", lane, actionIssue(game, 0, { ...selection, to: lane })) : "";
    const canShift = unit?.ready && [lane - 1, lane + 1].some((to) => !actionIssue(game, 0, { type: "shift", lane, to }));
    const shift = canShift ? `<button type="button" data-action="select-shift" data-lane="${lane}" aria-pressed="${selection?.type === "shift" && selection.lane === lane}">Shift</button>` : "";
    return `<div class="lane"><span class="lane-title">Lane ${lane + 1}</span>
      ${unitMarkup(rival.board[lane], lane, false)}<div class="lane-divider" aria-hidden="true">◇</div>
      ${unitMarkup(unit, lane, true)}${deploy || shiftHere || shift ? `<div class="lane-actions">${deploy}${shiftHere}${shift}</div>` : ""}</div>`;
  }).join("");
  const hand = player.hand.map((card, index) => {
    const active = selection?.type === "deploy" && selection.hand === index;
    return `<div class="hand-item${active ? " selected" : ""}">${cardMarkup(card)}
      <button type="button" data-action="select-card" data-index="${index}" aria-label="Select ${escapeHTML(card.name)}" aria-pressed="${active}"
        ${card.cost > player.pulse || game.winner !== null ? "disabled" : ""}>${active ? "Selected" : "Select"}</button></div>`;
  }).join("");
  arena.innerHTML = `<div class="arena-layout"><div>
    <section class="panel battlefield" aria-label="Duel board">
      <div class="battle-status"><div><span>Round ${game.round}</span><strong>${result}</strong></div>
        <div><span>Pulse</span><strong class="pulse">✦ ${player.pulse}<small> / ${player.capacity}</small></strong></div></div>
      ${coreMarkup(rival, 1)}<div class="lanes">${lanes}</div>${coreMarkup(player, 0)}
      <div class="turn-controls"><p role="status">${escapeHTML(arenaMessage || (selection?.type === "shift" ? "Choose an adjacent empty lane." : selection ? "Choose an empty lane." : ""))}</p>
        <button type="button" class="primary" data-action="end" ${game.winner !== null ? "disabled" : ""}>End turn</button></div>
    </section>
    <section class="hand"><div class="section-head"><h2>Your hand</h2><span>${player.hand.length} cards</span></div>
      ${hand ? `<div class="hand-rail">${hand}</div>` : "<p>Your hand is empty.</p>"}</section>
    </div><aside class="panel combat-log"><h2>Duel log</h2><ol>${game.log.map((entry) => `<li>${escapeHTML(entry)}</li>`).join("")}</ol></aside></div>`;
  if (focus) {
    const same = [...arena.querySelectorAll("[data-action]")].find((button) =>
      button.dataset.action === focus.action && button.dataset.lane === focus.lane &&
      button.dataset.index === focus.index && !button.disabled && button.offsetParent);
    (same ?? arena.querySelector('[data-action="end"]:enabled') ?? main.querySelector('[data-action="duel"]'))?.focus({ preventScroll: true });
  }
}

function handleArena(button) {
  const { action, lane, index } = button.dataset;
  if (action === "duel") return startDuel();
  if (action === "rules") return document.querySelector("#rules").showModal();
  if (!game || game.winner !== null) return;
  arenaMessage = "";
  if (action === "select-card") {
    const hand = Number(index);
    selection = selection?.type === "deploy" && selection.hand === hand ? null : { type: "deploy", hand };
  } else if (action === "select-shift") {
    selection = selection?.type === "shift" && selection.lane === Number(lane) ? null : { type: "shift", lane: Number(lane) };
  } else {
    const command = action === "deploy" ? { ...selection, lane: Number(lane) } :
      action === "shift" ? { ...selection, to: Number(lane) } : { type: action, lane: Number(lane) };
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
  const issue = deckIssue(library.deck, cards);
  const counts = new Map();
  for (const id of library.deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  main.innerHTML = `<section class="page-head"><div><h1>Deck &amp; collection</h1><p>Choose the 15 cards you want to bring to the arena.</p></div>
    <div class="head-actions"><a href="#studio" class="button primary">Create a card</a></div></section>
    <div class="deck-layout"><section><div class="section-head"><h2>Collection</h2><span>${cards.length} cards</span></div>
      <div class="collection-grid">${cards.map((card) => {
        const id = escapeHTML(card.id);
        const name = escapeHTML(card.name);
        return `<div class="collection-item">${cardMarkup(card)}<div class="collection-tools">
          <button type="button" data-action="add" data-id="${id}" aria-label="Add ${name}" ${library.deck.length >= LIMITS.deck || (counts.get(card.id) ?? 0) >= LIMITS.copies ? "disabled" : ""}>＋ Add</button>
          ${STARTER_CARDS.includes(card) ? "" : `<button type="button" data-action="edit" data-id="${id}" aria-label="Edit ${name}">Edit</button>`}</div></div>`;
      }).join("")}</div></section>
      <aside class="panel deck-panel"><div class="section-head"><h2>Active deck</h2><strong>${library.deck.length} / ${LIMITS.deck}</strong></div>
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
      </aside></div>`;
  if (focus) {
    const candidate = [...main.querySelectorAll("[data-action]")].find((button) =>
      button.dataset.action === focus.action && button.dataset.id === focus.id && !button.disabled);
    (candidate ?? main.querySelector(".deck-list button") ?? main.querySelector('[data-action="starter"]'))?.focus({ preventScroll: true });
  }
}

async function handleDeck(button) {
  const { action, id } = button.dataset;
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
  formMessage = "";
}

function mountStudio() {
  const form = document.querySelector("#card-form");
  form.elements.faction.append(new Option("Choose faction", ""));
  for (const [id, faction] of Object.entries(FACTIONS)) form.elements.faction.append(new Option(faction.name, id));
  for (const [id, ability] of Object.entries(ABILITIES)) form.elements.ability.append(new Option(ability.name, id));
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
  const ai = document.querySelector("#ai-fill");
  ai.disabled = drafting || artLoading || !aiAvailable;
  ai.textContent = drafting ? "Drafting…" : "✦ AI auto-fill";
  document.querySelector("#ai-status").textContent = aiAvailable
    ? "AI drafts editable fields. Quick fill uses built-in templates."
    : "Quick fill uses built-in templates. AI auto-fill requires a server configured with an OpenAI API key.";
  const ability = abilityOf(file);
  document.querySelector("#ability-help").textContent = ability.text;
  const spent = (Number(file.attack) || 0) + (Number(file.health) || 0) + ability.weight;
  const available = statBudget(Number(file.cost) || 0);
  const budget = document.querySelector("#budget");
  budget.textContent = `Stat budget ${spent} / ${available}`;
  budget.classList.toggle("over-budget", spent > available);
  document.querySelector("#form-status").textContent = formMessage || storageWarning;
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

function applyDraft(draft) {
  const issues = cardIssues(draft);
  if (issues.length) throw new Error(issues[0]);
  revision++;
  for (const key of CARD_FIELDS) file[key] = draft[key];
  syncStudioFields();
}

async function autoFill() {
  if (drafting || !aiAvailable) return;
  const brief = { name: file.name.trim(), faction: file.faction, concept: file.concept.trim(), art: file.shareArt ? file.art : "" };
  if (!brief.name && !brief.faction && !brief.concept && !brief.art) {
    formMessage = "Add a name, faction, or concept, or choose to include artwork.";
    updateStudio();
    return;
  }
  const requestRevision = revision;
  drafting = true;
  formMessage = "";
  updateStudio();
  try {
    const response = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brief),
    });
    const data = await response.json();
    if (revision !== requestRevision) return;
    if (!response.ok) throw new Error(data.error ?? "AI auto-fill is unavailable.");
    formMessage = "AI draft applied. Review the fields before saving.";
    applyDraft(data.draft);
  } catch (error) {
    if (revision === requestRevision) formMessage = error.message || "AI auto-fill is unavailable.";
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
      formMessage = "Template applied. Review the fields before saving.";
      applyDraft(templateDraft({ ...file, name: file.name.trim() }));
      break;
    case "ai-fill":
      void autoFill();
      break;
  }
});

main.addEventListener("input", (event) => {
  if (!event.target.form?.matches("#card-form")) return;
  const { name, value, type, checked, valueAsNumber } = event.target;
  if (name === "artwork") return;
  revision++;
  formMessage = "";
  file[name] = type === "checkbox" ? checked : type === "number" ? valueAsNumber : value;
  updateStudio();
});

main.addEventListener("change", (event) => {
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
