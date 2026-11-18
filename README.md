# Lanternwake Arena

An original anime-inspired card battler. Build a 15-card deck, fight across three lanes, and create playable units with your own illustrations.

## Run locally

Install Node.js 22 or later, then run:

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). There are no package dependencies. The app includes 23 sample units with emblem placeholders, a starter deck, and a CPU rival.

## The duel

- Reduce the rival's 20-health Core to zero. Bring 15 cards with up to three copies of each unit.
- Both players start with four cards, including a card they can afford if their deck contains one. At the start of your turn, draw once and refill Pulse. The first player skips the opening draw. Pulse capacity starts at two, growing by one per round to six.
- Spend Pulse to play units in empty lanes. Tap a ready unit to choose one of its active skills or shift it into an open neighboring lane. Paid skills spend Pulse from the same pool as deployment. Units trade damage when they fight and hit the opposing Core when no unit stands in the way.
- Striking in two distinct lanes in one turn gives one bonus Pulse. Starting a turn with an empty deck costs one Core health.
- Units can have up to two different active skills and one automatic passive. Attack, Health, and the passive use a shared stat budget based on deploy cost. Legacy cards keep their existing passive and receive one zero-Pulse Strike.
- The collection is filterable by element. Ember, Tide, Grove, Veil, Storm, Frost, Stone, Dawn, and Alloy have their own frames and drafting themes.

## Create a card

1. Open **Card studio**. Add an element, a name, a concept, or your artwork.
2. Tap **Lock** next to any field you want to keep. Quick fill and AI auto-fill use locked values as context and draft around them. Tap **Locked** to unlock a field. If locked stats exceed the Pulse budget, adjust or unlock one of them.
3. Enter the fields yourself, use **Quick fill** for a draft, or use **AI auto-fill** with the configuration below. Use **Suggest new flavor text** to revise just the lore with the card's concept, element, and skills. On a phone, tap **Preview** to see the complete card face.
4. In **Deck**, open **Active deck** and remove a card to free a slot. Add your new unit from the collection and start a **New duel**.

The collection, compressed artwork, and deck are saved in the current browser. Edits to a card apply the next time you start a duel. Clearing site data or switching browser profiles affects access to those saved cards.

## AI auto-fill with OpenRouter

In **Card studio → Auto-fill**, choose **OpenRouter**, paste your OpenRouter API key, and click **AI auto-fill**. This works on the hosted game and in a local browser. The game keeps the key in memory until you reload and sends it directly to OpenRouter. Drafts use your OpenRouter account and may use credits.

The default model is `google/gemini-3.5-flash-lite`. To use a different model, open **Model settings** and enter its OpenRouter model ID. Choose a model with structured outputs support. If you include artwork, choose a model that also accepts images. Artwork sharing is opt-in.

## AI auto-fill with the local OpenAI server

Create a local `.env` file containing `OPENAI_API_KEY=your_key`. Start with:

```sh
node --env-file=.env server.js
```

The server uses the OpenAI Responses API with structured outputs. The default model is `gpt-4.1-mini`. Set `OPENAI_MODEL` to override it with a compatible vision and structured-output model. Keep the key server-side. The server binds to loopback by default and is intended for local use. Add authentication and request quotas before exposing a keyed server publicly.

Both providers receive the name, faction, brief, and locked values you enter. They receive artwork only when you check the artwork option. You can review and edit the draft before adding it to your collection. Quick fill runs in the browser and is available without a key.

## Verification

Run `npm test` for duel rules, card validation, and the auto-fill HTTP contract. The API tests mock the provider and require no key.
