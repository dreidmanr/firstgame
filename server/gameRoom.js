const { LEVELS, ITEM_DEFS, SHOP_ITEMS, SURFACES } = require('../shared/data');
const { Monster } = require('./monsterAI');

const TICK_MS = 50; // 20Hz authoritative tick

class GameRoom {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map(); // id -> player state
    this.phase = 'lobby'; // lobby, shop, run, pawnshop
    this.levelIndex = 0;
    this.cash = 0;
    this.priceModifiers = {}; // itemType -> multiplier
    this.run = null; // active level run state
    this.loop = setInterval(() => this.tick(), TICK_MS);
  }

  addPlayer(socket, name) {
    this.players.set(socket.id, {
      id: socket.id, socket, name: name || 'Thief',
      x: 1, y: 1, facing: 0, dx: 0, dy: 0,
      crouching: false, running: false, downed: false,
      lastNoise: 0, ranRecently: false, runTimer: 0,
      inventory: [null, null, null], tools: [null, null],
      ownedItems: {}, secretBetrayer: false
    });
    socket.join(this.code);
    this.broadcastLobby();
  }

  removePlayer(id) {
    this.players.delete(id);
    this.broadcastLobby();
  }

  broadcastLobby() {
    this.io.to(this.code).emit('lobby', {
      code: this.code,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name })),
      phase: this.phase,
      levelIndex: this.levelIndex,
      cash: this.cash
    });
  }

  buyItem(playerId, itemKey) {
    const def = SHOP_ITEMS[itemKey];
    const p = this.players.get(playerId);
    if (!def || !p) return;
    if (this.cash < def.price) {
      p.socket.emit('shopError', 'Not enough cash');
      return;
    }
    this.cash -= def.price;
    p.ownedItems[itemKey] = (p.ownedItems[itemKey] || 0) + 1;
    this.broadcastLobby();
    this.io.to(this.code).emit('shopUpdate', { playerId, itemKey, owned: p.ownedItems[itemKey], cash: this.cash });
  }

  startRun() {
    if (this.phase === 'run') return;
    const level = LEVELS[this.levelIndex];
    if (!level) return;
    this.phase = 'run';
    let itemId = 0;
    const items = level.items.map(it => ({
      id: 'i' + (itemId++), type: it.type, x: it.x, y: it.y, broken: false, heldBy: null
    }));
    let monsterId = 0;
    const monsters = level.monsterSpawns.map(m => new Monster('m' + (monsterId++), m.type, m));
    // assign hoarder a guarded item
    monsters.forEach(m => {
      if (m.type === 'hoarder' && items.length) {
        let best = null, bestD = Infinity;
        for (const it of items) {
          const d = Math.hypot(it.x - m.x, it.y - m.y);
          if (d < bestD) { bestD = d; best = it; }
        }
        if (best) m.guardedItemId = best.id;
      }
    });
    this.run = {
      level, items, monsters, smokeZones: [],
      noiseEvents: [], alarmTriggered: false, alarmTimer: 0, alarmActive: false, heatLevel: 0,
      stolenValue: 0, startTime: Date.now()
    };
    let i = 0;
    const players = [...this.players.values()];
    for (const p of players) {
      p.x = level.vanPos.x + (i % 2); p.y = level.vanPos.y + Math.floor(i / 2);
      p.downed = false; p.inventory = [null, null, null]; p.secretBetrayer = false;
      p.sabotageCooldown = 0;
      i++;
    }
    if (players.length >= 2 && Math.random() < 0.4) {
      const betrayer = players[Math.floor(Math.random() * players.length)];
      betrayer.secretBetrayer = true;
      betrayer.socket.emit('role', {
        betrayer: true,
        info: 'You secretly work for security. Press B near a monster to reveal a random teammate\'s location to it.'
      });
    }
    this.io.to(this.code).emit('runStarted', this.serializeRun());
  }

  handleInput(playerId, input) {
    const p = this.players.get(playerId);
    if (!p || this.phase !== 'run' || p.downed) return;
    const speedBase = 4.2;
    const speed = input.crouch ? speedBase * 0.45 : (input.run ? speedBase * 1.7 : speedBase);
    const dt = TICK_MS / 1000;
    let dx = (input.dx || 0), dy = (input.dy || 0);
    const len = Math.hypot(dx, dy) || 1;
    dx = (dx / len) * speed * dt;
    dy = (dy / len) * speed * dt;
    const radius = 0.4;
    const level = this.run.level;
    let nx = p.x + dx;
    if (!this.collidesWall(level, nx, p.y, radius)) p.x = nx; else dx = 0;
    let ny = p.y + dy;
    if (!this.collidesWall(level, p.x, ny, radius)) p.y = ny; else dy = 0;
    p.dx = dx; p.dy = dy;
    p.facing = input.facing != null ? input.facing : p.facing;
    p.crouching = !!input.crouch;
    p.running = !!input.run && (dx !== 0 || dy !== 0);
    p.ranRecently = p.running ? true : (p.ranRecently && (p.runTimer -= dt) > 0);
    if (p.running) p.runTimer = 4;

    if (dx !== 0 || dy !== 0) {
      const surface = SURFACES[this.run.level.surface] || SURFACES.hardwood;
      let strength = p.crouching ? 0.05 : (p.running ? 1.0 : 0.4);
      strength *= surface.noiseMul;
      if (p.ownedItems.silent_shoes) strength *= 0.5;
      p.lastNoise = strength;
      if (strength > 0.15) {
        this.run.noiseEvents.push({ x: p.x, y: p.y, radius: 3 + strength * 6, strength, playerId: p.id });
        this.run.heatLevel += strength * 0.15;
      }
    } else {
      p.lastNoise = 0;
    }
  }

  collidesWall(level, x, y, radius) {
    if (x - radius < 0 || x + radius > level.size.w || y - radius < 0 || y + radius > level.size.h) return true;
    for (const room of level.rooms) {
      if (!room.wall) continue;
      if (x + radius > room.x && x - radius < room.x + room.w && y + radius > room.y && y - radius < room.y + room.h) return true;
    }
    return false;
  }

  handleInteract(playerId, data) {
    const p = this.players.get(playerId);
    if (!p || !this.run) return;
    if (data.action === 'pickup') {
      const item = this.run.items.find(i => i.id === data.itemId);
      if (!item || item.heldBy) return;
      const slot = p.inventory.findIndex(s => s === null);
      if (slot === -1) return;
      const dist = Math.hypot(item.x - p.x, item.y - p.y);
      if (dist > 1.5) return;
      item.heldBy = p.id;
      p.inventory[slot] = item.id;
    } else if (data.action === 'drop') {
      const slot = p.inventory.indexOf(data.itemId);
      if (slot === -1) return;
      const item = this.run.items.find(i => i.id === data.itemId);
      item.heldBy = null; item.x = p.x; item.y = p.y;
      p.inventory[slot] = null;
      const def = ITEM_DEFS[item.type];
      if (def.fragile) {
        item.broken = true;
        this.run.noiseEvents.push({ x: p.x, y: p.y, radius: 10, strength: 2.0, playerId: p.id });
      }
    } else if (data.action === 'decoy') {
      if (!p.ownedItems.music_box) return;
      p.ownedItems.music_box--;
      this.run.noiseEvents.push({ x: data.x, y: data.y, radius: 12, strength: 1.5, playerId: null });
    } else if (data.action === 'revive') {
      const target = this.players.get(data.targetId);
      if (target && target.downed) {
        const dist = Math.hypot(target.x - p.x, target.y - p.y);
        if (dist < 1.8) target.downed = false;
      }
    } else if (data.action === 'use_tool') {
      this.useTool(p, data.toolKey);
    } else if (data.action === 'sabotage') {
      this.sabotage(p);
    }
  }

  useTool(p, toolKey) {
    if (!p.ownedItems[toolKey]) return;
    const range = 8;
    let nearest = null, nearestD = range;
    for (const m of this.run.monsters) {
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d < nearestD) { nearestD = d; nearest = m; }
    }
    if (toolKey === 'smoke_bomb') {
      p.ownedItems.smoke_bomb--;
      this.run.smokeZones.push({ x: p.x, y: p.y, radius: 6, expiresAt: Date.now() + 15000 });
    } else if (toolKey === 'net') {
      if (!nearest) return;
      p.ownedItems.net--;
      nearest.state = 'trapped';
      nearest.stateTimer = 8;
    } else if (toolKey === 'sleep_gas') {
      if (!nearest) return;
      p.ownedItems.sleep_gas--;
      nearest.state = 'return';
      nearest.targetPlayerId = null;
      nearest.lastKnownX = null;
    } else if (toolKey === 'anti_smell_spray') {
      p.ownedItems.anti_smell_spray--;
      p.smellBlockedUntil = Date.now() + 60000;
    }
  }

  sabotage(p) {
    if (!p.secretBetrayer) return;
    const now = Date.now();
    if (p.sabotageCooldown && now < p.sabotageCooldown) return;
    p.sabotageCooldown = now + 20000;
    const others = [...this.players.values()].filter(o => o.id !== p.id && !o.downed);
    if (!others.length || !this.run.monsters.length) return;
    const victim = others[Math.floor(Math.random() * others.length)];
    let nearest = null, nearestD = Infinity;
    for (const m of this.run.monsters) {
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d < nearestD) { nearestD = d; nearest = m; }
    }
    if (nearest) {
      nearest.state = 'chase';
      nearest.targetPlayerId = victim.id;
      nearest.lastKnownX = victim.x;
      nearest.lastKnownY = victim.y;
    }
  }

  sellAtVan(playerId) {
    const p = this.players.get(playerId);
    if (!p || !this.run) return;
    const level = this.run.level;
    const distToVan = Math.hypot(p.x - level.vanPos.x, p.y - level.vanPos.y);
    if (distToVan > 2.5) return;
    for (let s = 0; s < p.inventory.length; s++) {
      const itemId = p.inventory[s];
      if (!itemId) continue;
      const item = this.run.items.find(i => i.id === itemId);
      if (!item) continue;
      const def = ITEM_DEFS[item.type];
      let value = def.value * (this.priceModifiers[item.type] || 1);
      if (item.broken) value *= 0.2;
      this.cash += value;
      this.run.stolenValue += value;
      this.priceModifiers[item.type] = (this.priceModifiers[item.type] || 1) * 0.85;
      item.sold = true;
      p.inventory[s] = null;
    }
    this.run.items = this.run.items.filter(i => !i.sold);
    if (this.run.stolenValue >= level.goal) {
      this.endRun(true);
    }
    this.io.to(this.code).emit('cashUpdate', { cash: this.cash, stolenValue: this.run.stolenValue, goal: level.goal });
  }

  endRun(success) {
    if (!this.run) return;
    let bonus = 0;
    if (success && this.run.stolenValue >= this.run.level.goal) {
      bonus = this.run.stolenValue * 0.3;
      this.cash += bonus;
    }
    this.phase = 'pawnshop';
    this.io.to(this.code).emit('runEnded', {
      success, bonus, cash: this.cash, stolenValue: this.run.stolenValue
    });
    this.run = null;
  }

  nextLevel() {
    if (this.levelIndex < LEVELS.length - 1) this.levelIndex++;
    this.phase = 'shop';
    this.broadcastLobby();
  }

  tick() {
    if (this.phase !== 'run' || !this.run) return;
    const dt = TICK_MS / 1000;
    const players = [...this.players.values()];

    this.run.smokeZones = this.run.smokeZones.filter(z => z.expiresAt > Date.now());
    this.run.heatLevel = Math.max(0, this.run.heatLevel - dt * 0.3);
    if (!this.run.alarmTriggered && this.run.heatLevel > 6) {
      this.run.alarmTriggered = true;
      this.run.alarmActive = true;
      this.run.alarmTimer = 60;
      this.io.to(this.code).emit('alarm', { triggered: true });
    }
    if (this.run.alarmActive) {
      this.run.alarmTimer -= dt;
      if (this.run.alarmTimer <= 0) {
        this.run.alarmActive = false;
        this.endRun(false);
        return;
      }
    }

    for (const m of this.run.monsters) {
      if (this.run.alarmActive && m.state !== 'trapped') {
        // berserk: every monster becomes an aggressive hunter, ignoring its normal detection rules
        let nearest = null, nearestD = Infinity;
        for (const p of players) {
          if (p.downed) continue;
          const d = Math.hypot(p.x - m.x, p.y - m.y);
          if (d < nearestD) { nearestD = d; nearest = p; }
        }
        if (nearest) {
          m.state = 'chase'; m.targetPlayerId = nearest.id;
          m.lastKnownX = nearest.x; m.lastKnownY = nearest.y;
          m.moveToward(nearest.x, nearest.y, m.def.chaseSpeed * 1.3, dt);
        }
      } else {
        m.update(dt, players, this.run.noiseEvents, this.run);
      }
      if (m.state === 'chase' || m.state === 'raging') {
        for (const p of players) {
          if (Math.hypot(p.x - m.x, p.y - m.y) < 1 && !p.downed) {
            p.downed = true;
            this.run.noiseEvents.push({ x: p.x, y: p.y, radius: 15, strength: 1.8, playerId: p.id });
          }
        }
      }
    }
    this.run.noiseEvents = [];
    if (players.length && players.every(p => p.downed)) {
      this.endRun(false);
      return;
    }
    this.io.to(this.code).emit('state', this.serializeRun());
  }

  serializeRun() {
    if (!this.run) return null;
    return {
      level: { id: this.run.level.id, name: this.run.level.name, goal: this.run.level.goal, size: this.run.level.size, surface: this.run.level.surface, vanPos: this.run.level.vanPos, rooms: this.run.level.rooms },
      items: this.run.items.map(i => ({ id: i.id, type: i.type, x: i.x, y: i.y, broken: i.broken, heldBy: i.heldBy })),
      monsters: this.run.monsters.map(m => m.serialize()),
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, x: p.x, y: p.y, facing: p.facing,
        crouching: p.crouching, running: p.running, downed: p.downed,
        lastNoise: p.lastNoise, inventory: p.inventory, ownedItems: p.ownedItems
      })),
      stolenValue: this.run.stolenValue,
      alarmActive: this.run.alarmActive, alarmTimer: Math.max(0, Math.round(this.run.alarmTimer)),
      smokeZones: this.run.smokeZones
    };
  }

  stop() { clearInterval(this.loop); }
}

module.exports = { GameRoom };
