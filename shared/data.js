// Shared game data: levels, monster types, shop items, item defs.
// Loaded by server (CommonJS) and client (as ES module via separate copy in public/src).

const SURFACES = {
  carpet: { noiseMul: 0.2, color: 0x6b5240 },
  hardwood: { noiseMul: 1.0, color: 0x8a6a45 },
  tile: { noiseMul: 1.1, color: 0xaaaaaa },
  glass: { noiseMul: 3.0, color: 0xffffff }
};

const MONSTER_TYPES = {
  blind_listener: {
    name: 'Blind Listener',
    desc: "Can't see. Hears everything in a radius.",
    speed: 2.6, chaseSpeed: 4.2,
    hearingRadius: 14, visionRange: 0, visionAngle: 0,
    color: 0x3a1f1f
  },
  deaf_watcher: {
    name: 'Deaf Watcher',
    desc: "Can't hear. Perfect vision, patrols a fixed route.",
    speed: 2.2, chaseSpeed: 4.6,
    hearingRadius: 0, visionRange: 12, visionAngle: 110,
    color: 0x1f1f3a
  },
  sniffer: {
    name: 'Sniffer',
    desc: 'Smells players; range grows a lot if they ran recently.',
    speed: 2.4, chaseSpeed: 4.0,
    smellRangeBase: 6, smellRangeRun: 16,
    color: 0x2f3a1f
  },
  mirror: {
    name: 'Mirror',
    desc: 'Copies the movement of anyone looking directly at it.',
    speed: 2.0, chaseSpeed: 3.6,
    color: 0x888888
  },
  sleeper: {
    name: 'Sleeper',
    desc: 'Sleeps until noise wakes it, then rages for 30s.',
    speed: 0, chaseSpeed: 5.0,
    wakeNoiseThreshold: 0.5, rageDuration: 30,
    color: 0x3a1f3a
  },
  hoarder: {
    name: 'Hoarder',
    desc: 'Guards specific items; teleports them back if moved far.',
    speed: 2.1, chaseSpeed: 3.8,
    teleportRadius: 8,
    color: 0x1f3a2f
  }
};

const ITEM_DEFS = {
  vase: { name: 'Ming Vase', value: 180, weight: 1, fragile: true, model: 'vase' },
  painting: { name: 'Oil Painting', value: 250, weight: 1, fragile: false, model: 'painting' },
  jewelry_box: { name: 'Jewelry Box', value: 140, weight: 1, fragile: false, model: 'box' },
  gold_statue: { name: 'Gold Statue', value: 400, weight: 2, fragile: false, model: 'statue', heavy: true },
  silverware: { name: 'Silverware Set', value: 90, weight: 1, fragile: false, model: 'crate' },
  tv: { name: 'Flatscreen TV', value: 300, weight: 2, fragile: true, model: 'tv', heavy: true },
  safe: { name: 'Antique Safe', value: 600, weight: 3, fragile: false, model: 'safe', heavy: true },
  crown: { name: 'Jeweled Crown', value: 900, weight: 1, fragile: false, model: 'crown' },
  chandelier: { name: 'Crystal Chandelier', value: 500, weight: 2, fragile: true, model: 'chandelier', heavy: true },
  coin_collection: { name: 'Rare Coin Collection', value: 220, weight: 1, fragile: false, model: 'box' }
};

const SHOP_ITEMS = {
  quiet_flashlight: { name: 'Quiet Flashlight', price: 30, desc: 'Lights area, no noise.' },
  silent_shoes: { name: 'Silent Shoes', price: 50, desc: '-50% movement noise.' },
  monster_scanner: { name: 'Monster Scanner', price: 80, desc: 'Pings nearby monster positions.' },
  music_box: { name: 'Music Box Decoy', price: 60, desc: 'Throwable, lures sound-based monsters.' },
  large_backpack: { name: 'Large Backpack', price: 120, desc: '+1 item slot.' },
  adrenaline_shot: { name: 'Adrenaline Shot', price: 150, desc: 'Temporary speed boost, no stamina drain.' },
  hook_tool: { name: 'Hook Tool', price: 40, desc: 'Grab items from a distance.' },
  lockpick: { name: 'Lockpick', price: 70, desc: 'Open locked doors/chests silently.' },
  anti_smell_spray: { name: 'Anti-Smell Spray', price: 90, desc: 'Blocks Sniffer detection for 60s.' },
  smoke_bomb: { name: 'Smoke Bomb', price: 100, desc: 'Breaks vision-based monster line of sight.' },
  net: { name: 'Net', price: 110, desc: 'Temporarily traps a monster.' },
  sleep_gas: { name: 'Sleep Gas', price: 130, desc: 'Forces a monster back into patrol state.' }
};

const LEVELS = [
  {
    id: 1, name: 'Abandoned House', goal: 200,
    monsters: ['blind_listener'],
    size: { w: 24, h: 18 },
    rooms: [
      { x: 0, y: 0, w: 24, h: 18, name: 'Floor' },
      { x: 8, y: 0, w: 1, h: 7, wall: true },
      { x: 8, y: 11, w: 1, h: 7, wall: true },
      { x: 16, y: 5, w: 1, h: 13, wall: true }
    ],
    surface: 'hardwood',
    items: [
      { type: 'vase', x: 4, y: 4 },
      { type: 'painting', x: 12, y: 3 },
      { type: 'jewelry_box', x: 20, y: 8 },
      { type: 'silverware', x: 6, y: 14 },
      { type: 'coin_collection', x: 18, y: 14 }
    ],
    monsterSpawns: [{ type: 'blind_listener', x: 12, y: 9 }],
    vanPos: { x: 2, y: 2 }
  },
  {
    id: 2, name: 'Suburban House', goal: 500,
    monsters: ['blind_listener', 'deaf_watcher'],
    size: { w: 30, h: 24 },
    rooms: [{ x: 0, y: 0, w: 30, h: 24, name: 'Floor' }],
    surface: 'carpet',
    items: [
      { type: 'tv', x: 5, y: 5 }, { type: 'gold_statue', x: 22, y: 6 },
      { type: 'vase', x: 14, y: 18 }, { type: 'painting', x: 8, y: 20 },
      { type: 'jewelry_box', x: 25, y: 18 }, { type: 'silverware', x: 4, y: 14 },
      { type: 'coin_collection', x: 18, y: 4 }
    ],
    monsterSpawns: [{ type: 'blind_listener', x: 15, y: 12 }, { type: 'deaf_watcher', x: 22, y: 12 }],
    vanPos: { x: 2, y: 2 }
  },
  {
    id: 3, name: 'Mansion', goal: 1500,
    monsters: ['blind_listener', 'deaf_watcher', 'sniffer'],
    size: { w: 40, h: 32 },
    rooms: [{ x: 0, y: 0, w: 40, h: 32, name: 'Floor' }],
    surface: 'hardwood',
    items: [
      { type: 'crown', x: 35, y: 28 }, { type: 'safe', x: 5, y: 28 },
      { type: 'chandelier', x: 20, y: 4 }, { type: 'gold_statue', x: 8, y: 8 },
      { type: 'tv', x: 30, y: 6 }, { type: 'painting', x: 14, y: 20 },
      { type: 'vase', x: 25, y: 16 }, { type: 'jewelry_box', x: 4, y: 16 }
    ],
    monsterSpawns: [{ type: 'blind_listener', x: 20, y: 16 }, { type: 'deaf_watcher', x: 10, y: 24 }, { type: 'sniffer', x: 30, y: 20 }],
    vanPos: { x: 2, y: 2 }
  },
  {
    id: 4, name: 'Psychiatric Hospital', goal: 3000,
    monsters: ['blind_listener', 'deaf_watcher', 'sniffer', 'sleeper'],
    size: { w: 48, h: 40 },
    rooms: [{ x: 0, y: 0, w: 48, h: 40, name: 'Floor' }],
    surface: 'tile',
    items: [
      { type: 'safe', x: 40, y: 36 }, { type: 'crown', x: 6, y: 6 },
      { type: 'gold_statue', x: 24, y: 30 }, { type: 'chandelier', x: 36, y: 10 },
      { type: 'tv', x: 12, y: 32 }, { type: 'vase', x: 30, y: 4 },
      { type: 'painting', x: 18, y: 18 }, { type: 'jewelry_box', x: 42, y: 18 },
      { type: 'silverware', x: 8, y: 22 }
    ],
    monsterSpawns: [
      { type: 'blind_listener', x: 24, y: 20 }, { type: 'deaf_watcher', x: 12, y: 12 },
      { type: 'sniffer', x: 36, y: 28 }, { type: 'sleeper', x: 20, y: 34 }
    ],
    vanPos: { x: 2, y: 2 }
  },
  {
    id: 5, name: 'Castle', goal: 8000,
    monsters: ['blind_listener', 'deaf_watcher', 'sniffer', 'mirror', 'hoarder'],
    size: { w: 56, h: 48 },
    rooms: [{ x: 0, y: 0, w: 56, h: 48, name: 'Floor' }],
    surface: 'hardwood',
    items: [
      { type: 'crown', x: 48, y: 42 }, { type: 'safe', x: 8, y: 8 },
      { type: 'chandelier', x: 28, y: 6 }, { type: 'gold_statue', x: 44, y: 10 },
      { type: 'tv', x: 6, y: 36 }, { type: 'vase', x: 36, y: 20 },
      { type: 'painting', x: 14, y: 28 }, { type: 'jewelry_box', x: 50, y: 24 },
      { type: 'silverware', x: 20, y: 40 }, { type: 'coin_collection', x: 30, y: 34 }
    ],
    monsterSpawns: [
      { type: 'blind_listener', x: 28, y: 24 }, { type: 'deaf_watcher', x: 16, y: 16 },
      { type: 'sniffer', x: 42, y: 32 }, { type: 'mirror', x: 28, y: 40 },
      { type: 'hoarder', x: 48, y: 10 }
    ],
    vanPos: { x: 2, y: 2 }
  }
];

const GameData = { SURFACES, MONSTER_TYPES, ITEM_DEFS, SHOP_ITEMS, LEVELS };
if (typeof module !== 'undefined') module.exports = GameData;
if (typeof window !== 'undefined') window.GameData = GameData;
