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
      level, items, monsters,
      noiseEvents: [], alarmTriggered: false, alarmTimer: 0,
      stolenValue: 0, startTime: Date.now()
    };
    let i = 0;
    for (const p of this.players.values()) {
      p.x = level.vanPos.x + (i % 2); p.y = level.vanPos.y + Math.floor(i / 2);
      p.downed = false; p.inventory = [null, null, null];
      i++;
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
    p.x += dx; p.y += dy;
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
      }
    } else {
      p.lastNoise = 0;
    }
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
      this.run.noiseEvents.push({ x: data.x, y: data.y, radius: 12, strength: 1.5, playerId: null });
    } else if (data.action === 'revive') {
      const target = this.players.get(data.targetId);
      if (target && target.downed) {
        const dist = Math.hypot(target.x - p.x, target.y - p.y);
        if (dist < 1.8) target.downed = false;
      }
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
    for (const m of this.run.monsters) {
      m.update(dt, players, this.run.noiseEvents, this.run);
      if (m.state === 'chase') {
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
        lastNoise: p.lastNoise, inventory: p.inventory
      })),
      stolenValue: this.run.stolenValue
    };
  }

  stop() { clearInterval(this.loop); }
}

module.exports = { GameRoom };
