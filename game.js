(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const COLORS = {
    bg: '#07090f',
    grid: 'rgba(180, 197, 229, 0.055)',
    gridStrong: 'rgba(180, 197, 229, 0.09)',
    text: '#f4f7ff',
    cyan: '#75f7ff',
    violet: '#9a79ff',
    pink: '#ff5f9f',
    amber: '#ffc85a',
    green: '#79ffba',
    enemy: '#ff547d',
    enemyCore: '#ffd3df'
  };

  const POWER_DEFS = {
    phase: {
      name: 'PHASE',
      subtitle: 'contact immunity',
      symbol: 'Ø',
      color: COLORS.violet,
      duration: 5.5,
      weight: 24
    },
    orbit: {
      name: 'ORBIT',
      subtitle: 'three cutters',
      symbol: '◇',
      color: COLORS.amber,
      duration: 8,
      weight: 23
    },
    freeze: {
      name: 'DRIFT',
      subtitle: 'slows the field',
      symbol: '≈',
      color: COLORS.cyan,
      duration: 6.5,
      weight: 22
    },
    amplify: {
      name: 'AMPLIFY',
      subtitle: 'chain gain ×2',
      symbol: '×',
      color: COLORS.pink,
      duration: 8,
      weight: 20
    },
    pulse: {
      name: 'PULSE',
      subtitle: 'radial purge',
      symbol: '◎',
      color: COLORS.cyan,
      duration: 0,
      weight: 18
    },
    repair: {
      name: 'REPAIR',
      subtitle: '+1 integrity',
      symbol: '+',
      color: COLORS.green,
      duration: 0,
      weight: 8
    }
  };

  const CONFIG = {
    maxLives: 5,
    initialLives: 3,
    playerRadius: 10,
    pointerEase: 15,
    keyboardSpeed: 430,
    enemyCap: 150,
    enemyLinkDistance: 145,
    enemyLinkCell: 150,
    trailLength: 52,
    maxParticles: 650,
    pickupLifetime: 16,
    pickupIntervalMin: 7,
    pickupIntervalMax: 11.5,
    flowX: -72,
    flowY: 61
  };

  const canvas = document.querySelector('#world');
  const ctx = canvas.getContext('2d', { alpha: false });

  const ui = {
    score: document.querySelector('#scoreValue'),
    multiplier: document.querySelector('#multiplierValue'),
    highScore: document.querySelector('#highScoreValue'),
    lives: document.querySelector('#livesValue'),
    flow: document.querySelector('#flowValue'),
    effects: document.querySelector('#effectStack'),
    overlay: document.querySelector('#overlay'),
    overlayKicker: document.querySelector('#overlayKicker'),
    overlayTitle: document.querySelector('#overlayTitle'),
    overlayCopy: document.querySelector('#overlayCopy'),
    primaryButton: document.querySelector('#primaryButton'),
    primaryButtonLabel: document.querySelector('#primaryButtonLabel'),
    runStats: document.querySelector('#runStats'),
    finalScore: document.querySelector('#finalScore'),
    finalCombo: document.querySelector('#finalCombo'),
    finalTime: document.querySelector('#finalTime'),
    pauseBadge: document.querySelector('#pauseBadge'),
    soundButton: document.querySelector('#soundButton')
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const random = (min, max) => min + Math.random() * (max - min);
  const sqrDistance = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };
  const formatScore = value => Math.floor(value).toString().padStart(6, '0');
  const formatTime = seconds => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  const withAlpha = (hex, alpha) => {
    const value = hex.replace('#', '');
    const number = Number.parseInt(value.length === 3 ? value.split('').map(char => char + char).join('') : value, 16);
    return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
  };
  const storage = {
    get(key, fallback = null) {
      try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch { /* Storage may be unavailable in sandboxed browsers. */ }
    }
  };

  class AudioBus {
    constructor() {
      this.context = null;
      this.muted = false;
    }

    ensure() {
      if (this.context || this.muted) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.context = new AudioContext();
    }

    setMuted(value) {
      this.muted = value;
      if (!value) this.ensure();
    }

    tone(frequency, duration = 0.08, type = 'sine', gain = 0.025, endFrequency = frequency) {
      if (this.muted) return;
      this.ensure();
      if (!this.context) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const volume = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), now + duration);
      volume.gain.setValueAtTime(gain, now);
      volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(volume).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    }

    pickup(type) {
      const frequencies = {
        phase: 520,
        orbit: 620,
        freeze: 410,
        amplify: 720,
        pulse: 260,
        repair: 840
      };
      const base = frequencies[type] || 520;
      this.tone(base, 0.12, 'triangle', 0.035, base * 1.55);
    }

    hit() {
      this.tone(130, 0.2, 'sawtooth', 0.04, 52);
    }

    kill() {
      this.tone(210, 0.045, 'square', 0.012, 150);
    }

    gameOver() {
      this.tone(180, 0.45, 'sawtooth', 0.045, 45);
    }
  }

  const audio = new AudioBus();

  const state = {
    mode: 'idle',
    width: 0,
    height: 0,
    dpr: 1,
    elapsed: 0,
    score: 0,
    displayScore: 0,
    highScore: Number(storage.get('cosinuos-high-score', 0) || 0),
    bestCombo: 1,
    difficulty: 1,
    spawnTimer: 0,
    pickupTimer: 3.2,
    uiTimer: 0,
    lastTime: performance.now(),
    fieldTime: 0,
    screenFlash: 0,
    shake: 0,
    nextWaveId: 1,
    pointer: { x: 0, y: 0, active: false },
    keys: new Set(),
    enemies: [],
    pickups: [],
    particles: [],
    shockwaves: [],
    floaters: [],
    backgroundNodes: [],
    player: null
  };

  function createPlayer() {
    const x = state.width * 0.42;
    const y = state.height * 0.55;
    return {
      x,
      y,
      targetX: x,
      targetY: y,
      radius: CONFIG.playerRadius,
      lives: CONFIG.initialLives,
      invulnerable: 0,
      trail: [],
      trailAccumulator: 0,
      combo: 1,
      comboTimer: 0,
      effects: {
        phase: 0,
        orbit: 0,
        freeze: 0,
        amplify: 0
      }
    };
  }

  function resize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    state.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    if (!state.player) state.player = createPlayer();
    state.player.x = clamp(state.player.x, 24, state.width - 24);
    state.player.y = clamp(state.player.y, 24, state.height - 24);
    state.player.targetX = clamp(state.player.targetX, 24, state.width - 24);
    state.player.targetY = clamp(state.player.targetY, 24, state.height - 24);

    state.backgroundNodes = Array.from({ length: Math.ceil((state.width * state.height) / 52000) }, () => ({
      x: Math.random(),
      y: Math.random(),
      phase: random(0, TAU),
      size: random(0.8, 1.8)
    }));
  }

  function resetGame() {
    state.elapsed = 0;
    state.score = 0;
    state.displayScore = 0;
    state.bestCombo = 1;
    state.difficulty = 1;
    state.spawnTimer = 0;
    state.pickupTimer = 3.2;
    state.screenFlash = 0;
    state.shake = 0;
    state.enemies.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.shockwaves.length = 0;
    state.floaters.length = 0;
    state.player = createPlayer();
    state.pointer.x = state.player.x;
    state.pointer.y = state.player.y;

    for (let index = 0; index < 14; index += 1) {
      spawnEnemy();
      const enemy = state.enemies[state.enemies.length - 1];
      enemy.x = random(state.width * 0.58, state.width + 36);
      enemy.y = random(-24, state.height * 0.82);
      if (sqrDistance(enemy, state.player) < 210 * 210) {
        enemy.x = state.width + enemy.radius + random(20, 90);
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
    ui.pauseBadge.hidden = true;
    state.lastTime = performance.now();
  }

  function finishGame() {
    state.mode = 'gameover';
    state.highScore = Math.max(state.highScore, Math.floor(state.score));
    storage.set('cosinuos-high-score', String(state.highScore));
    audio.gameOver();

    ui.overlayKicker.textContent = 'SIGNAL LOST / RUN COMPLETE';
    ui.overlayTitle.innerHTML = 'Noise won.<br>Trace it again.';
    ui.overlayCopy.textContent = 'The field collapsed, but the peak is stored locally. A cleaner route will build a stronger chain.';
    ui.primaryButtonLabel.textContent = 'RESTART SIGNAL';
    ui.finalScore.textContent = formatScore(state.score);
    ui.finalCombo.textContent = `×${state.bestCombo.toFixed(1)}`;
    ui.finalTime.textContent = formatTime(state.elapsed);
    ui.runStats.hidden = false;
    ui.overlay.classList.add('is-visible');
    updateUi(true);
  }

  function togglePause(force) {
    if (state.mode !== 'running' && state.mode !== 'paused') return;
    const shouldPause = typeof force === 'boolean' ? force : state.mode === 'running';
    state.mode = shouldPause ? 'paused' : 'running';
    ui.pauseBadge.hidden = !shouldPause;
    state.lastTime = performance.now();
  }

  function spawnEnemy() {
    if (state.enemies.length >= CONFIG.enemyCap) return;
    const fromTop = Math.random() < 0.52;
    const radius = random(6, 20 + Math.min(19, state.difficulty * 1.2));
    const speedScale = random(0.78, 1.25) * (1 + Math.min(1.1, state.difficulty * 0.035));
    state.enemies.push({
      x: fromTop ? random(radius, state.width + radius) : state.width + radius + 8,
      y: fromTop ? -radius - 8 : random(-radius, state.height * 0.9),
      radius,
      vx: CONFIG.flowX * speedScale + random(-15, 11),
      vy: CONFIG.flowY * speedScale + random(-9, 16),
      drift: random(7, 24),
      phase: random(0, TAU),
      phaseSpeed: random(0.88, 1.12),
      rotation: random(0, TAU),
      rotationSpeed: random(-1.1, 1.1),
      sides: Math.floor(random(3, 7)),
      pulseWave: 0
    });
  }

  function weightedPowerType() {
    const entries = Object.entries(POWER_DEFS).filter(([type]) => type !== 'repair' || state.player.lives < CONFIG.maxLives);
    const total = entries.reduce((sum, [, def]) => sum + def.weight, 0);
    let roll = Math.random() * total;
    for (const [type, def] of entries) {
      roll -= def.weight;
      if (roll <= 0) return type;
    }
    return 'pulse';
  }

  function spawnPickup() {
    if (state.pickups.length >= 2) return;
    const type = weightedPowerType();
    const fromTop = Math.random() < 0.55;
    state.pickups.push({
      type,
      x: fromTop ? random(70, state.width - 40) : state.width + 30,
      y: fromTop ? -30 : random(95, state.height - 90),
      vx: CONFIG.flowX * 0.48,
      vy: CONFIG.flowY * 0.48,
      radius: 16,
      rotation: random(0, TAU),
      age: 0,
      ttl: CONFIG.pickupLifetime
    });
  }

  function addParticles(x, y, color, count = 16, energy = 120) {
    const available = Math.max(0, CONFIG.maxParticles - state.particles.length);
    const amount = Math.min(count, available);
    for (let i = 0; i < amount; i += 1) {
      const angle = random(0, TAU);
      const speed = random(energy * 0.25, energy);
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed + CONFIG.flowX * 0.15,
        vy: Math.sin(angle) * speed + CONFIG.flowY * 0.15,
        life: random(0.35, 0.9),
        maxLife: 1,
        size: random(1, 3.5),
        color,
        line: Math.random() < 0.75
      });
    }
  }

  function addFloater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 0.85, maxLife: 0.85 });
  }

  function addShockwave(x, y, color, maxRadius, destructive = false) {
    state.shockwaves.push({
      id: state.nextWaveId++,
      x,
      y,
      radius: 0,
      previousRadius: 0,
      speed: maxRadius / 0.48,
      maxRadius,
      color,
      destructive
    });
  }

  function applyPower(type, pickup) {
    const def = POWER_DEFS[type];
    const player = state.player;
    audio.pickup(type);
    addParticles(pickup.x, pickup.y, def.color, 28, 175);
    addFloater(pickup.x, pickup.y - 24, def.name, def.color);
    state.screenFlash = Math.max(state.screenFlash, 0.2);

    if (type === 'pulse') {
      addShockwave(player.x, player.y, def.color, Math.min(430, Math.max(280, state.width * 0.3)), true);
      state.shake = Math.max(state.shake, 5);
      return;
    }

    if (type === 'repair') {
      if (player.lives < CONFIG.maxLives) {
        player.lives += 1;
        renderLives();
      } else {
        state.score += 500;
      }
      addShockwave(player.x, player.y, def.color, 100, false);
      return;
    }

    player.effects[type] = Math.max(player.effects[type], def.duration);
    addShockwave(player.x, player.y, def.color, 135, false);
  }

  function destroyEnemy(index, reason = 'normal') {
    const enemy = state.enemies[index];
    if (!enemy) return;
    const player = state.player;
    const effectMultiplier = player.effects.amplify > 0 ? 2 : 1;
    const base = reason === 'pulse' ? 90 : reason === 'orbit' ? 70 : 55;
    state.score += base * player.combo * effectMultiplier;
    player.combo = clamp(player.combo + 0.12, 1, 8);
    player.comboTimer = 2.2;
    state.bestCombo = Math.max(state.bestCombo, player.combo * effectMultiplier);
    addParticles(enemy.x, enemy.y, reason === 'pulse' ? COLORS.cyan : COLORS.enemy, 10 + Math.floor(enemy.radius * 0.35), 105 + enemy.radius * 2);
    if (Math.random() < 0.12) audio.kill();
    state.enemies[index] = state.enemies[state.enemies.length - 1];
    state.enemies.pop();
  }

  function hitPlayer(index) {
    const player = state.player;
    if (player.invulnerable > 0 || player.effects.phase > 0) {
      destroyEnemy(index, 'phase');
      return;
    }

    player.lives -= 1;
    player.invulnerable = 1.45;
    player.combo = 1;
    player.comboTimer = 0;
    state.screenFlash = 0.7;
    state.shake = 11;
    addParticles(player.x, player.y, COLORS.pink, 38, 220);
    addShockwave(player.x, player.y, COLORS.pink, 170, false);
    audio.hit();
    renderLives();

    state.enemies[index] = state.enemies[state.enemies.length - 1];
    state.enemies.pop();

    if (player.lives <= 0) finishGame();
  }

  function updatePlayer(dt) {
    const player = state.player;
    let keyboardX = 0;
    let keyboardY = 0;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) keyboardX -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) keyboardX += 1;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) keyboardY -= 1;
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) keyboardY += 1;

    if (keyboardX || keyboardY) {
      const length = Math.hypot(keyboardX, keyboardY) || 1;
      player.targetX += (keyboardX / length) * CONFIG.keyboardSpeed * dt;
      player.targetY += (keyboardY / length) * CONFIG.keyboardSpeed * dt;
    } else if (state.pointer.active) {
      player.targetX = state.pointer.x;
      player.targetY = state.pointer.y;
    }

    player.targetX = clamp(player.targetX, 18, state.width - 18);
    player.targetY = clamp(player.targetY, 18, state.height - 18);
    const ease = 1 - Math.exp(-CONFIG.pointerEase * dt);
    player.x = lerp(player.x, player.targetX, ease);
    player.y = lerp(player.y, player.targetY, ease);

    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.comboTimer = Math.max(0, player.comboTimer - dt);
    if (player.comboTimer <= 0) player.combo = Math.max(1, player.combo - dt * 1.35);

    for (const key of Object.keys(player.effects)) {
      player.effects[key] = Math.max(0, player.effects[key] - dt);
    }

    player.trailAccumulator += dt;
    if (player.trailAccumulator >= 0.018) {
      player.trailAccumulator = 0;
      player.trail.push({ x: player.x, y: player.y });
      if (player.trail.length > CONFIG.trailLength) player.trail.shift();
    }
  }

  function getOrbiters() {
    const player = state.player;
    if (player.effects.orbit <= 0) return [];
    const radius = 44 + Math.sin(state.fieldTime * 2.2) * 5;
    return [0, 1, 2].map(index => {
      const angle = state.fieldTime * 2.8 + index * TAU / 3;
      return {
        x: player.x + Math.cos(angle) * radius,
        y: player.y + Math.sin(angle) * radius,
        radius: 8,
        angle
      };
    });
  }

  function updateEnemies(dt) {
    const player = state.player;
    const speedFactor = player.effects.freeze > 0 ? 0.38 : 1;
    const orbiters = getOrbiters();

    for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = state.enemies[index];
      enemy.phase += dt * enemy.phaseSpeed;
      enemy.rotation += enemy.rotationSpeed * dt;
      enemy.x += (enemy.vx + Math.sin(enemy.phase) * enemy.drift) * dt * speedFactor;
      enemy.y += (enemy.vy + Math.cos(enemy.phase * 0.73) * enemy.drift * 0.45) * dt * speedFactor;

      let destroyedByOrbit = false;
      for (const orbiter of orbiters) {
        const threshold = enemy.radius + orbiter.radius;
        if (sqrDistance(enemy, orbiter) < threshold * threshold) {
          destroyEnemy(index, 'orbit');
          destroyedByOrbit = true;
          break;
        }
      }
      if (destroyedByOrbit) continue;

      const threshold = enemy.radius + player.radius + 1;
      if (sqrDistance(enemy, player) < threshold * threshold) {
        hitPlayer(index);
        if (state.mode !== 'running') return;
        continue;
      }

      if (enemy.x < -enemy.radius - 70 || enemy.y > state.height + enemy.radius + 70) {
        state.enemies[index] = state.enemies[state.enemies.length - 1];
        state.enemies.pop();
      }
    }
  }

  function updatePickups(dt) {
    const player = state.player;
    for (let index = state.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = state.pickups[index];
      pickup.age += dt;
      pickup.rotation += dt * 0.9;
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;

      const threshold = pickup.radius + player.radius + 5;
      if (sqrDistance(pickup, player) < threshold * threshold) {
        applyPower(pickup.type, pickup);
        state.pickups[index] = state.pickups[state.pickups.length - 1];
        state.pickups.pop();
        continue;
      }

      if (pickup.age > pickup.ttl || pickup.x < -80 || pickup.y > state.height + 80) {
        state.pickups[index] = state.pickups[state.pickups.length - 1];
        state.pickups.pop();
      }
    }
  }

  function updateShockwaves(dt) {
    for (let waveIndex = state.shockwaves.length - 1; waveIndex >= 0; waveIndex -= 1) {
      const wave = state.shockwaves[waveIndex];
      wave.previousRadius = wave.radius;
      wave.radius += wave.speed * dt;

      if (wave.destructive) {
        for (let enemyIndex = state.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
          const enemy = state.enemies[enemyIndex];
          if (enemy.pulseWave === wave.id) continue;
          const distance = Math.sqrt(sqrDistance(enemy, wave));
          if (distance <= wave.radius + enemy.radius && distance >= wave.previousRadius - enemy.radius - 16) {
            enemy.pulseWave = wave.id;
            destroyEnemy(enemyIndex, 'pulse');
          }
        }
      }

      if (wave.radius >= wave.maxRadius) {
        state.shockwaves[waveIndex] = state.shockwaves[state.shockwaves.length - 1];
        state.shockwaves.pop();
      }
    }
  }

  function updateParticles(dt) {
    for (let index = state.particles.length - 1; index >= 0; index -= 1) {
      const particle = state.particles[index];
      particle.life -= dt;
      particle.vx = lerp(particle.vx, CONFIG.flowX * 0.35, 1 - Math.exp(-2.2 * dt));
      particle.vy = lerp(particle.vy, CONFIG.flowY * 0.35, 1 - Math.exp(-2.2 * dt));
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      if (particle.life <= 0) {
        state.particles[index] = state.particles[state.particles.length - 1];
        state.particles.pop();
      }
    }

    for (let index = state.floaters.length - 1; index >= 0; index -= 1) {
      const floater = state.floaters[index];
      floater.life -= dt;
      floater.y -= dt * 32;
      if (floater.life <= 0) {
        state.floaters[index] = state.floaters[state.floaters.length - 1];
        state.floaters.pop();
      }
    }
  }

  function update(dt) {
    state.fieldTime += dt;
    state.screenFlash = Math.max(0, state.screenFlash - dt * 2.8);
    state.shake = Math.max(0, state.shake - dt * 22);

    if (state.mode !== 'running') return;

    state.elapsed += dt;
    state.difficulty = 1 + state.elapsed / 34;
    state.score += dt * (12 + state.difficulty * 3.1) * (state.player.effects.amplify > 0 ? 1.35 : 1);
    state.displayScore = lerp(state.displayScore, state.score, 1 - Math.exp(-8 * dt));

    updatePlayer(dt);

    state.spawnTimer -= dt;
    const spawnInterval = clamp(0.28 - state.difficulty * 0.014, 0.065, 0.27);
    if (state.spawnTimer <= 0) {
      state.spawnTimer += spawnInterval;
      spawnEnemy();
      if (state.difficulty > 4 && Math.random() < 0.14) spawnEnemy();
    }

    state.pickupTimer -= dt;
    if (state.pickupTimer <= 0) {
      spawnPickup();
      state.pickupTimer = random(CONFIG.pickupIntervalMin, CONFIG.pickupIntervalMax);
    }

    updateEnemies(dt);
    updatePickups(dt);
    updateShockwaves(dt);
    updateParticles(dt);

    state.uiTimer -= dt;
    if (state.uiTimer <= 0) {
      state.uiTimer = 0.1;
      updateUi(false);
    }
  }

  function drawBackground() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, state.width, state.height);

    const driftX = (state.fieldTime * CONFIG.flowX * 0.18) % 58;
    const driftY = (state.fieldTime * CONFIG.flowY * 0.18) % 58;
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (let x = driftX - 80; x < state.width + 80; x += 58) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x + state.height * 0.28, state.height);
    }
    for (let y = driftY - 80; y < state.height + 80; y += 58) {
      ctx.moveTo(0, y);
      ctx.lineTo(state.width, y - state.width * 0.16);
    }
    ctx.stroke();

    ctx.strokeStyle = COLORS.gridStrong;
    ctx.lineWidth = 1;
    for (let band = 0; band < 3; band += 1) {
      const baseY = state.height * (0.23 + band * 0.27);
      ctx.beginPath();
      for (let x = -20; x <= state.width + 20; x += 18) {
        const y = baseY
          + Math.sin(x * 0.009 + state.fieldTime * (0.55 + band * 0.11)) * (11 + band * 3)
          + Math.sin(x * 0.021 - state.fieldTime * 0.8) * 4;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    for (const node of state.backgroundNodes) {
      const flicker = 0.4 + Math.sin(state.fieldTime * 0.8 + node.phase) * 0.25;
      ctx.fillStyle = `rgba(202, 214, 239, ${Math.max(0.03, flicker * 0.11)})`;
      ctx.fillRect(node.x * state.width, node.y * state.height, node.size, node.size);
    }
  }

  function drawEnemyConnections() {
    const cellSize = CONFIG.enemyLinkCell;
    const grid = new Map();

    for (let i = 0; i < state.enemies.length; i += 1) {
      const enemy = state.enemies[i];
      const gx = Math.floor(enemy.x / cellSize);
      const gy = Math.floor(enemy.y / cellSize);
      const key = `${gx},${gy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }

    const maxDistanceSq = CONFIG.enemyLinkDistance ** 2;
    ctx.lineWidth = 0.65;
    ctx.strokeStyle = 'rgba(255, 84, 125, 0.105)';
    ctx.beginPath();

    for (let i = 0; i < state.enemies.length; i += 1) {
      const enemy = state.enemies[i];
      const gx = Math.floor(enemy.x / cellSize);
      const gy = Math.floor(enemy.y / cellSize);
      let links = 0;

      for (let offsetX = -1; offsetX <= 1 && links < 2; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1 && links < 2; offsetY += 1) {
          const bucket = grid.get(`${gx + offsetX},${gy + offsetY}`);
          if (!bucket) continue;
          for (const otherIndex of bucket) {
            if (otherIndex <= i) continue;
            const other = state.enemies[otherIndex];
            const distanceSq = sqrDistance(enemy, other);
            if (distanceSq < maxDistanceSq) {
              ctx.moveTo(enemy.x, enemy.y);
              ctx.lineTo(other.x, other.y);
              links += 1;
              if (links >= 2) break;
            }
          }
        }
      }
    }
    ctx.stroke();
  }

  function polygonPath(x, y, radius, sides, rotation) {
    ctx.beginPath();
    for (let i = 0; i < sides; i += 1) {
      const angle = rotation + i * TAU / sides;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawEnemies() {
    drawEnemyConnections();
    for (const enemy of state.enemies) {
      const alpha = clamp(0.52 + enemy.radius / 70, 0.55, 0.95);
      polygonPath(enemy.x, enemy.y, enemy.radius, enemy.sides, enemy.rotation);
      ctx.strokeStyle = `rgba(255, 84, 125, ${alpha})`;
      ctx.lineWidth = enemy.radius > 25 ? 1.35 : 1;
      ctx.stroke();

      polygonPath(enemy.x, enemy.y, enemy.radius * 0.52, enemy.sides, -enemy.rotation * 0.65);
      ctx.strokeStyle = 'rgba(255, 211, 223, 0.22)';
      ctx.lineWidth = 0.7;
      ctx.stroke();

      ctx.fillStyle = enemy.radius > 24 ? COLORS.enemyCore : COLORS.enemy;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(enemy.x - 1, enemy.y - 1, 2, 2);
      ctx.globalAlpha = 1;
    }
  }

  function drawPickups() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '10px SFMono-Regular, Consolas, monospace';

    for (const pickup of state.pickups) {
      const def = POWER_DEFS[pickup.type];
      const pulse = 1 + Math.sin(state.fieldTime * 3.2 + pickup.rotation) * 0.08;
      const radius = pickup.radius * pulse;

      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      ctx.rotate(pickup.rotation);
      ctx.strokeStyle = def.color;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.1;
      ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
      ctx.rotate(-pickup.rotation * 1.8);
      ctx.globalAlpha = 0.32;
      ctx.strokeRect(-radius * 0.7, -radius * 0.7, radius * 1.4, radius * 1.4);
      ctx.restore();

      ctx.globalAlpha = 1;
      ctx.fillStyle = def.color;
      ctx.fillText(def.symbol, pickup.x, pickup.y + 0.5);

      ctx.strokeStyle = withAlpha(def.color, 0.45);
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, radius + 9 + Math.sin(state.fieldTime * 2) * 3, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawTrail() {
    const trail = state.player.trail;
    if (trail.length < 2) return;
    const phaseActive = state.player.effects.phase > 0;

    for (let pass = 0; pass < 2; pass += 1) {
      ctx.beginPath();
      for (let i = 0; i < trail.length; i += 1) {
        const point = trail[i];
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = pass === 0 ? 7 : 1.25;
      ctx.strokeStyle = pass === 0
        ? (phaseActive ? 'rgba(154, 121, 255, 0.07)' : 'rgba(117, 247, 255, 0.055)')
        : (phaseActive ? 'rgba(154, 121, 255, 0.68)' : 'rgba(117, 247, 255, 0.66)');
      ctx.stroke();
    }

    for (let i = 0; i < trail.length; i += 7) {
      const point = trail[i];
      const alpha = i / trail.length;
      ctx.fillStyle = `rgba(117, 247, 255, ${alpha * 0.34})`;
      ctx.fillRect(point.x - 1, point.y - 1, 2, 2);
    }
  }

  function drawPlayer() {
    const player = state.player;
    const phase = player.effects.phase > 0;
    const blink = player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0;
    if (blink) return;

    drawTrail();

    if (phase) {
      for (let echo = 1; echo <= 3; echo += 1) {
        ctx.strokeStyle = `rgba(154, 121, 255, ${0.17 / echo})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(player.x - CONFIG.flowX * echo * 0.08, player.y - CONFIG.flowY * echo * 0.08, player.radius + echo * 6, 0, TAU);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = phase ? COLORS.violet : COLORS.cyan;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius + 8 + Math.sin(state.fieldTime * 3) * 2, 0, TAU);
    ctx.stroke();

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(Math.PI * 0.25 + state.fieldTime * 0.35);
    ctx.strokeStyle = COLORS.text;
    ctx.fillStyle = phase ? COLORS.violet : COLORS.cyan;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-player.radius, -player.radius, player.radius * 2, player.radius * 2);
    ctx.globalAlpha = 0.24;
    ctx.fillRect(-player.radius * 0.56, -player.radius * 0.56, player.radius * 1.12, player.radius * 1.12);
    ctx.restore();
    ctx.globalAlpha = 1;

    const orbiters = getOrbiters();
    for (const orbiter of orbiters) {
      ctx.save();
      ctx.translate(orbiter.x, orbiter.y);
      ctx.rotate(orbiter.angle + Math.PI / 4);
      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-6, -6, 12, 12);
      ctx.restore();
    }

    if (orbiters.length) {
      ctx.strokeStyle = 'rgba(255, 200, 90, 0.17)';
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.arc(player.x, player.y, 44 + Math.sin(state.fieldTime * 2.2) * 5, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawParticles() {
    ctx.lineWidth = 1;
    for (const particle of state.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = particle.color;
      ctx.fillStyle = particle.color;
      if (particle.line) {
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x - particle.vx * 0.035, particle.y - particle.vy * 0.035);
        ctx.stroke();
      } else {
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawShockwaves() {
    for (const wave of state.shockwaves) {
      const alpha = 1 - wave.radius / wave.maxRadius;
      ctx.globalAlpha = alpha * 0.78;
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = wave.destructive ? 2 : 1;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.12;
      ctx.lineWidth = wave.destructive ? 15 : 7;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '9px SFMono-Regular, Consolas, monospace';
    for (const floater of state.floaters) {
      ctx.globalAlpha = clamp(floater.life / floater.maxLife, 0, 1);
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawFrameCorners() {
    const inset = 17;
    const length = 18;
    ctx.strokeStyle = 'rgba(214, 226, 250, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(inset, inset + length); ctx.lineTo(inset, inset); ctx.lineTo(inset + length, inset);
    ctx.moveTo(state.width - inset - length, inset); ctx.lineTo(state.width - inset, inset); ctx.lineTo(state.width - inset, inset + length);
    ctx.moveTo(inset, state.height - inset - length); ctx.lineTo(inset, state.height - inset); ctx.lineTo(inset + length, state.height - inset);
    ctx.moveTo(state.width - inset - length, state.height - inset); ctx.lineTo(state.width - inset, state.height - inset); ctx.lineTo(state.width - inset, state.height - inset - length);
    ctx.stroke();
  }

  function render() {
    drawBackground();

    const shakeX = state.shake > 0 ? random(-state.shake, state.shake) : 0;
    const shakeY = state.shake > 0 ? random(-state.shake, state.shake) : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawShockwaves();
    drawPickups();
    drawEnemies();
    drawPlayer();
    drawParticles();
    drawFloaters();
    ctx.restore();
    drawFrameCorners();

    if (state.screenFlash > 0) {
      ctx.fillStyle = `rgba(255, 95, 159, ${state.screenFlash * 0.13})`;
      ctx.fillRect(0, 0, state.width, state.height);
    }
  }

  function renderLives() {
    ui.lives.replaceChildren();
    for (let index = 0; index < CONFIG.maxLives; index += 1) {
      const dot = document.createElement('i');
      dot.className = `integrity-dot${index < state.player.lives ? ' is-live' : ''}`;
      ui.lives.append(dot);
    }
    ui.lives.setAttribute('aria-label', `${state.player.lives} integrity points`);
  }

  function renderEffects() {
    const active = Object.entries(state.player.effects)
      .filter(([, time]) => time > 0.02)
      .sort((a, b) => b[1] - a[1]);

    const existing = new Map([...ui.effects.children].map(element => [element.dataset.effect, element]));
    const fragment = document.createDocumentFragment();

    for (const [type, time] of active) {
      const def = POWER_DEFS[type];
      let card = existing.get(type);
      if (!card) {
        card = document.createElement('article');
        card.className = 'effect-card';
        card.dataset.effect = type;
        card.innerHTML = `
          <div class="effect-symbol"><span>${def.symbol}</span></div>
          <div class="effect-copy"><strong>${def.name}</strong><small>${def.subtitle}</small></div>
          <span class="effect-time"></span>`;
      }
      card.style.setProperty('--effect-color', def.color);
      card.style.setProperty('--progress', clamp(time / def.duration, 0, 1).toFixed(3));
      card.querySelector('.effect-time').textContent = `${time.toFixed(1)}s`;
      fragment.append(card);
      existing.delete(type);
    }

    ui.effects.replaceChildren(fragment);
  }

  function updateUi(force) {
    if (!state.player) return;
    const multiplier = state.player.combo * (state.player.effects.amplify > 0 ? 2 : 1);
    ui.score.textContent = formatScore(force ? state.score : state.displayScore);
    ui.multiplier.textContent = `×${multiplier.toFixed(1)}`;
    ui.highScore.textContent = formatScore(state.highScore);

    const intensity = state.difficulty < 1.8 ? 'STABLE' : state.difficulty < 3.2 ? 'RISING' : state.difficulty < 5 ? 'TURBULENT' : 'CRITICAL';
    ui.flow.textContent = `${intensity} / ${state.enemies.length.toString().padStart(3, '0')}`;
    renderEffects();
  }

  function frame(now) {
    const dt = Math.min(0.033, Math.max(0, (now - state.lastTime) / 1000));
    state.lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function setPointer(event) {
    state.pointer.x = clamp(event.clientX, 0, state.width);
    state.pointer.y = clamp(event.clientY, 0, state.height);
    state.pointer.active = true;
  }

  function bindEvents() {
    window.addEventListener('resize', resize, { passive: true });
    canvas.addEventListener('pointermove', setPointer, { passive: true });
    canvas.addEventListener('pointerdown', event => {
      setPointer(event);
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointerleave', () => {
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

    ui.primaryButton.addEventListener('click', startGame);
    ui.soundButton.addEventListener('click', () => {
      audio.setMuted(!audio.muted);
      ui.soundButton.textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON';
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
