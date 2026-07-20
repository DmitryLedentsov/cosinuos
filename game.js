(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const COLORS = {
    bg: '#000000',
    white: '#f7f8fc',
    cyan: '#5fe7ff',
    blue: '#4c72ff',
    violet: '#9b67ff',
    pink: '#ff4fbd',
    amber: '#ffb34d',
    green: '#72efaa',
    red: '#ff5f75'
  };

  const POWER_DEFS = {
    lucid: { name: 'LUCID', subtitle: 'field slows', icon: '≈', color: COLORS.cyan, duration: 6.5 },
    echo: { name: 'ECHO', subtitle: 'graze value ×2', icon: '∞', color: COLORS.pink, duration: 8.5 },
    phase: { name: 'PHASE', subtitle: 'one safe contact', icon: '◇', color: COLORS.violet, duration: 0 },
    bloom: { name: 'BLOOM', subtitle: 'clears nearby noise', icon: '✦', color: COLORS.amber, duration: 0 }
  };

  const CONFIG = {
    initialLives: 3,
    maxLives: 4,
    playerRadius: 4.3,
    normalSpeed: 345,
    focusSpeed: 158,
    acceleration: 11.5,
    focusDrain: 24,
    focusRegen: 15,
    enemyCap: 74,
    particleCap: 420,
    pickupInterval: [8.5, 13],
    grazeMargin: 17,
    invulnerableTime: 1.3
  };

  const canvas = document.querySelector('#world');
  const arenaShell = document.querySelector('#arenaShell');
  const ctx = canvas.getContext('2d', { alpha: false });

  const ui = {
    appShell: document.querySelector('#appShell'),
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
    chainState: document.querySelector('#chainState'),
    resonance: document.querySelector('#resonanceValue'),
    resonanceMeter: document.querySelector('#resonanceMeter'),
    fieldStatus: document.querySelector('#fieldStatus'),
    density: document.querySelector('#densityValue'),
    flow: document.querySelector('#flowValue'),
    grazes: document.querySelector('#grazeValue'),
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
  const choose = array => array[Math.floor(Math.random() * array.length)];
  const formatScore = value => Math.floor(value).toString().padStart(6, '0');
  const formatTime = seconds => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  const rgba = (hex, alpha) => {
    const value = hex.slice(1);
    const n = Number.parseInt(value, 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  };
  const distSq = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };
  const storage = {
    get(key, fallback = 0) {
      try { return Number(localStorage.getItem(key) ?? fallback); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, String(value)); } catch { /* ignored */ }
    }
  };

  function distancePointToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const lenSq = abx * abx + aby * aby || 1;
    const t = clamp((apx * abx + apy * aby) / lenSq, 0, 1);
    const x = ax + abx * t;
    const y = ay + aby * t;
    return Math.hypot(px - x, py - y);
  }

  class AudioBus {
    constructor() {
      this.context = null;
      this.muted = false;
      this.master = null;
    }

    ensure() {
      if (this.context || this.muted) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.context = new AC();
      this.master = this.context.createGain();
      this.master.gain.value = 0.65;
      this.master.connect(this.context.destination);
    }

    tone(freq, duration = 0.1, type = 'sine', gain = 0.02, end = freq) {
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

    graze(chain) {
      if (Math.random() > 0.18) return;
      this.tone(260 + chain * 24, 0.05, 'sine', 0.008, 310 + chain * 28);
    }

    pickup(type) {
      const base = { lucid: 420, echo: 580, phase: 690, bloom: 330 }[type] || 480;
      this.tone(base, 0.16, 'triangle', 0.028, base * 1.65);
      setTimeout(() => this.tone(base * 1.25, 0.14, 'sine', 0.018, base * 2), 45);
    }

    hit() { this.tone(120, 0.22, 'sawtooth', 0.036, 46); }
    over() { this.tone(180, 0.55, 'triangle', 0.03, 42); }
  }

  const audio = new AudioBus();

  const state = {
    mode: 'idle',
    width: 0,
    height: 0,
    dpr: 1,
    now: 0,
    lastTime: performance.now(),
    elapsed: 0,
    score: 0,
    displayScore: 0,
    highScore: storage.get('cosinuos-v3-high-score', 0),
    peakChain: 1,
    grazes: 0,
    difficulty: 1,
    spawnTimer: 0,
    pickupTimer: 7,
    screenPulse: 0,
    slowTime: 0,
    fpsTimer: 0,
    fpsFrames: 0,
    fps: 60,
    toastTimer: 0,
    uiTimer: 0,
    hitStop: 0,
    pointer: { x: 0, y: 0, active: false, down: false },
    keys: new Set(),
    player: null,
    hazards: [],
    pickups: [],
    particles: [],
    ripples: [],
    backgroundPoints: []
  };

  function createPlayer() {
    return {
      x: state.width * 0.5,
      y: state.height * 0.57,
      vx: 0,
      vy: 0,
      targetX: state.width * 0.5,
      targetY: state.height * 0.57,
      radius: CONFIG.playerRadius,
      lives: CONFIG.initialLives,
      focus: 100,
      chain: 1,
      chainEnergy: 0,
      chainHold: 0,
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
    const margin = 18;
    state.player.x = clamp(state.player.x, margin, state.width - margin);
    state.player.y = clamp(state.player.y, margin, state.height - margin);
    state.player.targetX = clamp(state.player.targetX, margin, state.width - margin);
    state.player.targetY = clamp(state.player.targetY, margin, state.height - margin);

    const count = Math.ceil((state.width * state.height) / 38000);
    state.backgroundPoints = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: rand(0.5, 1.5),
      phase: rand(0, TAU)
    }));
  }

  function resetGame() {
    state.elapsed = 0;
    state.score = 0;
    state.displayScore = 0;
    state.peakChain = 1;
    state.grazes = 0;
    state.difficulty = 1;
    state.spawnTimer = 1.1;
    state.pickupTimer = rand(6.5, 9);
    state.screenPulse = 0;
    state.slowTime = 0;
    state.hitStop = 0;
    state.uiTimer = 0;
    state.hazards.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.ripples.length = 0;
    state.player = createPlayer();
    state.pointer.x = state.player.x;
    state.pointer.y = state.player.y;
    state.pointer.active = false;

    for (let i = 0; i < 7; i += 1) {
      spawnHazard();
      const hazard = state.hazards[state.hazards.length - 1];
      hazard.x = rand(28, state.width - 28);
      hazard.y = rand(28, state.height - 28);
      if (Math.hypot(hazard.x - state.player.x, hazard.y - state.player.y) < 145) {
        hazard.x = hazard.x < state.width * 0.5 ? 24 : state.width - 24;
        hazard.y = rand(28, state.height - 28);
      }
    }

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
    storage.set('cosinuos-v3-high-score', state.highScore);
    audio.over();
    ui.overlayEyebrow.textContent = 'RUN COMPLETE / SIGNAL STORED';
    ui.overlayTitle.innerHTML = 'The field closed.<br>Your line remains.';
    ui.overlayCopy.textContent = 'Precision builds slowly. Return to the curve and hold the chain a little longer.';
    ui.finalScore.textContent = formatScore(state.score);
    ui.finalChain.textContent = `×${state.peakChain.toFixed(1)}`;
    ui.finalGrazes.textContent = String(state.grazes);
    ui.finalStats.hidden = false;
    ui.launchLabel.textContent = 'TRACE AGAIN';
    ui.overlay.classList.add('is-visible');
    updateUi(true);
  }

  function togglePause(force) {
    if (state.mode !== 'running' && state.mode !== 'paused') return;
    const pause = typeof force === 'boolean' ? force : state.mode === 'running';
    state.mode = pause ? 'paused' : 'running';
    ui.pausePill.hidden = !pause;
    state.lastTime = performance.now();
  }

  function edgeSpawn(margin = 24) {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return { x: rand(margin, state.width - margin), y: -margin, edge: 'top' };
    if (side === 1) return { x: state.width + margin, y: rand(margin, state.height - margin), edge: 'right' };
    if (side === 2) return { x: rand(margin, state.width - margin), y: state.height + margin, edge: 'bottom' };
    return { x: -margin, y: rand(margin, state.height - margin), edge: 'left' };
  }

  function velocityTowardField(spawn, speed) {
    const target = {
      x: state.width * rand(0.28, 0.72),
      y: state.height * rand(0.28, 0.72)
    };
    const dx = target.x - spawn.x;
    const dy = target.y - spawn.y;
    const len = Math.hypot(dx, dy) || 1;
    return { vx: dx / len * speed, vy: dy / len * speed };
  }

  function spawnHazard() {
    if (state.hazards.length >= CONFIG.enemyCap) return;
    const roll = Math.random();
    const spawn = edgeSpawn(28);
    const baseSpeed = rand(34, 52) * (1 + state.difficulty * 0.08);
    const velocity = velocityTowardField(spawn, baseSpeed);

    if (roll < 0.48) {
      state.hazards.push({
        kind: 'mote',
        x: spawn.x,
        y: spawn.y,
        vx: velocity.vx,
        vy: velocity.vy,
        radius: rand(2.4, 4.4),
        phase: rand(0, TAU),
        wobble: rand(8, 20),
        hue: choose([COLORS.pink, COLORS.cyan, COLORS.violet, COLORS.amber]),
        age: 0,
        grazed: false,
        grazeCooldown: 0
      });
      return;
    }

    if (roll < 0.78) {
      state.hazards.push({
        kind: 'weaver',
        x: spawn.x,
        y: spawn.y,
        vx: velocity.vx * 0.86,
        vy: velocity.vy * 0.86,
        radius: 3.4,
        length: rand(18, 34),
        angle: rand(0, TAU),
        spin: rand(-1.2, 1.2),
        hue: choose([COLORS.cyan, COLORS.violet, COLORS.pink]),
        age: 0,
        grazed: false,
        grazeCooldown: 0
      });
      return;
    }

    state.hazards.push({
      kind: 'ripple',
      x: spawn.x,
      y: spawn.y,
      vx: velocity.vx * 0.58,
      vy: velocity.vy * 0.58,
      radius: rand(12, 22),
      expansion: rand(10, 18),
      thickness: 1.6,
      maxRadius: rand(52, 84),
      hue: choose([COLORS.amber, COLORS.violet, COLORS.cyan]),
      age: 0,
      grazed: false,
      grazeCooldown: 0
    });
  }

  function spawnPickup() {
    if (state.pickups.length >= 2) return;
    const type = choose(Object.keys(POWER_DEFS));
    const spawn = edgeSpawn(26);
    const velocity = velocityTowardField(spawn, rand(25, 36));
    state.pickups.push({
      type,
      x: spawn.x,
      y: spawn.y,
      vx: velocity.vx,
      vy: velocity.vy,
      radius: 7,
      angle: rand(0, TAU),
      age: 0,
      ttl: 18
    });
  }

  function addParticles(x, y, color, amount = 18, energy = 80) {
    const count = Math.min(amount, CONFIG.particleCap - state.particles.length);
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, TAU);
      const speed = rand(energy * 0.18, energy);
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rand(0.28, 0.72),
        maxLife: 0.72,
        size: rand(0.8, 2.2),
        color,
        line: Math.random() < 0.72
      });
    }
  }

  function addRipple(x, y, color, maxRadius = 80, width = 1.5) {
    state.ripples.push({ x, y, radius: 0, maxRadius, speed: maxRadius / 0.55, color, width });
  }

  function grazeHazard(hazard, strength = 1) {
    if (hazard.grazeCooldown > 0) return;
    hazard.grazeCooldown = 0.18;
    const player = state.player;
    const echo = player.effects.echo > 0 ? 2 : 1;
    const focusBonus = isFocusing() ? 1.35 : 1;
    const gain = (6 + player.chain * 2.2) * echo * focusBonus * strength;
    state.score += gain;
    player.chainEnergy = clamp(player.chainEnergy + 4.4 * strength, 0, 100);
    player.chainHold = 2.3;
    player.chain = 1 + player.chainEnergy / 22;
    state.peakChain = Math.max(state.peakChain, player.chain * echo);
    state.grazes += 1;
    audio.graze(player.chain);
    if (Math.random() < 0.28) addParticles(player.x, player.y, hazard.hue, 3, 22);
  }

  function isFocusing() {
    return (state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') || state.pointer.down) && state.player.focus > 1;
  }

  function hazardDistance(hazard, player) {
    if (hazard.kind === 'mote') {
      return Math.hypot(player.x - hazard.x, player.y - hazard.y) - hazard.radius;
    }
    if (hazard.kind === 'weaver') {
      const dx = Math.cos(hazard.angle) * hazard.length * 0.5;
      const dy = Math.sin(hazard.angle) * hazard.length * 0.5;
      return distancePointToSegment(player.x, player.y, hazard.x - dx, hazard.y - dy, hazard.x + dx, hazard.y + dy) - hazard.radius;
    }
    return Math.abs(Math.hypot(player.x - hazard.x, player.y - hazard.y) - hazard.radius) - hazard.thickness;
  }

  function hitPlayer(index) {
    const player = state.player;
    if (player.invulnerable > 0) return;
    if (player.phaseCharge > 0) {
      player.phaseCharge -= 1;
      destroyHazard(index, COLORS.violet, 24);
      addRipple(player.x, player.y, COLORS.violet, 76, 2);
      showToast('phase');
      return;
    }

    player.lives -= 1;
    player.invulnerable = CONFIG.invulnerableTime;
    player.chain = 1;
    player.chainEnergy = 0;
    player.chainHold = 0;
    state.screenPulse = 1;
    state.hitStop = 0.085;
    audio.hit();
    addParticles(player.x, player.y, COLORS.red, 36, 145);
    addRipple(player.x, player.y, COLORS.red, 108, 2);
    state.hazards.splice(index, 1);
    renderLives();
    if (player.lives <= 0) finishGame();
  }

  function destroyHazard(index, color, particles = 10) {
    const h = state.hazards[index];
    if (!h) return;
    addParticles(h.x, h.y, color || h.hue, particles, 85);
    state.hazards.splice(index, 1);
  }

  function applyPickup(type, pickup) {
    const player = state.player;
    const def = POWER_DEFS[type];
    audio.pickup(type);
    addParticles(pickup.x, pickup.y, def.color, 28, 125);
    addRipple(pickup.x, pickup.y, def.color, 92, 2);
    showToast(type);
    state.score += 180 * player.chain;
    player.chainEnergy = clamp(player.chainEnergy + 16, 0, 100);
    player.chainHold = 3;

    if (type === 'lucid') {
      player.effects.lucid = def.duration;
      player.focus = 100;
    } else if (type === 'echo') {
      player.effects.echo = def.duration;
    } else if (type === 'phase') {
      player.phaseCharge = Math.min(2, player.phaseCharge + 1);
    } else if (type === 'bloom') {
      const max = 150;
      for (let i = state.hazards.length - 1; i >= 0; i -= 1) {
        const h = state.hazards[i];
        if (Math.hypot(h.x - player.x, h.y - player.y) < max) {
          state.score += 32 * player.chain;
          destroyHazard(i, def.color, 8);
        }
      }
      addRipple(player.x, player.y, def.color, max, 3);
    }
  }

  function showToast(type) {
    const def = POWER_DEFS[type];
    ui.pickupToast.hidden = false;
    ui.pickupToast.style.setProperty('--effect-color', def.color);
    ui.pickupIcon.textContent = def.icon;
    ui.pickupName.textContent = def.name;
    ui.pickupDescription.textContent = def.subtitle.toUpperCase();
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

    const speed = focusing ? CONFIG.focusSpeed : CONFIG.normalSpeed;
    if (ix || iy) {
      const len = Math.hypot(ix, iy) || 1;
      p.targetX += ix / len * speed * dt;
      p.targetY += iy / len * speed * dt;
    } else if (state.pointer.active) {
      p.targetX = state.pointer.x;
      p.targetY = state.pointer.y;
    }

    p.targetX = clamp(p.targetX, 14, state.width - 14);
    p.targetY = clamp(p.targetY, 14, state.height - 14);
    const desiredVx = (p.targetX - p.x) * (focusing ? 5.2 : 7.6);
    const desiredVy = (p.targetY - p.y) * (focusing ? 5.2 : 7.6);
    const maxSpeed = speed;
    const desiredLen = Math.hypot(desiredVx, desiredVy) || 1;
    const scale = Math.min(1, maxSpeed / desiredLen);
    const easing = 1 - Math.exp(-CONFIG.acceleration * dt);
    p.vx = lerp(p.vx, desiredVx * scale, easing);
    p.vy = lerp(p.vy, desiredVy * scale, easing);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = clamp(p.x, 10, state.width - 10);
    p.y = clamp(p.y, 10, state.height - 10);

    if (focusing) p.focus = Math.max(0, p.focus - CONFIG.focusDrain * dt);
    else p.focus = Math.min(100, p.focus + CONFIG.focusRegen * dt);

    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.chainHold = Math.max(0, p.chainHold - dt);
    if (p.chainHold <= 0) {
      p.chainEnergy = Math.max(0, p.chainEnergy - dt * 10);
      p.chain = 1 + p.chainEnergy / 22;
    }
    for (const key of Object.keys(p.effects)) p.effects[key] = Math.max(0, p.effects[key] - dt);

    p.trailTimer += dt;
    if (p.trailTimer >= 0.018) {
      p.trailTimer = 0;
      p.trail.push({ x: p.x, y: p.y, focus: focusing });
      if (p.trail.length > 56) p.trail.shift();
    }
  }

  function updateHazards(dt) {
    const p = state.player;
    const slow = p.effects.lucid > 0 ? 0.48 : 1;
    for (let i = state.hazards.length - 1; i >= 0; i -= 1) {
      const h = state.hazards[i];
      h.age += dt;
      h.grazeCooldown = Math.max(0, h.grazeCooldown - dt);
      if (h.kind === 'mote') {
        h.x += (h.vx + Math.sin(h.phase + h.age * 1.25) * h.wobble) * dt * slow;
        h.y += (h.vy + Math.cos(h.phase * 0.7 + h.age) * h.wobble * 0.42) * dt * slow;
      } else if (h.kind === 'weaver') {
        h.x += h.vx * dt * slow;
        h.y += h.vy * dt * slow;
        h.angle += h.spin * dt * slow;
      } else {
        h.x += h.vx * dt * slow;
        h.y += h.vy * dt * slow;
        h.radius += h.expansion * dt * slow;
        if (h.radius > h.maxRadius) h.radius = 10;
      }

      const distance = hazardDistance(h, p);
      if (distance < p.radius + 0.8) {
        hitPlayer(i);
        if (state.mode !== 'running') return;
        continue;
      }
      if (distance < p.radius + CONFIG.grazeMargin) {
        const strength = 1 - clamp((distance - p.radius) / CONFIG.grazeMargin, 0, 1);
        grazeHazard(h, 0.7 + strength * 0.7);
      }

      if (h.x < -120 || h.x > state.width + 120 || h.y < -120 || h.y > state.height + 120 || h.age > 25) {
        state.hazards.splice(i, 1);
      }
    }
  }

  function updatePickups(dt) {
    const p = state.player;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      pickup.age += dt;
      pickup.angle += dt * 0.72;
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
      if (distSq(pickup, p) < (pickup.radius + p.radius + 3) ** 2) {
        applyPickup(pickup.type, pickup);
        state.pickups.splice(i, 1);
        continue;
      }
      if (pickup.age > pickup.ttl || pickup.x < -60 || pickup.x > state.width + 60 || pickup.y < -60 || pickup.y > state.height + 60) {
        state.pickups.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      p.vx *= Math.exp(-2.2 * dt);
      p.vy *= Math.exp(-2.2 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.ripples.length - 1; i >= 0; i -= 1) {
      const r = state.ripples[i];
      r.radius += r.speed * dt;
      if (r.radius >= r.maxRadius) state.ripples.splice(i, 1);
    }
  }

  function update(dt) {
    state.now += dt;
    state.screenPulse = Math.max(0, state.screenPulse - dt * 2.6);
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

    if (state.mode !== 'running') return;
    if (state.hitStop > 0) {
      state.hitStop -= dt;
      return;
    }

    state.elapsed += dt;
    state.difficulty = 1 + state.elapsed / 52;
    const p = state.player;
    const survival = 8.5 + state.difficulty * 1.5;
    state.score += survival * dt * p.chain;
    state.displayScore = lerp(state.displayScore, state.score, 1 - Math.exp(-7 * dt));

    updatePlayer(dt);

    state.spawnTimer -= dt;
    const interval = clamp(1.02 - state.difficulty * 0.075, 0.38, 0.98);
    if (state.spawnTimer <= 0) {
      state.spawnTimer += interval;
      spawnHazard();
      if (state.difficulty > 2.6 && Math.random() < 0.14) spawnHazard();
    }

    state.pickupTimer -= dt;
    if (state.pickupTimer <= 0) {
      spawnPickup();
      state.pickupTimer = rand(...CONFIG.pickupInterval);
    }

    updateHazards(dt);
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

    const glowA = ctx.createRadialGradient(state.width * 0.18, state.height * 0.82, 0, state.width * 0.18, state.height * 0.82, state.width * 0.45);
    glowA.addColorStop(0, 'rgba(80, 64, 255, 0.055)');
    glowA.addColorStop(1, 'rgba(80, 64, 255, 0)');
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, state.width, state.height);

    const glowB = ctx.createRadialGradient(state.width * 0.78, state.height * 0.2, 0, state.width * 0.78, state.height * 0.2, state.width * 0.34);
    glowB.addColorStop(0, 'rgba(255, 76, 181, 0.045)');
    glowB.addColorStop(1, 'rgba(255, 76, 181, 0)');
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.lineWidth = 0.7;
    for (let band = 0; band < 7; band += 1) {
      const color = [COLORS.cyan, COLORS.blue, COLORS.violet, COLORS.pink, COLORS.amber][band % 5];
      ctx.strokeStyle = rgba(color, 0.075 + (band % 2) * 0.025);
      ctx.beginPath();
      const baseY = state.height * (0.18 + band * 0.105);
      for (let x = -12; x <= state.width + 12; x += 10) {
        const y = baseY
          + Math.sin(x * 0.009 + state.now * (0.18 + band * 0.012) + band * 0.6) * (18 + band * 1.5)
          + Math.sin(x * 0.021 - state.now * 0.14 + band) * 5;
        if (x === -12) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    for (const point of state.backgroundPoints) {
      const alpha = 0.05 + (Math.sin(state.now * 0.7 + point.phase) + 1) * 0.025;
      ctx.fillStyle = `rgba(220,228,255,${alpha})`;
      ctx.fillRect(point.x * state.width, point.y * state.height, point.size, point.size);
    }
  }

  function drawTrail() {
    const trail = state.player.trail;
    if (trail.length < 2) return;
    const p = state.player;
    for (let pass = 0; pass < 2; pass += 1) {
      ctx.beginPath();
      for (let i = 0; i < trail.length; i += 1) {
        const point = trail[i];
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = pass === 0 ? 7 : 1;
      ctx.strokeStyle = pass === 0 ? 'rgba(95,231,255,0.045)' : rgba(p.effects.echo > 0 ? COLORS.pink : COLORS.cyan, 0.55);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    const p = state.player;
    const blink = p.invulnerable > 0 && Math.floor(p.invulnerable * 14) % 2 === 0;
    if (blink) return;
    drawTrail();

    const focus = isFocusing();
    const color = focus ? COLORS.violet : COLORS.cyan;
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 26);
    halo.addColorStop(0, rgba(color, 0.28));
    halo.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(p.x - 26, p.y - 26, 52, 52);

    ctx.strokeStyle = rgba(color, 0.48);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius + 6 + Math.sin(state.now * 3) * 1.2, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = COLORS.white;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, TAU);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x + 0.6, p.y - 0.6, p.radius * 0.55, 0, TAU);
    ctx.fill();

    if (p.phaseCharge > 0) {
      ctx.strokeStyle = rgba(COLORS.violet, 0.7);
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 13, state.now, state.now + TAU * 0.84);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawMote(h) {
    const glow = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.radius * 5.5);
    glow.addColorStop(0, rgba(h.hue, 0.3));
    glow.addColorStop(1, rgba(h.hue, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(h.x - h.radius * 6, h.y - h.radius * 6, h.radius * 12, h.radius * 12);
    ctx.fillStyle = h.hue;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.44);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.radius + 3, 0, TAU);
    ctx.stroke();
  }

  function drawWeaver(h) {
    const dx = Math.cos(h.angle) * h.length * 0.5;
    const dy = Math.sin(h.angle) * h.length * 0.5;
    const ax = h.x - dx;
    const ay = h.y - dy;
    const bx = h.x + dx;
    const by = h.y + dy;
    const gradient = ctx.createLinearGradient(ax, ay, bx, by);
    gradient.addColorStop(0, rgba(h.hue, 0));
    gradient.addColorStop(0.25, rgba(h.hue, 0.65));
    gradient.addColorStop(0.75, rgba(COLORS.white, 0.42));
    gradient.addColorStop(1, rgba(h.hue, 0));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    for (const [x, y] of [[ax, ay], [bx, by]]) {
      ctx.fillStyle = h.hue;
      ctx.beginPath();
      ctx.arc(x, y, h.radius, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(h.hue, 0.45);
      ctx.beginPath();
      ctx.arc(x, y, h.radius + 3.5, 0, TAU);
      ctx.stroke();
    }
  }

  function drawRippleHazard(h) {
    ctx.strokeStyle = rgba(h.hue, 0.62);
    ctx.lineWidth = h.thickness;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.radius, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = rgba(h.hue, 0.12);
    ctx.lineWidth = 8;
    ctx.stroke();
    const marker = h.radius * 0.7;
    ctx.fillStyle = h.hue;
    ctx.fillRect(h.x + Math.cos(state.now + h.age) * marker - 1, h.y + Math.sin(state.now + h.age) * marker - 1, 2, 2);
  }

  function drawHazards() {
    for (const h of state.hazards) {
      if (h.kind === 'mote') drawMote(h);
      else if (h.kind === 'weaver') drawWeaver(h);
      else drawRippleHazard(h);
    }
  }

  function drawPickupIcon(type, x, y, radius, rotation) {
    const def = POWER_DEFS[type];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.strokeStyle = def.color;
    ctx.fillStyle = rgba(def.color, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (type === 'lucid') {
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-radius * 0.7, 1);
      ctx.bezierCurveTo(-radius * 0.2, -5, radius * 0.2, 5, radius * 0.7, -1);
      ctx.stroke();
    } else if (type === 'echo') {
      ctx.arc(-3, 0, radius * 0.62, -Math.PI * 0.55, Math.PI * 0.55);
      ctx.arc(3, 0, radius * 0.62, Math.PI * 0.45, Math.PI * 1.55);
      ctx.stroke();
    } else if (type === 'phase') {
      ctx.moveTo(0, -radius);
      ctx.lineTo(radius, 0);
      ctx.lineTo(0, radius);
      ctx.lineTo(-radius, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      for (let i = 0; i < 8; i += 1) {
        const a = i * TAU / 8;
        const r = i % 2 === 0 ? radius : radius * 0.42;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPickups() {
    for (const p of state.pickups) {
      const def = POWER_DEFS[p.type];
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 28);
      glow.addColorStop(0, rgba(def.color, 0.2));
      glow.addColorStop(1, rgba(def.color, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - 28, p.y - 28, 56, 56);
      drawPickupIcon(p.type, p.x, p.y, p.radius, p.angle);
      ctx.strokeStyle = rgba(def.color, 0.28);
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 13 + Math.sin(state.now * 2.4) * 1.5, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawParticles() {
    for (const p of state.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.color;
      if (p.line) {
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.028, p.y - p.vy * 0.028);
        ctx.stroke();
      } else {
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRipples() {
    for (const r of state.ripples) {
      const alpha = 1 - r.radius / r.maxRadius;
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.08;
      ctx.lineWidth = r.width * 7;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    drawBackground();
    drawRipples();
    drawPickups();
    drawHazards();
    drawPlayer();
    drawParticles();

    if (state.screenPulse > 0) {
      const gradient = ctx.createRadialGradient(state.player.x, state.player.y, 0, state.player.x, state.player.y, state.width * 0.65);
      gradient.addColorStop(0, `rgba(255,95,117,${state.screenPulse * 0.12})`);
      gradient.addColorStop(1, 'rgba(255,95,117,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, state.width, state.height);
    }
  }

  function renderLives() {
    ui.lifeReadout.replaceChildren();
    for (let i = 0; i < CONFIG.maxLives; i += 1) {
      const dot = document.createElement('i');
      if (i < state.player.lives) dot.classList.add('is-live');
      ui.lifeReadout.append(dot);
    }
    ui.lifeReadout.setAttribute('aria-label', `${state.player.lives} lives`);
  }

  function renderEffects() {
    const entries = [];
    const p = state.player;
    if (p.effects.lucid > 0) entries.push(['lucid', p.effects.lucid]);
    if (p.effects.echo > 0) entries.push(['echo', p.effects.echo]);
    if (p.phaseCharge > 0) entries.push(['phase', p.phaseCharge]);
    ui.effectCount.textContent = `${entries.length} / 3`;

    if (!entries.length) {
      ui.effectList.innerHTML = '<div class="effect-empty"><span class="empty-glyph">∞</span><p>Collect rare nodes to bend the field.</p></div>';
      return;
    }

    ui.effectList.replaceChildren();
    for (const [type, value] of entries) {
      const def = POWER_DEFS[type];
      const row = document.createElement('div');
      row.className = 'effect-row';
      row.style.setProperty('--effect', def.color);
      const progress = type === 'phase' ? Math.min(1, value / 2) : clamp(value / def.duration, 0, 1);
      row.style.setProperty('--progress', progress.toFixed(3));
      row.innerHTML = `<i>${def.icon}</i><span><strong>${def.name}</strong><small>${def.subtitle}</small></span><time>${type === 'phase' ? `×${value}` : `${value.toFixed(1)}s`}</time>`;
      ui.effectList.append(row);
    }
  }

  function updateUi(force) {
    const p = state.player;
    if (!p) return;
    const value = force ? state.score : state.displayScore;
    const delta = state.highScore > 0 ? ((value / state.highScore) * 100) : 0;
    ui.score.textContent = formatScore(value);
    ui.scoreDelta.textContent = `+${delta.toFixed(1)}%`;
    ui.time.textContent = formatTime(state.elapsed);
    ui.chain.textContent = `×${p.chain.toFixed(1)}`;
    ui.peak.textContent = formatScore(state.highScore);
    ui.highScore.textContent = formatScore(state.highScore);
    ui.resonance.textContent = `${Math.round(p.chainEnergy)}%`;
    ui.chainState.textContent = p.chainEnergy < 12 ? 'QUIET' : p.chainEnergy < 44 ? 'OPEN' : p.chainEnergy < 78 ? 'ALIVE' : 'LUCID';
    [...ui.resonanceMeter.children].forEach((segment, index) => segment.classList.toggle('is-active', index < Math.ceil(p.chainEnergy / 12.5)));

    ui.focusBar.style.width = `${p.focus}%`;
    ui.focusValue.textContent = String(Math.round(p.focus));
    const focusing = isFocusing();
    ui.modeReadout.classList.toggle('is-focus', focusing);
    ui.modeValue.textContent = focusing ? 'FOCUS MODE' : 'DRIFT MODE';

    const density = Math.round(clamp(state.hazards.length / 42, 0, 1) * 100);
    ui.density.textContent = `${density}%`;
    ui.fieldStatus.textContent = density < 24 ? 'CALM' : density < 54 ? 'FLOWING' : density < 78 ? 'DENSE' : 'SATURATED';
    ui.flow.textContent = density < 35 ? 'LOW' : density < 70 ? 'MID' : 'HIGH';
    ui.grazes.textContent = String(state.grazes);
    renderEffects();
  }

  function frame(now) {
    const dt = Math.min(0.033, Math.max(0, (now - state.lastTime) / 1000));
    state.lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function mapPointer(event) {
    const rect = canvas.getBoundingClientRect();
    state.pointer.x = clamp(event.clientX - rect.left, 0, rect.width) * state.width / rect.width;
    state.pointer.y = clamp(event.clientY - rect.top, 0, rect.height) * state.height / rect.height;
    state.pointer.active = true;
  }

  function updateParallax(event) {
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;
    ui.appShell.style.setProperty('--parallax-x', `${x * 10}px`);
    ui.appShell.style.setProperty('--parallax-y', `${y * 8}px`);
  }

  function bindEvents() {
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', updateParallax, { passive: true });
    canvas.addEventListener('pointermove', mapPointer, { passive: true });
    canvas.addEventListener('pointerdown', event => {
      mapPointer(event);
      state.pointer.down = true;
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointerup', () => { state.pointer.down = false; });
    canvas.addEventListener('pointercancel', () => { state.pointer.down = false; });
    canvas.addEventListener('pointerleave', () => {
      state.pointer.down = false;
      if (!matchMedia('(pointer: coarse)').matches) state.pointer.active = false;
    });

    window.addEventListener('keydown', event => {
      if (event.code === 'Space' || event.code === 'Escape') {
        event.preventDefault();
        togglePause();
        return;
      }
      if (event.code === 'KeyM') {
        ui.soundButton.click();
        return;
      }
      state.keys.add(event.code);
    });
    window.addEventListener('keyup', event => state.keys.delete(event.code));
    window.addEventListener('blur', () => togglePause(true));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) togglePause(true);
    });

    ui.launchButton.addEventListener('click', startGame);
    ui.menuButton.addEventListener('click', () => togglePause());
    ui.soundButton.addEventListener('click', () => {
      audio.muted = !audio.muted;
      ui.soundButton.classList.toggle('is-muted', audio.muted);
      if (!audio.muted) audio.ensure();
    });
  }

  function init() {
    resize();
    bindEvents();
    renderLives();
    updateUi(true);
    requestAnimationFrame(frame);
  }

  init();
})();
