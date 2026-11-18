# Lanternwake Arena

An original anime-inspired card battler. Build a 15-card deck, fight across three lanes, and create playable units with your own illustrations.

## Run locally

Install Node.js 22 or later, then run:

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). There are no package dependencies. The app includes 18 starter units with emblem placeholders, a starter deck, and a CPU rival.

## The duel

- Reduce the rival's 20-health Core to zero. Bring 15 cards with up to three copies of each unit.
- Both players start with four cards, including a card they can afford if their deck contains one. At the start of your turn, draw once and refill Pulse. The first player skips the opening draw. Pulse capacity starts at two, growing by one per round to six.
- Spend Pulse to play units in empty lanes. Ready units can strike in their lane or shift into an open neighboring lane. Units trade damage when they fight and hit the opposing Core when no unit stands in the way.
- Striking in two distinct lanes in one turn gives one bonus Pulse. Starting a turn with an empty deck costs one Core health.
- Units use a shared stat budget based on cost. Six built-in abilities support rushing, shielding, drawing, healing, and damage on deployment.

## Create a card

1. Open **Card studio**. Add a faction, a name, a concept, or your artwork.
2. Enter the fields yourself, use **Quick fill** for a template, or use **AI auto-fill** with the configuration below. Review the draft and save it.
3. In **Deck**, remove a card to free a slot, add your new unit, and start a **New duel**.

The collection, compressed artwork, and deck are saved in the current browser. Edits to a card apply the next time you start a duel. Clearing site data or switching browser profiles affects access to those saved cards.

## Optional AI auto-fill

Create a local `.env` file containing `OPENAI_API_KEY=your_key`. Start with:

```sh
node --env-file=.env server.js
```

The server uses the OpenAI Responses API with structured outputs. The default model is `gpt-4.1-mini`. Set `OPENAI_MODEL` to override it with a compatible vision and structured-output model. Keep the key server-side. The server binds to loopback by default and is intended for local use. Add authentication and request quotas before exposing a keyed server publicly.

Auto-fill sends the name, faction and brief you enter. It includes artwork only when you check the artwork option. It never changes your image. You can review and edit the draft before adding it to your collection. Quick fill runs in the browser and is available without a key.

## Verification

Run `npm test` for duel rules, card validation, and the auto-fill HTTP contract. The API tests mock the provider and require no key.
