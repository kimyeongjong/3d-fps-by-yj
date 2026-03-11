import "./style.css";
import * as THREE from "three";

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="shell">
    <canvas id="game-canvas" aria-label="Neon Skyline FPS"></canvas>
    <div class="hud">
      <div class="hud__top">
        <div class="chip"><span>HP</span><strong id="health-value">100</strong></div>
        <div class="chip"><span>Score</span><strong id="score-value">0</strong></div>
        <div class="chip"><span>Wave</span><strong id="wave-value">1</strong></div>
      </div>
      <div class="crosshair" aria-hidden="true"></div>
      <div class="hud__bottom" id="status-line">Clear the outskirts and hold the city hub.</div>
    </div>
    <div class="overlay overlay--show" id="menu-overlay">
      <div class="panel">
        <p class="eyebrow">Neo Seoul Defense Grid</p>
        <h1>Modern City 3D FPS</h1>
        <p class="copy">
          Rush through a bright neon downtown and stop the incoming drones. Pointer
          lock is supported, and the game remains keyboard-playable for automated tests.
        </p>
        <ul class="controls">
          <li><strong>WASD / Arrow Keys</strong> Move</li>
          <li><strong>Mouse</strong> Look</li>
          <li><strong>Shift / B</strong> Sprint</li>
          <li><strong>Space</strong> Jump</li>
          <li><strong>Left Click</strong> Fire</li>
          <li><strong>P / Esc</strong> Pause</li>
          <li><strong>F</strong> Fullscreen</li>
          <li><strong>R</strong> Restart</li>
        </ul>
        <button id="start-btn" class="start-btn">Start Patrol</button>
      </div>
    </div>
  </div>
`;

const canvas = document.querySelector("#game-canvas");
const healthValue = document.querySelector("#health-value");
const scoreValue = document.querySelector("#score-value");
const waveValue = document.querySelector("#wave-value");
const statusLine = document.querySelector("#status-line");
const menuOverlay = document.querySelector("#menu-overlay");
const startButton = document.querySelector("#start-btn");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaed9ff);
scene.fog = new THREE.Fog(0xaed9ff, 40, 220);

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 600);

const cityCenter = new THREE.Vector3(0, 1.5, 0);
const playerHeight = 1.65;
const gravity = 28;
const floorY = playerHeight;
const arenaLimit = 58;
const fireCooldown = 0.14;
const enemyRadius = 1.05;

const clock = new THREE.Clock();
const input = new Set();
const moveAxes = new THREE.Vector2();
const mouseDelta = new THREE.Vector2();
const tracerPool = [];
const enemyPool = [];
const buildingColliders = [];
const skylineBillboards = [];
const projectiles = [];
const explosions = [];

const state = {
  mode: "menu",
  score: 0,
  wave: 1,
  health: 100,
  simulationTime: 0,
  fireTimer: 0,
  enemyDamageTimer: 0,
  cameraYaw: 0,
  cameraPitch: -0.06,
  pointerLocked: false,
  player: {
    position: new THREE.Vector3(0, floorY, 24),
    velocity: new THREE.Vector3(),
    radius: 0.7,
    grounded: true,
  },
};

const raycaster = new THREE.Raycaster();
const tmpDirection = new THREE.Vector3();
const tmpOffset = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);

buildWorld();
resetWave(1);
resize();
updateUi();
render();

function buildWorld() {
  addLights();
  addSky();
  addGround();
  addStreets();
  addBuildings();
  addDecor();
}

function addLights() {
  const hemi = new THREE.HemisphereLight(0xdff4ff, 0x35506b, 1.4);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(18, 36, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  scene.add(sun);

  const fill = new THREE.PointLight(0x8dd2ff, 1.5, 140, 2);
  fill.position.set(0, 18, 0);
  scene.add(fill);
}

function addSky() {
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 1024;
  skyCanvas.height = 1024;
  const ctx = skyCanvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, skyCanvas.height);
  gradient.addColorStop(0, "#d8f0ff");
  gradient.addColorStop(0.45, "#7fc6ff");
  gradient.addColorStop(1, "#f6e6c4");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);

  for (let i = 0; i < 22; i++) {
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#ffe7bc";
    ctx.beginPath();
    ctx.ellipse(
      60 + i * 42,
      170 + Math.sin(i * 0.7) * 18,
      90,
      24,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(skyCanvas);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(260, 32, 16),
    new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
    })
  );
  scene.add(sky);
}

function addGround() {
  const groundCanvas = document.createElement("canvas");
  groundCanvas.width = 1024;
  groundCanvas.height = 1024;
  const ctx = groundCanvas.getContext("2d");
  ctx.fillStyle = "#2f4157";
  ctx.fillRect(0, 0, groundCanvas.width, groundCanvas.height);

  ctx.strokeStyle = "#41556f";
  ctx.lineWidth = 4;
  for (let i = 0; i <= 32; i++) {
    const p = (groundCanvas.width / 32) * i;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, groundCanvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(groundCanvas.width, p);
    ctx.stroke();
  }

  ctx.fillStyle = "#233245";
  ctx.fillRect(120, 0, 200, groundCanvas.height);
  ctx.fillRect(704, 0, 200, groundCanvas.height);
  ctx.fillRect(0, 120, groundCanvas.width, 200);
  ctx.fillRect(0, 704, groundCanvas.width, 200);

  ctx.strokeStyle = "#cbd7ea";
  ctx.lineWidth = 10;
  ctx.setLineDash([28, 20]);
  ctx.beginPath();
  ctx.moveTo(220, 0);
  ctx.lineTo(220, groundCanvas.height);
  ctx.moveTo(804, 0);
  ctx.lineTo(804, groundCanvas.height);
  ctx.moveTo(0, 220);
  ctx.lineTo(groundCanvas.width, 220);
  ctx.moveTo(0, 804);
  ctx.lineTo(groundCanvas.width, 804);
  ctx.stroke();
  ctx.setLineDash([]);

  const texture = new THREE.CanvasTexture(groundCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.92,
      metalness: 0.08,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

function addStreets() {
  const stripes = new THREE.Group();
  const laneGeometry = new THREE.BoxGeometry(0.35, 0.02, 3.8);
  const laneMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff8d8,
    emissive: 0xf7e7a1,
    emissiveIntensity: 0.25,
  });

  for (let i = -52; i <= 52; i += 8) {
    for (const x of [-16, 16]) {
      const mesh = new THREE.Mesh(laneGeometry, laneMaterial);
      mesh.position.set(x, 0.02, i);
      stripes.add(mesh);
    }
    for (const z of [-16, 16]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.02, 0.35), laneMaterial);
      mesh.position.set(i, 0.02, z);
      stripes.add(mesh);
    }
  }

  const roadGlow = new THREE.Mesh(
    new THREE.RingGeometry(9, 14, 40),
    new THREE.MeshBasicMaterial({
      color: 0x88d7ff,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    })
  );
  roadGlow.rotation.x = -Math.PI / 2;
  roadGlow.position.y = 0.03;
  stripes.add(roadGlow);
  scene.add(stripes);
}

function createWindowTexture(base, glow) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= c.width; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, c.height);
    ctx.stroke();
  }
  for (let y = 0; y <= c.height; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(c.width, y);
    ctx.stroke();
  }
  for (let y = 8; y < c.height - 8; y += 32) {
    for (let x = 8; x < c.width - 8; x += 32) {
      const lit = Math.random() > 0.35;
      ctx.fillStyle = lit ? glow : "rgba(11,19,30,0.65)";
      ctx.fillRect(x, y, 18, 18);
    }
  }
  return new THREE.CanvasTexture(c);
}

function addBuildings() {
  const blocks = [
    [-38, -38, 18, 26],
    [38, -38, 16, 22],
    [-38, 38, 20, 24],
    [38, 38, 17, 28],
    [-38, 0, 14, 18],
    [38, 0, 12, 18],
    [0, -38, 14, 20],
    [0, 38, 12, 18],
    [-14, 8, 7, 10],
    [14, -8, 7, 10],
  ];
  const palettes = [
    ["#40596f", "#9ed9ff"],
    ["#2f4357", "#b9f3ff"],
    ["#43546d", "#ffe8ae"],
    ["#314c66", "#ffd0e8"],
  ];

  for (let i = 0; i < blocks.length; i++) {
    const [x, z, w, d] = blocks[i];
    const height = 8 + (i % 4) * 5 + (i > 7 ? 2 : 0);
    const [baseColor, glow] = palettes[i % palettes.length];
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(w, height, d),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(baseColor),
        map: createWindowTexture(baseColor, glow),
        roughness: 0.74,
        metalness: 0.24,
      })
    );
    building.position.set(x, height / 2, z);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);
    buildingColliders.push({
      minX: x - w / 2 - 1,
      maxX: x + w / 2 + 1,
      minZ: z - d / 2 - 1,
      maxZ: z + d / 2 + 1,
    });

    if (i < 8) {
      const topper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 5 + i * 0.2, 8),
        new THREE.MeshStandardMaterial({
          color: 0xdaf7ff,
          emissive: 0x9ddcff,
          emissiveIntensity: 0.8,
        })
      );
      topper.position.set(x, height + 2.5, z);
      scene.add(topper);
    }
  }
}

function addDecor() {
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 5.8, 0.24, 32),
    new THREE.MeshStandardMaterial({
      color: 0xc5d3df,
      metalness: 0.08,
      roughness: 0.8,
    })
  );
  plaza.position.set(0, 0.12, 0);
  plaza.receiveShadow = true;
  scene.add(plaza);

  const sculpture = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.2, 0.32, 90, 18),
    new THREE.MeshStandardMaterial({
      color: 0xff7ea8,
      emissive: 0xff6f8d,
      emissiveIntensity: 0.65,
      metalness: 0.35,
      roughness: 0.28,
    })
  );
  sculpture.position.set(-6, 2.8, 4);
  sculpture.castShadow = true;
  scene.add(sculpture);

  for (let i = 0; i < 12; i++) {
    const billboard = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 2.2),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x83f0ff : 0xffd280,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
      })
    );
    const angle = (i / 12) * Math.PI * 2;
    billboard.position.set(Math.cos(angle) * 30, 6 + (i % 3), Math.sin(angle) * 30);
    billboard.lookAt(cityCenter);
    scene.add(billboard);
    skylineBillboards.push(billboard);
  }
}

function createEnemyMesh() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.15, 1.4, 8),
    new THREE.MeshStandardMaterial({
      color: 0x182334,
      metalness: 0.35,
      roughness: 0.42,
      emissive: 0xff4d63,
      emissiveIntensity: 0.32,
    })
  );
  core.castShadow = true;
  core.receiveShadow = true;
  group.add(core);

  const eye = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.24, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xfff0bf })
  );
  eye.position.set(0, 0.12, 0.72);
  group.add(eye);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.08, 8, 18),
    new THREE.MeshStandardMaterial({
      color: 0x78dcff,
      emissive: 0x78dcff,
      emissiveIntensity: 1.1,
    })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  return group;
}

function resetWave(wave) {
  state.wave = wave;
  waveValue.textContent = String(state.wave);
  for (const enemy of enemyPool) {
    scene.remove(enemy.mesh);
  }
  enemyPool.length = 0;

  const spawnPoints = [
    new THREE.Vector3(0, 0.72, -10),
    new THREE.Vector3(-18, 0.72, -14),
    new THREE.Vector3(18, 0.72, -12),
    new THREE.Vector3(-12, 0.72, 18),
    new THREE.Vector3(12, 0.72, 22),
    new THREE.Vector3(0, 0.72, 30),
  ];
  const count = Math.min(spawnPoints.length, 3 + wave);

  for (let i = 0; i < count; i++) {
    const mesh = createEnemyMesh();
    mesh.position.copy(spawnPoints[i]);
    scene.add(mesh);
    enemyPool.push({
      id: `enemy-${wave}-${i}`,
      mesh,
      hp: 50 + wave * 10,
      alive: true,
      attackCooldown: 0.5,
      bobOffset: Math.random() * Math.PI * 2,
      flash: 0,
    });
  }
}

function showOverlay(show, message = "") {
  menuOverlay.classList.toggle("overlay--show", show);
  if (message) {
    menuOverlay.querySelector(".copy").textContent = message;
  }
}

function startGame() {
  if (state.mode === "playing") {
    return;
  }
  if (state.mode === "gameover") {
    restartGame();
    return;
  }
  state.mode = "playing";
  statusLine.textContent = "Drones incoming. Defend the central plaza.";
  showOverlay(false);
  requestPointerLock();
}

function restartGame() {
  state.mode = "playing";
  state.score = 0;
  state.health = 100;
  state.wave = 1;
  state.simulationTime = 0;
  state.fireTimer = 0;
  state.enemyDamageTimer = 0;
  state.player.position.set(0, floorY, 24);
  state.player.velocity.set(0, 0, 0);
  state.player.grounded = true;
  state.cameraYaw = 0;
  state.cameraPitch = -0.06;
  clearTransientEffects();
  resetWave(1);
  updateUi();
  statusLine.textContent = "Starting a fresh patrol.";
  showOverlay(false);
  requestPointerLock();
}

function clearTransientEffects() {
  tracerPool.splice(0).forEach((tracer) => scene.remove(tracer.mesh));
  projectiles.splice(0).forEach((projectile) => scene.remove(projectile.mesh));
  explosions.splice(0).forEach((explosion) => scene.remove(explosion.mesh));
}

function pauseGame() {
  if (state.mode !== "playing") {
    return;
  }
  state.mode = "paused";
  statusLine.textContent = "Paused. Press P or Start Patrol to jump back in.";
  showOverlay(true, "The patrol is paused. Press the button or tap P to resume the fight.");
}

function resumeGame() {
  if (state.mode !== "paused") {
    return;
  }
  state.mode = "playing";
  statusLine.textContent = "Combat resumed.";
  showOverlay(false);
  requestPointerLock();
}

function endGame() {
  state.mode = "gameover";
  showOverlay(
    true,
    `The city hub has fallen. Final score: ${state.score}. Press the button or R to restart instantly.`
  );
  statusLine.textContent = "Game over. Restart and rebuild the defense line.";
}

function requestPointerLock() {
  if (document.pointerLockElement !== canvas && canvas.isConnected && typeof canvas.requestPointerLock === "function") {
    try {
      const maybePromise = canvas.requestPointerLock();
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {});
      }
    } catch {
      // Ignore pointer lock failures in unsupported automation environments.
    }
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function getForwardVector() {
  camera.getWorldDirection(tmpForward);
  tmpForward.y = 0;
  if (tmpForward.lengthSq() < 1e-6) {
    tmpForward.set(0, 0, -1);
  } else {
    tmpForward.normalize();
  }
  return tmpForward;
}

function getRightVector() {
  tmpRight.crossVectors(getForwardVector(), worldUp);
  if (tmpRight.lengthSq() < 1e-6) {
    tmpRight.set(1, 0, 0);
  } else {
    tmpRight.normalize();
  }
  return tmpRight;
}

function handleMovement(delta) {
  moveAxes.set(0, 0);
  if (input.has("KeyW") || input.has("ArrowUp")) moveAxes.y += 1;
  if (input.has("KeyS") || input.has("ArrowDown")) moveAxes.y -= 1;
  if (input.has("KeyD") || input.has("ArrowRight")) moveAxes.x += 1;
  if (input.has("KeyA") || input.has("ArrowLeft")) moveAxes.x -= 1;

  const sprinting = input.has("ShiftLeft") || input.has("ShiftRight") || input.has("KeyB");
  const speed = sprinting ? 14 : 9;

  const wishDir = new THREE.Vector3();
  const forward = getForwardVector();
  const right = getRightVector();
  wishDir.addScaledVector(forward, moveAxes.y);
  wishDir.addScaledVector(right, moveAxes.x);

  if (wishDir.lengthSq() > 0) {
    wishDir.normalize().multiplyScalar(speed);
    state.player.velocity.x = THREE.MathUtils.damp(state.player.velocity.x, wishDir.x, 10, delta);
    state.player.velocity.z = THREE.MathUtils.damp(state.player.velocity.z, wishDir.z, 10, delta);
  } else {
    state.player.velocity.x = THREE.MathUtils.damp(state.player.velocity.x, 0, 12, delta);
    state.player.velocity.z = THREE.MathUtils.damp(state.player.velocity.z, 0, 12, delta);
  }

  if ((input.has("Space")) && state.player.grounded) {
    state.player.velocity.y = 11.5;
    state.player.grounded = false;
  }

  if (!state.player.grounded) {
    state.player.velocity.y -= gravity * delta;
  }

  tmpOffset.copy(state.player.velocity).multiplyScalar(delta);
  const nextPosition = state.player.position.clone().add(tmpOffset);

  if (nextPosition.y <= floorY) {
    nextPosition.y = floorY;
    state.player.velocity.y = 0;
    state.player.grounded = true;
  }

  nextPosition.x = THREE.MathUtils.clamp(nextPosition.x, -arenaLimit, arenaLimit);
  nextPosition.z = THREE.MathUtils.clamp(nextPosition.z, -arenaLimit, arenaLimit);

  for (const collider of buildingColliders) {
    if (
      nextPosition.x > collider.minX &&
      nextPosition.x < collider.maxX &&
      nextPosition.z > collider.minZ &&
      nextPosition.z < collider.maxZ
    ) {
      nextPosition.sub(tmpOffset.multiplyScalar(1.05));
      state.player.velocity.x = 0;
      state.player.velocity.z = 0;
      break;
    }
  }

  state.player.position.copy(nextPosition);
}

function updateCamera(delta) {
  const sensitivity = 0.0024;
  state.cameraYaw -= mouseDelta.x * sensitivity;
  state.cameraPitch -= mouseDelta.y * sensitivity;
  state.cameraPitch = THREE.MathUtils.clamp(state.cameraPitch, -1.1, 1.1);
  mouseDelta.set(0, 0);

  camera.position.copy(state.player.position);
  camera.rotation.order = "YXZ";
  camera.rotation.y = state.cameraYaw;
  camera.rotation.x =
    state.cameraPitch + Math.sin(state.simulationTime * 10) * 0.01 * Math.min(1, moveAxes.length());

  skylineBillboards.forEach((billboard) => billboard.lookAt(camera.position));
}

function fireShot() {
  if (state.fireTimer > 0 || state.mode !== "playing") {
    return;
  }
  state.fireTimer = fireCooldown;
  statusLine.textContent = "Plasma shot fired.";

  camera.getWorldDirection(tmpDirection);
  raycaster.set(camera.position, tmpDirection);
  raycaster.far = 120;

  let closestEnemy = null;
  let closestDistance = Infinity;
  for (const enemy of enemyPool) {
    if (!enemy.alive) continue;
    const distanceToRay = rayDistanceToEnemy(raycaster.ray, enemy.mesh.position);
    const alongRay = enemy.mesh.position.clone().sub(camera.position).dot(tmpDirection);
    if (distanceToRay <= enemyRadius && alongRay > 0 && alongRay < closestDistance) {
      closestDistance = alongRay;
      closestEnemy = enemy;
    }
  }

  const hitPoint = camera.position.clone().addScaledVector(tmpDirection, closestEnemy ? closestDistance : 48);
  spawnTracer(hitPoint, Boolean(closestEnemy));
  spawnProjectile(hitPoint);

  if (closestEnemy) {
    closestEnemy.hp -= 34;
    closestEnemy.flash = 0.16;
    if (closestEnemy.hp <= 0) {
      closestEnemy.alive = false;
      state.score += 100;
      spawnExplosion(closestEnemy.mesh.position.clone(), 0x7ce9ff);
      scene.remove(closestEnemy.mesh);
      statusLine.textContent = "Drone eliminated.";
    } else {
      state.score += 10;
      statusLine.textContent = "Drone hit.";
    }
    updateUi();
  }
}

function rayDistanceToEnemy(ray, center) {
  const toCenter = center.clone().sub(ray.origin);
  const projection = toCenter.dot(ray.direction);
  const closestPoint = ray.origin.clone().addScaledVector(ray.direction, projection);
  return closestPoint.distanceTo(center);
}

function spawnTracer(hitPoint, hit) {
  const geometry = new THREE.BufferGeometry().setFromPoints([camera.position.clone(), hitPoint]);
  const material = new THREE.LineBasicMaterial({
    color: hit ? 0xffee9e : 0x7fd8ff,
    transparent: true,
    opacity: 0.9,
  });
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  tracerPool.push({
    mesh: line,
    life: 0.12,
  });
}

function spawnProjectile(targetPoint) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  mesh.position.copy(camera.position);
  scene.add(mesh);
  projectiles.push({
    mesh,
    target: targetPoint,
    life: 0.12,
  });
}

function spawnExplosion(position, color) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 10, 10),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
    })
  );
  mesh.position.copy(position);
  scene.add(mesh);
  explosions.push({
    mesh,
    life: 0.25,
  });
}

function updateEffects(delta) {
  for (let i = tracerPool.length - 1; i >= 0; i--) {
    const tracer = tracerPool[i];
    tracer.life -= delta;
    tracer.mesh.material.opacity = Math.max(0, tracer.life * 8);
    if (tracer.life <= 0) {
      scene.remove(tracer.mesh);
      tracerPool.splice(i, 1);
    }
  }

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    projectile.life -= delta;
    projectile.mesh.position.lerp(projectile.target, 0.45);
    if (projectile.life <= 0 || projectile.mesh.position.distanceTo(projectile.target) < 0.7) {
      scene.remove(projectile.mesh);
      projectiles.splice(i, 1);
    }
  }

  for (let i = explosions.length - 1; i >= 0; i--) {
    const explosion = explosions[i];
    explosion.life -= delta;
    const scale = 1 + (0.25 - explosion.life) * 6;
    explosion.mesh.scale.setScalar(scale);
    explosion.mesh.material.opacity = Math.max(0, explosion.life * 3);
    if (explosion.life <= 0) {
      scene.remove(explosion.mesh);
      explosions.splice(i, 1);
    }
  }
}

function updateEnemies(delta) {
  let livingCount = 0;
  for (const enemy of enemyPool) {
    if (!enemy.alive) continue;
    livingCount += 1;
    const toPlayer = state.player.position.clone().sub(enemy.mesh.position);
    const distance = toPlayer.length();
    const dir = toPlayer.normalize();
    enemy.mesh.position.addScaledVector(dir, delta * (2.4 + state.wave * 0.15));
    enemy.mesh.position.y = 0.72 + Math.sin(state.simulationTime * 3 + enemy.bobOffset) * 0.24;
    enemy.mesh.lookAt(state.player.position.x, enemy.mesh.position.y, state.player.position.z);
    enemy.mesh.rotation.x = 0;
    enemy.mesh.rotation.z = 0;

    if (enemy.flash > 0) {
      enemy.flash -= delta;
      enemy.mesh.children[0].material.emissiveIntensity = 1.1;
    } else {
      enemy.mesh.children[0].material.emissiveIntensity = 0.32;
    }

    enemy.attackCooldown -= delta;
    if (distance < 2.2 && enemy.attackCooldown <= 0) {
      enemy.attackCooldown = 0.7;
      state.health = Math.max(0, state.health - (8 + state.wave));
      updateUi();
      statusLine.textContent = "Drone collision. Health reduced.";
      spawnExplosion(state.player.position.clone(), 0xff9175);
      if (state.health <= 0) {
        endGame();
        return;
      }
    }
  }

  if (livingCount === 0 && state.mode === "playing") {
    state.wave += 1;
    state.score += 150;
    updateUi();
    statusLine.textContent = `Plaza secured. Wave ${state.wave} begins.`;
    resetWave(state.wave);
  }
}

function updateUi() {
  healthValue.textContent = String(Math.round(state.health));
  scoreValue.textContent = String(state.score);
  waveValue.textContent = String(state.wave);
}

function renderGameToText() {
  const payload = {
    mode: state.mode,
    coordinateSystem: "Three.js meters; origin at plaza center, +x east, +y up, -z forward from spawn.",
    player: {
      x: Number(state.player.position.x.toFixed(2)),
      y: Number(state.player.position.y.toFixed(2)),
      z: Number(state.player.position.z.toFixed(2)),
      vx: Number(state.player.velocity.x.toFixed(2)),
      vy: Number(state.player.velocity.y.toFixed(2)),
      vz: Number(state.player.velocity.z.toFixed(2)),
      yaw: Number(state.cameraYaw.toFixed(2)),
      pitch: Number(state.cameraPitch.toFixed(2)),
      grounded: state.player.grounded,
      health: Number(state.health.toFixed(0)),
    },
    enemies: enemyPool
      .filter((enemy) => enemy.alive)
      .map((enemy) => ({
        id: enemy.id,
        x: Number(enemy.mesh.position.x.toFixed(2)),
        y: Number(enemy.mesh.position.y.toFixed(2)),
        z: Number(enemy.mesh.position.z.toFixed(2)),
        hp: Number(enemy.hp.toFixed(0)),
      })),
    score: state.score,
    wave: state.wave,
    transientFx: {
      tracers: tracerPool.length,
      projectiles: projectiles.length,
      explosions: explosions.length,
    },
    pointerLocked: state.pointerLocked,
    fullscreen: Boolean(document.fullscreenElement),
  };
  return JSON.stringify(payload);
}

function step(delta) {
  state.simulationTime += delta;
  if (state.mode !== "playing") {
    updateCamera(delta);
    updateEffects(delta);
    render();
    return;
  }

  state.fireTimer = Math.max(0, state.fireTimer - delta);
  handleMovement(delta);
  updateCamera(delta);
  updateEnemies(delta);
  updateEffects(delta);
  updateUi();
  render();
}

function render() {
  renderer.render(scene, camera);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = manualStepping.enabled ? 0 : Math.min(clock.getDelta(), 0.033);
  if (!manualStepping.enabled) {
    step(delta);
  } else {
    render();
  }
}

const manualStepping = { enabled: false };
window.advanceTime = async (ms) => {
  manualStepping.enabled = true;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) {
    step(1 / 60);
  }
};

window.render_game_to_text = renderGameToText;

window.addEventListener("resize", resize);
document.addEventListener("pointerlockchange", () => {
  state.pointerLocked = document.pointerLockElement === canvas;
  if (!state.pointerLocked && state.mode === "playing") {
    statusLine.textContent = "Pointer lock released. Click to re-enable mouse look.";
  }
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement === canvas) {
    mouseDelta.x += event.movementX;
    mouseDelta.y += event.movementY;
  }
});

window.addEventListener("keydown", (event) => {
  input.add(event.code);

  if (event.code === "Enter" && state.mode === "menu") {
    startGame();
  }
  if (event.code === "KeyP") {
    if (state.mode === "playing") {
      pauseGame();
    } else if (state.mode === "paused") {
      resumeGame();
    }
  }
  if (event.code === "Escape") {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    if (state.mode === "playing") {
      pauseGame();
    }
  }
  if (event.code === "KeyF") {
    toggleFullscreen();
  }
  if (event.code === "KeyR") {
    restartGame();
  }
});

window.addEventListener("keyup", (event) => {
  input.delete(event.code);
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button === 0) {
    if (state.mode === "menu") {
      startGame();
      return;
    }
    if (state.mode === "paused") {
      resumeGame();
      return;
    }
    fireShot();
  }
});

startButton.addEventListener("click", () => {
  if (state.mode === "paused") {
    resumeGame();
  } else if (state.mode === "gameover") {
    restartGame();
  } else {
    startGame();
  }
});

camera.position.copy(state.player.position);
camera.rotation.order = "YXZ";
render();
animate();
