(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const COLORS = {
    white: '#f7f8fc', cyan: '#5fe7ff', blue: '#4c72ff', violet: '#9b67ff',
    pink: '#ff4fbd', amber: '#ffb34d', green: '#72efaa', red: '#ff5f75'
  };

  const POWER_DEFS = {
    lucid: { name: 'LUCID', subtitle: 'FLOW SLOWS', color: COLORS.cyan, duration: 6.2 },
    echo: { name: 'ECHO', subtitle: 'WIDER GRAZE', color: COLORS.violet, duration: 7.5 },
    phase: { name: 'PHASE', subtitle: 'CONTACT IMMUNITY', color: COLORS.pink, duration: 4.2 },
    bloom: { name: 'BLOOM', subtitle: 'SCORE ×2', color: COLORS.amber, duration: 7.0 }
  };

  const CONFIG = {
    maxLives: 3,
    playerRadius: 5.2,
    collisionPadding: 1.2,
    grazeMargin: 17,
    keyboardSpeed: 250,
    focusSpeed: 118,
    pointerEase: 11.5,
    focusPointerEase: 6.2,
    focusDrain: 28,
    focusRecovery: 19,
    baseFlowSpeed: 92,
    maxFlowSpeed: 172,
    hazardCap: 92,
    particleCap: 360,
    trailLength: 34,
    pickupIntervalMin: 10,
    pickupIntervalMax: 15
  };

  const canvas = document.querySelector('#world');
  const arena = document.querySelector('#arenaShell');
  if (!canvas || !arena) return;
  const ctx = canvas.getContext('2d', { alpha: false });

  const ui = {
    appShell: document.querySelector('#appShell'),
    startScreen: document.querySelector('#startScreen'),
    startButton: document.querySelector('#startButton'),
    overlay: document.querySelector('#gameOverlay'),
    overlayEyebrow: document.querySelector('#overlayEyebrow'),
    overlayTitle: document.querySelector('#overlayTitle'),
    overlayCopy: document.querySelector('#overlayCopy'),
    launchButton: document.querySelector('#launchButton'),
    launchLabel: document.querySelector('#launchLabel'),
    finalStats: document.querySelector('#finalStats'),
    finalScore: document.querySelector('#finalScore'),
    finalChain: document.querySelector('#finalChain'),
    finalGrazes: document.querySelector('#finalGrazes'),
    score: document.querySelector('#scoreValue'),
    scoreDelta: document.querySelector('#scoreDelta'),
    time: document.querySelector('#timeValue'),
    chain: document.querySelector('#chainValue'),
    peak: document.querySelector('#peakValue'),
    highScore: document.querySelector('#highScoreValue'),
    resonance: document.querySelector('#resonanceValue'),
    resonanceMeter: document.querySelector('#resonanceMeter'),
    chainState: document.querySelector('#chainState'),
    density: document.querySelector('#densityValue'),
    flow: document.querySelector('#flowValue'),
    grazes: document.querySelector('#grazeValue'),
    fieldStatus: document.querySelector('#fieldStatus'),
    effectList: document.querySelector('#effectList'),
    effectCount: document.querySelector('#effectCount'),
    focusBar: document.querySelector('#focusBar'),
    focusValue: document.querySelector('#focusValue'),
    mode: document.querySelector('#modeValue'),
    lives: document.querySelector('#lifeReadout'),
    pausePill: document.querySelector('#pausePill'),
    pickupToast: document.querySelector('#pickupToast'),
    pickupName: document.querySelector('#pickupName'),
    pickupDescription: document.querySelector('#pickupDescription'),
    pickupIcon: document.querySelector('#pickupIcon'),
    menuButton: document.querySelector('#menuButton'),
    soundButton: document.querySelector('#soundButton'),
    fps: document.querySelector('#fpsValue')
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const random = (min, max) => min + Math.random() * (max - min);
  const choose = values => values[Math.floor(Math.random() * values.length)];
  const formatScore = value => Math.floor(value).toString().padStart(6, '0');
  const formatTime = seconds => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  const distanceSq = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  };
  const withAlpha = (hex, alpha) => {
    const value = hex.replace('#', '');
    const n = Number.parseInt(value, 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  };

  const storage = {
    get(key, fallback = '0') {
      try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* ignored */ }
    }
  };

  class AudioBus {
    constructor() {
      this.context = null;
      this.muted = storage.get('cosinuos-muted', '0') === '1';
    }

    ensure() {
      if (this.muted || this.context) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.context = new AudioContext();
    }

    tone(frequency, duration, type = 'sine', gain = 0.018, end = frequency) {
      if (this.muted) return;
      this.ensure();
      if (!this.context) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const volume = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, end), now + duration);
      volume.gain.setValueAtTime(gain, now);
      volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(volume).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    }

    graze() { this.tone(620, 0.06, 'triangle', 0.012, 880); }
    pickup() { this.tone(420, 0.16, 'sine', 0.025, 920); }
    hit() { this.tone(150, 0.25, 'sawtooth', 0.035, 48); }
    end() { this.tone(210, 0.48, 'sine', 0.03, 58); }
  }

  const audio = new AudioBus();

  const state = {
    mode: 'idle',
    width: 1,
    height: 1,
    dpr: 1,
    lastTime: performance.now(),
    elapsed: 0,
    score: 0,
    displayScore: 0,
    highScore: Number(storage.get('cosinuos-flight-high', '0')) || 0,
    bestChain: 1,
    chain: 1,
    chainTimer: 0,
    resonance: 0,
    grazes: 0,
    focus: 100,
    difficulty: 1,
    flowSpeed: CONFIG.baseFlowSpeed,
    spawnTimer: 0.8,
    pickupTimer: 7,
    shake: 0,
    flash: 0,
    hitStop: 0,
    fpsTimer: 0,
    fpsFrames: 0,
    fpsValue: 60,
    pointer: { x: 0, y: 0, active: false, down: false },
    keys: new Set(),
    hazards: [],
    pickups: [],
    particles: [],
    stars: [],
    ribbons: [],
    player: null,
    effects: { lucid: 0, echo: 0, phase: 0, bloom: 0 },
    toastTimer: 0
  };

  function createPlayer() {
    const x = state.width * 0.38;
    const y = state.height * 0.62;
    return {
      x, y,
      targetX: x,
      targetY: y,
      vx: 0,
      vy: 0,
      radius: CONFIG.playerRadius,
      lives: CONFIG.maxLives,
      invulnerable: 0,
      trail: []
    };
  }

  function resize() {
    const rect = arena.getBoundingClientRect();
    const oldWidth = state.width;
    const oldHeight = state.height;
    state.width = Math.max(1, rect.width);
    state.height = Math.max(1, rect.height);
    state.dpr = Math.min(window.devicePixelRatio || 1, 1.65);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    if (!state.player) state.player = createPlayer();
    if (oldWidth > 1 && oldHeight > 1) {
      state.player.x *= state.width / oldWidth;
      state.player.y *= state.height / oldHeight;
      state.player.targetX *= state.width / oldWidth;
      state.player.targetY *= state.height / oldHeight;
    }
    state.player.x = clamp(state.player.x, 18, state.width - 18);
    state.player.y = clamp(state.player.y, 18, state.height - 18);
    state.player.targetX = clamp(state.player.targetX, 18, state.width - 18);
    state.player.targetY = clamp(state.player.targetY, 18, state.height - 18);

    seedStars();
    seedRibbons();
  }

  function seedStars() {
    const count = Math.ceil(state.width * state.height / 5800);
    state.stars = Array.from({ length: count }, () => ({
      x: random(0, state.width),
      y: random(0, state.height),
      z: Math.random() ** 1.6,
      phase: random(0, TAU)
    }));
  }

  function seedRibbons() {
    state.ribbons = Array.from({ length: 7 }, (_, index) => ({
      offset: index / 7,
      phase: random(0, TAU),
      color: [COLORS.cyan, COLORS.blue, COLORS.violet, COLORS.pink, COLORS.amber][index % 5]
    }));
  }

  function resetGame() {
    state.elapsed = 0;
    state.score = 0;
    state.displayScore = 0;
    state.bestChain = 1;
    state.chain = 1;
    state.chainTimer = 0;
    state.resonance = 0;
    state.grazes = 0;
    state.focus = 100;
    state.difficulty = 1;
    state.flowSpeed = CONFIG.baseFlowSpeed;
    state.spawnTimer = 0.65;
    state.pickupTimer = random(8, 11);
    state.shake = 0;
    state.flash = 0;
    state.hitStop = 0;
    state.hazards.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.effects = { lucid: 0, echo: 0, phase: 0, bloom: 0 };
    state.player = createPlayer();
    state.pointer.x = state.player.x;
    state.pointer.y = state.player.y;
    state.pointer.active = false;
    state.pointer.down = false;
    renderLives();
    updateUi(true);

    for (let i = 0; i < 7; i += 1) spawnHazard(true);
  }

  function startGame() {
    audio.ensure();
    resetGame();
    state.mode = 'running';
    ui.overlay?.classList.remove('is-visible');
    if (ui.startScreen) {
      ui.startScreen.classList.add('is-leaving');
      window.setTimeout(() => { if (ui.startScreen?.isConnected) ui.startScreen.remove(); }, 460);
    }
    if (ui.finalStats) ui.finalStats.hidden = true;
    if (ui.pausePill) ui.pausePill.hidden = true;
    state.lastTime = performance.now();
  }

  function finishGame() {
    state.mode = 'gameover';
    state.highScore = Math.max(state.highScore, Math.floor(state.score));
    storage.set('cosinuos-flight-high', String(state.highScore));
    audio.end();

    if (ui.overlayEyebrow) ui.overlayEyebrow.textContent = 'RUN COMPLETE / SIGNAL STORED';
    if (ui.overlayTitle) ui.overlayTitle.innerHTML = 'The field closed.<br>Your line remains.';
    if (ui.overlayCopy) ui.overlayCopy.textContent = 'The current keeps moving. Return to the flight and hold the line a little longer.';
    if (ui.launchLabel) ui.launchLabel.textContent = 'FLY AGAIN';
    if (ui.finalScore) ui.finalScore.textContent = formatScore(state.score);
    if (ui.finalChain) ui.finalChain.textContent = `×${state.bestChain.toFixed(1)}`;
    if (ui.finalGrazes) ui.finalGrazes.textContent = String(state.grazes);
    if (ui.finalStats) ui.finalStats.hidden = false;
    ui.overlay?.classList.add('is-visible');
    updateUi(true);
  }

  function togglePause(force) {
    if (state.mode !== 'running' && state.mode !== 'paused') return;
    const shouldPause = typeof force === 'boolean' ? force : state.mode === 'running';
    state.mode = shouldPause ? 'paused' : 'running';
    if (ui.pausePill) ui.pausePill.hidden = !shouldPause;
    state.lastTime = performance.now();
  }

  function flowVector(multiplier = 1) {
    const effectScale = state.effects.lucid > 0 ? 0.68 : 1;
    const speed = state.flowSpeed * effectScale * multiplier;
    return { x: -speed * 0.76, y: speed * 0.65 };
  }

  function spawnPoint(margin = 30) {
    if (Math.random() < 0.5) {
      return { x: random(state.width * 0.42, state.width + margin), y: -margin };
    }
    return { x: state.width + margin, y: random(-margin, state.height * 0.58) };
  }

  function spawnHazard(initial = false) {
    if (state.hazards.length >= CONFIG.hazardCap) return;
    const type = choose(['mote', 'shard', 'weaver', 'ripple']);
    const point = initial
      ? { x: random(state.width * 0.55, state.width + 120), y: random(-80, state.height * 0.58) }
      : spawnPoint(48);
    const size = type === 'weaver' ? random(17, 28) : type === 'ripple' ? random(13, 22) : random(5, 12);
    const speedFactor = random(0.82, 1.18);
    const drift = random(-18, 18);
    state.hazards.push({
      type,
      x: point.x,
      y: point.y,
      size,
      rotation: random(0, TAU),
      rotationSpeed: random(-0.9, 0.9),
      speedFactor,
      drift,
      age: random(0, 2),
      grazed: false,
      pulse: random(0, TAU),
      color: choose([COLORS.cyan, COLORS.blue, COLORS.violet, COLORS.pink, COLORS.amber])
    });
  }

  function spawnPickup() {
    const point = spawnPoint(42);
    state.pickups.push({
      type: choose(Object.keys(POWER_DEFS)),
      x: point.x,
      y: point.y,
      radius: 9,
      rotation: random(0, TAU),
      age: 0
    });
  }

  function burst(x, y, color, count = 12, force = 70) {
    const available = Math.max(0, CONFIG.particleCap - state.particles.length);
    for (let i = 0; i < Math.min(count, available); i += 1) {
      const angle = random(0, TAU);
      const speed = random(force * 0.25, force);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: random(0.28, 0.85),
        maxLife: 1,
        size: random(0.7, 2.2),
        color
      });
    }
  }

  function addFloater(x, y, text, color) {
    state.particles.push({ x, y, vx: 14, vy: -24, life: 0.8, maxLife: 0.8, size: 0, color, text });
  }

  function hazardDistance(hazard, player) {
    if (hazard.type !== 'weaver') {
      return Math.sqrt(distanceSq(hazard.x, hazard.y, player.x, player.y)) - hazard.size;
    }

    const length = hazard.size * 2.8;
    const dx = Math.cos(hazard.rotation) * length;
    const dy = Math.sin(hazard.rotation) * length;
    const ax = hazard.x - dx;
    const ay = hazard.y - dy;
    const bx = hazard.x + dx;
    const by = hazard.y + dy;
    const abx = bx - ax;
    const aby = by - ay;
    const t = clamp(((player.x - ax) * abx + (player.y - ay) * aby) / (abx * abx + aby * aby), 0, 1);
    const px = ax + abx * t;
    const py = ay + aby * t;
    return Math.sqrt(distanceSq(px, py, player.x, player.y)) - 2.6;
  }

  function grazeHazard(hazard) {
    hazard.grazed = true;
    state.grazes += 1;
    const focusBonus = isFocusing() ? 1.35 : 1;
    const bloomBonus = state.effects.bloom > 0 ? 2 : 1;
    state.chain = Math.min(9.9, state.chain + (0.16 + state.resonance * 0.0018) * focusBonus);
    state.bestChain = Math.max(state.bestChain, state.chain);
    state.chainTimer = state.effects.echo > 0 ? 5.4 : 3.9;
    state.resonance = Math.min(100, state.resonance + 9.5 * focusBonus);
    const gain = 56 * state.chain * focusBonus * bloomBonus;
    state.score += gain;
    burst(hazard.x, hazard.y, hazard.color, 8, 38);
    addFloater(hazard.x, hazard.y, `+${Math.round(gain)}`, hazard.color);
    audio.graze();
  }

  function damagePlayer() {
    const player = state.player;
    if (player.invulnerable > 0 || state.effects.phase > 0) return;
    player.lives -= 1;
    player.invulnerable = 1.45;
    state.chain = 1;
    state.chainTimer = 0;
    state.resonance *= 0.32;
    state.shake = 10;
    state.flash = 1;
    state.hitStop = 0.07;
    burst(player.x, player.y, COLORS.red, 26, 115);
    audio.hit();
    renderLives();
    if (player.lives <= 0) finishGame();
  }

  function collectPickup(index) {
    const pickup = state.pickups[index];
    const def = POWER_DEFS[pickup.type];
    state.effects[pickup.type] = Math.max(state.effects[pickup.type], def.duration);
    state.score += 180 * state.chain;
    state.resonance = Math.min(100, state.resonance + 18);
    burst(pickup.x, pickup.y, def.color, 22, 92);
    state.pickups.splice(index, 1);
    showPickupToast(pickup.type);
    audio.pickup();
  }

  function showPickupToast(type) {
    const def = POWER_DEFS[type];
    if (!ui.pickupToast) return;
    ui.pickupToast.hidden = false;
    ui.pickupToast.style.setProperty('--pickup-color', def.color);
    ui.pickupToast.style.setProperty('--effect-color', def.color);
    if (ui.pickupName) ui.pickupName.textContent = def.name;
    if (ui.pickupDescription) ui.pickupDescription.textContent = def.subtitle;
    if (ui.pickupIcon) {
      ui.pickupIcon.textContent = '';
      ui.pickupIcon.className = `effect-glyph effect-${type}`;
    }
    state.toastTimer = 2.2;
  }

  function isFocusing() {
    return state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') || state.pointer.down;
  }

  function updatePlayer(dt) {
    const player = state.player;
    const focusing = isFocusing() && state.focus > 0;
    const keyboardSpeed = focusing ? CONFIG.focusSpeed : CONFIG.keyboardSpeed;
    let inputX = 0;
    let inputY = 0;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) inputX -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) inputX += 1;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) inputY -= 1;
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) inputY += 1;

    if (inputX || inputY) {
      const length = Math.hypot(inputX, inputY) || 1;
      player.targetX += inputX / length * keyboardSpeed * dt;
      player.targetY += inputY / length * keyboardSpeed * dt;
      state.pointer.active = false;
    } else if (state.pointer.active) {
      player.targetX = state.pointer.x;
      player.targetY = state.pointer.y;
    }

    player.targetX = clamp(player.targetX, 16, state.width - 16);
    player.targetY = clamp(player.targetY, 16, state.height - 16);
    const ease = 1 - Math.exp(-(focusing ? CONFIG.focusPointerEase : CONFIG.pointerEase) * dt);
    const oldX = player.x;
    const oldY = player.y;
    player.x = lerp(player.x, player.targetX, ease);
    player.y = lerp(player.y, player.targetY, ease);
    player.vx = (player.x - oldX) / Math.max(dt, 0.001);
    player.vy = (player.y - oldY) / Math.max(dt, 0.001);
    player.invulnerable = Math.max(0, player.invulnerable - dt);

    if (focusing) state.focus = Math.max(0, state.focus - CONFIG.focusDrain * dt);
    else state.focus = Math.min(100, state.focus + CONFIG.focusRecovery * dt);

    player.trail.push({ x: player.x, y: player.y, focus: focusing ? 1 : 0 });
    if (player.trail.length > CONFIG.trailLength) player.trail.shift();
  }

  function updateHazards(dt) {
    const player = state.player;
    const grazeMargin = CONFIG.grazeMargin + (state.effects.echo > 0 ? 8 : 0);

    for (let i = state.hazards.length - 1; i >= 0; i -= 1) {
      const hazard = state.hazards[i];
      const flow = flowVector(hazard.speedFactor);
      hazard.age += dt;
      hazard.rotation += hazard.rotationSpeed * dt;
      hazard.x += (flow.x + Math.sin(hazard.age * 1.3 + hazard.pulse) * hazard.drift) * dt;
      hazard.y += (flow.y + Math.cos(hazard.age * 1.05 + hazard.pulse) * hazard.drift * 0.45) * dt;

      const separation = hazardDistance(hazard, player);
      const collisionDistance = player.radius + CONFIG.collisionPadding;
      if (separation < collisionDistance) damagePlayer();
      else if (!hazard.grazed && separation < collisionDistance + grazeMargin) grazeHazard(hazard);

      if (hazard.x < -110 || hazard.y > state.height + 110) state.hazards.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    const player = state.player;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      const flow = flowVector(0.82);
      pickup.age += dt;
      pickup.rotation += dt * 0.65;
      pickup.x += flow.x * dt;
      pickup.y += flow.y * dt;
      if (distanceSq(pickup.x, pickup.y, player.x, player.y) < (pickup.radius + player.radius + 3) ** 2) {
        collectPickup(i);
        continue;
      }
      if (pickup.x < -60 || pickup.y > state.height + 60) state.pickups.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    const flow = flowVector(0.15);
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      particle.x += (particle.vx + flow.x) * dt;
      particle.y += (particle.vy + flow.y) * dt;
      particle.vx *= Math.exp(-2.2 * dt);
      particle.vy *= Math.exp(-2.2 * dt);
    }
  }

  function updateStars(dt) {
    const flow = flowVector(0.2);
    for (const star of state.stars) {
      const scale = 0.25 + star.z * 1.45;
      star.x += flow.x * scale * dt;
      star.y += flow.y * scale * dt;
      if (star.x < -20 || star.y > state.height + 20) {
        if (Math.random() < 0.5) {
          star.x = random(state.width * 0.55, state.width + 15);
          star.y = -15;
        } else {
          star.x = state.width + 15;
          star.y = random(-15, state.height * 0.65);
        }
        star.z = Math.random() ** 1.6;
      }
    }
  }

  function updateEffects(dt) {
    for (const key of Object.keys(state.effects)) {
      state.effects[key] = Math.max(0, state.effects[key] - dt);
    }
    if (state.toastTimer > 0) {
      state.toastTimer -= dt;
      if (state.toastTimer <= 0 && ui.pickupToast) ui.pickupToast.hidden = true;
    }
  }

  function update(dt) {
    if (state.hitStop > 0) {
      state.hitStop = Math.max(0, state.hitStop - dt);
      return;
    }

    state.elapsed += dt;
    state.difficulty = 1 + state.elapsed / 24;
    state.flowSpeed = Math.min(CONFIG.maxFlowSpeed, CONFIG.baseFlowSpeed + state.elapsed * 1.15);
    state.score += dt * 9 * state.chain * (state.effects.bloom > 0 ? 2 : 1);
    state.displayScore = lerp(state.displayScore, state.score, 1 - Math.exp(-8 * dt));
    state.flash = Math.max(0, state.flash - dt * 3.4);
    state.shake = Math.max(0, state.shake - dt * 22);

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnHazard();
      if (Math.random() < Math.min(0.42, state.elapsed / 90)) spawnHazard();
      state.spawnTimer = random(0.5, 0.95) / Math.min(1.75, 1 + state.elapsed / 110);
    }

    state.pickupTimer -= dt;
    if (state.pickupTimer <= 0) {
      spawnPickup();
      state.pickupTimer = random(CONFIG.pickupIntervalMin, CONFIG.pickupIntervalMax);
    }

    if (state.chainTimer > 0) {
      state.chainTimer -= dt;
    } else {
      state.chain = Math.max(1, state.chain - dt * 0.42);
    }
    state.resonance = Math.max(0, state.resonance - dt * (state.chainTimer > 0 ? 1.1 : 4.2));

    updatePlayer(dt);
    updateHazards(dt);
    updatePickups(dt);
    updateParticles(dt);
    updateStars(dt);
    updateEffects(dt);
    updateUi(false);
  }

  function drawBackground() {
    ctx.fillStyle = '#000104';
    ctx.fillRect(0, 0, state.width, state.height);

    const vanishingX = state.width * 1.08;
    const vanishingY = -state.height * 0.08;
    const glow = ctx.createRadialGradient(vanishingX, vanishingY, 0, vanishingX, vanishingY, state.width * 0.8);
    glow.addColorStop(0, 'rgba(78,114,255,0.12)');
    glow.addColorStop(0.42, 'rgba(155,103,255,0.035)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i += 1) {
      const t = (i + 1) / 10;
      const startX = -state.width * 0.08 + t * state.width * 1.15;
      const startY = state.height + 30;
      ctx.strokeStyle = `rgba(255,255,255,${0.012 + t * 0.018})`;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(vanishingX, vanishingY);
      ctx.stroke();
    }

    for (const ribbon of state.ribbons) {
      const drift = (state.elapsed * state.flowSpeed * 0.28 + ribbon.offset * 180) % 180;
      ctx.strokeStyle = withAlpha(ribbon.color, 0.08);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      const baseX = state.width * (0.12 + ribbon.offset * 0.9) - drift;
      for (let step = 0; step <= 14; step += 1) {
        const x = baseX + step * 42;
        const y = state.height * 0.9 - step * 35 + Math.sin(step * 0.8 + ribbon.phase + state.elapsed * 0.6) * 7;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const starFlow = flowVector(0.12);
    for (const star of state.stars) {
      const alpha = 0.12 + star.z * 0.55;
      const length = 2 + star.z * 13;
      ctx.strokeStyle = `rgba(218,228,255,${alpha})`;
      ctx.lineWidth = 0.55 + star.z * 0.8;
      ctx.beginPath();
      ctx.moveTo(star.x, star.y);
      ctx.lineTo(star.x - starFlow.x / state.flowSpeed * length, star.y - starFlow.y / state.flowSpeed * length);
      ctx.stroke();
    }
  }

  function drawHazard(hazard) {
    const pulse = 1 + Math.sin(hazard.age * 2.5 + hazard.pulse) * 0.08;
    const color = hazard.color;
    ctx.save();
    ctx.translate(hazard.x, hazard.y);
    ctx.rotate(hazard.rotation);

    if (hazard.type === 'mote') {
      const radius = hazard.size * pulse;
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 3);
      gradient.addColorStop(0, withAlpha(color, 0.65));
      gradient.addColorStop(0.28, withAlpha(color, 0.2));
      gradient.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(-radius * 3, -radius * 3, radius * 6, radius * 6);
      ctx.strokeStyle = withAlpha(color, 0.92);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.48)';
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.36, 0, TAU);
      ctx.stroke();
    } else if (hazard.type === 'shard') {
      const size = hazard.size * pulse;
      ctx.strokeStyle = withAlpha(color, 0.95);
      ctx.fillStyle = withAlpha(color, 0.06);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(size * 1.45, 0);
      ctx.lineTo(-size * 0.65, size * 0.7);
      ctx.lineTo(-size * 0.25, 0);
      ctx.lineTo(-size * 0.65, -size * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.beginPath();
      ctx.moveTo(size * 0.72, 0);
      ctx.lineTo(-size * 0.42, 0);
      ctx.stroke();
    } else if (hazard.type === 'weaver') {
      const length = hazard.size * 2.8;
      const gradient = ctx.createLinearGradient(-length, 0, length, 0);
      gradient.addColorStop(0, withAlpha(color, 0.05));
      gradient.addColorStop(0.5, withAlpha(color, 0.95));
      gradient.addColorStop(1, withAlpha(color, 0.05));
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-length, 0);
      ctx.lineTo(length, 0);
      ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.strokeStyle = withAlpha(color, 0.85);
        ctx.beginPath();
        ctx.arc(side * length, 0, 4.5, 0, TAU);
        ctx.stroke();
      }
    } else {
      const radius = hazard.size * (1.1 + (hazard.age * 0.18) % 0.55);
      ctx.strokeStyle = withAlpha(color, 0.75);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(color, 0.22);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.52, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = withAlpha(color, 0.8);
      ctx.fillRect(-1, -1, 2, 2);
    }

    ctx.restore();
  }

  function drawPickups() {
    for (const pickup of state.pickups) {
      const def = POWER_DEFS[pickup.type];
      const radius = pickup.radius * (1 + Math.sin(pickup.age * 3) * 0.08);
      const gradient = ctx.createRadialGradient(pickup.x, pickup.y, 0, pickup.x, pickup.y, radius * 3.4);
      gradient.addColorStop(0, withAlpha(def.color, 0.34));
      gradient.addColorStop(1, withAlpha(def.color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(pickup.x - radius * 4, pickup.y - radius * 4, radius * 8, radius * 8);
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      ctx.rotate(pickup.rotation);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = i / 6 * TAU;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.rotate(-pickup.rotation * 1.8);
      ctx.strokeStyle = 'rgba(255,255,255,0.62)';
      ctx.strokeRect(-3, -3, 6, 6);
      ctx.restore();
    }
  }

  function drawPlayer() {
    const player = state.player;
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 14) % 2 === 0) return;
    const focusing = isFocusing() && state.focus > 0;

    if (player.trail.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass += 1) {
        ctx.beginPath();
        player.trail.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.strokeStyle = pass === 0
          ? (focusing ? 'rgba(155,103,255,0.10)' : 'rgba(95,231,255,0.10)')
          : (focusing ? 'rgba(155,103,255,0.72)' : 'rgba(95,231,255,0.72)');
        ctx.lineWidth = pass === 0 ? 8 : 1.25;
        ctx.stroke();
      }
    }

    const glow = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, 30);
    glow.addColorStop(0, focusing ? 'rgba(155,103,255,0.32)' : 'rgba(95,231,255,0.34)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(player.x - 34, player.y - 34, 68, 68);

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = focusing ? COLORS.violet : COLORS.cyan;
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(player.radius * 1.65, 0);
    ctx.lineTo(-player.radius * 0.85, player.radius * 0.72);
    ctx.lineTo(-player.radius * 0.42, 0);
    ctx.lineTo(-player.radius * 0.85, -player.radius * 0.72);
    ctx.closePath();
    ctx.globalAlpha = 0.38;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.restore();

    if (focusing) {
      ctx.strokeStyle = 'rgba(155,103,255,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius + 7 + Math.sin(state.elapsed * 4) * 1.5, 0, TAU);
      ctx.stroke();
    }
  }

  function drawParticles() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const particle of state.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      if (particle.text) {
        ctx.fillStyle = particle.color;
        ctx.font = '8px SFMono-Regular, Consolas, monospace';
        ctx.fillText(particle.text, particle.x, particle.y);
      } else {
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    const shakeX = state.shake ? random(-state.shake, state.shake) : 0;
    const shakeY = state.shake ? random(-state.shake, state.shake) : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBackground();
    for (const hazard of state.hazards) drawHazard(hazard);
    drawPickups();
    drawParticles();
    drawPlayer();
    ctx.restore();

    if (state.flash > 0) {
      const gradient = ctx.createLinearGradient(0, state.height, state.width, 0);
      gradient.addColorStop(0, `rgba(255,79,189,${state.flash * 0.09})`);
      gradient.addColorStop(1, `rgba(255,95,117,${state.flash * 0.14})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, state.width, state.height);
    }
  }

  function renderLives() {
    if (!ui.lives || !state.player) return;
    ui.lives.innerHTML = '';
    for (let i = 0; i < CONFIG.maxLives; i += 1) {
      const dot = document.createElement('i');
      if (i < state.player.lives) dot.classList.add('is-live');
      ui.lives.appendChild(dot);
    }
  }

  function renderEffects() {
    if (!ui.effectList || !ui.effectCount) return;
    const active = Object.entries(state.effects).filter(([, time]) => time > 0);
    ui.effectCount.textContent = `${active.length} / 4`;
    if (!active.length) {
      ui.effectList.innerHTML = '<div class="effect-empty"><span class="empty-glyph"></span><p>Collect rare nodes to bend the field.</p></div>';
      return;
    }
    ui.effectList.innerHTML = active.map(([key, time]) => {
      const def = POWER_DEFS[key];
      const progress = clamp(time / def.duration, 0, 1);
      return `<div class="active-effect" style="--effect-color:${def.color};--effect-progress:${progress}">
        <i class="effect-glyph effect-${key}"></i>
        <span><strong>${def.name}</strong><small>${def.subtitle}</small></span>
        <b>${time.toFixed(1)}</b>
      </div>`;
    }).join('');
  }

  function updateUi(force) {
    if (!force && state.mode !== 'running') return;
    if (ui.score) ui.score.textContent = formatScore(state.displayScore);
    if (ui.scoreDelta) ui.scoreDelta.textContent = `+${Math.min(99.9, state.elapsed * 0.45).toFixed(1)}%`;
    if (ui.time) ui.time.textContent = formatTime(state.elapsed);
    if (ui.chain) ui.chain.textContent = `×${state.chain.toFixed(1)}`;
    if (ui.peak) ui.peak.textContent = formatScore(state.highScore);
    if (ui.highScore) ui.highScore.textContent = formatScore(state.highScore);
    if (ui.resonance) ui.resonance.textContent = `${Math.round(state.resonance)}%`;
    if (ui.grazes) ui.grazes.textContent = String(state.grazes);
    if (ui.density) ui.density.textContent = `${Math.round(clamp(state.hazards.length / 42 * 100, 0, 100))}%`;
    if (ui.flow) ui.flow.textContent = state.flowSpeed < 112 ? 'LOW' : state.flowSpeed < 145 ? 'MID' : 'HIGH';
    if (ui.fieldStatus) ui.fieldStatus.textContent = state.flowSpeed < 112 ? 'FLOATING' : state.flowSpeed < 145 ? 'STREAMING' : 'RUSHING';
    if (ui.chainState) ui.chainState.textContent = state.chain > 4 ? 'RESONANT' : state.chain > 2 ? 'ALIVE' : 'QUIET';
    if (ui.focusBar) ui.focusBar.style.width = `${state.focus}%`;
    if (ui.focusValue) ui.focusValue.textContent = String(Math.round(state.focus));
    if (ui.mode) ui.mode.textContent = isFocusing() && state.focus > 0 ? 'FOCUS MODE' : 'FLIGHT MODE';

    if (ui.resonanceMeter) {
      const segments = ui.resonanceMeter.querySelectorAll('i');
      const activeCount = Math.ceil(state.resonance / 100 * segments.length);
      segments.forEach((segment, index) => segment.classList.toggle('is-active', index < activeCount));
    }
    renderEffects();
  }

  function loop(now) {
    const rawDt = Math.min(0.05, Math.max(0, (now - state.lastTime) / 1000));
    state.lastTime = now;
    state.fpsFrames += 1;
    state.fpsTimer += rawDt;
    if (state.fpsTimer >= 0.5) {
      state.fpsValue = Math.round(state.fpsFrames / state.fpsTimer);
      state.fpsFrames = 0;
      state.fpsTimer = 0;
      if (ui.fps) ui.fps.textContent = `${state.fpsValue} FPS`;
    }

    if (state.mode === 'running') update(rawDt);
    else updateStars(rawDt * 0.45);
    render();
    requestAnimationFrame(loop);
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 14, rect.width - 14),
      y: clamp(event.clientY - rect.top, 14, rect.height - 14)
    };
  }

  canvas.addEventListener('pointermove', event => {
    const point = pointerPosition(event);
    state.pointer.x = point.x;
    state.pointer.y = point.y;
    state.pointer.active = true;
  });
  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture?.(event.pointerId);
    const point = pointerPosition(event);
    state.pointer.x = point.x;
    state.pointer.y = point.y;
    state.pointer.active = true;
    state.pointer.down = true;
  });
  canvas.addEventListener('pointerup', event => {
    state.pointer.down = false;
    canvas.releasePointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointercancel', () => { state.pointer.down = false; });

  window.addEventListener('keydown', event => {
    if (state.mode === 'idle' && event.code === 'Enter') {
      event.preventDefault();
      startGame();
      return;
    }
    state.keys.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'Space') togglePause();
  });
  window.addEventListener('keyup', event => state.keys.delete(event.code));
  window.addEventListener('blur', () => {
    state.keys.clear();
    state.pointer.down = false;
    if (state.mode === 'running') togglePause(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'running') togglePause(true);
  });

  ui.startButton?.addEventListener('click', startGame);
  ui.launchButton?.addEventListener('click', startGame);
  ui.menuButton?.addEventListener('click', () => togglePause());
  ui.soundButton?.addEventListener('click', () => {
    audio.muted = !audio.muted;
    storage.set('cosinuos-muted', audio.muted ? '1' : '0');
    ui.soundButton.classList.toggle('is-muted', audio.muted);
    if (!audio.muted) audio.ensure();
  });

  ui.appShell?.addEventListener('pointermove', event => {
    const x = (event.clientX / window.innerWidth - 0.5) * 18;
    const y = (event.clientY / window.innerHeight - 0.5) * 14;
    ui.appShell.style.setProperty('--parallax-x', `${x}px`);
    ui.appShell.style.setProperty('--parallax-y', `${y}px`);
  });

  const flightStyles = document.createElement('link');
  flightStyles.rel = 'stylesheet';
  flightStyles.href = 'flight-v2.css';
  document.head.appendChild(flightStyles);

  if (ui.highScore) ui.highScore.textContent = formatScore(state.highScore);
  if (ui.peak) ui.peak.textContent = formatScore(state.highScore);
  ui.soundButton?.classList.toggle('is-muted', audio.muted);
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(loop);
})();
