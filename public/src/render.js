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
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4488cc });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 4, 8), bodyMat);
  torso.position.y = 0.75;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), new THREE.MeshStandardMaterial({ color: 0xe8c39e }));
  head.position.y = 1.25;
  head.castShadow = true;
  group.add(head);
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.18), new THREE.MeshStandardMaterial({ color: 0x2e2e2e }));
  backpack.position.set(0, 0.85, -0.28);
  group.add(backpack);

  const light = new THREE.SpotLight(0x9fffb0, 1.6, 16, Math.PI / 6, 0.5);
  light.position.set(0, 1.3, 0);
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

  const label = makeLabelSprite(p.name || 'Thief', '#6fff8f');
  label.position.set(0, 1.75, 0);
  group.add(label);

  ctx.scene.add(group);
  const entry = { group, body: torso, head, light, lightTarget, ring, label };
  ctx.playerMeshes.set(p.id, entry);
  return entry;
}

// ---- Procedural monster models (no external art — built from primitives so every type reads as a distinct silhouette) ----
function buildMonsterModel(type, baseColor) {
  const group = new THREE.Group();
  const robeMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  const glowMat = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.5 });

  if (type === 'blind_listener') {
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 8), robeMat);
    robe.position.y = 0.85; group.add(robe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), skinMat);
    head.position.y = 1.55; group.add(head);
    const blindfold = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    blindfold.position.set(0, 1.57, 0.27); group.add(blindfold);
    [[-0.32, 1.6, -0.45], [0.32, 1.6, -0.45]].forEach(([x, y, rotY]) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), robeMat);
      ear.position.set(x, y, 0);
      ear.rotation.z = x < 0 ? 0.9 : -0.9;
      group.add(ear);
    });
  } else if (type === 'deaf_watcher') {
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.5, 8), robeMat);
    robe.position.y = 0.85; group.add(robe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), skinMat);
    head.position.y = 1.55; group.add(head);
    [[-0.13, 0], [0.13, 0]].forEach(([x]) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), glowMat(0xffe24a));
      eye.position.set(x, 1.58, 0.26);
      group.add(eye);
    });
  } else if (type === 'sniffer') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.9), robeMat);
    body.position.y = 0.7; body.rotation.x = 0.15; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), skinMat);
    head.position.set(0, 0.95, 0.55); group.add(head);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.45, 8), skinMat);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.9, 0.95); group.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), glowMat(0xff5050));
    nose.position.set(0, 0.9, 1.17); group.add(nose);
    [[-0.55, 0.5], [0.55, 0.5]].forEach(([x]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6), skinMat);
      leg.position.set(x * 0.3, 0.3, 0.3); group.add(leg);
    });
  } else if (type === 'mirror') {
    const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xc8d6e0, metalness: 1, roughness: 0.05 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 8), mirrorMat);
    torso.position.y = 0.85; group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), mirrorMat);
    head.position.y = 1.5; group.add(head);
  } else if (type === 'sleeper') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), robeMat);
    body.scale.set(1, 0.7, 1.1);
    body.position.y = 0.45; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), skinMat);
    head.position.set(0, 0.55, 0.5); group.add(head);
    const lash1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.02), new THREE.MeshStandardMaterial({ color: 0x000000 }));
    lash1.position.set(-0.1, 0.58, 0.74); group.add(lash1);
    const lash2 = lash1.clone(); lash2.position.x = 0.1; group.add(lash2);
  } else if (type === 'hoarder') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.5, 4, 8), robeMat);
    body.position.y = 0.7; body.rotation.x = 0.2; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), skinMat);
    head.position.set(0, 1.25, 0.1); group.add(head);
    [[-0.18, 0], [0.18, 0]].forEach(([x]) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), glowMat(0x6fff8f));
      eye.position.set(x, 1.3, 0.34); group.add(eye);
    });
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshStandardMaterial({ color: 0x4a3a2a }));
    sack.scale.set(1, 1.2, 0.8);
    sack.position.set(0, 0.9, -0.45); group.add(sack);
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}

function ensureMonsterMesh(ctx, m) {
  if (ctx.monsterMeshes.has(m.id)) return ctx.monsterMeshes.get(m.id);
  const def = GameData.MONSTER_TYPES[m.type];
  const group = new THREE.Group();
  const model = buildMonsterModel(m.type, def.color);
  group.add(model);
  const label = makeLabelSprite(def.name, '#ff8080');
  label.position.set(0, 2.1, 0);
  group.add(label);
  ctx.scene.add(group);
  const entry = { group, model };
  ctx.monsterMeshes.set(m.id, entry);
  return entry;
}

// ---- Procedural item models — distinct silhouette per item type instead of generic cubes ----
function buildItemModel(def) {
  const group = new THREE.Group();
  const color = def.fragile ? 0xffe0a0 : 0xd0b070;
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.5 });
  switch (def.model) {
    case 'vase': {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.55, 12), mat);
      mesh.position.y = 0.28; group.add(mesh);
      break;
    }
    case 'painting': {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.06), new THREE.MeshStandardMaterial({ color: 0x3a2a18 }));
      frame.position.y = 0.4; group.add(frame);
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.57), new THREE.MeshStandardMaterial({ color: 0x6a4a8a }));
      canvas.position.set(0, 0.4, 0.035); group.add(canvas);
      break;
    }
    case 'statue': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.15, 10), new THREE.MeshStandardMaterial({ color: 0xffd76b, metalness: 0.8, roughness: 0.3 }));
      base.position.y = 0.08; group.add(base);
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0xffd76b, metalness: 0.8, roughness: 0.3 }));
      body.position.y = 0.45; group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), new THREE.MeshStandardMaterial({ color: 0xffd76b, metalness: 0.8, roughness: 0.3 }));
      head.position.y = 0.78; group.add(head);
      break;
    }
    case 'tv': {
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.06), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x113355, emissiveIntensity: 0.6 }));
      screen.position.y = 0.45; group.add(screen);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.15), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      stand.position.y = 0.2; group.add(stand);
      break;
    }
    case 'safe': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x33363b, metalness: 0.6, roughness: 0.4 }));
      body.position.y = 0.3; group.add(body);
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12), new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 1 }));
      dial.rotation.x = Math.PI / 2;
      dial.position.set(0, 0.35, 0.26); group.add(dial);
      break;
    }
    case 'crown': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16), new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1, roughness: 0.2 }));
      ring.position.y = 0.3; ring.rotation.x = Math.PI / 2; group.add(ring);
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1 }));
        const a = (i / 5) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.2, 0.42, Math.sin(a) * 0.2);
        group.add(spike);
      }
      break;
    }
    case 'chandelier': {
      const center = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), new THREE.MeshStandardMaterial({ color: 0xfff6d0, metalness: 0.7 }));
      center.position.y = 0.7; group.add(center);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ color: 0xddeeff, metalness: 0.9, roughness: 0.1 }));
        bead.position.set(Math.cos(a) * 0.25, 0.55, Math.sin(a) * 0.25);
        group.add(bead);
      }
      break;
    }
    case 'box':
    case 'crate':
    default: {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.4), mat);
      mesh.position.y = 0.18; group.add(mesh);
      break;
    }
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}

function ensureItemMesh(ctx, item) {
  if (ctx.itemMeshes.has(item.id)) return ctx.itemMeshes.get(item.id);
  const def = GameData.ITEM_DEFS[item.type];
  const group = new THREE.Group();
  const model = buildItemModel(def);
  group.add(model);
  const label = makeLabelSprite(`${def.name} ($${def.value})`, '#ffe9b0');
  label.position.set(0, 1.0, 0);
  group.add(label);
  const glowGeo = new THREE.RingGeometry(0.45, 0.55, 24);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x6fff8f, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.03;
  group.add(glow);
  ctx.scene.add(group);
  const entry = { group, model, label, glow };
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
    const chasing = m.state === 'chase' || m.state === 'raging';
    entry.model.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) o.material.emissive.set(chasing ? 0x880000 : 0x000000); });
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
    if (item.broken && !entry.brokenApplied) {
      entry.model.traverse((o) => { if (o.isMesh && o.material && o.material.color) o.material.color.set(0x553333); });
      entry.brokenApplied = true;
    }
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
