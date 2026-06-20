# Ghost Heist

2–4 player online co-op horror heist game. Break into monster-infested houses, steal valuables, sell them at the pawnshop, and survive — you can't kill the monsters, only outsmart them.

## Stack

- **Node.js + Express + Socket.io** — authoritative multiplayer server (rooms, monster AI, physics-lite item/noise simulation), runs anywhere (Win/Mac/Linux), browser client needs no install.
- **Three.js** (client, via CDN import map) — 3D rendering, top-down 45° follow camera, fog/spotlights for atmosphere.
- Plain HTML/CSS/JS for UI (menu, lobby, shop, pawnshop, HUD).

This was chosen over Unity/Unreal so the whole game is playable instantly in a browser tab by anyone with the URL, with no build/installer step, while still giving full control over the physics/AI/noise systems described in the spec.

## Run it

```
npm install
npm start
```

Open `http://localhost:3000` in 2–4 browser tabs (or share your LAN/tunnel URL with friends). One player hosts and gets a room code, others join with it.

## What's implemented

- **5 levels** with increasing goals/monster counts/room counts (`shared/data.js`): Abandoned House → Suburban House → Mansion → Psychiatric Hospital → Castle.
- **6 monster types**, each with a real, distinct AI implementation in `server/monsterAI.js`:
  - Blind Listener — pure hearing-radius detection, no vision.
  - Deaf Watcher — 110° vision cone + fixed patrol route, no hearing.
  - Sniffer — smell radius that expands sharply if a player has run recently.
  - Mirror — copies the movement of whoever is looking directly at it.
  - Sleeper — dormant until a loud-enough noise wakes it, then rages for 30s.
  - Hoarder — bound to a guarded item; teleports it back if it's carried too far away.
  - All run through a patrol → alert → chase → search → return state machine (`runStateMachine`), with type-specific detection layered on top.
- **Noise system** (`server/gameRoom.js`): every player action emits a noise event with radius+strength based on move state (crouch/walk/run) and floor surface material (carpet/hardwood/tile/glass multipliers). Fragile item drops emit a loud breakage event. Visualized client-side as a green→red ring under each player.
- **Physics-lite item system**: items live in shared room state, get picked up/dropped/carried, break (and go loud) on impact if fragile, and heavy items are flagged for 2-player carry.
- **Economy**: pawnshop price decay per item type when oversold, broken items sell for 20% value, 30% bonus for hitting the level goal.
- **Shop**: all 12 gear items from the spec, purchasable with shared team cash between levels.
- **Online co-op**: Socket.io rooms, 2–4 players, host/join via 4-letter code, authoritative 20Hz server tick syncing all player/monster/item state.
- **Downed/revive**: getting caught downs a player (and screams — emits noise); teammates revive by interacting nearby.
- **Active tools** (G key, consumed from shared team inventory): Net traps the nearest monster for 8s, Sleep Gas forces it back to patrol, Smoke Bomb creates a fog zone that blocks vision-based monsters' line of sight for 15s, Anti-Smell Spray blocks the Sniffer's detection of you for 60s.
- **Alarm/berserk mode**: sustained noise builds up a hidden "heat" meter; once it crosses a threshold, an alarm triggers — every monster instantly goes aggressive and hunts the nearest player for a 60-second window. Fail to finish (or fail to bring heat back down) before it expires and the run ends.
- **Secret betrayer**: at the start of a run there's a chance one player is secretly working for security (only they're told). Their hidden ability (B key, 20s cooldown) reveals a random teammate's location to the nearest monster.
- Minimal EN/RU UI string toggle (top-right of main menu) as a starting point for full localization.

## Honest scope notes

This is a real, working multiplayer prototype proving out every system in the design (AI, noise, physics, economy, netcode) — not a finished, polished, Steam-shippable AAA title. Things intentionally **not** built to spec, because they genuinely require a full game-dev production pipeline (3D art/animation team, audio design, Steamworks integration, voice infra) rather than coding effort alone:

- Hand-modeled 3D art/animations (currently primitive geometric meshes), volumetric fog/bloom post-processing, particle FX.
- Full 3D positional voice chat (would need WebRTC audio mesh + push-to-talk UI).
- Full Russian/English localization of all in-game text (only a handful of menu strings are toggled today).
- A signed, packaged Steam build (Steamworks SDK, depot config, achievements).

The architecture (shared data-driven levels/monsters/items, a clean monster AI module, an authoritative room/tick loop) is built so each of these can be layered on without a rewrite.
