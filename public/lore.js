const scenes = {
  ember: ["At the kiln gate, red dust settles into every footprint.", "When the coal barges arrive, the docks smell of orange peel and smoke.", "In the ash quarter, bakers mark the hour by what the ovens will burn."],
  tide: ["At low tide, the harbor bells ring beneath the water.", "The ferry ropes are crusted with salt and warm from the sun.", "After the seawall floods, the fishmongers find silver scales in their tea."],
  grove: ["In the old grove, the footpath bends around a single white mushroom.", "Rain fills the hollows in the cedar roots before it reaches the path.", "At the forest edge, the signposts are tied to living branches."],
  veil: ["At dusk, the lanterns in the west arcade throw two shadows apiece.", "The midnight market opens when the last shop window goes dark.", "Fog collects in the theater seats long after the audience leaves."],
  storm: ["Before the thunder, the city's copper signs rattle against their bolts.", "Along the rail line, lightning skips from one signal mast to the next.", "The rooftop weather vanes all turn inland just before the first flash."],
  frost: ["On the ice road, travelers hang bells where the mile markers freeze over.", "The snow squeaks underfoot when the lake is cold enough to cross.", "At first light, frost traces every ladder against the watchtower wall."],
  stone: ["At the quarry, workers wrap the newest steps in red cord.", "Each traveler leaves a pebble at the pass before the climb.", "The cliff village counts the seasons by how far the stairway's shadow falls."],
  dawn: ["At sunrise, the lighthouse shutters open one at a time.", "The gold on the east-facing tiles lasts just long enough to cross the square.", "Before the bells ring, the window washers get the first light to themselves."],
  alloy: ["The last tram carries a box of spare bolts under every seat.", "In the machine hall, a good wrench hangs above each door.", "The old signal tower clicks once after its gears stop moving."],
};

const settings = [
  [/\b(shrine|temple|altar)\b/i, ["At the shrine gate, wet prayer slips cling to the lacquer.", "At the shrine, the bronze bell still hums after the rope goes still."]],
  [/\b(mountain|peak|ridge)\b/i, ["On the mountain trail, the guide ropes leave red fibers on the snow.", "Above the last switchback, mist gathers in the cracks of the stone steps."]],
  [/\b(ruins?|tomb|catacomb)\b/i, ["In the ruins, rain taps on the inside of a broken shield.", "At the ruined gate, a bird nests in the hollow of the bell."]],
  [/\b(desert|dunes?|oasis)\b/i, ["In the desert, wind piles a soft ridge of sand against every boot.", "By evening, the dunes have buried the caravan's last set of tracks."]],
];

const beats = {
  guard: ["The watch changes only after every traveler is counted.", "No one has had to ring the alarm bell twice."],
  haste: ["The message usually arrives before anyone hears the runner's steps.", "Everyone bets on the clock. The clock usually loses."],
  heal: ["Every chipped cup gets mended before the next traveler comes through.", "The first thing a weary traveler is offered is a place to sit."],
  draw: ["An apprentice carries a notebook to record what everyone else misses.", "Someone always stays behind to sketch the small detail that changed the route."],
  ping: ["A warning mark is left just high enough for the next patrol to see.", "When trouble is coming, the warning usually takes the form of a single bright mark."],
  lunge: ["The witnesses always disagree about which foot moved first.", "An apprentice puts fresh chalk down after each practice bout."],
  sweep: ["The crew learned to leave an extra space on either side.", "The duelists leave the edges clear when practice begins."],
  siphon: ["The smallest reserve is always kept for the walk home.", "No one can recall seeing the spare flask run empty."],
  recover: ["The ritual never changes: straighten the gear, breathe, then stand.", "The apprentice knows which stitch to replace before the next crossing."],
  basic: ["The watch keeps a fresh cup by the door for the next shift.", "Old hands can tell who came through by what was left in the dust."],
};

export function draftFlavor(card, concept = "", variant = 0) {
  const cues = `${concept} ${card.name ?? ""}`;
  let seed = 0;
  for (const character of cues) seed = (Math.imul(31, seed) + character.codePointAt(0)) >>> 0;
  const opening = settings.find(([pattern]) => pattern.test(cues))?.[1] ?? scenes[card.faction] ?? scenes.veil;
  const role = [card.active2, card.active1, card.ability].find((id) => id !== "basic" && Object.hasOwn(beats, id));
  const closing = beats[role] ?? beats.basic;
  const scene = opening[(seed + variant) % opening.length];
  const beat = closing[(Math.floor(seed / opening.length) + Math.floor(variant / opening.length)) % closing.length];
  return scene.length + beat.length < 140 ? `${scene} ${beat}` : scene;
}
