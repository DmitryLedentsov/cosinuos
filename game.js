(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const COLORS = {
    white: '#f7f8fc', cyan: '#5fe7ff', blue: '#4c72ff', violet: '#9b67ff',
    pink: '#ff4fbd', amber: '#ffb34d', green: '#72efaa', red: '#ff5f75'
  };

  const POWER_DEFS = {
    lucid: {
      name: 'LUCID', subtitle: 'FLOW SLOWS', color: COLORS.cyan, duration: 6.5,
      svg: '<svg viewBox="0 0 24 24"><path d="M4 9c3-3 5 3 8 0s5 3 8 0M4 15c3-3 5 3 8 0s5 3 8 0"/></svg>'
    },
    echo: {
      name: 'ECHO', subtitle: 'CHAIN VALUE ×2', color: COLORS.pink, duration: 8,
      svg: '<svg viewBox="0 0 24 24"><path d="M5 12c2.2-4 5-4 7 0s4.8 4 7 0-4.8-4-7 0-4.8 4-7 0z"/></svg>'
    },
    phase: {
      name: 'PHASE', subtitle: 'ONE SAFE HIT', color: COLORS.violet, duration: 0,
      svg: '<svg viewBox="0 0 24 24"><path d="M12 4l7 4v8l-7 4-7-4V8zM8 12h8"/></svg>'
    },
    bloom: {
      name: 'BLOOM', subtitle: 'CLEARS THE LANE', color: COLORS.amber, duration: 0,
      svg: '<svg viewBox="0 0 24 24"><path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M18.4 5.6l-4.2 4.2M9.8 14.2l-4.2 4.2"/></svg>'
    }
  };

  const CONFIG = {
    lives: 3,
    maxLives: 4,
    playerRadius: 4.2,
    focusRadius: 3.2,
    maxPlayerSpeed: 285,
    focusSpeed: 128,
    acceleration: 9.4,
    drag: 5.1,
    focusDrain: 23,
    focusRegen: 17,
    baseWorldSpeed: 122,
    maxWorldSpeed: 236,
    grazeMargin: 14,
    particleCap: 520,
    obstacleCap: 72,
    invulnerability: 1.25,
    pickupInterval: [9, 14]
  };

  const canvas = document.querySelector('#world');
  const arenaShell = document.querySelector('#arenaShell');
  const ctx = canvas.getContext('2d', { alpha: false });

  const ui = {
    startScreen: document.querySelector('#startScreen'),
    startButton: document.querySelector('#startButton'),
    overlay: document.querySelector('#gameOverlay'),
    overlayEyebrow: document.querySelector('#overlayEyebrow'),
    overlayTitle: document.querySelector('#overlayTitle'),
    overlayCopy: document.querySelector('#overlayCopy'),
    launchButton: document.querySelector('#launchButton'),
    launchLabel: document.querySelector('#launchLabel'),
    finalScore: document.querySelector('#finalScore'),
    finalChain: document.querySelector('#finalChain'),
    finalGates: document.querySelector('#finalGrazes'),
    score: document.querySelector('#scoreValue'),
    scoreDelta: document.querySelector('#scoreDelta'),
    time: document.querySelector('#timeValue'),
    chain: document.querySelector('#chainValue'),
    peak: document.querySelector('#peakValue'),
    highScore: document.querySelector('#highScoreValue'),
    chainState: document.querySelector('#chainState'),
    resonance: document.querySelector('#resonanceValue'),
    resonanceMeter: document.querySelector('#resonanceMeter'),
    fieldStatus: document.querySelector('#fieldStatus'),
    density: document.querySelector('#densityValue'),
    flow: document.querySelector('#flowValue'),
    gates: document.querySelector('#grazeValue'),
    effectCount: document.querySelector('#effectCount'),
    effectList: document.querySelector('#effectList'),
    focusBar: document.querySelector('#focusBar'),
    focusValue: document.querySelector('#focusValue'),
    modeValue: document.querySelector('#modeValue'),
    modeReadout: document.querySelector('.mode-readout'),
    lifeReadout: document.querySelector('#lifeReadout'),
    pausePill: document.querySelector('#pausePill'),
    pickupToast: document.querySelector('#pickupToast'),
    pickupIcon: document.querySelector('#pickupIcon'),
    pickupName: document.querySelector('#pickupName'),
    pickupDescription: document.querySelector('#pickupDescription'),
    menuButton: document.querySelector('#menuButton'),
    soundButton: document.querySelector('#soundButton'),
    fps: document.querySelector('#fpsValue')
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => min + Math.random() * (max - min);
  const choose = list => list[Math.floor(Math.random() * list.length)];
  const formatScore = n => Math.floor(n).toString().padStart(6, '0');
  const formatTime = s => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  const rgba = (hex, a) => {
    const n = Number.parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };

  const storage = {
    get(key, fallback = 0) {
      try { return Number(localStorage.getItem(key) ?? fallback); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, String(value)); } catch { /* no-op */ }
    }
  };

  class AudioBus {
    constructor() {
      this.context = null;
      this.master = null;
      this.muted = false;
    }

    ensure() {
      if (this.context || this.muted) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.context = new AC();
      this.master = this.context.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.context.destination);
    }

    tone(freq, duration = 0.1, type = 'sine', gain = 0.018, end = freq) {
      if (this.muted) return;
      this.ensure();
      if (!this.context) return;
      const now = this.context.currentTime;
      const osc = this.context.createOscillator();
      const amp = this.context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, end), now + duration);
      amp.gain.setValueAtTime(gain, now);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(amp).connect(this.master);
      osc.start(now);
      osc.stop(now + duration);
    }

    near(chain) {
      if (Math.random() < 0.22) this.tone(330 + chain * 18, 0.055, 'sine', 0.007, 420 + chain * 22);
    }

    gate(chain) {
      this.tone(420 + chain * 12, 0.11, 'triangle', 0.018, 610 + chain * 16);
    }

    pickup(type) {
      const base = { lucid: 430, echo: 590, phase: 700, bloom: 320 }[type] || 480;
      this.tone(base, 0.15, 'triangle', 0.025, base * 1.6);
      window.setTimeout(() => this.tone(base * 1.3, 0.11, 'sine', 0.014, base * 1.9), 55);
    }

    hit() { this.tone(120, 0.25, 'sawtooth', 0.034, 42); }
    over() { this.tone(175, 0.55, 'triangle', 0.028, 40); }
  }

  const audio = new AudioBus();

  const state = {
    mode: 'idle',
    width: 0,
    height: 0,
    dpr: 1,
    now: 0,
    elapsed: 0,
    lastTime: performance.now(),
    score: 0,
    displayScore: 0,
    highScore: storage.get('cosinuos-flight-high-score', 0),
    peakChain: 1,
    gates: 0,
    nearMisses: 0,
    worldSpeed: CONFIG.baseWorldSpeed,
    targetWorldSpeed: CONFIG.baseWorldSpeed,
    spawnTimer: 0,
    pickupTimer: 8,
    uiTimer: 0,
    fpsTimer: 0,
    fpsFrames: 0,
    fps: 60,
    shake: 0,
    flash: 0,
    hitStop: 0,
    toastTimer: 0,
    pointer: { x: 0, y: 0, active: false, down: false },
    keys: new Set(),
    player: null,
    obstacles: [],
    pickups: [],
    particles: [],
    waves: [],
    stars: [],
    flowLines: []
  };

  function createPlayer() {
    return {
      x: state.width * 0.27,
      y: state.height * 0.5,
      vx: 0,
      vy: 0,
      targetX: state.width * 0.27,
      targetY: state.height * 0.5,
      radius: CONFIG.playerRadius,
      lives: CONFIG.lives,
      focus: 100,
      chain: 1,
      energy: 0,
      hold: 0,
      invulnerable: 0,
      phaseCharge: 0,
      trail: [],
      trailTimer: 0,
      effects: { lucid: 0, echo: 0 }
    };
  }

  function resize() {
    const rect = arenaShell.getBoundingClientRect();
    state.width = Math.max(280, rect.width);
    state.height = Math.max(280, rect.height);
    state.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    if (!state.player) state.player = createPlayer();
    state.player.x = clamp(state.player.x, 18, state.width - 18);
    state.player.y = clamp(state.player.y, 18, state.height - 18);
    state.player.targetX = clamp(state.player.targetX, 18, state.width - 18);
    state.player.targetY = clamp(state.player.targetY, 18, state.height - 18);

    const starCount = Math.ceil((state.width * state.height) / 2600);
    state.stars = Array.from({ length: starCount }, () => makeStar(true));
    state.flowLines = Array.from({ length: 11 }, (_, i) => ({
      y: (i + 0.5) / 11,
      phase: rand(0, TAU),
      speed: rand(0.75, 1.35),
      color: choose([COLORS.cyan, COLORS.blue, COLORS.violet, COLORS.pink, COLORS.amber])
    }));
  }

  function makeStar(anywhere = false) {
    const z = Math.random() ** 1.8;
    return {
      x: anywhere ? rand(0, state.width) : state.width + rand(0, 80),
      y: rand(0, state.height),
      z: 0.2 + z * 0.8,
      size: rand(0.45, 1.45)
    };
  }

  function resetGame() {
    state.elapsed = 0;
    state.score = 0;
    state.displayScore = 0;
    state.peakChain = 1;
    state.gates = 0;
    state.nearMisses = 0;
    state.worldSpeed = CONFIG.baseWorldSpeed;
    state.targetWorldSpeed = CONFIG.baseWorldSpeed;
    state.spawnTimer = 1.15;
    state.pickupTimer = rand(7.5, 10.5);
    state.uiTimer = 0;
    state.shake = 0;
    state.flash = 0;
    state.hitStop = 0;
    state.toastTimer = 0;
    state.obstacles.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.waves.length = 0;
    state.player = createPlayer();
    state.pointer.x = state.player.x;
    state.pointer.y = state.player.y;
    state.pointer.active = false;
    state.pointer.down = false;
    renderLives();
    updateUi(true);
  }

  function startGame() {
    audio.ensure();
    resetGame();
    state.mode = 'running';
    ui.overlay.classList.remove('is-visible');
    ui.pausePill.hidden = true;
    state.lastTime = performance.now();
  }

  function finishGame() {
    state.mode = 'gameover';
    state.highScore = Math.max(state.highScore, Math.floor(state.score));
    storage.set('cosinuos-flight-high-score', state.highScore);
    audio.over();
    ui.overlayEyebrow.textContent = 'RUN COMPLETE / FLIGHT STORED';
    ui.overlayTitle.innerHTML = 'The flight ended.<br>The line remains.';
    ui.overlayCopy.textContent = 'The current keeps moving. Return, read the gaps earlier, and hold the chain longer.';
    ui.finalScore.textContent = formatScore(state.score);
    ui.finalChain.textContent = `×${state.peakChain.toFixed(1)}`;
    ui.finalGates.textContent = String(state.gates);
    ui.launchLabel.textContent = 'FLY AGAIN';
    ui.overlay.classList.add('is-visible');
    updateUi(true);
  }

  function togglePause(force) {
    if (state.mode !== 'running' && state.mode !== 'paused') return;
    const paused = typeof force === 'boolean' ? force : state.mode === 'running';
    state.mode = paused ? 'paused' : 'running';
    ui.pausePill.hidden = !paused;
    state.lastTime = performance.now();
  }

  function isFocusing() {
    return (state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') || state.pointer.down) && state.player.focus > 1;
  }

  function spawnPattern() {
    if (state.obstacles.length >= CONFIG.obstacleCap) return;
    const roll = Math.random();
    if (roll < 0.46) spawnGate();
    else if (roll < 0.78) spawnShardFlock();
    else spawnRing();
  }

  function spawnGate() {
    const margin = 54;
    const gapSize = clamp(rand(92, 142) - state.elapsed * 0.045, 76, 142);
    const gapY = rand(margin + gapSize * 0.5, state.height - margin - gapSize * 0.5);
    state.obstacles.push({
      kind: 'gate',
      x: state.width + 32,
      width: rand(8, 12),
      gapY,
      gapSize,
      color: choose([COLORS.cyan, COLORS.violet, COLORS.pink, COLORS.amber]),
      passed: false,
      nearTop: false,
      nearBottom: false,
      age: 0
    });
  }

  function spawnShardFlock() {
    const count = Math.random() < 0.32 ? 4 : 3;
    const baseY = rand(70, state.height - 70);
    const spread = rand(36, 72);
    for (let i = 0; i < count; i += 1) {
      state.obstacles.push({
        kind: 'shard',
        x: state.width + 28 + i * rand(24, 42),
        y: clamp(baseY + (i - (count - 1) / 2) * spread + rand(-12, 12), 28, state.height - 28),
        radius: rand(5, 9),
        rotation: rand(0, TAU),
        spin: rand(-2.2, 2.2),
        drift: rand(-13, 13),
        phase: rand(0, TAU),
        color: choose([COLORS.pink, COLORS.blue, COLORS.violet, COLORS.amber]),
        grazed: false,
        age: 0
      });
    }
  }

  function spawnRing() {
    state.obstacles.push({
      kind: 'ring',
      x: state.width + 48,
      y: rand(80, state.height - 80),
      radius: rand(26, 42),
      thickness: rand(2.2, 3.8),
      drift: rand(-18, 18),
      phase: rand(0, TAU),
      color: choose([COLORS.cyan, COLORS.violet, COLORS.amber]),
      grazed: false,
      passed: false,
      age: 0
    });
  }

  function spawnPickup() {
    if (state.pickups.length >= 2) return;
    const type = choose(Object.keys(POWER_DEFS));
    state.pickups.push({
      type,
      x: state.width + 34,
      y: rand(54, state.height - 54),
      radius: 8,
      angle: rand(0, TAU),
      age: 0
    });
  }

  function addParticles(x, y, color, count = 18, speed = 100, direction = null) {
    const available = Math.max(0, CONFIG.particleCap - state.particles.length);
    const amount = Math.min(count, available);
    for (let i = 0; i < amount; i += 1) {
      const angle = direction == null ? rand(0, TAU) : direction + rand(-0.65, 0.65);
      const velocity = rand(speed * 0.22, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: rand(0.26, 0.72),
        maxLife: 0.72,
        size: rand(0.7, 2.1),
        color,
        streak: Math.random() < 0.72
      });
    }
  }

  function addWave(x, y, color, maxRadius = 90, width = 1.5) {
    state.waves.push({ x, y, radius: 0, maxRadius, speed: maxRadius / 0.55, color, width });
  }

  function addChain(amount, score, color = COLORS.cyan) {
    const p = state.player;
    const echo = p.effects.echo > 0 ? 2 : 1;
    p.energy = clamp(p.energy + amount * echo, 0, 100);
    p.hold = 2.5;
    p.chain = 1 + p.energy / 20;
    state.peakChain = Math.max(state.peakChain, p.chain * echo);
    state.score += score * p.chain * echo;
    audio.near(p.chain);
    if (Math.random() < 0.55) addParticles(p.x - 2, p.y, color, 3, 24, Math.PI);
  }

  function passGate(gate) {
    if (gate.passed) return;
    gate.passed = true;
    state.gates += 1;
    addChain(9, 74, gate.color);
    audio.gate(state.player.chain);
    addWave(state.player.x, state.player.y, gate.color, 68, 1.3);
  }

  function hitPlayer(index) {
    const p = state.player;
    if (p.invulnerable > 0 || state.mode !== 'running') return;
    if (p.phaseCharge > 0) {
      p.phaseCharge -= 1;
      const h = state.obstacles[index];
      if (h) addParticles(h.x, h.y || p.y, COLORS.violet, 24, 100);
      state.obstacles.splice(index, 1);
      addWave(p.x, p.y, COLORS.violet, 84, 2);
      showToast('phase');
      return;
    }

    p.lives -= 1;
    p.invulnerable = CONFIG.invulnerability;
    p.energy = 0;
    p.chain = 1;
    p.hold = 0;
    state.shake = 1;
    state.flash = 1;
    state.hitStop = 0.09;
    audio.hit();
    addParticles(p.x, p.y, COLORS.red, 38, 155);
    addWave(p.x, p.y, COLORS.red, 110, 2.2);
    state.obstacles.splice(index, 1);
    renderLives();
    if (p.lives <= 0) finishGame();
  }

  function applyPickup(type, pickup) {
    const p = state.player;
    const def = POWER_DEFS[type];
    audio.pickup(type);
    addParticles(pickup.x, pickup.y, def.color, 30, 125);
    addWave(pickup.x, pickup.y, def.color, 94, 2);
    showToast(type);
    addChain(14, 150, def.color);

    if (type === 'lucid') {
      p.effects.lucid = def.duration;
      p.focus = 100;
    } else if (type === 'echo') {
      p.effects.echo = def.duration;
    } else if (type === 'phase') {
      p.phaseCharge = Math.min(2, p.phaseCharge + 1);
    } else if (type === 'bloom') {
      for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
        const h = state.obstacles[i];
        const hx = h.x;
        const hy = h.y ?? h.gapY;
        if (Math.hypot(hx - p.x, hy - p.y) < 190) {
          addParticles(hx, hy, def.color, 7, 80);
          state.obstacles.splice(i, 1);
          state.score += 30 * p.chain;
        }
      }
      addWave(p.x, p.y, def.color, 190, 3);
    }
  }

  function showToast(type) {
    const def = POWER_DEFS[type];
    ui.pickupToast.hidden = false;
    ui.pickupToast.style.setProperty('--effect-color', def.color);
    ui.pickupIcon.innerHTML = def.svg;
    ui.pickupName.textContent = def.name;
    ui.pickupDescription.textContent = def.subtitle;
    state.toastTimer = 1.8;
  }

  function updatePlayer(dt) {
    const p = state.player;
    const focusing = isFocusing();
    let ix = 0;
    let iy = 0;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) ix -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) ix += 1;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) iy -= 1;
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) iy += 1;

    const maxSpeed = focusing ? CONFIG.focusSpeed : CONFIG.maxPlayerSpeed;
    if (ix || iy) {
      const len = Math.hypot(ix, iy) || 1;
      p.targetX += ix / len * maxSpeed * dt;
      p.targetY += iy / len * maxSpeed * dt;
    } else if (state.pointer.active) {
      p.targetX = state.pointer.x;
      p.targetY = state.pointer.y;
    } else {
      p.targetX = lerp(p.targetX, state.width * 0.28, 1 - Math.exp(-0.55 * dt));
    }

    const xMin = 18;
    const xMax = state.width * 0.7;
    p.targetX = clamp(p.targetX, xMin, xMax);
    p.targetY = clamp(p.targetY, 16, state.height - 16);

    const desiredX = (p.targetX - p.x) * (focusing ? 4.2 : 6.8);
    const desiredY = (p.targetY - p.y) * (focusing ? 4.2 : 6.8);
    const desiredLength = Math.hypot(desiredX, desiredY) || 1;
    const scale = Math.min(1, maxSpeed / desiredLength);
    const response = 1 - Math.exp(-CONFIG.acceleration * dt);
    p.vx = lerp(p.vx, desiredX * scale, response);
    p.vy = lerp(p.vy, desiredY * scale, response);
    p.vx *= Math.exp(-CONFIG.drag * dt * 0.08);
    p.vy *= Math.exp(-CONFIG.drag * dt * 0.08);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = clamp(p.x, xMin, xMax);
    p.y = clamp(p.y, 14, state.height - 14);

    if (focusing) p.focus = Math.max(0, p.focus - CONFIG.focusDrain * dt);
    else p.focus = Math.min(100, p.focus + CONFIG.focusRegen * dt);

    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.hold = Math.max(0, p.hold - dt);
    if (p.hold <= 0) {
      p.energy = Math.max(0, p.energy - dt * 7.5);
      p.chain = 1 + p.energy / 20;
    }
    for (const key of Object.keys(p.effects)) p.effects[key] = Math.max(0, p.effects[key] - dt);

    p.trailTimer += dt;
    if (p.trailTimer >= 0.015) {
      p.trailTimer = 0;
      p.trail.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, focus: focusing });
      if (p.trail.length > 68) p.trail.shift();
    }
  }

  function updateStars(dt) {
    const speed = state.worldSpeed;
    for (const star of state.stars) {
      star.x -= speed * (0.25 + star.z * 1.35) * dt;
      if (star.x < -24) Object.assign(star, makeStar(false));
    }
  }

  function updateObstacles(dt) {
    const p = state.player;
    const slow = p.effects.lucid > 0 ? 0.55 : 1;
    const speed = state.worldSpeed * slow;
    const hitRadius = isFocusing() ? CONFIG.focusRadius : CONFIG.playerRadius;

    for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
      const h = state.obstacles[i];
      h.age += dt;
      h.x -= speed * dt;

      if (h.kind === 'gate') {
        const left = h.x - h.width * 0.5;
        const right = h.x + h.width * 0.5;
        const gapTop = h.gapY - h.gapSize * 0.5;
        const gapBottom = h.gapY + h.gapSize * 0.5;
        const overlappingX = p.x + hitRadius > left && p.x - hitRadius < right;
        if (overlappingX && (p.y - hitRadius < gapTop || p.y + hitRadius > gapBottom)) {
          hitPlayer(i);
          continue;
        }

        const nearX = Math.abs(p.x - h.x) < 19;
        if (nearX) {
          const topDistance = Math.abs((p.y - hitRadius) - gapTop);
          const bottomDistance = Math.abs((p.y + hitRadius) - gapBottom);
          if (topDistance < CONFIG.grazeMargin && !h.nearTop) {
            h.nearTop = true;
            state.nearMisses += 1;
            addChain(3.2, 14, h.color);
          }
          if (bottomDistance < CONFIG.grazeMargin && !h.nearBottom) {
            h.nearBottom = true;
            state.nearMisses += 1;
            addChain(3.2, 14, h.color);
          }
        }
        if (!h.passed && h.x + h.width < p.x) passGate(h);
      } else if (h.kind === 'shard') {
        h.y += (h.drift + Math.sin(h.phase + h.age * 2.1) * 10) * dt;
        h.rotation += h.spin * dt;
        const distance = Math.hypot(p.x - h.x, p.y - h.y) - h.radius;
        if (distance < hitRadius + 1) {
          hitPlayer(i);
          continue;
        }
        if (!h.grazed && distance < hitRadius + CONFIG.grazeMargin) {
          h.grazed = true;
          state.nearMisses += 1;
          addChain(5, 24, h.color);
        }
      } else if (h.kind === 'ring') {
        h.y += Math.sin(h.phase + h.age * 1.3) * h.drift * dt;
        const centerDistance = Math.hypot(p.x - h.x, p.y - h.y);
        const ringDistance = Math.abs(centerDistance - h.radius) - h.thickness;
        if (ringDistance < hitRadius) {
          hitPlayer(i);
          continue;
        }
        if (!h.grazed && ringDistance < hitRadius + CONFIG.grazeMargin) {
          h.grazed = true;
          state.nearMisses += 1;
          addChain(6, 28, h.color);
        }
        if (!h.passed && h.x + h.radius < p.x) {
          h.passed = true;
          state.gates += 1;
          addChain(7, 52, h.color);
          audio.gate(p.chain);
        }
      }

      if (h.x < -120) state.obstacles.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    const p = state.player;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      pickup.age += dt;
      pickup.angle += dt * 1.15;
      pickup.x -= state.worldSpeed * 0.72 * dt;
      pickup.y += Math.sin(pickup.age * 1.35 + pickup.angle) * 4 * dt;
      if (Math.hypot(pickup.x - p.x, pickup.y - p.y) < pickup.radius + p.radius + 3) {
        applyPickup(pickup.type, pickup);
        state.pickups.splice(i, 1);
        continue;
      }
      if (pickup.x < -50) state.pickups.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      p.vx *= Math.exp(-2.1 * dt);
      p.vy *= Math.exp(-2.1 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.waves.length - 1; i >= 0; i -= 1) {
      const w = state.waves[i];
      w.radius += w.speed * dt;
      if (w.radius >= w.maxRadius) state.waves.splice(i, 1);
    }
  }

  function update(dt) {
    state.now += dt;
    state.flash = Math.max(0, state.flash - dt * 3.3);
    state.shake = Math.max(0, state.shake - dt * 4.2);
    state.toastTimer = Math.max(0, state.toastTimer - dt);
    if (state.toastTimer <= 0) ui.pickupToast.hidden = true;

    state.fpsTimer += dt;
    state.fpsFrames += 1;
    if (state.fpsTimer >= 0.5) {
      state.fps = Math.round(state.fpsFrames / state.fpsTimer);
      state.fpsTimer = 0;
      state.fpsFrames = 0;
      ui.fps.textContent = `${state.fps} FPS`;
    }

    updateStars(dt);
    if (state.mode !== 'running') return;
    if (state.hitStop > 0) {
      state.hitStop -= dt;
      return;
    }

    state.elapsed += dt;
    const progress = clamp(state.elapsed / 135, 0, 1);
    state.targetWorldSpeed = lerp(CONFIG.baseWorldSpeed, CONFIG.maxWorldSpeed, progress ** 0.72);
    state.worldSpeed = lerp(state.worldSpeed, state.targetWorldSpeed, 1 - Math.exp(-0.8 * dt));
    const p = state.player;
    state.score += (8 + state.worldSpeed * 0.035) * p.chain * dt;
    state.displayScore = lerp(state.displayScore, state.score, 1 - Math.exp(-7 * dt));

    updatePlayer(dt);

    state.spawnTimer -= dt;
    const interval = clamp(1.52 - progress * 0.72, 0.7, 1.52);
    if (state.spawnTimer <= 0) {
      state.spawnTimer += interval * rand(0.86, 1.14);
      spawnPattern();
      if (progress > 0.55 && Math.random() < 0.12) spawnShardFlock();
    }

    state.pickupTimer -= dt;
    if (state.pickupTimer <= 0) {
      spawnPickup();
      state.pickupTimer = rand(...CONFIG.pickupInterval);
    }

    updateObstacles(dt);
    updatePickups(dt);
    updateParticles(dt);

    state.uiTimer -= dt;
    if (state.uiTimer <= 0) {
      state.uiTimer = 0.1;
      updateUi(false);
    }
  }

  function drawBackground() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, state.width, state.height);

    const horizonY = state.height * 0.5;
    const speedRatio = state.worldSpeed / CONFIG.maxWorldSpeed;

    const glow = ctx.createRadialGradient(state.width * 0.34, horizonY, 0, state.width * 0.34, horizonY, state.width * 0.58);
    glow.addColorStop(0, 'rgba(64,72,255,.055)');
    glow.addColorStop(0.55, 'rgba(155,70,255,.018)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const star of state.stars) {
      const length = 1 + speedRatio * star.z * 15;
      const alpha = 0.14 + star.z * 0.48;
      ctx.strokeStyle = `rgba(220,230,255,${alpha})`;
      ctx.lineWidth = star.size * (0.5 + star.z * 0.75);
      ctx.beginPath();
      ctx.moveTo(star.x, star.y);
      ctx.lineTo(star.x - length, star.y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.lineWidth = 0.8;
    for (let i = 0; i < state.flowLines.length; i += 1) {
      const line = state.flowLines[i];
      const baseY = state.height * line.y;
      const offset = (state.now * state.worldSpeed * line.speed * 0.24) % 120;
      ctx.strokeStyle = rgba(line.color, 0.045 + speedRatio * 0.035);
      ctx.beginPath();
      for (let x = -140 + offset; x <= state.width + 140; x += 12) {
        const curve = Math.sin(x * 0.009 + line.phase + state.now * 0.2) * (8 + i * 0.45);
        const pull = (x / state.width - 0.35) * (baseY - horizonY) * 0.08;
        const y = baseY + curve - pull;
        if (x === -140 + offset) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,.025)';
    ctx.lineWidth = 0.7;
    for (let i = 1; i <= 5; i += 1) {
      const y = state.height * (i / 6);
      ctx.beginPath();
      ctx.moveTo(0, lerp(y, horizonY, 0.18));
      ctx.lineTo(state.width, lerp(y, horizonY, -0.06));
      ctx.stroke();
    }
  }

  function drawTrail() {
    const trail = state.player.trail;
    if (trail.length < 2) return;
    const focus = isFocusing();
    for (let pass = 0; pass < 3; pass += 1) {
      ctx.beginPath();
      for (let i = 0; i < trail.length; i += 1) {
        const point = trail[i];
        const tail = (trail.length - i) / trail.length;
        const x = point.x - tail * tail * 18;
        if (i === 0) ctx.moveTo(x, point.y);
        else ctx.lineTo(x, point.y);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = pass === 0 ? 11 : pass === 1 ? 3.2 : 0.9;
      ctx.strokeStyle = pass === 0
        ? rgba(focus ? COLORS.violet : COLORS.cyan, 0.035)
        : pass === 1
          ? rgba(state.player.effects.echo > 0 ? COLORS.pink : COLORS.blue, 0.16)
          : rgba(focus ? COLORS.violet : COLORS.cyan, 0.72);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    const p = state.player;
    if (p.invulnerable > 0 && Math.floor(p.invulnerable * 15) % 2 === 0) return;
    drawTrail();

    const focus = isFocusing();
    const color = focus ? COLORS.violet : COLORS.cyan;
    const angle = Math.atan2(p.vy, 110 + p.vx * 0.35);

    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 28);
    glow.addColorStop(0, rgba(color, 0.28));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - 30, p.y - 30, 60, 60);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);

    ctx.strokeStyle = rgba(color, 0.65);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -4.5);
    ctx.lineTo(7, 0);
    ctx.lineTo(-8, 4.5);
    ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = COLORS.white;
    ctx.beginPath();
    ctx.moveTo(-4.5, -2.6);
    ctx.lineTo(5.2, 0);
    ctx.lineTo(-4.5, 2.6);
    ctx.lineTo(-2.2, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = color;
    ctx.fillRect(-7.5, -1, 2.8, 2);
    ctx.restore();

    if (focus) {
      ctx.strokeStyle = rgba(COLORS.violet, 0.52);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8.5 + Math.sin(state.now * 4) * 0.8, 0, TAU);
      ctx.stroke();
    }

    if (p.phaseCharge > 0) {
      ctx.strokeStyle = rgba(COLORS.violet, 0.75);
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, state.now, state.now + TAU * 0.84);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawGate(h) {
    const topEnd = h.gapY - h.gapSize * 0.5;
    const bottomStart = h.gapY + h.gapSize * 0.5;
    const gradientTop = ctx.createLinearGradient(h.x, 0, h.x, topEnd);
    gradientTop.addColorStop(0, rgba(h.color, 0.05));
    gradientTop.addColorStop(1, rgba(h.color, 0.9));
    const gradientBottom = ctx.createLinearGradient(h.x, bottomStart, h.x, state.height);
    gradientBottom.addColorStop(0, rgba(h.color, 0.9));
    gradientBottom.addColorStop(1, rgba(h.color, 0.05));

    ctx.lineWidth = h.width;
    ctx.lineCap = 'round';
    ctx.strokeStyle = gradientTop;
    ctx.beginPath();
    ctx.moveTo(h.x, -12);
    ctx.lineTo(h.x, topEnd);
    ctx.stroke();
    ctx.strokeStyle = gradientBottom;
    ctx.beginPath();
    ctx.moveTo(h.x, bottomStart);
    ctx.lineTo(h.x, state.height + 12);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(h.color, 0.8);
    ctx.beginPath();
    ctx.arc(h.x, topEnd, 9, 0, TAU);
    ctx.moveTo(h.x + 9, bottomStart);
    ctx.arc(h.x, bottomStart, 9, 0, TAU);
    ctx.stroke();
  }

  function drawShard(h) {
    const glow = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.radius * 3.2);
    glow.addColorStop(0, rgba(h.color, 0.24));
    glow.addColorStop(1, rgba(h.color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(h.x - h.radius * 4, h.y - h.radius * 4, h.radius * 8, h.radius * 8);

    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rotation);
    ctx.strokeStyle = rgba(h.color, 0.88);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(h.radius * 1.5, 0);
    ctx.lineTo(-h.radius, h.radius * 0.8);
    ctx.lineTo(-h.radius * 0.45, 0);
    ctx.lineTo(-h.radius, -h.radius * 0.8);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawRing(h) {
    const glow = ctx.createRadialGradient(h.x, h.y, h.radius * 0.55, h.x, h.y, h.radius * 1.55);
    glow.addColorStop(0, rgba(h.color, 0));
    glow.addColorStop(0.72, rgba(h.color, 0.12));
    glow.addColorStop(1, rgba(h.color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(h.x - h.radius * 1.8, h.y - h.radius * 1.8, h.radius * 3.6, h.radius * 3.6);

    ctx.strokeStyle = rgba(h.color, 0.86);
    ctx.lineWidth = h.thickness;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.radius, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = rgba(COLORS.white, 0.14);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.radius * 0.72, state.now, state.now + TAU * 0.72);
    ctx.stroke();
  }

  function drawObstacles() {
    for (const h of state.obstacles) {
      if (h.kind === 'gate') drawGate(h);
      else if (h.kind === 'shard') drawShard(h);
      else drawRing(h);
    }
  }

  function drawPickupGlyph(type, x, y, radius, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const color = POWER_DEFS[type].color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (type === 'lucid') {
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-radius, i * 4);
        ctx.bezierCurveTo(-radius * 0.35, i * 4 - 5, radius * 0.35, i * 4 + 5, radius, i * 4);
        ctx.stroke();
      }
    } else if (type === 'echo') {
      ctx.beginPath();
      ctx.moveTo(-radius, 0);
      ctx.bezierCurveTo(-radius * 0.42, -radius, radius * 0.42, radius, radius, 0);
      ctx.bezierCurveTo(radius * 0.42, -radius, -radius * 0.42, radius, -radius, 0);
      ctx.stroke();
    } else if (type === 'phase') {
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = i / 6 * TAU - Math.PI / 2;
        const px = Math.cos(a) * radius;
        const py = Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-radius * 0.55, 0);
      ctx.lineTo(radius * 0.55, 0);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-radius, 0); ctx.lineTo(radius, 0);
      ctx.moveTo(0, -radius); ctx.lineTo(0, radius);
      ctx.moveTo(-radius * 0.7, -radius * 0.7); ctx.lineTo(radius * 0.7, radius * 0.7);
      ctx.moveTo(radius * 0.7, -radius * 0.7); ctx.lineTo(-radius * 0.7, radius * 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPickups() {
    for (const pickup of state.pickups) {
      const def = POWER_DEFS[pickup.type];
      const pulse = 1 + Math.sin(state.now * 3 + pickup.angle) * 0.08;
      const radius = pickup.radius * pulse;
      const glow = ctx.createRadialGradient(pickup.x, pickup.y, 0, pickup.x, pickup.y, 30);
      glow.addColorStop(0, rgba(def.color, 0.22));
      glow.addColorStop(1, rgba(def.color, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(pickup.x - 32, pickup.y - 32, 64, 64);
      ctx.strokeStyle = rgba(def.color, 0.48);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, radius + 6, 0, TAU);
      ctx.stroke();
      drawPickupGlyph(pickup.type, pickup.x, pickup.y, radius, pickup.angle);
    }
  }

  function drawParticles() {
    for (const p of state.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.strokeStyle = rgba(p.color, alpha * 0.85);
      ctx.fillStyle = rgba(p.color, alpha * 0.85);
      if (p.streak) {
        ctx.lineWidth = Math.max(0.5, p.size * alpha);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else {
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }

    for (const w of state.waves) {
      const alpha = 1 - w.radius / w.maxRadius;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = w.width;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    const shakeX = state.shake > 0 ? rand(-3, 3) * state.shake : 0;
    const shakeY = state.shake > 0 ? rand(-3, 3) * state.shake : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBackground();
    drawObstacles();
    drawPickups();
    drawParticles();
    drawPlayer();
    ctx.restore();

    if (state.flash > 0) {
      const gradient = ctx.createLinearGradient(0, 0, state.width, state.height);
      gradient.addColorStop(0, `rgba(255,79,189,${state.flash * 0.12})`);
      gradient.addColorStop(1, `rgba(95,231,255,${state.flash * 0.07})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, state.width, state.height);
    }
  }

  function renderLives() {
    ui.lifeReadout.replaceChildren();
    for (let i = 0; i < CONFIG.maxLives; i += 1) {
      const life = document.createElement('i');
      life.className = `life-icon${i < state.player.lives ? ' is-live' : ''}`;
      ui.lifeReadout.appendChild(life);
    }
  }

  function updateEffects() {
    const p = state.player;
    const active = [];
    if (p.effects.lucid > 0) active.push(['lucid', p.effects.lucid]);
    if (p.effects.echo > 0) active.push(['echo', p.effects.echo]);
    if (p.phaseCharge > 0) active.push(['phase', p.phaseCharge]);
    ui.effectCount.textContent = `${active.length} / 3`;

    if (!active.length) {
      ui.effectList.innerHTML = '<div class="effect-empty"><span class="empty-glyph"><svg viewBox="0 0 24 24"><path d="M5 12c2-4 5-4 7 0s5 4 7 0-5-4-7 0-5 4-7 0z"/></svg></span><p>Collect rare nodes to bend the flow.</p></div>';
      return;
    }

    ui.effectList.innerHTML = active.map(([type, remaining]) => {
      const def = POWER_DEFS[type];
      const time = type === 'phase' ? `×${remaining}` : `${remaining.toFixed(1)}s`;
      return `<div class="effect-row" style="--effect-color:${def.color}"><i>${def.svg}</i><span><strong>${def.name}</strong><small>${def.subtitle}</small></span><time>${time}</time></div>`;
    }).join('');
  }

  function updateUi(force) {
    const p = state.player;
    if (!p) return;
    const score = force ? state.score : state.displayScore;
    ui.score.textContent = formatScore(score);
    ui.time.textContent = formatTime(state.elapsed);
    ui.chain.textContent = `×${p.chain.toFixed(1)}`;
    ui.peak.textContent = formatScore(Math.max(state.highScore, state.score));
    ui.highScore.textContent = formatScore(Math.max(state.highScore, state.score));
    const delta = state.highScore > 0 ? ((state.score / state.highScore) * 100) : 0;
    ui.scoreDelta.textContent = `${delta >= 100 ? '+' : ''}${delta.toFixed(1)}%`;

    const resonance = Math.round(p.energy);
    ui.resonance.textContent = `${resonance}%`;
    [...ui.resonanceMeter.children].forEach((segment, i) => segment.classList.toggle('is-active', resonance >= (i + 1) * 12.5));
    ui.chainState.textContent = resonance > 82 ? 'SURGING' : resonance > 48 ? 'LOCKED' : resonance > 12 ? 'WARM' : 'QUIET';

    ui.focusBar.style.width = `${p.focus}%`;
    ui.focusValue.textContent = String(Math.round(p.focus));
    const focusing = isFocusing();
    ui.modeValue.textContent = focusing ? 'FOCUS' : 'CRUISE';
    ui.modeReadout.classList.toggle('is-focus', focusing);

    const density = Math.round(clamp(state.obstacles.length / 28, 0, 1) * 100);
    ui.density.textContent = `${density}%`;
    const speedRatio = (state.worldSpeed - CONFIG.baseWorldSpeed) / (CONFIG.maxWorldSpeed - CONFIG.baseWorldSpeed);
    ui.flow.textContent = speedRatio > 0.72 ? 'HIGH' : speedRatio > 0.34 ? 'MID' : 'LOW';
    ui.fieldStatus.textContent = p.effects.lucid > 0 ? 'LUCID' : density > 72 ? 'DENSE' : 'FLOWING';
    ui.gates.textContent = String(state.gates);
    updateEffects();
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width * state.width, 0, state.width),
      y: clamp((event.clientY - rect.top) / rect.height * state.height, 0, state.height)
    };
  }

  function startFromSplash() {
    if (state.mode !== 'idle') return;
    ui.startScreen.classList.add('is-leaving');
    window.setTimeout(() => ui.startScreen.remove(), 430);
    startGame();
  }

  ui.startButton.addEventListener('click', startFromSplash);
  ui.launchButton.addEventListener('click', startGame);
  ui.menuButton.addEventListener('click', () => togglePause());
  ui.soundButton.addEventListener('click', () => {
    audio.muted = !audio.muted;
    ui.soundButton.classList.toggle('is-muted', audio.muted);
    if (!audio.muted) audio.ensure();
  });

  canvas.addEventListener('pointermove', event => {
    const point = pointerPosition(event);
    state.pointer.x = point.x;
    state.pointer.y = point.y;
    state.pointer.active = true;
  });
  canvas.addEventListener('pointerdown', event => {
    const point = pointerPosition(event);
    state.pointer.x = point.x;
    state.pointer.y = point.y;
    state.pointer.active = true;
    state.pointer.down = true;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointerup', event => {
    state.pointer.down = false;
    canvas.releasePointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointercancel', () => { state.pointer.down = false; });
  canvas.addEventListener('pointerleave', () => { state.pointer.down = false; });

  window.addEventListener('keydown', event => {
    state.keys.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'Space') togglePause();
    if (event.code === 'Enter' && state.mode === 'idle') startFromSplash();
    if (event.code === 'Enter' && state.mode === 'gameover') startGame();
  });
  window.addEventListener('keyup', event => state.keys.delete(event.code));
  window.addEventListener('blur', () => {
    state.keys.clear();
    state.pointer.down = false;
    if (state.mode === 'running') togglePause(true);
  });
  window.addEventListener('resize', resize);

  function loop(timestamp) {
    const dt = Math.min(0.033, Math.max(0, (timestamp - state.lastTime) / 1000));
    state.lastTime = timestamp;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  resize();
  state.player = createPlayer();
  renderLives();
  updateUi(true);
  requestAnimationFrame(loop);
})();
