import * as THREE from 'three';

const GameData = window.GameData;

export function initScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1018);
  scene.fog = new THREE.FogExp2(0x0c1018, 0.018);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);

  const ambient = new THREE.AmbientLight(0x8fa0b8, 1.1);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x6f8fff, 0x202020, 0.7);
  scene.add(hemi);

  const floorGeo = new THREE.PlaneGeometry(200, 200);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 1 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    renderer, scene, camera,
    playerMeshes: new Map(),
    monsterMeshes: new Map(),
    itemMeshes: new Map(),
    noiseRings: new Map(),
    builtLevelId: null
  };
}

function makeLabelSprite(text, color = '#ffe9b0') {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx2 = canvas.getContext('2d');
  ctx2.font = 'bold 28px sans-serif';
  ctx2.textAlign = 'center';
  ctx2.fillStyle = 'rgba(0,0,0,0.55)';
  ctx2.fillRect(0, 8, 256, 48);
  ctx2.fillStyle = color;
  ctx2.fillText(text, 128, 42);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.2, 0.55, 1);
  return sprite;
}

function colorForNoise(strength) {
  const c = new THREE.Color();
  c.setHSL(THREE.MathUtils.lerp(0.33, 0.0, Math.min(strength, 1)), 1, 0.5);
  return c;
}

function buildLevel(ctx, level) {
  // clear old room geometry
  if (ctx.levelGroup) ctx.scene.remove(ctx.levelGroup);
  const group = new THREE.Group();
  const surface = GameData.SURFACES[level.surface] || GameData.SURFACES.hardwood;
  const floorGeo = new THREE.PlaneGeometry(level.size.w, level.size.h);
  const floorMat = new THREE.MeshStandardMaterial({ color: surface.color, roughness: 0.9 });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(level.size.w / 2, 0, level.size.h / 2);
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  for (const room of level.rooms) {
    if (!room.wall) continue;
    const wallGeo = new THREE.BoxGeometry(room.w, 2.6, room.h);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x202830 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(room.x + room.w / 2, 1.3, room.y + room.h / 2);
    wall.castShadow = true;
    group.add(wall);
  }

  // van marker
  const vanGeo = new THREE.BoxGeometry(2, 1.6, 3);
  const vanMat = new THREE.MeshStandardMaterial({ color: 0x335577, emissive: 0x113355 });
  const van = new THREE.Mesh(vanGeo, vanMat);
  van.position.set(level.vanPos.x, 0.8, level.vanPos.y);
  group.add(van);

  const dirLight = new THREE.DirectionalLight(0xaabbdd, 0.9);
  dirLight.position.set(10, 30, 10);
  group.add(dirLight);

  // ceiling-style fill lights spread across the room so it's never pitch black
  const cols = Math.max(2, Math.round(level.size.w / 10));
  const rows = Math.max(2, Math.round(level.size.h / 10));
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      const pl = new THREE.PointLight(0xfff0d0, 0.6, 14, 2);
      pl.position.set((cx + 0.5) * (level.size.w / cols), 4, (cy + 0.5) * (level.size.h / rows));
      group.add(pl);
    }
  }

  ctx.scene.add(group);
  ctx.levelGroup = group;
  ctx.builtLevelId = level.id;
}

function ensurePlayerMesh(ctx, p) {
  if (ctx.playerMeshes.has(p.id)) return ctx.playerMeshes.get(p.id);
  const group = new THREE.Group();
  const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.9, 4, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4488cc });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.9;
  body.castShadow = true;
  group.add(body);

  const light = new THREE.SpotLight(0x6fff8f, 1.2, 14, Math.PI / 6, 0.5);
  light.position.set(0, 1.4, 0);
  group.add(light);
  const lightTarget = new THREE.Object3D();
  lightTarget.position.set(2, 0, 0);
  group.add(lightTarget);
  light.target = lightTarget;

  const ringGeo = new THREE.RingGeometry(0.1, 0.15, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x6fff8f, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);

  ctx.scene.add(group);
  const entry = { group, body, light, lightTarget, ring };
  ctx.playerMeshes.set(p.id, entry);
  return entry;
}

function ensureMonsterMesh(ctx, m) {
  if (ctx.monsterMeshes.has(m.id)) return ctx.monsterMeshes.get(m.id);
  const def = GameData.MONSTER_TYPES[m.type];
  const group = new THREE.Group();
  const geo = new THREE.ConeGeometry(0.5, 1.8, 6);
  const mat = new THREE.MeshStandardMaterial({ color: def.color, emissive: 0x110000 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  group.add(mesh);
  const label = makeLabelSprite(def.name, '#ff8080');
  label.position.set(0, 1.6, 0);
  group.add(label);
  ctx.scene.add(group);
  const entry = { group, mesh };
  ctx.monsterMeshes.set(m.id, entry);
  return entry;
}

function ensureItemMesh(ctx, item) {
  if (ctx.itemMeshes.has(item.id)) return ctx.itemMeshes.get(item.id);
  const def = GameData.ITEM_DEFS[item.type];
  const group = new THREE.Group();
  const size = 0.3 + (def.weight || 1) * 0.15;
  const geo = new THREE.BoxGeometry(size, size, size);
  const mat = new THREE.MeshStandardMaterial({ color: def.fragile ? 0xffe0a0 : 0xd0b070, metalness: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  group.add(mesh);
  const label = makeLabelSprite(`${def.name} ($${def.value})`, '#ffe9b0');
  label.position.set(0, size + 0.5, 0);
  group.add(label);
  const glowGeo = new THREE.RingGeometry(0.45, 0.55, 24);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x6fff8f, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.03;
  group.add(glow);
  ctx.scene.add(group);
  const entry = { group, mesh, label, glow };
  ctx.itemMeshes.set(item.id, entry);
  return entry;
}

export function syncScene(ctx, state, myId) {
  if (ctx.builtLevelId !== state.level.id) buildLevel(ctx, state.level);

  const livingPlayerIds = new Set(state.players.map(p => p.id));
  for (const [id, entry] of ctx.playerMeshes) {
    if (!livingPlayerIds.has(id)) { ctx.scene.remove(entry.group); ctx.playerMeshes.delete(id); }
  }
  let me = null;
  for (const p of state.players) {
    const entry = ensurePlayerMesh(ctx, p);
    entry.group.position.set(p.x, 0, p.y);
    entry.group.rotation.y = -p.facing + Math.PI / 2;
    entry.body.material.color.set(p.downed ? 0x884444 : (p.id === myId ? 0x6fff8f : 0x4488cc));
    const noiseScale = 0.3 + (p.lastNoise || 0) * 8;
    entry.ring.scale.set(noiseScale, noiseScale, 1);
    entry.ring.material.color.copy(colorForNoise(p.lastNoise || 0));
    if (p.id === myId) me = p;
  }

  const livingMonsterIds = new Set(state.monsters.map(m => m.id));
  for (const [id, entry] of ctx.monsterMeshes) {
    if (!livingMonsterIds.has(id)) { ctx.scene.remove(entry.group); ctx.monsterMeshes.delete(id); }
  }
  for (const m of state.monsters) {
    const entry = ensureMonsterMesh(ctx, m);
    entry.group.position.set(m.x, 0.9, m.y);
    entry.group.rotation.y = -m.facing + Math.PI / 2;
    entry.mesh.material.emissive.set(m.state === 'chase' || m.state === 'raging' ? 0x880000 : 0x110000);
  }

  const livingItemIds = new Set(state.items.map(i => i.id));
  for (const [id, entry] of ctx.itemMeshes) {
    if (!livingItemIds.has(id)) { ctx.scene.remove(entry.group); ctx.itemMeshes.delete(id); }
  }
  for (const item of state.items) {
    const entry = ensureItemMesh(ctx, item);
    if (item.heldBy) {
      const holder = state.players.find(p => p.id === item.heldBy);
      if (holder) entry.group.position.set(holder.x, 1.4, holder.y);
      entry.label.visible = false;
      entry.glow.material.opacity = 0;
    } else {
      entry.group.position.set(item.x, item.broken ? 0.05 : 0.25, item.y);
      entry.label.visible = true;
      const near = me && Math.hypot(item.x - me.x, item.y - me.y) < 1.5;
      entry.glow.material.opacity = near ? 0.7 : 0;
    }
    entry.mesh.material.color.set(item.broken ? 0x553333 : (GameData.ITEM_DEFS[item.type].fragile ? 0xffe0a0 : 0xd0b070));
  }

  const liveSmokeIds = new Set((state.smokeZones || []).map((z, i) => 'z' + i));
  if (!ctx.smokeMeshes) ctx.smokeMeshes = new Map();
  for (const [id, mesh] of ctx.smokeMeshes) {
    if (!liveSmokeIds.has(id)) { ctx.scene.remove(mesh); ctx.smokeMeshes.delete(id); }
  }
  (state.smokeZones || []).forEach((z, i) => {
    const id = 'z' + i;
    let mesh = ctx.smokeMeshes.get(id);
    if (!mesh) {
      const geo = new THREE.SphereGeometry(z.radius, 12, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.25 });
      mesh = new THREE.Mesh(geo, mat);
      ctx.scene.add(mesh);
      ctx.smokeMeshes.set(id, mesh);
    }
    mesh.position.set(z.x, 1, z.y);
  });

  if (me) {
    const camDist = 12, camHeight = 10;
    ctx.camera.position.set(me.x - Math.cos(0) * camDist * 0.4, camHeight, me.y + camDist * 0.6);
    ctx.camera.lookAt(me.x, 0, me.y);
  }
}
