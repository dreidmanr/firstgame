import * as THREE from 'three';
import { initScene, syncScene } from './render.js';

const socket = io();
const GameData = window.GameData;

const ui = {
  menu: document.getElementById('screen-menu'),
  lobby: document.getElementById('screen-lobby'),
  shop: document.getElementById('screen-shop'),
  results: document.getElementById('screen-results'),
  hud: document.getElementById('hud')
};

let myId = null;
let roomCode = null;
let latestState = null;
let myPhase = 'lobby';

function showOnly(screenEl) {
  for (const s of [ui.menu, ui.lobby, ui.shop, ui.results]) s.classList.add('hidden');
  if (screenEl) screenEl.classList.remove('hidden');
}

document.getElementById('btn-create').onclick = () => {
  const name = document.getElementById('name-input').value || 'Thief';
  socket.emit('createRoom', name, (res) => {
    if (res.error) return showError(res.error);
    myId = res.playerId; roomCode = res.code;
    showOnly(ui.lobby);
  });
};
document.getElementById('btn-join').onclick = () => {
  const name = document.getElementById('name-input').value || 'Thief';
  const code = document.getElementById('code-input').value.toUpperCase();
  socket.emit('joinRoom', code, name, (res) => {
    if (res.error) return showError(res.error);
    myId = res.playerId; roomCode = res.code;
    showOnly(ui.lobby);
  });
};
function showError(msg) { document.getElementById('menu-error').textContent = msg; }

document.getElementById('btn-start').onclick = () => socket.emit('startRun');
document.getElementById('btn-to-house').onclick = () => socket.emit('startRun');
document.getElementById('btn-continue').onclick = () => socket.emit('nextLevel');

socket.on('lobby', (data) => {
  myPhase = data.phase;
  document.getElementById('lobby-code').textContent = data.code;
  const list = document.getElementById('lobby-players');
  list.innerHTML = '';
  for (const p of data.players) {
    const li = document.createElement('li');
    li.textContent = p.name + (p.id === myId ? ' (you)' : '');
    list.appendChild(li);
  }
  if (data.phase === 'lobby') showOnly(ui.lobby);
  else if (data.phase === 'shop') renderShop(data);
});

function renderShop(data) {
  showOnly(ui.shop);
  const level = GameData.LEVELS[data.levelIndex];
  document.getElementById('shop-title').textContent = `Heading to: ${level.name} — Goal $${level.goal}`;
  document.getElementById('shop-cash').textContent = `Team Cash: $${Math.round(data.cash)}`;
  const grid = document.getElementById('shop-items');
  grid.innerHTML = '';
  for (const [key, item] of Object.entries(GameData.SHOP_ITEMS)) {
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML = `<h3>${item.name}</h3><p>${item.desc}</p><div>$${item.price}</div>`;
    const btn = document.createElement('button');
    btn.textContent = 'Buy';
    btn.onclick = () => socket.emit('buyItem', key);
    card.appendChild(btn);
    grid.appendChild(card);
  }
}
socket.on('shopUpdate', (data) => {
  document.getElementById('shop-cash').textContent = `Team Cash: $${Math.round(data.cash)}`;
});
socket.on('shopError', (msg) => alert(msg));

socket.on('runStarted', (state) => {
  showOnly(null);
  ui.hud.classList.remove('hidden');
  latestState = state;
  isBetrayer = false;
  document.getElementById('hud-role').textContent = '';
  document.getElementById('hud-alarm').classList.add('hidden');
});

socket.on('state', (state) => {
  latestState = state;
  const me = state.players.find(p => p.id === myId);
  document.body.classList.toggle('downed', !!(me && me.downed));
  document.getElementById('hud-level').textContent = state.level.name;
  document.getElementById('hud-goal').textContent = `$${Math.round(state.stolenValue)} / $${state.level.goal}`;
  document.getElementById('hud-noise-label').textContent = me ? `Noise: ${(me.lastNoise * 100).toFixed(0)}%` : '';
  renderInventory(me, state);
  const alarmEl = document.getElementById('hud-alarm');
  if (state.alarmActive) {
    alarmEl.classList.remove('hidden');
    alarmEl.textContent = `ALARM! MONSTERS BERSERK — ${state.alarmTimer}s`;
  } else {
    alarmEl.classList.add('hidden');
  }
});

function renderInventory(me, state) {
  const el = document.getElementById('hud-inventory');
  el.innerHTML = '';
  if (!me) return;
  for (const itemId of me.inventory) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    if (itemId) {
      const item = state.items.find(i => i.id === itemId);
      if (item) slot.textContent = GameData.ITEM_DEFS[item.type].name;
    }
    el.appendChild(slot);
  }
}

socket.on('cashUpdate', () => {});

let isBetrayer = false;
socket.on('role', (data) => {
  if (data.betrayer) {
    isBetrayer = true;
    document.getElementById('hud-role').textContent = data.info;
  }
});

socket.on('alarm', () => {
  document.getElementById('hud-alarm').classList.remove('hidden');
});

socket.on('runEnded', (data) => {
  ui.hud.classList.add('hidden');
  showOnly(ui.results);
  document.getElementById('results-title').textContent = data.success ? 'HEIST COMPLETE' : 'CAUGHT — RUN FAILED';
  document.getElementById('results-body').textContent =
    `Stolen: $${Math.round(data.stolenValue)}  Bonus: $${Math.round(data.bonus)}  Team Cash: $${Math.round(data.cash)}`;
});

// ---- Localization (EN/RU) ----
const I18N = {
  en: { host: 'Host Game', join: 'Join', start: 'Start Heist', toHouse: 'Go to House', continue: 'Continue' },
  ru: { host: 'Создать игру', join: 'Войти', start: 'Начать ограбление', toHouse: 'Идти в дом', continue: 'Продолжить' }
};
function applyLang(lang) {
  document.getElementById('btn-create').textContent = I18N[lang].host;
  document.getElementById('btn-join').textContent = I18N[lang].join;
  document.getElementById('btn-start').textContent = I18N[lang].start;
  document.getElementById('btn-to-house').textContent = I18N[lang].toHouse;
  document.getElementById('btn-continue').textContent = I18N[lang].continue;
  document.getElementById('lang-en').classList.toggle('lang-active', lang === 'en');
  document.getElementById('lang-ru').classList.toggle('lang-active', lang === 'ru');
}
document.getElementById('lang-en').onclick = () => applyLang('en');
document.getElementById('lang-ru').onclick = () => applyLang('ru');
applyLang('en');

// ---- Input ----
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

let facing = 0;
let lastInteractTime = 0;

function sendInput() {
  let dx = 0, dy = 0;
  if (keys['KeyW']) dy -= 1;
  if (keys['KeyS']) dy += 1;
  if (keys['KeyA']) dx -= 1;
  if (keys['KeyD']) dx += 1;
  if (dx !== 0 || dy !== 0) facing = Math.atan2(dy, dx);
  const crouch = !!keys['ControlLeft'];
  const run = !!keys['ShiftLeft'];
  socket.emit('input', { dx, dy, crouch, run, facing });

  if (keys['KeyE'] && Date.now() - lastInteractTime > 250) {
    lastInteractTime = Date.now();
    tryInteract();
  }
  if (keys['KeyQ'] && Date.now() - lastInteractTime > 500) {
    lastInteractTime = Date.now();
    const me = latestState && latestState.players.find(p => p.id === myId);
    if (me) socket.emit('interact', { action: 'decoy', x: me.x + Math.cos(facing) * 2, y: me.y + Math.sin(facing) * 2 });
  }
  if (keys['KeyF'] && Date.now() - lastInteractTime > 250) {
    lastInteractTime = Date.now();
    const me = latestState && latestState.players.find(p => p.id === myId);
    if (me) {
      const van = latestState.level.vanPos;
      if (Math.hypot(me.x - van.x, me.y - van.y) < 3) socket.emit('sellAtVan');
    }
  }
  if (keys['KeyG'] && Date.now() - lastInteractTime > 400) {
    lastInteractTime = Date.now();
    const me = latestState && latestState.players.find(p => p.id === myId);
    if (me && me.ownedItems) {
      const priority = ['net', 'sleep_gas', 'smoke_bomb', 'anti_smell_spray'];
      const toolKey = priority.find(k => (me.ownedItems[k] || 0) > 0);
      if (toolKey) socket.emit('interact', { action: 'use_tool', toolKey });
    }
  }
  if (keys['KeyB'] && isBetrayer && Date.now() - lastInteractTime > 400) {
    lastInteractTime = Date.now();
    socket.emit('interact', { action: 'sabotage' });
  }
}

function tryInteract() {
  if (!latestState) return;
  const me = latestState.players.find(p => p.id === myId);
  if (!me) return;
  if (me.downed) {
    const teammate = latestState.players.find(p => p.id !== myId && !p.downed && Math.hypot(p.x - me.x, p.y - me.y) < 1.8);
    return;
  }
  let nearest = null, nearestD = 1.6;
  for (const item of latestState.items) {
    if (item.heldBy) continue;
    const d = Math.hypot(item.x - me.x, item.y - me.y);
    if (d < nearestD) { nearest = item; nearestD = d; }
  }
  if (nearest) { socket.emit('interact', { action: 'pickup', itemId: nearest.id }); return; }
  const slotIdx = me.inventory.findIndex(s => s);
  if (slotIdx !== -1) socket.emit('interact', { action: 'drop', itemId: me.inventory[slotIdx] });
  for (const p of latestState.players) {
    if (p.id !== myId && p.downed && Math.hypot(p.x - me.x, p.y - me.y) < 1.8) {
      socket.emit('interact', { action: 'revive', targetId: p.id });
    }
  }
}

setInterval(() => { if (latestState) sendInput(); }, 50);

// ---- Rendering ----
const canvas = document.getElementById('game-canvas');
const sceneCtx = initScene(canvas);

function animate() {
  requestAnimationFrame(animate);
  if (latestState) syncScene(sceneCtx, latestState, myId);
  sceneCtx.renderer.render(sceneCtx.scene, sceneCtx.camera);
}
animate();
