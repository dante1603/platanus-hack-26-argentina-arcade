const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

const TUNING = {
  PLAYER: {
    JUMP_VELOCITY: -500,
    DOWN_DASH_VELOCITY: 700,
    DOWN_DASH_BOUNCE: -300,
    WALK_SPEED: 220,
    DASH_SPEED: 500,
    DASH_DURATION_MS: 150,
    DASH_COOLDOWN_MS: 500,
    DOUBLE_TAP_WINDOW_MS: 200,
    IMMUNITY_AFTER_HIT_MS: 2000,
    IMMUNITY_POWERUP_MS: 5000,
    JUMP_RECHARGE_MS: 6000,
    JUMP_INITIAL: 3,
    JUMP_MAX: 6,
    HEALTH_INITIAL: 3,
    HEALTH_MAX: 6,
  },
  WORLD: {
    GAME_SPEED_START: 150,
    GAME_SPEED_MAX: 450,
    GAME_SPEED_ACCEL: 0.5,
    FIRST_ENEMY_DELAY_MS: 3000,
  },
  BOSS: {
    HP_BOSS1: 30,
    HP_BOSS2: 60,
    HP_LOOP_BONUS: 15,
    SPEED_LOOP_BONUS: 30,
    PATTERN_COOLDOWN_MS: 4000,
    BULLET_SPEED: 320,
    BULLET_SPEED_SPREAD: 300,
    BULLET_SPEED_STRAFE: 380,
  },
  SHOOT: {
    BULLET_SPEED: 600,

    HOMING_INTERVAL_MS: 400,
    HOMING_DAMAGE: 1.0,

    AUTO_INTERVAL_MS: 100,
    AUTO_DAMAGE: 0.4,

    TRIPLE_INTERVAL_MS: 450,
    TRIPLE_DAMAGE: 0.8,
    TRIPLE_SPREAD_DEG: 20,

    PIERCE_CHARGE_MIN_MS: 200,
    PIERCE_CHARGE_MED_MS: 600,
    PIERCE_CHARGE_MAX_MS: 1000,
    PIERCE_DAMAGE_MIN: 2.0,
    PIERCE_DAMAGE_MED: 6.0,
    PIERCE_DAMAGE_MAX: 10.5,
    PIERCE_SIZE_MIN: 8,
    PIERCE_SIZE_MED: 14,
    PIERCE_SIZE_MAX: 24,
  },
  ENEMY: {
    FIRE_COOLDOWN_L1_MS: 2500,
    FIRE_COOLDOWN_L23_MS: 3000,
    BURST_DELAY_MS: 300,
    BULLET_SPEED: 350,
    SPAWN_NEXT_MIN_MS: 2500,
    SPAWN_NEXT_BASE_MS: 6000,
    SPAWN_SPEED_FACTOR: 15,
  },
  AIR_TRIANGLE: {
    SPEED_L1: 300,
    SPEED_L23: 500,
    BULLET_SPEED: 450,
  },
};

const COLORS = {
  background: 0x000000,
  textHighlight: '#ffff00',


  player: 0x00ffff,


  platform: 0x00ff66,
  platformMoving: 0x00ccff,


  spike: 0xff0033,


  enemyL1: 0xff3300,
  enemyL2: 0xff6600,
  enemyL3: 0xffaa00,


  airTriangle: 0xff0088,


  enemyBullet: 0xff0044,


  powerupJump: 0x00ff88,
  powerupHealth: 0xff3333,
  powerupInvune: 0x0066ff,


  weaponHoming: 0x00ffff,
  weaponAuto: 0xff8800,
  weaponTriple: 0xff00ff,
  weaponPierce: 0xff2200,
  weaponPierceMed: 0xff6600,
  weaponPierceMax: 0xffffff,
};




const CABINET_KEYS = {
  P1_U: ['w', 'ArrowUp'],
  P1_D: ['s', 'ArrowDown'],
  P1_L: ['a', 'ArrowLeft'],
  P1_R: ['d', 'ArrowRight'],
  P1_1: ['e', 'u', 'z', 'f'],
  P1_2: ['i'],
  START1: ['Enter', ' '],
  START2: ['2', 'Escape'],
};

const KEYBOARD_TO_ARCADE = {};
for (const [arcadeCode, keys] of Object.entries(CABINET_KEYS)) {
  for (const key of keys) {
    let normalized = key;
    if (normalized.length === 1 && normalized !== ' ') {
      normalized = normalized.toLowerCase();
    }
    KEYBOARD_TO_ARCADE[normalized] = arcadeCode;
  }
}

const Audio = (() => {
  let ctx = null;
  let masterGain = null;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 1.0;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function playTone({ freq = 440, type = 'sine', duration = 0.1, gain = 0.3,
    freqEnd = null, gainEnd = 0, delay = 0 } = {}) {
    try {
      let c = getCtx();
      let osc = c.createOscillator();
      let g = c.createGain();
      osc.connect(g);
      g.connect(masterGain);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime + delay);
      if (freqEnd !== null) osc.frequency.linearRampToValueAtTime(freqEnd, c.currentTime + delay + duration);
      g.gain.setValueAtTime(gain, c.currentTime + delay);
      g.gain.linearRampToValueAtTime(gainEnd, c.currentTime + delay + duration);
      osc.start(c.currentTime + delay);
      osc.stop(c.currentTime + delay + duration);
    } catch (e) { }
  }

  function playNoise({ duration = 0.1, gain = 0.2, filterFreq = 2000, gainEnd = 0, delay = 0 } = {}) {
    try {
      let c = getCtx();
      let bufferSize = Math.floor(c.sampleRate * duration);
      let buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      let data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      let source = c.createBufferSource();
      source.buffer = buffer;
      let filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = filterFreq;
      let g = c.createGain();
      g.gain.setValueAtTime(gain, c.currentTime + delay);
      g.gain.linearRampToValueAtTime(gainEnd, c.currentTime + delay + duration);
      source.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      source.start(c.currentTime + delay);
    } catch (e) { }
  }

  let bgmStep = 0;
  let bgmInterval = null;

  function tickBGM() {
    if (!ctx || ctx.state === 'suspended') return;
    try {
      let intensity = bossState ? 2 : (enemies.countActive(true) > 0 || currentSection > 0 ? 1 : 0);
      let tempo = [200, 175, 140][intensity];
      if (bgmInterval.delay !== tempo) bgmInterval.delay = tempo;

      const bassTracks = [
        [110, 0, 110, 0, 110, 0, 110, 0],
        [110, 110, 130, 110, 146, 110, 130, 123],
        [82, 82, 110, 82, 98, 82, 110, 103]
      ];

      const bass = bassTracks[intensity];
      playTone({ freq: bass[bgmStep % 8], type: intensity === 2 ? 'sawtooth' : 'triangle', duration: 0.15, gain: intensity === 2 ? 0.3 : (intensity === 1 ? 0.5 : 0.6) });

      if (bgmStep % 4 === 0) playNoise({ duration: 0.05, gain: intensity === 0 ? 0.4 : 0.6, filterFreq: 60 });
      if (intensity > 0 && bgmStep % 4 === 2) playNoise({ duration: 0.1, gain: 0.3, filterFreq: 1800 });
      bgmStep++;
    } catch (e) { }
  }

  return {
    startBGM(scene) {
      if (bgmInterval) return;
      bgmInterval = scene.time.addEvent({ delay: 200, loop: true, callback: tickBGM });
    },
    stopBGM() {
      if (bgmInterval) { bgmInterval.remove(); bgmInterval = null; }
    },
    jump() { playTone({ freq: 280, freqEnd: 520, type: 'square', duration: 0.12, gain: 0.08 }); },
    doubleJump() {
      playTone({ freq: 400, freqEnd: 800, type: 'square', duration: 0.08, gain: 0.1 });
      playTone({ freq: 500, freqEnd: 1000, type: 'sine', duration: 0.12, gain: 0.08, delay: 0.06 });
    },
    land() { playTone({ freq: 80, freqEnd: 60, type: 'sine', duration: 0.08, gain: 0.06 }); },
    dash() { playTone({ freq: 600, freqEnd: 200, type: 'sawtooth', duration: 0.1, gain: 0.08 }); },
    downDash() { playTone({ freq: 800, freqEnd: 150, type: 'sawtooth', duration: 0.15, gain: 0.1 }); },
    hurt() {
      playNoise({ duration: 0.15, gain: 0.15, filterFreq: 800 });
      playTone({ freq: 150, freqEnd: 80, type: 'sine', duration: 0.2, gain: 0.1, delay: 0.05 });
    },
    die() {
      playNoise({ duration: 0.4, gain: 0.2, filterFreq: 400 });
      playTone({ freq: 200, freqEnd: 60, type: 'sine', duration: 0.5, gain: 0.15 });
    },
    deathPulse() { playTone({ freq: 800, freqEnd: 200, type: 'sine', duration: 0.4, gain: 0.15 }); },
    shootHoming() { playTone({ freq: 600, freqEnd: 500, type: 'sine', duration: 0.06, gain: 0.06 }); },
    shootAuto() { playTone({ freq: 900, freqEnd: 700, type: 'square', duration: 0.04, gain: 0.03 }); },
    shootTriple() {
      [500, 600, 700].forEach((f, i) => { playTone({ freq: f, type: 'sine', duration: 0.05, gain: 0.05, delay: i * 0.02 }); });
    },
    pierceCharge(level) {
      let freq = [0, 400, 600, 1000][level] || 400;
      playTone({ freq, freqEnd: freq * 1.1, type: 'sawtooth', duration: 0.08, gain: 0.03 * level });
    },
    pierceShoot(level) {
      let freq = [0, 500, 700, 1200][level] || 500;
      playTone({ freq, freqEnd: freq * 0.5, type: 'sawtooth', duration: 0.2, gain: 0.15 });
      if (level === 3) playNoise({ duration: 0.15, gain: 0.1, filterFreq: 3000 });
    },
    enemyShoot() { playTone({ freq: 300, freqEnd: 200, type: 'square', duration: 0.08, gain: 0.06 }); },
    enemyDie() {
      playNoise({ duration: 0.2, gain: 0.12, filterFreq: 1200 });
      playTone({ freq: 200, freqEnd: 80, type: 'sine', duration: 0.25, gain: 0.07 });
    },
    bossEnter() {
      playTone({ freq: 80, freqEnd: 60, type: 'sawtooth', duration: 1.2, gain: 0.2 });
      playNoise({ duration: 0.8, gain: 0.1, filterFreq: 200 });
    },
    bossHurt() { playTone({ freq: 400, freqEnd: 300, type: 'square', duration: 0.1, gain: 0.1 }); },
    bossDie() {
      for (let i = 0; i < 5; i++) {
        playTone({ freq: 100 + i * 80, freqEnd: 100 + i * 80 + 200, type: 'sawtooth', duration: 0.3, gain: 0.15 - i * 0.02, delay: i * 0.25 });
      }
      playNoise({ duration: 1.5, gain: 0.25, filterFreq: 600 });
    },
    powerup() {
      [400, 550, 700].forEach((f, i) => { playTone({ freq: f, type: 'sine', duration: 0.1, gain: 0.1, delay: i * 0.08 }); });
    },
    sectionChange() { playTone({ freq: 300, freqEnd: 600, type: 'sine', duration: 0.4, gain: 0.12 }); },
    leaderboardChar() {
      playTone({ freq: 440, freqEnd: 520, type: 'square', duration: 0.06, gain: 0.05 });
    }
  };
})();

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-root',
  backgroundColor: '#050508',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 800 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  scene: {
    preload,
    create,
    update,
  },
};

new Phaser.Game(config);

let controls = { held: {}, pressed: {} };


let ui = {};
let player;
let platforms;
let spikes;
let playerBullets;
let enemies;
let enemyBullets;
let powerups;
let airTriangles;
let lastFireTime = 0;
let nextEnemyTime = 0;
let gameSpeed = TUNING.WORLD.GAME_SPEED_START;
let nextPlatformX = 0;
let playTime = 0;
const playerState = {
  state: 'idle',
  jumps: { current: TUNING.PLAYER.JUMP_INITIAL, max: TUNING.PLAYER.JUMP_INITIAL, timer: 0 },
  health: { current: TUNING.PLAYER.HEALTH_INITIAL, max: TUNING.PLAYER.HEALTH_INITIAL },
  dash: { activeUntil: 0, cooldownUntil: 0, direction: 0, lastTapL: 0, lastTapR: 0 },
  invulnerableUntil: 0,
  pierce: { charging: false, chargeStart: 0, chargeLevel: 0, prevChargeLevel: 0 },
  canBeHit() { return playTime >= this.invulnerableUntil; },
  setState(newState) { this.state = newState; },
  reset() {
    this.state = 'idle';
    this.jumps.current = TUNING.PLAYER.JUMP_INITIAL;
    this.jumps.max = TUNING.PLAYER.JUMP_INITIAL;
    this.jumps.timer = 0;
    this.health.current = TUNING.PLAYER.HEALTH_INITIAL;
    this.health.max = TUNING.PLAYER.HEALTH_INITIAL;
    this.dash.activeUntil = 0;
    this.dash.cooldownUntil = 0;
    this.dash.direction = 0;
    this.dash.lastTapL = 0;
    this.dash.lastTapR = 0;
    this.invulnerableUntil = 0;
    this.pierce.charging = false;
    this.pierce.chargeStart = 0;
    this.pierce.chargeLevel = 0;
    this.pierce.prevChargeLevel = 0;
  }
};
let shootMode = 'homing';

const SECTIONS = [
  { color: 0x002244, duration: 8000, speedFloor: 150, mechanics: [] },
  { color: 0x884400, duration: 25000, speedFloor: 170, mechanics: ['spikes', 'enemies'] },
  { color: 0x666600, duration: 30000, speedFloor: 190, mechanics: ['spikes', 'enemies', 'moving'] },
  { color: 0x004400, duration: 35000, speedFloor: 210, mechanics: ['spikes', 'enemies', 'moving', 'triangles'] },
  { color: 0x440000, duration: 40000, speedFloor: 230, mechanics: ['spikes', 'enemies', 'moving', 'triangles'] }
];

let currentSection = 0;
let sectionProgress = 0.0;
let pendingBonusPowerup = false;
let sectionTimer = 0;
let currentThemeColorRGB = null;


let enemiesDefeated = 0;
let currentScore = 0;

let playerDying = false; // true mientras la animación de muerte está activa
let bossState = null;
let boss = null;
let bossHp = 0;
let bossHpMax = TUNING.BOSS.HP_BOSS1;
let bossPattern = 0;
let bossNextAction = 0;
let bossSection = 0;
let loopCount = 0;
let scoresReturnState = 'start';

const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let nameLetters = [0, 0, 0];
let nameCursor = 0;


let wasOnGround = false;
let landingSquashTime = 0;
let lastGroundTime = 0;
const COYOTE_TIME_MS = 150;
let playerTrail = [];
const PLAYER_TRAIL_MAX = 14;
const PLAYER_TRAIL_LIFE = 280;
let playerTrailGfx = null;


let bgStarsNear = [];
let bgStarsMid = [];
let bgStarsFar = [];


function getWeaponColor(mode) {
  const map = { homing: COLORS.weaponHoming, auto: COLORS.weaponAuto, triple: COLORS.weaponTriple, pierce: COLORS.weaponPierce };
  return map[mode] || COLORS.weaponHoming;
}

function updateWeaponUI() {
  const names = { homing: '◆ HOMING', auto: '◆ AUTO', triple: '◆ TRIPLE', pierce: '◆ PIERCE' };
  const colors = { homing: '#00ffff', auto: '#ff8800', triple: '#ff00ff', pierce: '#ff2200' };
  ui.shootModeText.setText(names[shootMode]).setColor(colors[shootMode]);
}

function showWeaponChangeIndicator(scene, name, color) {
  let txt = scene.add.text(player.x, player.y - 40, name, {
    fontSize: '18px', fontFamily: 'Arial', color, fontStyle: 'bold'
  }).setOrigin(0.5).setDepth(250);
  scene.tweens.add({
    targets: txt, y: player.y - 80, alpha: 0,
    duration: 1500, ease: 'Power2',
    onComplete: () => txt.destroy()
  });
}


function drawPlayerNeon(g, color, scaleX, scaleY) {
  g.clear();
  let rx = 14 * scaleX, ry = 14 * scaleY;
  g.lineStyle(8, color, 0.35); g.strokeEllipse(0, 0, rx * 2, ry * 2);
  g.lineStyle(3, color, 1); g.strokeEllipse(0, 0, rx * 2, ry * 2);
}

function computeSlimeTransform() {
  let scaleX = 1.0, scaleY = 1.0;
  let color = getWeaponColor(shootMode);
  let velY = player.body.velocity.y;
  let onGround = player.body.touching.down;
  if (playerState.state === 'dashing') { scaleX = 1.25; scaleY = 0.78; }
  else if (playerState.state === 'downDashing') { scaleX = 0.82; scaleY = 1.25; }
  else if (!onGround) {
    if (velY < -100) { scaleX = 0.88; scaleY = 1.15; }
    else if (velY > 200) { scaleX = 0.92; scaleY = 1.18; }
  } else { scaleX = 1.08; scaleY = 0.93; }
  if (landingSquashTime > 0) {
    let t = (playTime - landingSquashTime) / 200;
    if (t < 1) { let squash = Math.sin(t * Math.PI) * 0.22; scaleX *= (1 + squash); scaleY *= (1 - squash); }
    else { landingSquashTime = 0; }
  }
  if (shootMode === 'pierce' && playerState.pierce.charging) {
    let lvl = playerState.pierce.chargeLevel;
    let pulse = 1 + Math.sin(playTime * 0.015) * 0.05 * (lvl + 1);
    scaleX *= pulse; scaleY *= pulse;
    color = [COLORS.weaponPierce, COLORS.weaponPierce, COLORS.weaponPierceMed, COLORS.weaponPierceMax][lvl];
  }
  return { scaleX, scaleY, color };
}

function updatePlayerTrail(scene, color, delta = 16) {
  playerTrail.push({ x: player.x, y: player.y, born: playTime, color });
  if (playerTrail.length > PLAYER_TRAIL_MAX) playerTrail.shift();
  playerTrailGfx.clear();
  for (let i = 0; i < playerTrail.length; i++) {
    let pt = playerTrail[i];
    pt.x -= gameSpeed * (delta / 1000);
    let age = playTime - pt.born;
    if (age > PLAYER_TRAIL_LIFE) continue;
    let ratio = 1 - age / PLAYER_TRAIL_LIFE;
    playerTrailGfx.lineStyle(3, pt.color, ratio * 0.35);
    playerTrailGfx.strokeCircle(pt.x, pt.y, 12 * ratio * 0.9);
  }
}


function updateBackground(scene, delta) {
  ui.bgStarsGfx.clear();

  bgStarsFar.forEach(star => {
    star.x -= gameSpeed * 0.10 * (delta / 1000);
    if (star.x < 0) { star.x = GAME_WIDTH; star.y = Math.random() * GAME_HEIGHT; }
    ui.bgStarsGfx.fillStyle(0xffffff, star.alpha);
    ui.bgStarsGfx.fillRect(star.x, star.y, star.size, star.size);
  });

  bgStarsMid.forEach(star => {
    star.x -= gameSpeed * 0.25 * (delta / 1000);
    if (star.x < 0) { star.x = GAME_WIDTH; star.y = Math.random() * GAME_HEIGHT; }
    ui.bgStarsGfx.fillStyle(0xddffff, star.alpha);
    ui.bgStarsGfx.fillRect(star.x, star.y, star.size, star.size);
  });

  bgStarsNear.forEach(star => {
    star.x -= gameSpeed * 0.45 * (delta / 1000);
    if (star.x < 0) { star.x = GAME_WIDTH; star.y = Math.random() * GAME_HEIGHT; }
    ui.bgStarsGfx.fillStyle(0xffffff, star.alpha);
    ui.bgStarsGfx.fillCircle(star.x, star.y, star.size);
  });
}



function createEnemyBullet(scene, x, y, vx, vy) {
  let b = scene.add.rectangle(x, y, 10, 10, 0xffffff).setDepth(50);
  b.setBlendMode(Phaser.BlendModes.ADD);
  enemyBullets.add(b);
  scene.physics.add.existing(b);
  b.body.allowGravity = false;
  b.body.setVelocity(vx, vy);
  return b;
}

function createPlayerBullet(scene, type, angleRad, chargeLevel) {
  let color = getWeaponColor(shootMode);
  let bullet;

  if (type === 'homing') {
    bullet = scene.add.circle(player.x + 15, player.y, 5, color);
  } else if (type === 'auto') {
    bullet = scene.add.rectangle(player.x + 15, player.y, 14, 5, color);
  } else if (type === 'triple') {
    bullet = scene.add.triangle(player.x + 15, player.y, 0, -5, 14, 0, 0, 5, color);
    if (angleRad) bullet.setRotation(angleRad);
  } else if (type === 'pierce') {
    let size = TUNING.SHOOT.PIERCE_SIZE_MIN;
    let damage = TUNING.SHOOT.PIERCE_DAMAGE_MIN;
    if (chargeLevel === 2) { size = TUNING.SHOOT.PIERCE_SIZE_MED; damage = TUNING.SHOOT.PIERCE_DAMAGE_MED; color = COLORS.weaponPierceMed; }
    else if (chargeLevel === 3) { size = TUNING.SHOOT.PIERCE_SIZE_MAX; damage = TUNING.SHOOT.PIERCE_DAMAGE_MAX; color = COLORS.weaponPierceMax; }
    bullet = scene.add.graphics({ x: player.x + 15, y: player.y });
    bullet.fillStyle(color, 1);
    bullet.fillTriangle(0, -size / 2, size / 2, 0, 0, size / 2);
    bullet.fillTriangle(0, -size / 2, -size / 2, 0, 0, size / 2);
    bullet.lineStyle(2, 0xffffff, 0.8);
    bullet.strokeTriangle(0, -size / 2, size / 2, 0, 0, size / 2);
    bullet.strokeTriangle(0, -size / 2, -size / 2, 0, 0, size / 2);
    bullet.setData('damage', damage);
    bullet.setData('pierce', true);
    bullet.setData('chargeLevel', chargeLevel);
    bullet.setData('hitTargets', new Set());
  }

  bullet.setBlendMode(Phaser.BlendModes.ADD);
  bullet.setDepth(50);
  playerBullets.add(bullet);
  scene.physics.add.existing(bullet);
  bullet.body.allowGravity = false;

  if (type === 'pierce') {
    let hs = chargeLevel === 3 ? TUNING.SHOOT.PIERCE_SIZE_MAX : chargeLevel === 2 ? TUNING.SHOOT.PIERCE_SIZE_MED : TUNING.SHOOT.PIERCE_SIZE_MIN;
    bullet.body.setSize(hs, hs);
    bullet.body.setOffset(-hs / 2, -hs / 2);
    bullet.body.setVelocityX(TUNING.SHOOT.BULLET_SPEED);
  } else if (type === 'triple') {
    bullet.body.setVelocity(TUNING.SHOOT.BULLET_SPEED * Math.cos(angleRad), TUNING.SHOOT.BULLET_SPEED * Math.sin(angleRad));
    bullet.setData('damage', TUNING.SHOOT.TRIPLE_DAMAGE);
  } else if (type === 'auto') {
    bullet.body.setVelocityX(TUNING.SHOOT.BULLET_SPEED);
    bullet.setData('damage', TUNING.SHOOT.AUTO_DAMAGE);
  } else {
    bullet.body.setVelocityX(TUNING.SHOOT.BULLET_SPEED);
    bullet.setData('damage', TUNING.SHOOT.HOMING_DAMAGE);
  }

  bullet.setData('type', type);
  return bullet;
}

function createPlatform(scene, x, y, width, opts = {}) {
  const { isMoving = false, color = COLORS.platform } = opts;
  let plat = scene.add.graphics({ x, y });
  plat.setData('isMoving', isMoving);
  plat.setData('width', width);
  plat.setData('color', color);
  plat.setDepth(5);
  plat.setBlendMode(Phaser.BlendModes.ADD);

  function redraw(col) {
    plat.clear();
    const w = width, h = 20;

    plat.fillStyle(col, 0.08);
    plat.fillRect(-w / 2, -h / 2, w, h);

    plat.lineStyle(6, col, 0.22); plat.strokeRect(-w / 2, -h / 2, w, h);
    plat.lineStyle(2.5, col, 1); plat.strokeRect(-w / 2, -h / 2, w, h);
  }
  redraw(color);
  plat._redraw = redraw;

  platforms.add(plat);
  scene.physics.add.existing(plat);
  plat.body.allowGravity = false;
  plat.body.immovable = true;
  plat.body.setSize(width, 20);
  plat.body.setOffset(-width / 2, -10);
  plat.body.checkCollision.down = false;
  plat.body.checkCollision.left = false;
  plat.body.checkCollision.right = false;

  if (isMoving) {
    scene.tweens.add({ targets: plat, y: plat.y - 80, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  return plat;
}

function createSpike(scene, x, y, width) {
  let spike = scene.add.graphics({ x, y });
  spike.setDepth(6);
  spike.setData('width', width);
  spike.setBlendMode(Phaser.BlendModes.ADD);

  const w = width;
  const spikeColor = COLORS.spike;

  const spikeW = 20, spikeH = 22;
  const baseY = 10;
  const tipY = baseY - spikeH;
  const count = Math.floor(w / spikeW);


  spike.lineStyle(7, spikeColor, 0.25);
  for (let i = 0; i < count; i++) {
    let tx = -w / 2 + i * spikeW + spikeW / 2;
    spike.beginPath();
    spike.moveTo(tx - spikeW / 2, baseY);
    spike.lineTo(tx, tipY);
    spike.lineTo(tx + spikeW / 2, baseY);
    spike.strokePath();
  }

  spike.lineStyle(2, spikeColor, 1);
  for (let i = 0; i < count; i++) {
    let tx = -w / 2 + i * spikeW + spikeW / 2;
    spike.beginPath();
    spike.moveTo(tx - spikeW / 2, baseY);
    spike.lineTo(tx, tipY);
    spike.lineTo(tx + spikeW / 2, baseY);
    spike.strokePath();
  }

  spikes.add(spike);
  scene.physics.add.existing(spike);
  spike.body.allowGravity = false;
  spike.body.immovable = true;

  spike.body.setSize(w - 4, spikeH - 4);
  spike.body.setOffset(-w / 2 + 2, tipY + 2);
  return spike;
}

function createPowerup(scene, x, y, type) {
  let pu;
  if (type === 0) pu = scene.add.triangle(x, y, 0, 15, 15, 15, 7.5, 0, COLORS.powerupJump);
  else if (type === 1) pu = scene.add.text(x, y, '❤️', { fontSize: '18px' }).setOrigin(0.5);
  else if (type === 2) pu = scene.add.triangle(x, y, 0, 0, 15, 0, 7.5, 15, 0x00ffff);
  else if (type === 3) pu = scene.add.triangle(x, y, 0, 0, 15, 0, 7.5, 15, 0xff00ff);
  else if (type === 4) pu = scene.add.triangle(x, y, 0, 0, 15, 0, 7.5, 15, 0xff8800);
  else pu = scene.add.star(x, y, 4, 5, 12, 0xff3333);
  powerups.add(pu);
  scene.physics.add.existing(pu);
  pu.body.allowGravity = false;
  pu.body.immovable = true;
  pu.setData('type', type);
  scene.tweens.add({ targets: pu, y: pu.y - 15, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  return pu;
}

function createEnemy(scene, level) {
  const stats = {
    1: { r: 18, hp: 2, sides: 3, neonColor: COLORS.enemyL1 },
    2: { r: 22, hp: 4, sides: 4, neonColor: COLORS.enemyL2 },
    3: { r: 26, hp: 6, sides: 5, neonColor: COLORS.enemyL3 },
  }[level];
  let e = scene.add.graphics({ x: GAME_WIDTH + 50, y: Phaser.Math.Between(150, 450) });
  e.setBlendMode(Phaser.BlendModes.ADD);
  e.setDepth(10);
  e.radioActual = stats.r;
  e.radioBase = stats.r;
  e.brilloExtra = 1;

  e.velRotacion = (Math.random() > 0.5 ? 1 : -1) * (0.012 + level * 0.008);
  e.rotOuter = Math.random() * Math.PI * 2;
  e.rotInner = Math.random() * Math.PI * 2;
  e.faseTiempo = Math.random() * 100;
  e.sides = stats.sides;
  e.neonColor = stats.neonColor;
  e.hp = stats.hp;
  e.level = level;
  e.puntos = 2 + level;

  enemies.add(e);
  scene.physics.add.existing(e);
  e.body.allowGravity = false;
  e.body.setSize(stats.r * 2, stats.r * 2);
  e.body.offset.set(-stats.r, -stats.r);
  e.lastFire = playTime + Phaser.Math.Between(1000, 2000);

  let targetX = GAME_WIDTH - 50 - Phaser.Math.Between(0, 40);
  scene.tweens.add({
    targets: e, x: targetX, duration: 800 + Phaser.Math.Between(0, 500), ease: 'Power2',
    onComplete: () => {
      scene.tweens.add({ targets: e, y: e.y + Phaser.Math.Between(-80, 80), duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  });
  return e;
}

function createAirTriangle(scene, y, level) {
  let sizes = { 1: 18, 2: 24, 3: 30 };
  let s = sizes[level] || 18;
  let color = COLORS.airTriangle;

  let tri = scene.add.graphics({ x: 870, y });
  tri.setDepth(15);
  tri.setBlendMode(Phaser.BlendModes.ADD);



  tri.lineStyle(8, color, 0.25);
  tri.beginPath();
  tri.moveTo(-s, 0);
  tri.lineTo(s, -s * 0.7);
  tri.lineTo(s, s * 0.7);
  tri.closePath();
  tri.strokePath();

  tri.fillStyle(color, 0.15);
  tri.fillPath();

  tri.lineStyle(2.5, color, 1);
  tri.beginPath();
  tri.moveTo(-s, 0);
  tri.lineTo(s, -s * 0.7);
  tri.lineTo(s, s * 0.7);
  tri.closePath();
  tri.strokePath();

  airTriangles.add(tri);
  scene.physics.add.existing(tri);
  tri.body.allowGravity = false;
  let speed = level === 1 ? TUNING.AIR_TRIANGLE.SPEED_L1 : TUNING.AIR_TRIANGLE.SPEED_L23;
  tri.body.setVelocityX(-speed);
  tri.body.setSize(s * 2, s * 2);
  tri.body.setOffset(-s, -s);
  tri.setData('level', level);
  tri.setData('fired', false);
  tri.setData('size', s);


  let emitterRef = scene.time.addEvent({
    delay: level === 1 ? 45 : (level === 2 ? 35 : 25),
    loop: true,
    callback: () => {
      if (!tri || !tri.active) { emitterRef.remove(); return; }

      let squareSize = s * 0.7 * (level === 1 ? 0.9 : level === 2 ? 1.0 : 1.1);
      let sq = scene.add.rectangle(tri.x + s, tri.y + Phaser.Math.Between(-3, 3), squareSize, squareSize, color);
      sq.setBlendMode(Phaser.BlendModes.ADD);
      sq.setDepth(14);
      sq.setAlpha(0.55);
      scene.tweens.add({
        targets: sq,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        duration: 350, ease: 'Power2',
        onComplete: () => sq.destroy()
      });
    }
  });
  tri._emitterRef = emitterRef;
  return tri;
}

function spawnWarningRing(scene, x, y, delay) {
  scene.time.delayedCall(delay || 0, () => {
    let r = scene.add.graphics().setPosition(x, y).setDepth(80).setBlendMode(Phaser.BlendModes.ADD);
    r.lineStyle(2, 0xff0000, 0.8); r.strokeCircle(0, 0, 5);
    scene.tweens.add({ targets: r, scaleX: 10, scaleY: 10, alpha: 0, duration: 800, ease: 'Power2', onComplete: () => r.destroy() });
  });
}

function isMechanicActive(name) {
  return SECTIONS[currentSection].mechanics.includes(name);
}




function updateHealthHUD() {
  for (let i = 0; i < ui.healthBars.length; i++) {
    ui.healthBars[i].setText(i < playerState.health.current ? '❤️' : '🖤');
  }
}




function rebuildBarHUD(scene, key, newMax, createFn) {

  while (ui[key].length > newMax) ui[key].pop().destroy();

  while (ui[key].length < newMax) ui[key].push(createFn(scene, ui[key].length, newMax));

  if (key === 'healthBars') {
    for (let i = 0; i < ui.healthBars.length; i++) {
      ui.healthBars[i].setX(GAME_WIDTH / 2 - (newMax - 1) * 14 + i * 28);
    }
  }
}

function spawnDeathExplosion(scene, x, y, neonColor, count) {
  let c = count || 6;
  let flash = scene.add.circle(x, y, 24, 0xffffff, 0.85);
  flash.setBlendMode(Phaser.BlendModes.ADD).setDepth(155);
  scene.tweens.add({ targets: flash, alpha: 0, scale: 0.1, duration: 180, ease: 'Power2', onComplete: () => flash.destroy() });
  for (let i = 0; i < c; i++) {
    let ang = Math.random() * Math.PI * 2;
    let dist = Phaser.Math.Between(20, 80);
    let p = scene.add.circle(x, y, Phaser.Math.Between(2, 5), Math.random() < 0.4 ? 0xffffff : neonColor);
    p.setBlendMode(Phaser.BlendModes.ADD).setDepth(151);
    scene.tweens.add({ targets: p, x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist, alpha: 0, scale: 0, duration: Phaser.Math.Between(280, 500), ease: 'Power2', onComplete: () => p.destroy() });
  }
  let ring = scene.add.graphics({ x, y });
  ring.lineStyle(3, neonColor, 0.9); ring.strokeCircle(0, 0, 8);
  ring.setBlendMode(Phaser.BlendModes.ADD).setDepth(150);
  scene.tweens.add({ targets: ring, scaleX: 6, scaleY: 6, alpha: 0, duration: 350, ease: 'Power2', onComplete: () => ring.destroy() });
}



function spawnBoss(scene, sectionIdx) {
  bossSection = sectionIdx;
  bossState = 'entering';
  let isBoss2 = sectionIdx === 4;
  bossHpMax = (isBoss2 ? TUNING.BOSS.HP_BOSS2 : TUNING.BOSS.HP_BOSS1) + loopCount * TUNING.BOSS.HP_LOOP_BONUS;
  bossHp = bossHpMax;
  bossPattern = 0;
  bossNextAction = 0;
  enemies.clear(true, true);
  enemyBullets.clear(true, true);
  let rb = isBoss2 ? 55 : 42;
  let neonColor = isBoss2 ? 0xff6600 : 0xff3333;
  let puntos = isBoss2 ? 5 : 4;
  boss = scene.add.graphics({ x: GAME_WIDTH + 60, y: GAME_HEIGHT / 2 - 50 });
  boss.setBlendMode(Phaser.BlendModes.ADD);
  boss.setDepth(20);
  boss.radioActual = rb;
  boss.brilloExtra = 1;
  boss.velRotacion = (Math.random() > 0.5 ? 1 : -1) * 0.015;
  boss.faseTiempo = Math.random() * 100;
  boss.radioBase = rb;
  boss.neonColor = neonColor;
  boss.sides = puntos;
  boss.puntos = puntos; // mantener por compatibilidad
  scene.tweens.add({
    targets: boss,
    x: GAME_WIDTH - 120,
    duration: 1200,
    ease: 'Power2',
    onComplete: () => {
      bossState = 'active';
      bossNextAction = playTime + 1500;
      Audio.bossEnter();
    }
  });

  // Mostrar nombre del boss
  let bossName = isBoss2 ? 'MEGAPLATANUS' : 'PLATANUS PRIME';
  ui.bossNameText.setText(bossName).setVisible(true);
}

function killFinalBoss(scene) {
  if (bossState === 'dying') return;
  bossState = 'dying';
  Audio.bossDie();

  // Limpiar balas
  enemyBullets.clear(true, true);
  playerBullets.clear(true, true);

  // Paso 1: Boss se mueve al centro
  scene.tweens.add({
    targets: boss,
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
    duration: 1200,
    ease: 'Power2',
    onComplete: () => {
      // Paso 2: Tiembla
      let shakeCount = 0;
      let shakeTimer = scene.time.addEvent({
        delay: 80,
        loop: true,
        callback: () => {
          if (!boss || !boss.active) { shakeTimer.remove(); return; }
          boss.x = GAME_WIDTH / 2 + Phaser.Math.Between(-8, 8);
          boss.y = GAME_HEIGHT / 2 + Phaser.Math.Between(-8, 8);
          boss.brilloExtra = 1 + shakeCount * 0.3;
          shakeCount++;
          if (shakeCount > 18) {
            shakeTimer.remove();
            // Paso 3: Explosiones en cadena
            spawnDeathExplosion(scene, GAME_WIDTH / 2, GAME_HEIGHT / 2, 0xff6600, 20);
            scene.time.delayedCall(200, () => {
              spawnDeathExplosion(scene, GAME_WIDTH / 2, GAME_HEIGHT / 2, 0xffffff, 12);
            });
            if (boss) { boss.destroy(); boss = null; }
            if (ui.bossNameText) ui.bossNameText.setVisible(false);
            scene.cameras.main.shake(500, 0.025);

            // Paso 4: Flash blanco que cubre todo
            let flash = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 1)
              .setOrigin(0, 0).setDepth(400);
            scene.time.delayedCall(700, () => {
              scene.tweens.add({
                targets: flash,
                alpha: 0,
                duration: 1000,
                onComplete: () => {
                  flash.destroy();
                  changeState(scene, 'victory');
                }
              });
            });
          }
        }
      });
    }
  });
}

function killBoss(scene) {
  if (bossState === 'dying') return;
  bossState = 'dying';
  Audio.bossDie();
  let bx = boss.x, by = boss.y;
  let bnc = boss.neonColor || 0xff6600;
  boss.destroy();
  boss = null;
  let flash = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 1).setOrigin(0, 0).setDepth(300);
  scene.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
  spawnDeathExplosion(scene, bx, by, bnc, 14);
  scene.time.delayedCall(1000, () => {
    ui.bossNameText.setVisible(false);
    if (currentState !== 'playing') return;
    bossState = null;
    enemyBullets.clear(true, true);

    // Si es el boss final, usar la cinemática especial
    if (bossSection === 4) {
      killFinalBoss(scene);
      return;
    }

    // Avance de sección normal (ya sabemos que bossSection !== 4 aquí)
    currentSection++;
    sectionTimer = 0;
    sectionProgress = 0;
    gameSpeed = Math.max(SECTIONS[currentSection].speedFloor, gameSpeed * 0.8);
    pendingBonusPowerup = true;
    Audio.sectionChange();
    playerState.health.current = playerState.health.max;
    updateHealthHUD();
    let flash2 = scene.add.graphics();
    flash2.fillStyle(SECTIONS[currentSection].color, 1);
    flash2.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    flash2.setDepth(200);
    scene.tweens.add({ targets: flash2, alpha: 0, duration: 300, onComplete: () => flash2.destroy() });
  });
}

function executeBossPattern(scene) {
  if (!boss || !boss.active || bossState !== 'active') return;
  let numPatterns = bossSection === 4 ? 4 : 3;
  let pat = bossPattern % numPatterns;
  let rb2 = boss.radioBase || 42;
  scene.tweens.add({ targets: boss, radioActual: rb2 * 1.3, brilloExtra: 2.5, duration: 80, ease: 'Sine.easeOut', yoyo: true, hold: 30 });
  if (pat === 0) {
    spawnWarningRing(scene, boss.x - 40, boss.y);
    let baseAngle = Phaser.Math.Angle.Between(boss.x, boss.y, player.x, player.y);
    for (let i = 0; i < 6; i++) {
      let a = baseAngle - Phaser.Math.DegToRad(50) + i * Phaser.Math.DegToRad(20);
      createEnemyBullet(scene, boss.x - 40, boss.y, Math.cos(a) * TUNING.BOSS.BULLET_SPEED_SPREAD, Math.sin(a) * TUNING.BOSS.BULLET_SPEED_SPREAD);
    }
    bossNextAction = playTime + TUNING.BOSS.PATTERN_COOLDOWN_MS;
  } else if (pat === 1) {
    let heights = [100, 230, 360, 480];
    heights.forEach((h, i) => {
      spawnWarningRing(scene, GAME_WIDTH - 50, h, i * TUNING.ENEMY.BURST_DELAY_MS);
      scene.time.delayedCall(i * TUNING.ENEMY.BURST_DELAY_MS + 500, () => {
        if (bossState !== 'active') return;
        createEnemyBullet(scene, boss ? boss.x - 40 : GAME_WIDTH - 160, h, -TUNING.BOSS.BULLET_SPEED_STRAFE, 0);
      });
    });
    bossNextAction = playTime + TUNING.BOSS.PATTERN_COOLDOWN_MS;
  } else if (pat === 2) {
    let positions = [];
    for (let i = 0; i < 3; i++) {
      positions.push({ x: Phaser.Math.Between(80, 500), y: Phaser.Math.Between(80, 500) });
    }
    positions.forEach(p => spawnWarningRing(scene, p.x, p.y));
    scene.time.delayedCall(1000, () => {
      if (bossState !== 'active' || !boss) return;
      positions.forEach(p => {
        let a = Phaser.Math.Angle.Between(boss.x, boss.y, p.x, p.y);
        createEnemyBullet(scene, boss.x - 40, boss.y, Math.cos(a) * TUNING.BOSS.BULLET_SPEED, Math.sin(a) * TUNING.BOSS.BULLET_SPEED);
      });
    });
    bossNextAction = playTime + TUNING.BOSS.PATTERN_COOLDOWN_MS;
  } else {
    spawnWarningRing(scene, boss.x, boss.y);
    for (let i = 0; i < 8; i++) {
      let a = (i / 8) * Math.PI * 2;
      createEnemyBullet(scene, boss.x, boss.y, Math.cos(a) * TUNING.BOSS.BULLET_SPEED, Math.sin(a) * TUNING.BOSS.BULLET_SPEED);
    }
    bossNextAction = playTime + TUNING.BOSS.PATTERN_COOLDOWN_MS;
  }
  bossPattern++;
}

function drawNeonEnemy(e, time) {
  e.clear();

  e.rotOuter = (e.rotOuter || 0) + (e.velRotacion || 0.02);
  e.rotInner = (e.rotInner || 0) - (e.velRotacion || 0.02) * 2;

  let sides = e.sides || 3;
  let nc = e.neonColor || COLORS.enemyL1;
  let bx = e.brilloExtra || 1;
  let rBase = e.radioBase || 18;


  let pulse = Math.sin((time * 0.003) + (e.faseTiempo || 0)) * 1.2;
  let rOuter = (e.radioActual || rBase) + pulse;
  let rInner = rOuter * 0.45;


  function makePoly(radius, rotation) {
    const verts = [];

    const startAngle = (sides % 2 !== 0) ? -Math.PI / 2 : -Math.PI / sides;
    for (let i = 0; i < sides; i++) {
      let a = startAngle + rotation + (i / sides) * Math.PI * 2;
      verts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
    }
    return verts;
  }

  const outerVerts = makePoly(rOuter, e.rotOuter);
  const innerVerts = makePoly(rInner, e.rotInner);


  e.lineStyle(9, nc, 0.25 * bx);
  e.strokePoints(outerVerts, true, true);
  e.lineStyle(3.5, nc, 1);
  e.strokePoints(outerVerts, true, true);

  e.lineStyle(5, nc, 0.25 * bx);
  e.strokePoints(innerVerts, true, true);
  e.lineStyle(2, nc, 1);
  e.strokePoints(innerVerts, true, true);


  e.fillStyle(nc, 0.4 * bx);
  e.fillCircle(0, 0, rInner * 0.4);
  e.fillStyle(0xffffff, Math.min(1, 0.6 * bx));
  e.fillCircle(0, 0, rInner * 0.2);
}

function lbStorageGet() {
  try {
    let raw = localStorage.getItem('chromadash-leaderboard');
    if (raw) { let v = JSON.parse(raw); if (Array.isArray(v.top)) return v.top; }
  } catch (_) { }
  return [];
}

function lbStorageSet(top) {
  try { localStorage.setItem('chromadash-leaderboard', JSON.stringify({ top })); } catch (_) { }
}

async function updateLeaderboard(score, name) {
  ui.leaderboardText.setText('Saving score...');
  ui.leaderboardText.setVisible(true);

  try {
    let top = [];
    if (window.platanusArcadeStorage) {
      let result = await window.platanusArcadeStorage.get('chromadash-leaderboard');
      if (result && result.found && result.value && Array.isArray(result.value.top)) top = result.value.top;
    } else {
      top = lbStorageGet();
    }

    top.push({ score, name: name || '???' });
    top.sort((a, b) => b.score - a.score);
    if (top.length > 5) top = top.slice(0, 5);

    if (window.platanusArcadeStorage) {
      await window.platanusArcadeStorage.set('chromadash-leaderboard', { top });
    } else {
      lbStorageSet(top);
    }

    let lbText = 'TOP 5:\n\n';
    for (let i = 0; i < top.length; i++) lbText += `${i + 1}. ${top[i].name || '???'}  ${top[i].score}\n`;
    ui.leaderboardText.setText(lbText);
  } catch (err) {
    ui.leaderboardText.setText('Error saving');
  }
}

function triggerDeathPulse(scene) {

  let ring = scene.add.graphics();
  ring.lineStyle(4, 0xffffff, 0.9);
  ring.strokeCircle(0, 0, 10);
  ring.setPosition(player.x, player.y);
  ring.setBlendMode(Phaser.BlendModes.ADD);
  ring.setDepth(150);
  scene.tweens.add({
    targets: ring,
    scaleX: 25, scaleY: 25, alpha: 0,
    duration: 450, ease: 'Power2',
    onComplete: () => ring.destroy()
  });

  let bullets = enemyBullets.getChildren().slice();
  bullets.sort((a, b) => {
    let da = Phaser.Math.Distance.Between(player.x, player.y, a.x, a.y);
    let db = Phaser.Math.Distance.Between(player.x, player.y, b.x, b.y);
    return da - db;
  });
  bullets.forEach((bullet, index) => {
    scene.time.delayedCall(index * 40, () => {
      if (!bullet || !bullet.active) return;
      for (let i = 0; i < 5; i++) {
        let angle = Math.random() * Math.PI * 2;
        let dist = Phaser.Math.Between(10, 30);
        let p = scene.add.circle(bullet.x, bullet.y, 3, COLORS.enemyBullet);
        p.setBlendMode(Phaser.BlendModes.ADD);
        p.setDepth(120);
        scene.tweens.add({
          targets: p,
          x: bullet.x + Math.cos(angle) * dist,
          y: bullet.y + Math.sin(angle) * dist,
          alpha: 0, scale: 0,
          duration: 200, ease: 'Power2',
          onComplete: () => p.destroy()
        });
      }
      bullet.destroy();
    });
  });
}

function playerDie(scene, type) {
  if (currentState !== 'playing') return;
  if ((type === 'enemy' || type === 'enemyBullet' || type === 'airTriangle') && !playerState.canBeHit()) return;
  playerState.health.current--;
  updateHealthHUD();
  if (playerState.health.current <= 0) {
    if (playerDying) return; // evitar doble activación
    playerDying = true;
    Audio.die();
    scene.physics.pause();

    // Animación: el jugador escala hacia arriba y desaparece
    scene.tweens.add({
      targets: player,
      scaleX: 2.5,
      scaleY: 2.5,
      alpha: 0,
      duration: 800,
      ease: 'Power2'
    });

    // Flash rojo de pantalla
    let deathFlash = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0.4)
      .setOrigin(0, 0).setDepth(299);
    scene.tweens.add({
      targets: deathFlash,
      alpha: 0,
      duration: 1200,
      onComplete: () => deathFlash.destroy()
    });

    // Explosión de partículas en la posición del jugador
    spawnDeathExplosion(scene, player.x, player.y, COLORS.player, 14);

    // Esperar 2 segundos antes de mostrar la pantalla de nombre
    scene.time.delayedCall(2000, () => {
      playerDying = false;
      scene.physics.resume(); // lo vuelve a pausar dentro de nameentry.enter
      changeState(scene, 'nameentry');
    });
  } else {
    playerState.setState('hurt');
    playerState.invulnerableUntil = playTime + TUNING.PLAYER.IMMUNITY_AFTER_HIT_MS;
    Audio.hurt();


    scene.cameras.main.shake(150, 0.01);

    let flash = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0.25).setOrigin(0, 0).setDepth(250);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
    if (type === 'enemyBullet') {
      triggerDeathPulse(scene);
      Audio.deathPulse();
    }
  }
}

function preload() { }

function create() {
  const scene = this;


  ui.bgStarsGfx = scene.add.graphics().setDepth(2);

  bgStarsFar = [];
  for (let i = 0; i < 80; i++) {
    bgStarsFar.push({ x: Math.random() * GAME_WIDTH, y: Math.random() * GAME_HEIGHT, size: (Math.random() * 1.0 + 0.5) * 1.0, alpha: Math.random() * 0.4 + 0.2 });
  }

  bgStarsMid = [];
  for (let i = 0; i < 50; i++) {
    bgStarsMid.push({ x: Math.random() * GAME_WIDTH, y: Math.random() * GAME_HEIGHT, size: (Math.random() * 1.5 + 0.5) * 1.2, alpha: Math.random() * 0.5 + 0.3 });
  }

  bgStarsNear = [];
  for (let i = 0; i < 35; i++) {
    bgStarsNear.push({ x: Math.random() * GAME_WIDTH, y: Math.random() * GAME_HEIGHT, size: Math.random() * 2.5 + 1.5, alpha: Math.random() * 0.6 + 0.4, trail: Math.random() > 0.6 });
  }


  currentThemeColorRGB = Phaser.Display.Color.IntegerToRGB(SECTIONS[0].color);
  let initRGB = Phaser.Display.Color.IntegerToRGB(SECTIONS[0].color);
  let initialBgC = Phaser.Display.Color.GetColor(
    Math.floor(initRGB.r * 0.4),
    Math.floor(initRGB.g * 0.4),
    Math.floor(initRGB.b * 0.4)
  );
  ui.bgRect = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, initialBgC).setOrigin(0, 0).setDepth(0);


  ui.sectionBarBg = scene.add.rectangle(0, 0, GAME_WIDTH, 12, 0x333333).setOrigin(0, 0).setDepth(200);
  ui.sectionBarFill = scene.add.rectangle(0, 0, 0, 12, SECTIONS[0].color).setOrigin(0, 0).setDepth(201);
  ui.sectionText = scene.add.text(GAME_WIDTH - 10, 6, 'S1', {
    fontSize: '12px',
    fontFamily: 'Arial',
    color: '#ffffff',
    fontStyle: 'bold'
  }).setOrigin(1, 0.5).setDepth(202);

  // Nombre del boss (aparece debajo de la barra de vida del boss)
  ui.bossNameText = scene.add.text(GAME_WIDTH / 2, 20, '', {
    fontSize: '13px',
    fontFamily: 'Arial',
    color: '#ff6600',
    fontStyle: 'bold',
    stroke: '#000000',
    strokeThickness: 3,
    align: 'center'
  }).setOrigin(0.5, 0).setDepth(202).setVisible(false);


  // Start screen elements are dynamically generated in states.start.enter

  ui.scoresOverlay = scene.add.graphics();
  ui.scoresOverlay.fillStyle(0x000000, 0.85);
  ui.scoresOverlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ui.scoresOverlay.setDepth(300).setVisible(false);

  ui.scoresTitle = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 130, '— TOP SCORES —', {
    fontSize: '28px', fontFamily: 'Arial', color: '#ffff00', fontStyle: 'bold'
  }).setOrigin(0.5).setDepth(301).setVisible(false);

  ui.scoresDisplay = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
    fontSize: '22px', fontFamily: 'Arial', color: '#ffffff', align: 'center', lineSpacing: 10
  }).setOrigin(0.5).setDepth(301).setVisible(false);

  ui.scoresBack = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 160, 'PRESS SPACE TO RETURN', {
    fontSize: '16px', fontFamily: 'Arial', color: '#888888'
  }).setOrigin(0.5).setDepth(301).setVisible(false);


  // Paused UI is dynamically generated in states.paused.enter




  player = scene.add.graphics({ x: 200, y: 300 });
  player.setDepth(30);
  scene.physics.add.existing(player);
  player.body.setSize(24, 32);
  player.body.setOffset(-12, -16);
  player.body.allowGravity = false;
  player.setVisible(false);


  playerTrailGfx = scene.add.graphics().setDepth(29);
  playerTrailGfx.setBlendMode(Phaser.BlendModes.ADD);




  spikes = scene.physics.add.group({
    allowGravity: false,
    immovable: true
  });


  playerBullets = scene.physics.add.group({ allowGravity: false });


  enemies = scene.physics.add.group({ allowGravity: false });
  airTriangles = scene.physics.add.group({ allowGravity: false });

  scene.physics.add.overlap(player, airTriangles, (pl, tri) => playerDie(scene, 'airTriangle'));
  scene.physics.add.overlap(playerBullets, airTriangles, (bullet, tri) => {
    let isPierce = bullet.getData('pierce');
    if (!isPierce) bullet.destroy();
    let tx = tri.x, ty = tri.y;
    if (tri._emitterRef) tri._emitterRef.remove();
    tri.destroy();
    enemiesDefeated++;
    spawnDeathExplosion(scene, tx, ty, COLORS.airTriangle, 6);
  });


  enemyBullets = scene.physics.add.group({ allowGravity: false });


  powerups = scene.physics.add.group({ allowGravity: false });
  let warningLinesGroup = scene.add.group();
  scene.warningLinesGroup = warningLinesGroup;


  scene.physics.add.overlap(player, spikes, () => playerDie(scene, 'spike'));
  scene.physics.add.overlap(player, enemies, (pl, en) => {
    if (playerState.state === 'downDashing' && (pl.body.velocity.y > 10 || pl.y < en.y)) {
      let ex = en.x, ey = en.y, enc = en.neonColor || COLORS.enemyL1;
      en.destroy();
      enemiesDefeated++;
      spawnDeathExplosion(scene, ex, ey, enc, 6);
      pl.body.setVelocityY(TUNING.PLAYER.DOWN_DASH_BOUNCE);
      playerState.setState('airborne');
    } else {
      playerDie(scene, 'enemy');
    }
  });
  scene.physics.add.overlap(player, enemyBullets, () => playerDie(scene, 'enemyBullet'));
  scene.physics.add.overlap(playerBullets, enemies, (bullet, enemy) => {
    let isPierce = bullet.getData('pierce');
    if (isPierce) {
      let hits = bullet.getData('hitTargets');
      if (hits && hits.has(enemy)) return;
      if (hits) hits.add(enemy);
    }
    let damage = bullet.getData('damage') || 1;
    let hp = (enemy.hp || 1) - damage;
    enemy.hp = hp;
    if (!isPierce) bullet.destroy();
    if (hp <= 0) {
      spawnDeathExplosion(scene, enemy.x, enemy.y, enemy.neonColor || 0xff0044, 8);
      enemy.destroy();
      enemiesDefeated++;
      Audio.enemyDie();
    } else {
      enemy.brilloExtra = 5;
      scene.time.delayedCall(100, () => { if (enemy.active) enemy.brilloExtra = 1; });
    }
  });

  scene.physics.add.overlap(player, powerups, (pl, pu) => {
    if (pl.body.velocity.y > 10 || pl.y < pu.y) {
      let pt = pu.getData('type');
      if (pt === 0) {
        if (playerState.jumps.max < TUNING.PLAYER.JUMP_MAX) {
          playerState.jumps.max++;
          rebuildBarHUD(scene, 'jumpBars', playerState.jumps.max,
            (sc, i) => { let b = sc.add.rectangle(20 + i * 28, GAME_HEIGHT - 30, 24, 10, COLORS.powerupJump); b.setOrigin(0, 0.5); return b; });
        }
        playerState.jumps.current = playerState.jumps.max;
      } else if (pt === 1) {
        if (playerState.health.max < TUNING.PLAYER.HEALTH_MAX) {
          playerState.health.max++;
          rebuildBarHUD(scene, 'healthBars', playerState.health.max,
            (sc, i, max) => { let hb = sc.add.text(GAME_WIDTH / 2 - (max - 1) * 14 + i * 28, GAME_HEIGHT - 14, '❤️', { fontSize: '18px' }).setOrigin(0.5); hb.setDepth(202); return hb; });
        }
        playerState.health.current = playerState.health.max;
        updateHealthHUD();
      } else if (pt === 2) {
        shootMode = 'homing';
        updateWeaponUI();
        showWeaponChangeIndicator(scene, 'HOMING', '#00ffff');
      } else if (pt === 3) {
        shootMode = 'triple';
        updateWeaponUI();
        showWeaponChangeIndicator(scene, 'TRIPLE', '#ff00ff');
      } else if (pt === 4) {
        shootMode = 'auto';
        updateWeaponUI();
        showWeaponChangeIndicator(scene, 'AUTO', '#ff8800');
      } else if (pt === 5) {
        shootMode = 'pierce';
        updateWeaponUI();
        showWeaponChangeIndicator(scene, 'PIERCE', '#ff2200');
      }
      Audio.powerup();
      pu.destroy();
    }
  });


  platforms = scene.physics.add.group({
    allowGravity: false,
    immovable: true
  });
  scene.physics.add.collider(player, platforms);


  createPlatform(scene, GAME_WIDTH / 2, 550, GAME_WIDTH * 1.5, { color: SECTIONS[0].color });


  ui.jumpBars = [];
  for (let i = 0; i < playerState.jumps.max; i++) {
    let bar = scene.add.rectangle(20 + i * 28, GAME_HEIGHT - 30, 24, 10, COLORS.powerupJump);
    bar.setOrigin(0, 0.5);
    ui.jumpBars.push(bar);
  }


  ui.healthBars = [];
  for (let i = 0; i < playerState.health.max; i++) {
    let hb = scene.add.text(GAME_WIDTH / 2 - (playerState.health.max - 1) * 14 + i * 28, GAME_HEIGHT - 14, '❤️', { fontSize: '18px' }).setOrigin(0.5);
    hb.setDepth(202);
    ui.healthBars.push(hb);
  }


  ui.shootModeText = scene.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 30, '◆ HOMING', {
    fontSize: '20px',
    fontFamily: 'Arial',
    color: '#00ffff',
    fontStyle: 'bold'
  }).setOrigin(1, 0.5).setDepth(202);


  ui.scoreText = scene.add.text(20, 20, 'SCORE: 0', {
    fontSize: '24px',
    fontFamily: 'Arial',
    color: '#ffffff',
    fontStyle: 'bold'
  }).setOrigin(0, 0).setDepth(202);


  ui.leaderboardText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, '', {
    fontSize: '18px',
    fontFamily: 'Arial',
    color: '#aaaaaa',
    align: 'center'
  }).setOrigin(0.5).setDepth(101).setVisible(false);

  ui.nameOverlay = scene.add.graphics();
  ui.nameOverlay.fillStyle(0x000000, 0.88);
  ui.nameOverlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ui.nameOverlay.setDepth(400).setVisible(false);

  ui.nameTitle = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 130, 'ENTER YOUR NAME', {
    fontSize: '30px', fontFamily: 'Arial', color: '#ffff00', fontStyle: 'bold'
  }).setOrigin(0.5).setDepth(401).setVisible(false);

  ui.nameLetterTexts = [0, 1, 2].map(i =>
    scene.add.text(GAME_WIDTH / 2 - 80 + i * 80, GAME_HEIGHT / 2 - 20, 'A', {
      fontSize: '72px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(401).setVisible(false)
  );

  ui.nameCursorArrow = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, '▲', {
    fontSize: '24px', fontFamily: 'Arial', color: '#ffff00'
  }).setOrigin(0.5).setDepth(401).setVisible(false);

  ui.nameInstructions = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 110, 'W/S  CHANGE   A/D  MOVE   SPACE  CONFIRM', {
    fontSize: '14px', fontFamily: 'Arial', color: '#888888'
  }).setOrigin(0.5).setDepth(401).setVisible(false);


  const onKeyDown = (event) => {
    let key = event.key;
    if (key.length === 1 && key !== ' ') {
      key = key.toLowerCase();
    }
    const arcadeCode = KEYBOARD_TO_ARCADE[key];
    if (arcadeCode) {
      if (!controls.held[arcadeCode]) {
        controls.pressed[arcadeCode] = true;
      }
      controls.held[arcadeCode] = true;
    }
  };

  const onKeyUp = (event) => {
    let key = event.key;
    if (key.length === 1 && key !== ' ') {
      key = key.toLowerCase();
    }
    const arcadeCode = KEYBOARD_TO_ARCADE[key];
    if (arcadeCode) {
      controls.held[arcadeCode] = false;
    }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  scene.events.once('shutdown', () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  });

  states[currentState].enter(scene);
}

function consumePressed(code) {
  if (controls.pressed[code]) {
    controls.pressed[code] = false;
    return true;
  }
  return false;
}

function resetGame(scene) {
  playerDying = false;
  playerTrail = [];
  if (playerTrailGfx) playerTrailGfx.clear();

  for (const code in controls.held) controls.held[code] = false;
  for (const code in controls.pressed) controls.pressed[code] = false;
  player.setPosition(200, 300);
  player.body.setVelocity(0, 0);
  player.body.allowGravity = true;
  player.setScale(1);
  player.setAlpha(1);
  player.setVisible(true);

  playerState.reset();
  rebuildBarHUD(scene, 'jumpBars', playerState.jumps.max,
    (sc, i) => { let b = sc.add.rectangle(20 + i * 28, GAME_HEIGHT - 30, 24, 10, COLORS.powerupJump); b.setOrigin(0, 0.5); return b; });
  rebuildBarHUD(scene, 'healthBars', playerState.health.max,
    (sc, i, max) => { let hb = sc.add.text(GAME_WIDTH / 2 - (max - 1) * 14 + i * 28, GAME_HEIGHT - 14, '❤️', { fontSize: '18px' }).setOrigin(0.5); hb.setDepth(202); return hb; });
  updateHealthHUD();
  gameSpeed = TUNING.WORLD.GAME_SPEED_START;
  nextPlatformX = GAME_WIDTH + 200;
  playTime = 0;
  lastFireTime = 0;
  nextEnemyTime = TUNING.WORLD.FIRST_ENEMY_DELAY_MS;
  const weapons = ['homing', 'auto', 'triple', 'pierce'];
  shootMode = weapons[Math.floor(Math.random() * weapons.length)];
  updateWeaponUI();

  enemiesDefeated = 0;
  currentScore = 0;
  ui.scoreText.setText('SCORE: 0');
  ui.leaderboardText.setVisible(false);

  currentSection = 0;
  sectionProgress = 0;
  sectionTimer = 0;
  pendingBonusPowerup = false;
  currentThemeColorRGB = Phaser.Display.Color.IntegerToRGB(SECTIONS[0].color);

  bossState = null;
  if (boss && boss.active) boss.destroy();
  boss = null;
  bossHp = 0;
  bossPattern = 0;
  bossNextAction = 0;
  bossSection = 0;
  loopCount = 0;
  if (ui.bossNameText) ui.bossNameText.setVisible(false);

  platforms.clear(true, true);
  spikes.clear(true, true);
  playerBullets.clear(true, true);
  enemies.clear(true, true);
  airTriangles.clear(true, true);
  enemyBullets.clear(true, true);
  powerups.clear(true, true);
  if (scene.warningLinesGroup) scene.warningLinesGroup.clear(true, true);
  createPlatform(scene, GAME_WIDTH / 2, 550, GAME_WIDTH * 1.5, { color: SECTIONS[0].color });
}



function refreshNameDisplay() {
  for (let i = 0; i < 3; i++) {
    ui.nameLetterTexts[i].setText(NAME_CHARS[nameLetters[i]]);
    ui.nameLetterTexts[i].setColor(i === nameCursor ? '#ffff00' : '#ffffff');
  }
  ui.nameCursorArrow.setX(GAME_WIDTH / 2 - 80 + nameCursor * 80);
}

function confirmName(scene) {
  let name = nameLetters.map(i => NAME_CHARS[i]).join('');
  updateLeaderboard(currentScore, name);
  changeState(scene, 'gameover');
}

async function loadLeaderboard() {
  ui.scoresDisplay.setText('Loading...');
  try {
    let top = [];
    if (window.platanusArcadeStorage) {
      let result = await window.platanusArcadeStorage.get('chromadash-leaderboard');
      if (result && result.found && result.value && Array.isArray(result.value.top)) top = result.value.top;
    } else {
      top = lbStorageGet();
    }
    if (top.length === 0) {
      ui.scoresDisplay.setText('NO SCORES YET\nBE THE FIRST MASTER!');
    } else {
      ui.scoresDisplay.setText(top.map((e, i) => `${i + 1}.  ${e.name || '???'}  ${e.score}`).join('\n'));
    }
  } catch (_) {
    ui.scoresDisplay.setText('SCORES OFFLINE');
  }
}

const states = {
  start: {
    enter(scene) {
      Audio.stopBGM();
      ui.startElements = [];

      let cx = GAME_WIDTH / 2;
      let bg = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x050508, 0.85).setOrigin(0, 0).setDepth(390);
      ui.startElements.push(bg);

      // TÍTULO
      let title = scene.add.text(cx, 80, 'CROMA DASH', {
        fontSize: '56px', fontFamily: 'Orbitron, Arial', color: '#00ffff', fontStyle: '900',
        shadow: { color: '#00aaff', blur: 20, fill: true }
      }).setOrigin(0.5).setDepth(401);
      ui.startElements.push(title);

      let version = scene.add.text(cx + 160, 100, 'V 1.0', {
        fontSize: '14px', fontFamily: 'Orbitron, Arial', color: '#00ffff'
      }).setOrigin(0, 0.5).setDepth(401);
      version.setAlpha(0.5);
      ui.startElements.push(version);

      // PANEL HOW TO PLAY
      let boxW = 680;
      let boxH = 265;
      let boxX = cx - boxW / 2;
      let boxY = 150;

      let box = scene.add.graphics();
      box.fillStyle(0x080c16, 0.8);
      box.fillRoundedRect(boxX, boxY, boxW, boxH, 14);
      box.lineStyle(2, 0x1a3a50, 1);
      box.strokeRoundedRect(boxX, boxY, boxW, boxH, 14);
      
      // Separadores
      box.lineStyle(1, 0xffffff, 0.07);
      box.beginPath(); box.moveTo(boxX + 20, boxY + 40); box.lineTo(boxX + boxW - 20, boxY + 40); box.strokePath();
      box.beginPath(); box.moveTo(boxX + boxW * 0.42, boxY + 46); box.lineTo(boxX + boxW * 0.42, boxY + boxH - 14); box.strokePath();
      box.setDepth(401);
      ui.startElements.push(box);

      let howToText = scene.add.text(cx, boxY + 22, '— HOW TO PLAY —', {
        fontSize: '13px', fontFamily: 'Orbitron, Arial', color: '#88aacc', fontStyle: '700'
      }).setOrigin(0.5).setDepth(401);
      ui.startElements.push(howToText);

      // Helper para dibujar teclas
      const drawKey = (kchar, kx, ky, kcolor, klabel, ksize) => {
        let kgrp = scene.add.graphics().setDepth(401);
        kgrp.fillStyle(0x141423, 0.85);
        kgrp.fillRoundedRect(kx - ksize / 2, ky - ksize / 2, ksize, ksize, 7);
        kgrp.lineStyle(1.5, Phaser.Display.Color.HexStringToColor(kcolor).color, 1);
        kgrp.strokeRoundedRect(kx - ksize / 2, ky - ksize / 2, ksize, ksize, 7);
        ui.startElements.push(kgrp);

        let ktxt = scene.add.text(kx, ky, kchar, {
          fontSize: Math.floor(ksize * 0.42) + 'px', fontFamily: 'Orbitron, Arial', color: '#ffffff', fontStyle: '700',
          shadow: { color: kcolor, blur: 4, fill: true }
        }).setOrigin(0.5).setDepth(401);
        ui.startElements.push(ktxt);

        if (klabel) {
          let lbltxt = scene.add.text(kx, ky + ksize / 2 + 10, klabel, {
            fontSize: '9px', fontFamily: 'Orbitron, Arial', color: '#96b4c8', fontStyle: '500'
          }).setOrigin(0.5).setDepth(401);
          ui.startElements.push(lbltxt);
        }
      };

      // LEFT SIDE: MOVEMENT
      let leftCX = boxX + boxW * 0.22;
      let keysTop = boxY + 58;
      
      ui.startElements.push(scene.add.text(leftCX, keysTop - 5, 'MOVEMENT', {
        fontSize: '10px', fontFamily: 'Orbitron, Arial', color: '#aaaaaa', fontStyle: '500'
      }).setOrigin(0.5).setDepth(401));

      drawKey('W', leftCX, keysTop + 30, '#00ffff', 'JUMP', 34);
      drawKey('A', leftCX - 40, keysTop + 85, '#00ffff', 'LEFT', 34);
      drawKey('S', leftCX, keysTop + 85, '#ff8800', 'STOMP', 34);
      drawKey('D', leftCX + 40, keysTop + 85, '#00ffff', 'RIGHT', 34);

      ui.startElements.push(scene.add.text(leftCX, keysTop + 130, '↑ hasta 3 saltos (mejorable)', {
        fontSize: '9px', fontFamily: 'Orbitron, Arial', color: '#00ffc8'
      }).setOrigin(0.5).setDepth(401));
      ui.startElements.push(scene.add.text(leftCX, keysTop + 145, 'doble-tap A/D = DASH', {
        fontSize: '9px', fontFamily: 'Orbitron, Arial', color: '#ffc850'
      }).setOrigin(0.5).setDepth(401));

      // RIGHT SIDE: SHOOT
      let rightCX = boxX + boxW * 0.62;
      ui.startElements.push(scene.add.text(rightCX, keysTop - 5, 'SHOOT', {
        fontSize: '10px', fontFamily: 'Orbitron, Arial', color: '#aaaaaa', fontStyle: '500'
      }).setOrigin(0.5).setDepth(401));

      drawKey('E', rightCX, keysTop + 30, '#ff00ff', 'FIRE', 44);

      ui.startElements.push(scene.add.text(rightCX, keysTop + 75, 'mantén pulsado para disparar', {
        fontSize: '9px', fontFamily: 'Orbitron, Arial', color: '#c8b4ff'
      }).setOrigin(0.5).setDepth(401));
      ui.startElements.push(scene.add.text(rightCX, keysTop + 90, 'arma PIERCE: carga y suelta', {
        fontSize: '9px', fontFamily: 'Orbitron, Arial', color: '#ff7800'
      }).setOrigin(0.5).setDepth(401));

      // WEAPON DOTS
      let wNames = ['HOMING','AUTO','TRIPLE','PIERCE'];
      let wColors = [0x00ffff, 0xff8800, 0xff00ff, 0xff2200];
      let wColorsHex = ['#00ffff', '#ff8800', '#ff00ff', '#ff2200'];
      let iconSpacing = 44;
      let iconsY = keysTop + 125;
      let iconsStartX = rightCX - (iconSpacing * 1.5);

      wNames.forEach((n, i) => {
        let ix = iconsStartX + i * iconSpacing;
        let dgrp = scene.add.graphics().setDepth(401);
        dgrp.fillStyle(wColors[i], 1);
        dgrp.fillCircle(ix, iconsY, 7);
        ui.startElements.push(dgrp);

        ui.startElements.push(scene.add.text(ix, iconsY + 16, n, {
          fontSize: '7px', fontFamily: 'Orbitron, Arial', color: wColorsHex[i], fontStyle: '500'
        }).setOrigin(0.5).setDepth(401));
      });

      // BOTONES DE ACCION EXTRA
      let extraY = boxY + boxH - 18;
      ui.startElements.push(scene.add.text(cx, extraY, '[ESC] PAUSE    [I] TOP SCORES', {
        fontSize: '9px', fontFamily: 'Orbitron, Arial', color: '#788ca0'
      }).setOrigin(0.5).setDepth(401));

      // START
      let startY = boxY + boxH + 60;
      let startBtn = scene.add.text(cx, startY, 'PRESS [SPACE] TO START', {
        fontSize: '32px', fontFamily: 'Orbitron, Arial', color: '#ffff00', fontStyle: '900',
        shadow: { color: '#ffff00', blur: 18, fill: true }
      }).setOrigin(0.5).setDepth(401);
      ui.startElements.push(startBtn);

      scene.tweens.add({
        targets: startBtn,
        alpha: 0.5,
        duration: 800,
        yoyo: true,
        repeat: -1
      });

      let scoresHint = scene.add.text(cx, startY + 38, '[ I ] → TOP SCORES', {
        fontSize: '13px', fontFamily: 'Orbitron, Arial', color: '#888888', fontStyle: '500'
      }).setOrigin(0.5).setDepth(401);
      ui.startElements.push(scoresHint);
    },
    update(scene, time, delta) {
      if (consumePressed('START1') || consumePressed('P1_1') || consumePressed('P1_U')) {
        changeState(scene, 'playing');
      } else if (consumePressed('P1_2')) {
        scoresReturnState = 'start';
        changeState(scene, 'scores');
      }
    },
    exit(scene) {
      if (ui.startElements) {
        ui.startElements.forEach(e => { if (e && e.destroy) e.destroy(); });
      }
      ui.startElements = [];
      resetGame(scene);
    }
  },
  scores: {
    enter(scene) {
      ui.scoresOverlay.setVisible(true);
      ui.scoresTitle.setVisible(true);
      ui.scoresDisplay.setVisible(true);
      ui.scoresBack.setVisible(true);
      loadLeaderboard();
    },
    update(scene, time, delta) {
      if (consumePressed('START1') || consumePressed('START2') || consumePressed('P1_2')) {
        changeState(scene, scoresReturnState);
      }
    },
    exit(scene) {
      ui.scoresOverlay.setVisible(false);
      ui.scoresTitle.setVisible(false);
      ui.scoresDisplay.setVisible(false);
      ui.scoresBack.setVisible(false);
    }
  },
  playing: {
    enter(scene) {
      scene.physics.resume();
      Audio.startBGM(scene);
    },
    update(scene, time, delta) {
      if (consumePressed('START2') || consumePressed('P1_2')) {
        changeState(scene, 'paused');
        return;
      }
      playingUpdate(scene, time, delta);
    }
  },
  paused: {
    enter(scene) {
      scene.physics.pause();
      ui.pausedElements = [];

      let cx = GAME_WIDTH / 2;
      let bg = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x050508, 0.85).setOrigin(0, 0).setDepth(390);
      ui.pausedElements.push(bg);

      // TÍTULO PAUSED
      let title = scene.add.text(cx, 160, 'PAUSED', {
        fontSize: '50px', fontFamily: 'Orbitron, Arial', color: '#00ffff', fontStyle: '900',
        shadow: { color: '#00aaff', blur: 15, fill: true }
      }).setOrigin(0.5).setDepth(401);
      ui.pausedElements.push(title);

      scene.tweens.add({
        targets: title,
        alpha: 0.8,
        scale: 0.98,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });

      // CAJA MENU
      let boxW = 450;
      let boxH = 240;
      let boxX = cx - boxW / 2;
      let boxY = 230;

      let box = scene.add.graphics();
      box.fillStyle(0x080c16, 0.8);
      box.fillRoundedRect(boxX, boxY, boxW, boxH, 14);
      box.lineStyle(2, 0x1a3a50, 1);
      box.strokeRoundedRect(boxX, boxY, boxW, boxH, 14);
      
      // Esquinas
      let cL = 20;
      box.lineStyle(3, 0x00ffff, 1);
      box.beginPath(); box.moveTo(boxX, boxY + cL); box.lineTo(boxX, boxY); box.lineTo(boxX + cL, boxY); box.strokePath();
      box.beginPath(); box.moveTo(boxX + boxW, boxY + boxH - cL); box.lineTo(boxX + boxW, boxY + boxH); box.lineTo(boxX + boxW - cL, boxY + boxH); box.strokePath();
      box.setDepth(401);
      ui.pausedElements.push(box);

      // OPCIONES
      let opt1 = scene.add.text(cx, boxY + 50, '[SPACE] RESUME', {
        fontSize: '22px', fontFamily: 'Orbitron, Arial', color: '#00ffcc', fontStyle: '700',
        shadow: { color: '#00ffcc', blur: 10, fill: true }
      }).setOrigin(0.5).setDepth(401);
      ui.pausedElements.push(opt1);

      scene.tweens.add({
        targets: opt1,
        alpha: 0.5,
        duration: 600,
        yoyo: true,
        repeat: -1
      });

      let opt2 = scene.add.text(cx, boxY + 100, '[W] GIVE UP (saves score)', {
        fontSize: '18px', fontFamily: 'Orbitron, Arial', color: '#ffaa00', fontStyle: '500'
      }).setOrigin(0.5).setDepth(401);
      ui.pausedElements.push(opt2);

      let opt3 = scene.add.text(cx, boxY + 150, '[S] MAIN MENU', {
        fontSize: '18px', fontFamily: 'Orbitron, Arial', color: '#aaaaaa', fontStyle: '500'
      }).setOrigin(0.5).setDepth(401);
      ui.pausedElements.push(opt3);

      let opt4 = scene.add.text(cx, boxY + 200, '[I] TOP SCORES', {
        fontSize: '18px', fontFamily: 'Orbitron, Arial', color: '#8888aa', fontStyle: '500'
      }).setOrigin(0.5).setDepth(401);
      ui.pausedElements.push(opt4);
    },
    update(scene, time, delta) {
      if (consumePressed('START2') || consumePressed('START1')) {
        changeState(scene, 'playing');
      } else if (consumePressed('P1_U')) {
        changeState(scene, 'nameentry');
      } else if (consumePressed('P1_D')) {
        changeState(scene, 'start');
      } else if (consumePressed('P1_2')) {
        scoresReturnState = 'paused';
        changeState(scene, 'scores');
      }
    },
    exit(scene) {
      if (ui.pausedElements) {
        ui.pausedElements.forEach(e => { if (e && e.destroy) e.destroy(); });
      }
      ui.pausedElements = [];
    }
  },
  nameentry: {
    enter(scene) {
      scene.physics.pause();
      nameLetters = [0, 0, 0];
      nameCursor = 0;
      ui.nameOverlay.setVisible(true);
      ui.nameTitle.setVisible(true);
      ui.nameCursorArrow.setVisible(true);
      ui.nameInstructions.setVisible(true);
      for (let t of ui.nameLetterTexts) t.setVisible(true);
      refreshNameDisplay();
    },
    update(scene, time, delta) {
      if (consumePressed('P1_U')) {
        nameLetters[nameCursor] = (nameLetters[nameCursor] + 1) % 26;
        refreshNameDisplay();
      } else if (consumePressed('P1_D')) {
        nameLetters[nameCursor] = (nameLetters[nameCursor] + 25) % 26;
        refreshNameDisplay();
      } else if (consumePressed('P1_R')) {
        if (nameCursor < 2) { nameCursor++; refreshNameDisplay(); }
        else confirmName(scene);
      } else if (consumePressed('P1_L')) {
        if (nameCursor > 0) { nameCursor--; refreshNameDisplay(); }
      } else if (consumePressed('START1')) {
        confirmName(scene);
      }
    },
    exit(scene) {
      ui.nameOverlay.setVisible(false);
      ui.nameTitle.setVisible(false);
      ui.nameCursorArrow.setVisible(false);
      ui.nameInstructions.setVisible(false);
      for (let t of ui.nameLetterTexts) t.setVisible(false);
    }
  },
  gameover: {
    enter(scene) {
      scene.physics.pause();
      Audio.stopBGM();
      ui.gameOverElements = [];

      let bg = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0505, 0.95)
        .setOrigin(0, 0).setDepth(390);
      ui.gameOverElements.push(bg);

      // Título GAME OVER
      let title = scene.add.text(GAME_WIDTH / 2, 100, 'GAME OVER', {
        fontSize: '60px', fontFamily: 'Orbitron, Arial', color: '#ff1a1a', fontStyle: '900',
        shadow: { color: '#ff0000', blur: 15, fill: true }
      }).setOrigin(0.5).setDepth(401);
      ui.gameOverElements.push(title);

      scene.tweens.add({
        targets: title,
        alpha: 0.8,
        scale: 0.98,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });

      // Puntuación Final
      let scoreTxt = scene.add.text(GAME_WIDTH / 2, 170, `FINAL SCORE: ${Math.floor(currentScore)}`, {
        fontSize: '26px', fontFamily: 'Orbitron, Arial', color: '#ffffff', fontStyle: '700',
        shadow: { color: '#00ffff', blur: 10, fill: true }
      }).setOrigin(0.5).setDepth(401);
      ui.gameOverElements.push(scoreTxt);

      // Caja Leaderboard
      let boxWidth = 400;
      let boxHeight = 240;
      let boxX = GAME_WIDTH / 2 - boxWidth / 2;
      let boxY = 220;

      let box = scene.add.graphics();
      box.fillStyle(0x14141E, 0.8);
      box.fillRoundedRect(boxX, boxY, boxWidth, boxHeight, 15);
      box.lineStyle(2, 0x333344, 1);
      box.strokeRoundedRect(boxX, boxY, boxWidth, boxHeight, 15);
      
      // Esquinas
      let cL = 20;
      box.lineStyle(3, 0x00ffff, 1);
      box.beginPath(); box.moveTo(boxX, boxY + cL); box.lineTo(boxX, boxY); box.lineTo(boxX + cL, boxY); box.strokePath();
      box.beginPath(); box.moveTo(boxX + boxWidth, boxY + boxHeight - cL); box.lineTo(boxX + boxWidth, boxY + boxHeight); box.lineTo(boxX + boxWidth - cL, boxY + boxHeight); box.strokePath();
      box.setDepth(401);
      ui.gameOverElements.push(box);

      let lbTitle = scene.add.text(GAME_WIDTH / 2, boxY + 25, 'TOP 5 PILOTS', {
        fontSize: '18px', fontFamily: 'Orbitron, Arial', color: '#8888aa', fontStyle: '700'
      }).setOrigin(0.5).setDepth(401);
      ui.gameOverElements.push(lbTitle);

      let sep = scene.add.rectangle(GAME_WIDTH / 2, boxY + 45, boxWidth - 60, 2, 0x333344)
        .setDepth(401);
      ui.gameOverElements.push(sep);

      // Controles de Acción
      let playAgain = scene.add.text(GAME_WIDTH / 2, boxY + boxHeight + 40, '[SPACE] PLAY AGAIN', {
        fontSize: '20px', fontFamily: 'Orbitron, Arial', color: '#00ffcc', fontStyle: '700',
        shadow: { color: '#00ffcc', blur: 15, fill: true }
      }).setOrigin(0.5).setDepth(401);
      ui.gameOverElements.push(playAgain);

      scene.tweens.add({
        targets: playAgain,
        alpha: 0.4,
        duration: 800,
        yoyo: true,
        repeat: -1
      });

      let mainMenu = scene.add.text(GAME_WIDTH / 2, boxY + boxHeight + 80, '[S] MAIN MENU', {
        fontSize: '16px', fontFamily: 'Orbitron, Arial', color: '#aaaaaa', fontStyle: '500'
      }).setOrigin(0.5).setDepth(401);
      ui.gameOverElements.push(mainMenu);

      // Cargar scores asincrónicamente
      const loadLB = async () => {
        let top = [];
        try {
          if (window.platanusArcadeStorage) {
            let result = await window.platanusArcadeStorage.get('chromadash-leaderboard');
            if (result && result.found && result.value && Array.isArray(result.value.top)) top = result.value.top;
          } else {
            top = lbStorageGet();
          }
        } catch (_) {}
        
        if (currentState !== 'gameover') return;
        
        let listY = boxY + 70;
        let lastScoreMatched = false;
        top.forEach((entry, idx) => {
          if (idx >= 5) return;
          // Verificar si es el score actual. 
          let isCurrent = !lastScoreMatched && entry.score === Math.floor(currentScore);
          if (isCurrent) lastScoreMatched = true;

          let color = isCurrent ? '#ffff00' : '#cccccc';

          if (isCurrent) {
            let hl = scene.add.rectangle(GAME_WIDTH / 2, listY, boxWidth - 20, 30, 0xffff00, 0.1).setDepth(401);
            ui.gameOverElements.push(hl);
          }

          let rankTxt = scene.add.text(boxX + 40, listY, `${idx + 1}. ${entry.name || '???'}`, {
            fontSize: '18px', fontFamily: 'Orbitron, Arial', color: color, fontStyle: '500',
            shadow: isCurrent ? { color: '#ffff00', blur: 10, fill: true } : {}
          }).setOrigin(0, 0.5).setDepth(401);
          ui.gameOverElements.push(rankTxt);

          let scoreTxt2 = scene.add.text(boxX + boxWidth - 40, listY, `${entry.score}`, {
            fontSize: '18px', fontFamily: 'Orbitron, Arial', color: color, fontStyle: '500',
            shadow: isCurrent ? { color: '#ffff00', blur: 10, fill: true } : {}
          }).setOrigin(1, 0.5).setDepth(401);
          ui.gameOverElements.push(scoreTxt2);

          listY += 32;
        });
      };
      loadLB();
    },
    update(scene, time, delta) {
      if (consumePressed('START1') || consumePressed('P1_1')) {
        changeState(scene, 'playing');
      } else if (consumePressed('P1_D')) {
        changeState(scene, 'start');
      }
    },
    exit(scene) {
      if (ui.gameOverElements) {
        ui.gameOverElements.forEach(e => { if (e && e.destroy) e.destroy(); });
      }
      ui.gameOverElements = [];
      resetGame(scene);
    }
  },
  victory: {
    enter(scene) {
      scene.physics.pause();
      Audio.stopBGM();
      ui.victoryElements = [];

      // Fondo oscuro
      let bg = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000022, 0.92)
        .setOrigin(0, 0).setDepth(390);
      ui.victoryElements.push(bg);

      // Título
      let title = scene.add.text(GAME_WIDTH / 2, 80, '✦ VICTORIA ✦', {
        fontSize: '52px', fontFamily: 'Arial', color: '#00ffff',
        fontStyle: 'bold', stroke: '#003333', strokeThickness: 5,
        align: 'center'
      }).setOrigin(0.5).setDepth(401);
      ui.victoryElements.push(title);

      // Subtítulo narrativo
      let sub = scene.add.text(GAME_WIDTH / 2, 155,
        'MEGAPLATANUS fue destruido.\n¡Las rutas espaciales están a salvo!', {
        fontSize: '15px', fontFamily: 'Arial', color: '#aaaaaa', align: 'center'
      }).setOrigin(0.5).setDepth(401);
      ui.victoryElements.push(sub);

      // Score final
      let scoreLabel = scene.add.text(GAME_WIDTH / 2, 215,
        `PUNTUACIÓN FINAL: ${Math.floor(currentScore)}`, {
        fontSize: '24px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(401);
      ui.victoryElements.push(scoreLabel);

      // Separador
      let sep = scene.add.rectangle(GAME_WIDTH / 2, 252, 400, 2, 0x00ffff, 0.3)
        .setDepth(401);
      ui.victoryElements.push(sep);

      // Instrucciones de nombre
      let nameLabel = scene.add.text(GAME_WIDTH / 2, 272, 'INGRESA TU NOMBRE', {
        fontSize: '16px', fontFamily: 'Arial', color: '#ffff00'
      }).setOrigin(0.5).setDepth(401);
      ui.victoryElements.push(nameLabel);

      // Letras del nombre (3 caracteres)
      ui.victoryNameChars = [0, 0, 0];
      ui.victoryNameCursor = 0;
      ui.victoryNameTexts = [];
      const NAME_CHARS_LOCAL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      for (let i = 0; i < 3; i++) {
        let t = scene.add.text(GAME_WIDTH / 2 - 60 + i * 60, 320, 'A', {
          fontSize: '52px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(401);
        ui.victoryNameTexts.push(t);
        ui.victoryElements.push(t);
      }

      // Cursor bajo la letra activa
      ui.victoryCursorBar = scene.add.rectangle(GAME_WIDTH / 2 - 60, 354, 40, 4, 0xffff00)
        .setDepth(401);
      ui.victoryElements.push(ui.victoryCursorBar);

      let hint = scene.add.text(GAME_WIDTH / 2, 375,
        'W/S: cambiar letra    A/D o ENTER: siguiente', {
        fontSize: '12px', fontFamily: 'Arial', color: '#666666'
      }).setOrigin(0.5).setDepth(401);
      ui.victoryElements.push(hint);

      // Texto de New Game+ (oculto hasta confirmar nombre)
      ui.victoryNewGame = scene.add.text(GAME_WIDTH / 2, 440, '', {
        fontSize: '17px', fontFamily: 'Arial', color: '#00ff88', fontStyle: 'bold', align: 'center'
      }).setOrigin(0.5).setDepth(401).setVisible(false);
      ui.victoryElements.push(ui.victoryNewGame);

      ui._victoryPhase = 'naming';
      ui._victoryNameCharsStr = NAME_CHARS_LOCAL;
    },

    update(scene, time, delta) {
      const NC = ui._victoryNameCharsStr || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

      if (ui._victoryPhase === 'naming') {
        if (consumePressed('P1_U')) {
          ui.victoryNameChars[ui.victoryNameCursor] = (ui.victoryNameChars[ui.victoryNameCursor] + 1) % 26;
          ui.victoryNameTexts[ui.victoryNameCursor].setText(NC[ui.victoryNameChars[ui.victoryNameCursor]]);
          Audio.leaderboardChar ? Audio.leaderboardChar() : null;
        }
        if (consumePressed('P1_D')) {
          ui.victoryNameChars[ui.victoryNameCursor] = (ui.victoryNameChars[ui.victoryNameCursor] + 25) % 26;
          ui.victoryNameTexts[ui.victoryNameCursor].setText(NC[ui.victoryNameChars[ui.victoryNameCursor]]);
          Audio.leaderboardChar ? Audio.leaderboardChar() : null;
        }
        if (consumePressed('P1_R') || consumePressed('START1') || consumePressed('P1_1')) {
          ui.victoryNameCursor++;
          if (ui.victoryNameCursor >= 3) {
            // Guardar nombre y score
            let name = ui.victoryNameChars.map(i => NC[i]).join('');
            updateLeaderboard(Math.floor(currentScore), name);
            ui._victoryPhase = 'confirm';
            ui.victoryNewGame
              .setText('SPACE → NUEVO JUEGO (dificultad +)\n\nS → MENÚ PRINCIPAL')
              .setVisible(true);
            scene.tweens.add({
              targets: ui.victoryNewGame,
              alpha: 0.3, duration: 600, yoyo: true, repeat: -1
            });
          } else {
            ui.victoryCursorBar.setX(GAME_WIDTH / 2 - 60 + ui.victoryNameCursor * 60);
          }
        }
        if (consumePressed('P1_L')) {
          if (ui.victoryNameCursor > 0) {
            ui.victoryNameCursor--;
            ui.victoryCursorBar.setX(GAME_WIDTH / 2 - 60 + ui.victoryNameCursor * 60);
          }
        }
      } else {
        // Fase confirm: esperar decisión del jugador
        if (consumePressed('START1') || consumePressed('P1_1')) {
          loopCount++;
          changeState(scene, 'playing');
        } else if (consumePressed('P1_D')) {
          changeState(scene, 'start');
        }
      }
    },

    exit(scene) {
      if (ui.victoryElements) {
        ui.victoryElements.forEach(e => { if (e && e.destroy) e.destroy(); });
      }
      ui.victoryElements = [];
      ui.victoryNameTexts = [];
      resetGame(scene);
    }
  }
};

let currentState = 'start';

function changeState(scene, newState) {
  if (states[currentState].exit) states[currentState].exit(scene);
  currentState = newState;
  if (states[currentState].enter) states[currentState].enter(scene);
}



function updateSectionProgress(scene, delta) {
  sectionTimer += delta;
  sectionProgress = sectionTimer / SECTIONS[currentSection].duration;

  if (sectionProgress >= 1.0) {
    if ((currentSection === 1 || currentSection === 4) && !bossState) {
      sectionProgress = 1.0;
      sectionTimer = SECTIONS[currentSection].duration;
      if (!boss) spawnBoss(scene, currentSection);
    } else if (currentSection < 4 && !bossState) {
      sectionTimer -= SECTIONS[currentSection].duration;
      sectionProgress = 0;
      currentSection++;
      Audio.sectionChange();
      pendingBonusPowerup = true;
      playerState.health.current = playerState.health.max;
      updateHealthHUD();
      let flash = scene.add.graphics();
      flash.fillStyle(SECTIONS[currentSection].color, 1);
      flash.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      flash.setDepth(200);
      scene.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
      gameSpeed = Math.max(SECTIONS[currentSection].speedFloor, gameSpeed * 0.8);
    } else if (currentSection >= 4) {
      sectionProgress = 1.0;
    }
  }

  if (bossState) {
    ui.sectionBarFill.width = GAME_WIDTH * Math.max(0, bossHp / bossHpMax);
    ui.sectionBarFill.setFillStyle(0xff0000);
    ui.sectionText.setText('BOSS');
  } else {
    ui.sectionBarFill.width = GAME_WIDTH * Math.min(sectionProgress, 1.0);
    ui.sectionBarFill.setFillStyle(SECTIONS[currentSection].color);
    ui.sectionText.setText(loopCount > 0 ? 'S' + (currentSection + 1) + ' L' + (loopCount + 1) : 'S' + (currentSection + 1));
  }

  let tRGB = Phaser.Display.Color.IntegerToRGB(SECTIONS[currentSection].color);
  currentThemeColorRGB.r += (tRGB.r - currentThemeColorRGB.r) * 0.02;
  currentThemeColorRGB.g += (tRGB.g - currentThemeColorRGB.g) * 0.02;
  currentThemeColorRGB.b += (tRGB.b - currentThemeColorRGB.b) * 0.02;
  let themeValue = Phaser.Display.Color.GetColor(
    Math.floor(currentThemeColorRGB.r),
    Math.floor(currentThemeColorRGB.g),
    Math.floor(currentThemeColorRGB.b)
  );
  ui.bgRect.setFillStyle(Phaser.Display.Color.GetColor(
    Math.floor(currentThemeColorRGB.r * 0.4),
    Math.floor(currentThemeColorRGB.g * 0.4),
    Math.floor(currentThemeColorRGB.b * 0.4)
  ));

  gameSpeed += TUNING.WORLD.GAME_SPEED_ACCEL * (delta / 1000);
  if (gameSpeed > TUNING.WORLD.GAME_SPEED_MAX) gameSpeed = TUNING.WORLD.GAME_SPEED_MAX;

  return themeValue;
}

function updateSpawning(scene, delta, themeValue) {
  while (nextPlatformX < GAME_WIDTH + 800) {
    let platY = Phaser.Math.Between(250, 500);
    let platWidth = Phaser.Math.Between(150, 300);
    let randSubtype = Math.random();
    let boss2Active = !!bossState && bossSection === 4;
    let hasSpikes = randSubtype < 0.25 && isMechanicActive('spikes') && (!bossState || boss2Active);
    let isMoving = randSubtype >= 0.25 && randSubtype < 0.5 && isMechanicActive('moving') && !bossState;

    createPlatform(scene, nextPlatformX + platWidth / 2, platY, platWidth, { isMoving, color: isMoving ? COLORS.platformMoving : themeValue });

    if (hasSpikes) {
      let spikeWidth = Math.floor((platWidth * 0.5) / 20) * 20;
      if (spikeWidth < 20) spikeWidth = 20;
      let isLeft = Math.random() < 0.5;
      let spikeX = nextPlatformX + (isLeft ? (spikeWidth / 2) : (platWidth - spikeWidth / 2));
      createSpike(scene, spikeX, platY - 20, spikeWidth);
    } else if (!isMoving && (pendingBonusPowerup || Math.random() < 0.15)) {
      pendingBonusPowerup = false;
      let pType = Phaser.Math.Between(0, 5);
      if (pType === 0 && playerState.jumps.max >= TUNING.PLAYER.JUMP_MAX) pType = 1;
      createPowerup(scene, nextPlatformX + platWidth / 2, platY - 40, pType);
    }

    nextPlatformX += platWidth + Phaser.Math.Between(100, 250);
  }

  platforms.getChildren().forEach(plat => {
    if (!plat.getData('isMoving') && plat._redraw) plat._redraw(themeValue);
    plat.body.setVelocityX(-gameSpeed);
    if (plat.x + plat.getData('width') / 2 < 0) plat.destroy();
  });
  spikes.getChildren().forEach(s => {
    s.body.setVelocityX(-gameSpeed);
    if (s.x + s.getData('width') / 2 < 0) s.destroy();
  });
  powerups.getChildren().forEach(p => {
    p.body.setVelocityX(-gameSpeed);
    if (p.x + p.width < 0) p.destroy();
  });
  nextPlatformX -= gameSpeed * (delta / 1000);

  if (currentSection >= 3 && (!bossState || bossSection === 4) && airTriangles.countActive(true) < 2 && Math.random() < 0.005) {
    let lvl = 1;
    if (currentSection === 3) lvl = Math.random() < 0.5 ? 1 : 2;
    else if (currentSection === 4) lvl = Math.random() < 0.3 ? 2 : 3;
    let zones = [Phaser.Math.Between(50, 150), Phaser.Math.Between(200, 350), Phaser.Math.Between(400, 520)];
    let spawnY = zones[Phaser.Math.Between(0, 2)];
    let wLine = scene.add.rectangle(GAME_WIDTH / 2, spawnY, GAME_WIDTH, 2, 0xff0000, 0.5).setDepth(50);
    if (scene.warningLinesGroup) scene.warningLinesGroup.add(wLine);
    scene.time.delayedCall(800, () => wLine.destroy());
    scene.time.delayedCall(1000, () => {
      if (currentState !== 'playing') return;
      createAirTriangle(scene, spawnY, lvl);
    });
  }

  let enemiesInS1Loop = loopCount > 0 && currentSection === 0;
  if (playTime > nextEnemyTime && enemies.countActive(true) < 4 && (isMechanicActive('enemies') || enemiesInS1Loop) && !bossState) {
    let level = 1;
    if (enemiesInS1Loop) level = 2;
    else if (currentSection === 2) level = Math.random() < 0.5 ? 1 : 2;
    else if (currentSection === 3) level = 2;
    else if (currentSection >= 4) level = 3;

    createEnemy(scene, level);
    nextEnemyTime = playTime + Math.max(TUNING.ENEMY.SPAWN_NEXT_MIN_MS, TUNING.ENEMY.SPAWN_NEXT_BASE_MS - (gameSpeed - 150) * TUNING.ENEMY.SPAWN_SPEED_FACTOR);
  }
}

function updatePlayerInput(scene, delta, isOnGround) {
  if (consumePressed('P1_L')) {
    if (playTime - playerState.dash.lastTapL < TUNING.PLAYER.DOUBLE_TAP_WINDOW_MS && playTime > playerState.dash.cooldownUntil) {
      playerState.dash.direction = -1;
      playerState.dash.activeUntil = playTime + TUNING.PLAYER.DASH_DURATION_MS;
      playerState.dash.cooldownUntil = playTime + TUNING.PLAYER.DASH_COOLDOWN_MS;
      playerState.invulnerableUntil = Math.max(playerState.invulnerableUntil, playTime + 200);
      playerState.setState('dashing');
      Audio.dash();
    }
    playerState.dash.lastTapL = playTime;
  }
  if (consumePressed('P1_R')) {
    if (playTime - playerState.dash.lastTapR < TUNING.PLAYER.DOUBLE_TAP_WINDOW_MS && playTime > playerState.dash.cooldownUntil) {
      playerState.dash.direction = 1;
      playerState.dash.activeUntil = playTime + TUNING.PLAYER.DASH_DURATION_MS;
      playerState.dash.cooldownUntil = playTime + TUNING.PLAYER.DASH_COOLDOWN_MS;
      playerState.invulnerableUntil = Math.max(playerState.invulnerableUntil, playTime + 200);
      playerState.setState('dashing');
      Audio.dash();
    }
    playerState.dash.lastTapR = playTime;
  }

  let playerSpeedX = 0;
  if (playTime < playerState.dash.activeUntil) {
    playerSpeedX = TUNING.PLAYER.DASH_SPEED * playerState.dash.direction;
    if (Math.random() < 0.3) {
      let trailC = getWeaponColor(shootMode);
      let trail = scene.add.ellipse(player.x, player.y, 24, 32, trailC, 0.4);
      trail.setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: trail, alpha: 0, duration: 200, onComplete: () => trail.destroy() });
    }
  } else {
    if (controls.held['P1_L']) playerSpeedX = -(TUNING.PLAYER.WALK_SPEED + gameSpeed);
    else if (controls.held['P1_R']) playerSpeedX = TUNING.PLAYER.WALK_SPEED;
    else if (isOnGround) playerSpeedX = -gameSpeed;
  }
  player.body.setVelocityX(playerSpeedX);

  if (player.y > GAME_HEIGHT || player.x + 12 < 0) playerDie(scene, 'fall');

  if (!playerDying) {
    if (!playerState.canBeHit()) {
      player.alpha = (Math.floor(playTime / 100) % 2 === 0) ? 0.3 : 1;
    } else {
      player.alpha = 1;
    }
  }

  if (player.x + 12 > GAME_WIDTH) player.setX(GAME_WIDTH - 12);

  if (isOnGround && playerState.state === 'downDashing') playerState.setState('idle');

  if (consumePressed('START1') || consumePressed('P1_U')) {
    if (controls.held['P1_D'] && !isOnGround) {
      playerState.setState('downDashing');
      player.body.setVelocityY(TUNING.PLAYER.DOWN_DASH_VELOCITY);
      Audio.downDash();
    } else if (isOnGround || (playTime - lastGroundTime) < COYOTE_TIME_MS) {
      player.body.setVelocityY(TUNING.PLAYER.JUMP_VELOCITY);
      lastGroundTime = 0;
      Audio.jump();
    } else if (playerState.jumps.current > 0) {
      player.body.setVelocityY(TUNING.PLAYER.JUMP_VELOCITY);
      playerState.jumps.current--;
      Audio.doubleJump();
      let jumpColor = getWeaponColor(shootMode);
      let jx = player.x, jy = player.y + 12;

      let jRing = scene.add.graphics({ x: jx, y: jy });
      jRing.lineStyle(3, jumpColor, 0.85);
      jRing.strokeEllipse(0, 0, 24, 10);
      jRing.setBlendMode(Phaser.BlendModes.ADD);
      jRing.setDepth(28);
      scene.tweens.add({ targets: jRing, scaleX: 3.5, scaleY: 2.5, alpha: 0, duration: 380, ease: 'Power2', onComplete: () => jRing.destroy() });

      let jRing2 = scene.add.graphics({ x: jx, y: jy });
      jRing2.lineStyle(1.5, 0xffffff, 0.6);
      jRing2.strokeEllipse(0, 0, 18, 8);
      jRing2.setBlendMode(Phaser.BlendModes.ADD);
      jRing2.setDepth(27);
      scene.tweens.add({ targets: jRing2, scaleX: 5, scaleY: 3, alpha: 0, duration: 260, ease: 'Power2', onComplete: () => jRing2.destroy() });

      for (let i = 0; i < 8; i++) {
        let angle = (i / 8) * Math.PI * 2;
        let spark = scene.add.circle(
          jx + (Math.random() - 0.5) * 18,
          jy,
          Phaser.Math.Between(2, 4), Math.random() < 0.5 ? 0xffffff : jumpColor
        );
        spark.setBlendMode(Phaser.BlendModes.ADD);
        spark.setDepth(28);
        scene.tweens.add({
          targets: spark,
          x: spark.x + (Math.random() - 0.5) * 28,
          y: spark.y + Phaser.Math.Between(12, 35),
          alpha: 0, scale: 0,
          duration: Phaser.Math.Between(220, 380), ease: 'Power2',
          onComplete: () => spark.destroy()
        });
      }
    }
  }


  if (playerState.state === 'hurt' && playerState.canBeHit()) {
    playerState.setState(isOnGround ? 'idle' : 'airborne');
  } else if (playerState.state !== 'downDashing' && playerState.state !== 'hurt') {
    if (playTime < playerState.dash.activeUntil) {
      playerState.setState('dashing');
    } else if (!isOnGround) {
      playerState.setState('airborne');
    } else if (Math.abs(player.body.velocity.x) > 1) {
      playerState.setState('running');
    } else {
      playerState.setState('idle');
    }
  }
}

function updateShooting(scene) {
  const held = controls.held['P1_1'];

  if (shootMode === 'pierce') {
    playerState.pierce.prevChargeLevel = playerState.pierce.chargeLevel;
    if (held) {
      if (!playerState.pierce.charging) {
        playerState.pierce.charging = true;
        playerState.pierce.chargeStart = playTime;
      }
      let elapsed = playTime - playerState.pierce.chargeStart;
      if (elapsed >= TUNING.SHOOT.PIERCE_CHARGE_MAX_MS) playerState.pierce.chargeLevel = 3;
      else if (elapsed >= TUNING.SHOOT.PIERCE_CHARGE_MED_MS) playerState.pierce.chargeLevel = 2;
      else if (elapsed >= TUNING.SHOOT.PIERCE_CHARGE_MIN_MS) playerState.pierce.chargeLevel = 1;
      else playerState.pierce.chargeLevel = 0;
      if (playerState.pierce.chargeLevel > playerState.pierce.prevChargeLevel) {
        Audio.pierceCharge(playerState.pierce.chargeLevel);
      }
    } else if (playerState.pierce.charging) {
      if (playerState.pierce.chargeLevel > 0) {
        createPlayerBullet(scene, 'pierce', 0, playerState.pierce.chargeLevel);
        Audio.pierceShoot(playerState.pierce.chargeLevel);
        if (playerState.pierce.chargeLevel === 3) scene.cameras.main.shake(80, 0.005);
      }
      playerState.pierce.charging = false;
      playerState.pierce.chargeStart = 0;
      playerState.pierce.chargeLevel = 0;
    }
    return;
  }

  if (!held) return;
  let interval;
  if (shootMode === 'homing') interval = TUNING.SHOOT.HOMING_INTERVAL_MS;
  else if (shootMode === 'auto') interval = TUNING.SHOOT.AUTO_INTERVAL_MS;
  else if (shootMode === 'triple') interval = TUNING.SHOOT.TRIPLE_INTERVAL_MS;
  if (playTime > lastFireTime + interval) {
    lastFireTime = playTime;
    if (shootMode === 'homing') { createPlayerBullet(scene, 'homing'); Audio.shootHoming(); }
    else if (shootMode === 'auto') { createPlayerBullet(scene, 'auto'); Audio.shootAuto(); }
    else if (shootMode === 'triple') {
      let spread = TUNING.SHOOT.TRIPLE_SPREAD_DEG;
      for (let deg of [-spread, 0, spread]) createPlayerBullet(scene, 'triple', Phaser.Math.DegToRad(deg));
      Audio.shootTriple();
    }
  }
}

function updateEnemies(scene, time) {
  enemies.getChildren().forEach(e => {
    drawNeonEnemy(e, time);
    let level = e.level || 1;
    let cooldown = level === 1 ? TUNING.ENEMY.FIRE_COOLDOWN_L1_MS : TUNING.ENEMY.FIRE_COOLDOWN_L23_MS;
    if (playTime > e.lastFire + cooldown) {
      let rb = e.radioBase || 14;
      scene.tweens.add({ targets: e, radioActual: rb * 1.5, brilloExtra: 3.5, duration: 100, ease: 'Sine.easeOut', yoyo: true, hold: 50 });
      e.lastFire = playTime;
      if (level === 1) { Audio.enemyShoot(); createEnemyBullet(scene, e.x - 14, e.y, -TUNING.ENEMY.BULLET_SPEED, 0); }
      else if (level === 2) {
        Audio.enemyShoot(); createEnemyBullet(scene, e.x - 18, e.y, -TUNING.ENEMY.BULLET_SPEED, 0);
        scene.time.delayedCall(TUNING.ENEMY.BURST_DELAY_MS, () => { if (e.active) { Audio.enemyShoot(); createEnemyBullet(scene, e.x - 18, e.y, -TUNING.ENEMY.BULLET_SPEED, 0); } });
      } else if (level === 3) {
        Audio.enemyShoot();
        for (let ang of [-10, 0, 10]) {
          let rad = Phaser.Math.DegToRad(ang + 180);
          createEnemyBullet(scene, e.x - 22, e.y, Math.cos(rad) * TUNING.ENEMY.BULLET_SPEED, Math.sin(rad) * TUNING.ENEMY.BULLET_SPEED);
        }
      }
    }
  });

  enemyBullets.getChildren().forEach(b => {
    b.rotation += 0.15;
    let tc = Math.random() < 0.5 ? 0xffffff : 0xff0044;
    let bt = scene.add.rectangle(b.x, b.y, 7, 7, tc);
    bt.setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: bt, alpha: 0, scale: 0.1, duration: 150, onComplete: () => bt.destroy() });
    if (b.x < -50 || b.y < -50 || b.y > GAME_HEIGHT + 50) b.destroy();
  });
}

function updatePlayerBullets(scene, delta) {
  playerBullets.getChildren().forEach(b => {
    if (bossState && boss && boss.active && bossState !== 'dying') {
      let rb = boss.radioBase || 42;
      let hw = rb + 8;
      if (Math.abs(b.x - boss.x) < hw && Math.abs(b.y - boss.y) < hw) {
        let isPierce = b.getData('pierce');
        if (isPierce) {
          let hits = b.getData('hitTargets');
          if (hits && hits.has(boss)) return;
          if (hits) hits.add(boss);
        }
        let dmg = b.getData('damage') || 1;
        bossHp -= dmg;
        if (!isPierce) b.destroy();
        boss.brilloExtra = 5;
        Audio.bossHurt();
        scene.time.delayedCall(80, () => { if (boss && boss.active) boss.brilloExtra = 1; });
        if (bossHp <= 0 && bossState !== 'dying') killBoss(scene);
        if (!isPierce) return;
      }
    }
    if (b.getData('type') === 'homing') {
      let closestDest = null;
      let closestDist = Infinity;
      let homingTargets = [...enemies.getChildren()];
      if (bossState && boss && boss.active && bossState !== 'dying') homingTargets.push(boss);
      homingTargets.forEach(e => {
        let dist = Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y);
        if (dist < closestDist && e.x > b.x) { closestDist = dist; closestDest = e; }
      });
      if (closestDest) {
        if (b.y < closestDest.y) b.body.velocity.y += 20 * (delta / 16);
        else if (b.y > closestDest.y) b.body.velocity.y -= 20 * (delta / 16);
        b.body.velocity.y *= 0.92;
      } else {
        b.body.velocity.y *= 0.95;
      }
    }
    let trailColor, trailSize = 5;
    let btype = b.getData('type');
    if (btype === 'pierce') {
      trailColor = [COLORS.weaponPierce, COLORS.weaponPierce, COLORS.weaponPierceMed, COLORS.weaponPierceMax][b.getData('chargeLevel') || 1];
      trailSize = 7;
    } else if (btype === 'auto') { trailColor = COLORS.weaponAuto; trailSize = 3; }
    else if (btype === 'triple') { trailColor = COLORS.weaponTriple; trailSize = 4; }
    else { trailColor = COLORS.weaponHoming; trailSize = 5; }


    let halo = scene.add.circle(b.x, b.y, trailSize * 1.4, trailColor, 0.28);
    halo.setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: halo, alpha: 0, scale: 0.1, duration: 200, onComplete: () => halo.destroy() });
    if (b.x > GAME_WIDTH + 50 || b.y < -50 || b.y > GAME_HEIGHT + 50) b.destroy();
  });

  airTriangles.getChildren().forEach(tri => {
    if (tri.x < -50) {
      if (tri._emitterRef) tri._emitterRef.remove();
      tri.destroy();
    } else if (tri.getData('level') === 3 && !tri.getData('fired') && tri.x < 600) {
      tri.setData('fired', true);
      let bullet = scene.add.rectangle(tri.x, tri.y, 12, 12, COLORS.enemyBullet);
      enemyBullets.add(bullet);
      scene.physics.add.existing(bullet);
      bullet.body.allowGravity = false;
      let angle = Phaser.Math.Angle.Between(tri.x, tri.y, player.x, player.y);
      bullet.body.setVelocity(Math.cos(angle) * TUNING.AIR_TRIANGLE.BULLET_SPEED, Math.sin(angle) * TUNING.AIR_TRIANGLE.BULLET_SPEED);
    }
  });
}

function updateBossLogic(scene, time) {
  if (bossState && boss && boss.active && bossState !== 'dying') {
    drawNeonEnemy(boss, time);
    if (bossState === 'active' && playTime > bossNextAction) executeBossPattern(scene);
  }
}

function updateJumpRecharge(delta) {
  if (playerState.jumps.current < playerState.jumps.max) {
    playerState.jumps.timer += delta;
    if (playerState.jumps.timer >= TUNING.PLAYER.JUMP_RECHARGE_MS) {
      playerState.jumps.current++;
      playerState.jumps.timer -= TUNING.PLAYER.JUMP_RECHARGE_MS;
    }
  } else {
    playerState.jumps.timer = 0;
  }
}

function updateHUD() {
  currentScore = Math.floor(playTime / 1000) * 10 + enemiesDefeated * 50;
  ui.scoreText.setText(`SCORE: ${currentScore}`);
  for (let i = 0; i < playerState.jumps.max; i++) {
    ui.jumpBars[i].setFillStyle(i < playerState.jumps.current ? COLORS.powerupJump : 0x555555);
  }

}

function playingUpdate(scene, time, delta) {
  playTime += delta;


  const isOnGround = player.body.touching.down;
  const themeValue = updateSectionProgress(scene, delta);
  updateBackground(scene, delta);
  updateSpawning(scene, delta, themeValue);
  updatePlayerInput(scene, delta, isOnGround);
  updateShooting(scene);
  updateEnemies(scene, time);
  updatePlayerBullets(scene, delta);
  updateBossLogic(scene, time);
  updateJumpRecharge(delta);


  if (!wasOnGround && isOnGround) {
    landingSquashTime = playTime;
    Audio.land();
  }
  wasOnGround = isOnGround;
  if (isOnGround) lastGroundTime = playTime;
  if (currentState === 'playing') {
    let st = computeSlimeTransform();
    updatePlayerTrail(scene, st.color, delta);
    drawPlayerNeon(player, st.color, st.scaleX, st.scaleY);
  }

  updateHUD();
}

function update(time, delta) {
  const scene = this;
  states[currentState].update(scene, time, delta);
  for (const code in controls.pressed) {
    controls.pressed[code] = false;
  }
}

