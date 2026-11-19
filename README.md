# Lanternwake Arena

An original anime-inspired card battler. Build a 15-card deck, fight across three lanes, and create playable units with your own illustrations.

## Run locally

Install Node.js 22 or later, then run:

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). There are no package dependencies. The app includes 23 sample units, five sample items, a starter deck, and a CPU rival.

## The duel

- Reduce the rival's 20-health Core to zero. Bring 15 cards with up to three copies of each unit.
- Both players start with four cards, including a card they can afford if their deck contains one. At the start of your turn, draw once and refill Pulse. The first player skips the opening draw. Pulse capacity starts at two, growing by one per round to six.
- Spend Pulse to play units in empty lanes. Tap a ready unit to choose one of its named attacks or shift it into an open neighboring lane. The attack’s effects set its Pulse cost. Units trade damage on a lane hit and hit the opposing Core when the lane is open.
- Deploy Stage 1 units directly. Once a unit has started three of your turns in play, select a matching Stage 2 card from your hand and tap the unit to evolve it in the same lane. Stage 3 requires three more of your turns after evolving. Each evolution costs the next card’s printed Pulse, carries damage forward (at least 1 HP), and preserves readiness. The previous card goes to the discard pile, and on-deploy passives do not trigger.
- Striking in two distinct lanes in one turn gives one bonus Pulse. Starting a turn with an empty deck costs one Core health.
- Units can have up to two custom-named attacks and one automatic passive. Each attack can combine up to two combat effects. Attack, Health, and the passive use a shared stat budget based on deploy cost. New cards start with empty attack slots. Saved cards with an explicit older attack keep that attack and its mechanics.
- Items use the same deck and Pulse pool as units. On your turn, select an item from your hand, then tap a highlighted target or **Play item**. Once its effect resolves, it goes to the discard pile. Item effects can draw one card, heal an allied unit, damage a rival unit, restore your Core, or damage the rival Core.
- The collection is filterable by element. Ember, Tide, Grove, Veil, Storm, Frost, Stone, Dawn, and Alloy have their own frames and drafting themes.

## Create a card

1. Open **Card studio** and pick **Unit** or **Item** under **Card type**. Add an element, a name, a concept, or your artwork.
2. Tap **Lock** next to any field you want to keep. Quick fill and AI auto-fill use locked values as context and draft around them. Tap **Locked** to unlock a field. If locked stats exceed the Pulse budget, adjust or unlock one of them.
3. Enter the fields yourself, use **Quick fill** for a draft, or use **AI auto-fill** with the configuration below. Use **Auto-fill abilities** or **Auto-fill item effect** to draft just the unlocked ability fields at the current rarity and Pulse cost. These controls use built-in suggestions when no AI key is configured. On a phone, tap **Preview** to see the complete card face.
4. In **Deck**, open **Active deck** and remove a card to free a slot. Add your new unit from the collection and start a **New duel**.

In a unit’s attack slot, enter any name and an optional move concept. Choose effects manually or use **Auto-fill effects** to suggest the rules for your move without editing its name or concept. The suggested effects use the game’s supported mechanics, including lane hits, adjacent damage, Core drain, self-heal, stun, and draw. Clear any optional slot with **Clear attack**.

Set **Stage** by hand in Card Studio. Save lower stages first, then use **Evolves from** to link a Stage 2 card to a Stage 1 card, or a Stage 3 card to a Stage 2 card. Add the cards for your evolution line to the deck. Stage and evolution links are manual fields. Existing units count as Stage 1.

The collection, compressed artwork, and deck are saved in the current browser. Edits to a card apply the next time you start a duel. Clearing site data or switching browser profiles affects access to those saved cards.

### Rarity and balance

| Rarity | Minimum Pulse | Extra unit stat points |
| --- | ---: | ---: |
| Common | 1 | 0 |
| Uncommon | 2 | 1 |
| Rare | 3 | 2 |
| Legendary | 4 | 3 |

The unit stat budget is twice the deploy cost plus two, plus the rarity bonus. Item effects use a minimum tier. Draw and Mend Unit start at Common, Blast Unit and Restore Core at Uncommon, and Sabotage Core at Rare.

Quick fill and AI auto-fill suggest a tier and validate it with the rest of the card. Lock **Rarity** to have either drafter build around your choice. Older cards get Common for units and the effect's minimum rarity for items. Rarity is used only for card balance.

## AI auto-fill with OpenRouter

In **Card studio → Auto-fill**, choose **OpenRouter**, paste your OpenRouter API key, and click **AI auto-fill**. This works on the hosted game and in a local browser. The game keeps the key in memory until you reload and sends it directly to OpenRouter. Drafts use your OpenRouter account and may use credits.

The default model is `google/gemini-3.5-flash-lite`. To use a different model, open **Model settings** and enter its OpenRouter model ID. Choose a model with structured outputs support. If you include artwork, choose a model that also accepts images. Artwork sharing is opt-in.

## AI auto-fill with the local OpenAI server

Create a local `.env` file containing `OPENAI_API_KEY=your_key`. Start with:

```sh
node --env-file=.env server.js
```

The server uses the OpenAI Responses API with structured outputs. The default model is `gpt-4.1-mini`. Set `OPENAI_MODEL` to override it with a compatible vision and structured-output model. Keep the key server-side. The server binds to loopback by default and is intended for local use. Add authentication and request quotas before exposing a keyed server publicly.

Use **Character name** to supply the character’s identity. Add their series or version to the concept if useful. AI drafts report the identity they used and request clarification in the editor copy when artwork recognition is uncertain. Both providers receive the card details, concept, and locked values you enter. They receive artwork only when you check the artwork option. Quick fill runs in the browser and is available without a key.

## Verification

Run `npm test` for duel rules, card validation, and the auto-fill HTTP contract. The API tests mock the provider and require no key.
