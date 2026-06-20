const { MONSTER_TYPES } = require('../shared/data');

// States: patrol, alert, chase, search, return, sleeping, raging
class Monster {
  constructor(id, type, spawn) {
    this.id = id;
    this.type = type;
    this.def = MONSTER_TYPES[type];
    this.x = spawn.x;
    this.y = spawn.y;
    this.homeX = spawn.x;
    this.homeY = spawn.y;
    this.facing = Math.random() * Math.PI * 2;
    this.state = type === 'sleeper' ? 'sleeping' : 'patrol';
    this.patrolTarget = this.randomPatrolPoint();
    this.targetPlayerId = null;
    this.lastKnownX = null;
    this.lastKnownY = null;
    this.stateTimer = 0;
    this.guardedItemId = null; // hoarder
  }

  randomPatrolPoint() {
    return { x: this.homeX + (Math.random() - 0.5) * 10, y: this.homeY + (Math.random() - 0.5) * 10 };
  }

  // Core per-tick update. players: array of {id,x,y,running,crouching,downed,lastNoise}
  // noiseEvents: array of {x,y,radius,strength} generated this tick
  update(dt, players, noiseEvents, level) {
    if (this.state === 'trapped') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.state = 'patrol';
      return;
    }
    switch (this.type) {
      case 'blind_listener': this.updateBlindListener(dt, players, noiseEvents); break;
      case 'deaf_watcher': this.updateDeafWatcher(dt, players, level); break;
      case 'sniffer': this.updateSniffer(dt, players); break;
      case 'mirror': this.updateMirror(dt, players); break;
      case 'sleeper': this.updateSleeper(dt, players, noiseEvents); break;
      case 'hoarder': this.updateHoarder(dt, players, level); break;
    }
  }

  dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  moveToward(tx, ty, speed, dt) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.3) return true;
    this.facing = Math.atan2(dy, dx);
    this.x += (dx / d) * speed * dt;
    this.y += (dy / d) * speed * dt;
    return false;
  }

  // --- Blind Listener: reacts purely to noise radius ---
  updateBlindListener(dt, players, noiseEvents) {
    if (this.state === 'chase' || this.state === 'search') {
      const target = players.find(p => p.id === this.targetPlayerId);
      if (target && this.dist(this, target) < this.def.hearingRadius * 1.5 && (target.lastNoise || 0) > 0) {
        this.lastKnownX = target.x; this.lastKnownY = target.y;
      }
    }
    for (const ev of noiseEvents) {
      const d = Math.hypot(ev.x - this.x, ev.y - this.y);
      if (d < ev.radius * ev.strength + this.def.hearingRadius * 0.3) {
        this.lastKnownX = ev.x; this.lastKnownY = ev.y;
        this.targetPlayerId = ev.playerId || this.targetPlayerId;
        this.state = 'chase';
        this.stateTimer = 0;
      }
    }
    this.runStateMachine(dt, players);
  }

  // --- Deaf Watcher: vision cone, fixed patrol route ---
  updateDeafWatcher(dt, players, level) {
    if (this.state === 'patrol') {
      for (const p of players) {
        if (p.downed) continue;
        if (this.canSee(p, level)) { this.state = 'chase'; this.targetPlayerId = p.id; this.lastKnownX = p.x; this.lastKnownY = p.y; this.stateTimer = 0; }
      }
    } else if (this.state === 'chase') {
      const target = players.find(p => p.id === this.targetPlayerId);
      if (target && this.canSee(target, level)) { this.lastKnownX = target.x; this.lastKnownY = target.y; }
    }
    this.runStateMachine(dt, players);
  }

  canSee(p, level) {
    const d = this.dist(this, p);
    if (d > this.def.visionRange) return false;
    if (level && level.smokeZones) {
      for (const z of level.smokeZones) {
        if (Math.hypot(z.x - p.x, z.y - p.y) < z.radius || Math.hypot(z.x - this.x, z.y - this.y) < z.radius) return false;
      }
    }
    const angleTo = Math.atan2(p.y - this.y, p.x - this.x);
    let diff = Math.abs(angleTo - this.facing);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    return diff < (this.def.visionAngle / 2) * (Math.PI / 180);
  }

  // --- Sniffer: smell radius grows if player ran recently ---
  updateSniffer(dt, players) {
    for (const p of players) {
      if (p.downed) continue;
      if (p.smellBlockedUntil && Date.now() < p.smellBlockedUntil) continue;
      const range = p.ranRecently ? this.def.smellRangeRun : this.def.smellRangeBase;
      if (this.dist(this, p) < range) {
        this.state = 'chase'; this.targetPlayerId = p.id;
        this.lastKnownX = p.x; this.lastKnownY = p.y; this.stateTimer = 0;
      }
    }
    if (this.state === 'chase') {
      const target = players.find(p => p.id === this.targetPlayerId);
      if (target) { this.lastKnownX = target.x; this.lastKnownY = target.y; }
    }
    this.runStateMachine(dt, players);
  }

  // --- Mirror: copies movement of anyone looking directly at it ---
  updateMirror(dt, players) {
    let watcher = null;
    for (const p of players) {
      if (p.downed) continue;
      const d = this.dist(this, p);
      if (d < 10) {
        const angleToMonster = Math.atan2(this.y - p.y, this.x - p.x);
        let diff = Math.abs(angleToMonster - (p.facing || 0));
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.35) { watcher = p; break; }
      }
    }
    if (watcher) {
      this.state = 'mimic';
      this.x += (watcher.dx || 0);
      this.y += (watcher.dy || 0);
    } else if (this.state === 'mimic') {
      this.state = 'patrol';
    }
  }

  // --- Sleeper: sleeps until noise wakes it, then rages ---
  updateSleeper(dt, players, noiseEvents) {
    if (this.state === 'sleeping') {
      for (const ev of noiseEvents) {
        const d = Math.hypot(ev.x - this.x, ev.y - this.y);
        if (ev.strength >= this.def.wakeNoiseThreshold && d < ev.radius) {
          this.state = 'raging';
          this.stateTimer = this.def.rageDuration;
          this.lastKnownX = ev.x; this.lastKnownY = ev.y;
          this.targetPlayerId = ev.playerId || null;
        }
      }
      return;
    }
    if (this.state === 'raging') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) { this.state = 'sleeping'; return; }
      const target = players.find(p => p.id === this.targetPlayerId) || players[0];
      if (target) {
        this.moveToward(target.x, target.y, this.def.chaseSpeed, dt);
      }
    }
  }

  // --- Hoarder: guards items, teleports back if moved far ---
  updateHoarder(dt, players, level) {
    if (this.guardedItemId && level) {
      const item = level.items.find(i => i.id === this.guardedItemId);
      if (item) {
        const d = Math.hypot(item.x - this.homeX, item.y - this.homeY);
        if (d > this.def.teleportRadius && !item.heldBy) {
          item.x = this.homeX; item.y = this.homeY;
          this.state = 'alert';
          this.stateTimer = 3;
        }
        if (item.heldBy) {
          const carrier = players.find(p => p.id === item.heldBy);
          if (carrier) {
            this.state = 'chase'; this.targetPlayerId = carrier.id;
            this.lastKnownX = carrier.x; this.lastKnownY = carrier.y;
          }
        }
      }
    }
    this.runStateMachine(dt, players);
  }

  // Generic patrol/chase/search/return for states that use it
  runStateMachine(dt, players) {
    if (this.type === 'sleeper' || this.type === 'mirror') return;
    if (this.state === 'patrol') {
      if (this.moveToward(this.patrolTarget.x, this.patrolTarget.y, this.def.speed, dt)) {
        this.patrolTarget = this.randomPatrolPoint();
      }
    } else if (this.state === 'chase') {
      if (this.lastKnownX != null) {
        const reached = this.moveToward(this.lastKnownX, this.lastKnownY, this.def.chaseSpeed, dt);
        if (reached) { this.state = 'search'; this.stateTimer = 5; }
      }
      const target = players.find(p => p.id === this.targetPlayerId);
      if (target && this.dist(this, target) < 1) {
        target.caught = true;
      }
    } else if (this.state === 'search') {
      this.stateTimer -= dt;
      this.x += Math.sin(this.stateTimer * 3) * 0.02;
      if (this.stateTimer <= 0) { this.state = 'return'; }
    } else if (this.state === 'return') {
      if (this.moveToward(this.homeX, this.homeY, this.def.speed, dt)) {
        this.state = 'patrol';
        this.targetPlayerId = null;
        this.lastKnownX = null;
      }
    } else if (this.state === 'alert') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.state = 'patrol';
    }
  }

  serialize() {
    return { id: this.id, type: this.type, x: this.x, y: this.y, facing: this.facing, state: this.state };
  }
}

module.exports = { Monster };
