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
  },
  SHOOT: {
    BULLET_SPEED: 600,
    AUTO_INTERVAL_MS: 100,
    HOMING_COOLDOWN_MS: 400,
    TRIPLE_COOLDOWN_MS: 500,
  },
};

const COLORS = {
  background: 0x111111,
  textLight: '#ffffff',
  textHighlight: '#ffff00',
  pausedOverlay: 0x000000,
  player: 0xffff00,
  platform: 0x006600,
  spike: 0xff0000,
  platformMoving: 0x00aaff,
  enemy: 0xaa0000,
  bullet: 0x00ffff,
  enemyBullet: 0xff8800,
  powerupJump: 0x00ff00,
  powerupInvune: 0x0000ff,
  powerupRapid: 0xffff00
};

// NO modificar las teclas existentes — coinciden con el cableado físico del gabinete arcade.
// Para atajos de prueba local, agregar teclas extra al final de cualquier array.
// Las entradas P2_* fueron eliminadas: el juego es single-player y colisionaban con P1 ('f', flechas).
const CABINET_KEYS = {
  P1_U: ['w', 'ArrowUp'],
  P1_D: ['s', 'ArrowDown'],
  P1_L: ['a', 'ArrowLeft'],
  P1_R: ['d', 'ArrowRight'],
  P1_1: ['e', 'u', 'z', 'f'],
  P1_2: ['i'],
  P1_3: ['o'],
  P1_4: ['j'],
  P1_5: ['k'],
  P1_6: ['l'],
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

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-root',
  backgroundColor: '#111111',
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
  state: 'idle', // 'idle' | 'running' | 'airborne' | 'dashing' | 'downDashing'
  jumps: { current: TUNING.PLAYER.JUMP_INITIAL, max: TUNING.PLAYER.JUMP_INITIAL, timer: 0 },
  health: { current: TUNING.PLAYER.HEALTH_INITIAL, max: TUNING.PLAYER.HEALTH_INITIAL },
  dash: { activeUntil: 0, cooldownUntil: 0, direction: 0, lastTapL: 0, lastTapR: 0 },
  invulnerableUntil: 0,
  canBeHit() { return playTime >= this.invulnerableUntil; },
  setState(newState) { this.state = newState; },
  reset() {
    this.state = 'idle';
    this.playerState.jumps.current = TUNING.PLAYER.JUMP_INITIAL;
    this.playerState.jumps.max = TUNING.PLAYER.JUMP_INITIAL;
    this.playerState.jumps.timer = 0;
    this.playerState.health.current = TUNING.PLAYER.HEALTH_INITIAL;
    this.playerState.health.max = TUNING.PLAYER.HEALTH_INITIAL;
    this.dash.activeUntil = 0;
    this.dash.cooldownUntil = 0;
    this.dash.direction = 0;
    this.dash.lastTapL = 0;
    this.dash.lastTapR = 0;
    this.invulnerableUntil = 0;
  }
};
let shootMode = 'homing';

const SECTIONS = [
  { color: 0x002244, duration: 20000, speedFloor: 150, mechanics: [] },
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

let bossState = null; // null | 'entering' | 'active' | 'dying'
let boss = null;
let bossHp = 0;
let bossHpMax = TUNING.BOSS.HP_BOSS1;
let bossPattern = 0;
let bossNextAction = 0;
let bossSection = 0;
let loopCount = 0;

// ── Entity factories ───────────────────────────────────────────────────────

function createEnemyBullet(scene, x, y, vx, vy) {
  let b = scene.add.rectangle(x, y, 10, 10, 0xffffff).setDepth(50);
  b.setBlendMode(Phaser.BlendModes.ADD);
  enemyBullets.add(b);
  scene.physics.add.existing(b);
  b.body.allowGravity = false;
  b.body.setVelocity(vx, vy);
  return b;
}

function createPlayerBullet(scene, type, angleRad) {
  let bullet = scene.add.circle(player.x + 15, player.y, 6, COLORS.bullet);
  playerBullets.add(bullet);
  scene.physics.add.existing(bullet);
  bullet.body.allowGravity = false;
  if (type === 'triple') {
    bullet.body.setVelocity(
      TUNING.SHOOT.BULLET_SPEED * Math.cos(angleRad),
      TUNING.SHOOT.BULLET_SPEED * Math.sin(angleRad)
    );
    bullet.setData('damage', 1);
  } else if (type === 'auto') {
    bullet.body.setVelocityX(TUNING.SHOOT.BULLET_SPEED);
    bullet.setData('damage', 0.5);
  } else { // homing (por defecto)
    bullet.body.setVelocityX(TUNING.SHOOT.BULLET_SPEED);
    bullet.setData('damage', 1);
  }
  bullet.setData('type', type);
  return bullet;
}

function isMechanicActive(name) {
  return SECTIONS[currentSection].mechanics.includes(name);
}

// ── Event bus helpers ──────────────────────────────────────────────────────
// Emiten eventos de Phaser en los puntos clave de la lógica.
// Para añadir sonidos/animaciones: scene.events.on('player:jump', handler).
let _eventScene = null; // se setea en create()
function emit(event, data) {
  if (_eventScene) _eventScene.events.emit(event, data);
}

function updateHealthHUD() {
  for (let i = 0; i < ui.healthBars.length; i++) {
    ui.healthBars[i].setFillStyle(i < playerState.health.current ? 0xff3333 : 0x555555);
  }
}

// ── HUD bar helper ─────────────────────────────────────────────────────────
// Reconstruye jumpBars o healthBars al máximo dado, destruyendo los sobrantes.
// createFn(scene, index, newMax) → Phaser GameObject
function rebuildBarHUD(scene, key, newMax, createFn) {
  // destruir sobrantes
  while (ui[key].length > newMax) ui[key].pop().destroy();
  // crear faltantes
  while (ui[key].length < newMax) ui[key].push(createFn(scene, ui[key].length, newMax));
  // reposicionar todos (necesario cuando cambia el max en healthBars)
  if (key === 'healthBars') {
    for (let i = 0; i < ui.healthBars.length; i++) {
      ui.healthBars[i].setX(GAME_WIDTH / 2 - (newMax - 1) * 14 + i * 28);
    }
  }
}

function spawnDeathExplosion(scene, x, y, neonColor, count) {
  for (let i = 0; i < count; i++) {
    let p = scene.add.rectangle(x, y, 6, 6, Math.random() < 0.5 ? 0xffffff : neonColor);
    p.setBlendMode(Phaser.BlendModes.ADD);
    p.setDepth(150);
    let angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    let dist = Phaser.Math.Between(30, 100);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      alpha: 0,
      scale: 0,
      duration: Phaser.Math.Between(300, 550),
      ease: 'Power2',
      onComplete: () => p.destroy()
    });
  }
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
  boss.setData('radioBase', rb);
  boss.setData('neonColor', neonColor);
  boss.setData('puntos', puntos);
  scene.tweens.add({
    targets: boss,
    x: GAME_WIDTH - 120,
    duration: 1200,
    ease: 'Power2',
    onComplete: () => {
      bossState = 'active';
      bossNextAction = playTime + 1500;
      emit('boss:enter');
    }
  });
}

function killBoss(scene) {
  if (bossState === 'dying') return;
  bossState = 'dying';
  emit('boss:die');
  let bx = boss.x, by = boss.y;
  let bnc = boss.getData('neonColor') || 0xff6600;
  boss.destroy();
  boss = null;
  let flash = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 1).setOrigin(0, 0).setDepth(300);
  scene.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
  spawnDeathExplosion(scene, bx, by, bnc, 14);
  scene.time.delayedCall(1000, () => {
    if (currentState !== 'playing') return;
    bossState = null;
    enemyBullets.clear(true, true);
    if (bossSection === 4) {
      loopCount++;
      currentSection = 0;
      sectionTimer = 0;
      sectionProgress = 0;
      gameSpeed = SECTIONS[0].speedFloor + loopCount * TUNING.BOSS.SPEED_LOOP_BONUS;
      pendingBonusPowerup = true;
    } else {
      currentSection++;
      sectionTimer = 0;
      sectionProgress = 0;
      gameSpeed = Math.max(SECTIONS[currentSection].speedFloor, gameSpeed * 0.8);
      pendingBonusPowerup = true;
    }
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
  let rb2 = boss.getData('radioBase') || 42;
  scene.tweens.add({ targets: boss, radioActual: rb2 * 1.3, brilloExtra: 2.5, duration: 80, ease: 'Sine.easeOut', yoyo: true, hold: 30 });
  if (pat === 0) {
    let baseAngle = Phaser.Math.Angle.Between(boss.x, boss.y, player.x, player.y);
    for (let i = 0; i < 6; i++) {
      let a = baseAngle - Phaser.Math.DegToRad(50) + i * Phaser.Math.DegToRad(20);
      createEnemyBullet(scene, boss.x - 40, boss.y, Math.cos(a) * 300, Math.sin(a) * 300);
    }
    bossNextAction = playTime + 4000;
  } else if (pat === 1) {
    let heights = [100, 230, 360, 480];
    heights.forEach((h, i) => {
      scene.time.delayedCall(i * 300, () => {
        if (bossState !== 'active') return;
        createEnemyBullet(scene, boss ? boss.x - 40 : GAME_WIDTH - 160, h, -380, 0);
      });
    });
    bossNextAction = playTime + 4200;
  } else if (pat === 2) {
    let positions = [];
    for (let i = 0; i < 3; i++) {
      positions.push({ x: Phaser.Math.Between(80, 500), y: Phaser.Math.Between(80, 500) });
    }
    let markers = positions.map(p =>
      scene.add.text(p.x, p.y, 'X', { fontSize: '28px', fontFamily: 'Arial', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5).setDepth(100)
    );
    scene.time.delayedCall(1000, () => {
      markers.forEach(m => m.destroy());
      if (bossState !== 'active' || !boss) return;
      positions.forEach(p => {
        let a = Phaser.Math.Angle.Between(boss.x, boss.y, p.x, p.y);
        createEnemyBullet(scene, boss.x - 40, boss.y, Math.cos(a) * 320, Math.sin(a) * 320);
      });
    });
    bossNextAction = playTime + 4500;
  } else {
    // Espiral: 8 proyectiles en círculo (solo boss 2)
    for (let i = 0; i < 8; i++) {
      let a = (i / 8) * Math.PI * 2;
      createEnemyBullet(scene, boss.x, boss.y, Math.cos(a) * 320, Math.sin(a) * 320);
    }
    bossNextAction = playTime + 4000;
  }
  bossPattern++;
}

function drawNeonEnemy(e, time) {
  e.clear();
  e.rotation += e.velRotacion || 0.02;
  let osc = Math.sin((time * 0.003) + (e.faseTiempo || 0)) * 4;
  let r = (e.radioActual || e.getData('radioBase') || 14) + osc;
  let puntos = e.getData('puntos') || 3;
  let nc = e.getData('neonColor') || 0xff0044;
  let bx = e.brilloExtra || 1;
  let verts = [];
  for (let i = 0; i < puntos; i++) {
    let a = -Math.PI / 2 + (i / puntos) * Math.PI * 2;
    verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  e.lineStyle(12, nc, 0.2 * bx);
  e.strokePoints(verts, true, true);
  e.lineStyle(6, nc, 0.6 * bx);
  e.strokePoints(verts, true, true);
  e.lineStyle(2, 0xffffff, 1);
  e.strokePoints(verts, true, true);
  for (let v of verts) {
    e.fillStyle(nc, 0.5 * bx);
    e.fillCircle(v.x, v.y, 5);
    e.fillStyle(0xffffff, 1);
    e.fillCircle(v.x, v.y, 2);
  }
}

async function updateLeaderboard(score) {
  if (!window.platanusArcadeStorage) return;

  ui.leaderboardText.setText('Saving score...');
  ui.leaderboardText.setVisible(true);

  try {
    let result = await window.platanusArcadeStorage.get('chromadash-leaderboard');
    let top = [];
    if (result && result.found && result.value && Array.isArray(result.value.top)) {
      top = result.value.top;
    }

    top.push({ score: score });
    top.sort((a, b) => b.score - a.score);
    if (top.length > 5) top = top.slice(0, 5);

    await window.platanusArcadeStorage.set('chromadash-leaderboard', { top: top });

    let lbText = 'TOP 5 SCORES:\n\n';
    for (let i = 0; i < top.length; i++) {
      lbText += `${i + 1}. ${top[i].score}\n`;
    }
    ui.leaderboardText.setText(lbText);
  } catch (err) {
    ui.leaderboardText.setText('Leaderboard offline');
  }
}

function playerDie(scene, type) {
  if (currentState !== 'playing') return;
  if ((type === 'enemy' || type === 'enemyBullet' || type === 'airTriangle') && playTime < playerState.invulnerableUntil) return;
  playerState.health.current--;
  updateHealthHUD();
  if (playerState.health.current <= 0) {
    emit('player:die');
    changeState(scene, 'gameover');
  } else {
    playerState.invulnerableUntil = playTime + TUNING.PLAYER.IMMUNITY_AFTER_HIT_MS;
    emit('player:hurt');
    let flash = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0.25).setOrigin(0, 0).setDepth(250);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
  }
}

function preload() { }

function create() {
  const scene = this;
  _eventScene = scene;

  // Fondo
  currentThemeColorRGB = Phaser.Display.Color.IntegerToRGB(SECTIONS[0].color);
  let initRGB = Phaser.Display.Color.IntegerToRGB(SECTIONS[0].color);
  let initialBgC = Phaser.Display.Color.GetColor(
    Math.floor(initRGB.r * 0.4),
    Math.floor(initRGB.g * 0.4),
    Math.floor(initRGB.b * 0.4)
  );
  ui.bgRect = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, initialBgC).setOrigin(0, 0).setDepth(0);

  // HUD de sección
  ui.sectionBarBg = scene.add.rectangle(0, 0, GAME_WIDTH, 12, 0x333333).setOrigin(0, 0).setDepth(200);
  ui.sectionBarFill = scene.add.rectangle(0, 0, 0, 12, SECTIONS[0].color).setOrigin(0, 0).setDepth(201);
  ui.sectionText = scene.add.text(GAME_WIDTH - 10, 6, 'S1', {
    fontSize: '12px',
    fontFamily: 'Arial',
    color: '#ffffff',
    fontStyle: 'bold'
  }).setOrigin(1, 0.5).setDepth(202);

  // Pantalla de inicio
  ui.startText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 3, 'INFINITE RUNNER PLATFORMER', {
    fontSize: '32px',
    fontFamily: 'Arial',
    color: COLORS.textLight,
    fontStyle: 'bold'
  }).setOrigin(0.5);

  ui.startInstructions = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'PRESS SPACE TO START', {
    fontSize: '24px',
    fontFamily: 'Arial',
    color: COLORS.textHighlight
  }).setOrigin(0.5);

  // Pantalla de pausa
  ui.pausedOverlay = scene.add.graphics();
  ui.pausedOverlay.fillStyle(COLORS.pausedOverlay, 0.7);
  ui.pausedOverlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ui.pausedOverlay.setDepth(100);
  ui.pausedOverlay.setVisible(false);

  ui.pausedText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'PAUSED', {
    fontSize: '48px',
    fontFamily: 'Arial',
    color: '#ffffff',
    align: 'center'
  }).setOrigin(0.5).setDepth(101).setVisible(false);

  // Pantalla de fin de juego
  ui.gameOverText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 3, 'GAME OVER', {
    fontSize: '48px',
    fontFamily: 'Arial',
    color: '#ff0000',
    fontStyle: 'bold'
  }).setOrigin(0.5).setDepth(101).setVisible(false);

  ui.gameOverInstructions = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'PRESS SPACE TO RESTART', {
    fontSize: '24px',
    fontFamily: 'Arial',
    color: COLORS.textHighlight
  }).setOrigin(0.5).setDepth(101).setVisible(false);

  // Jugador
  player = scene.add.rectangle(200, 300, 24, 32, COLORS.player);
  scene.physics.add.existing(player);
  player.body.allowGravity = false;
  player.setVisible(false);

  // Textura de pinchos
  let g = scene.make.graphics({ add: false });
  g.fillStyle(COLORS.spike, 1);
  g.fillTriangle(0, 20, 10, 0, 20, 20);
  g.generateTexture('spike', 20, 20);

  // Grupo de pinchos
  spikes = scene.physics.add.group({
    allowGravity: false,
    immovable: true
  });

  // Balas del jugador
  playerBullets = scene.physics.add.group({ allowGravity: false });

  // Enemigos
  enemies = scene.physics.add.group({ allowGravity: false });
  airTriangles = scene.physics.add.group({ allowGravity: false });

  scene.physics.add.overlap(player, airTriangles, (pl, tri) => playerDie(scene, 'airTriangle'));
  scene.physics.add.overlap(playerBullets, airTriangles, (bullet, tri) => {
    bullet.destroy();
    tri.destroy();
    enemiesDefeated++;
  });

  // Balas enemigas
  enemyBullets = scene.physics.add.group({ allowGravity: false });

  // Grupo de powerups
  powerups = scene.physics.add.group({ allowGravity: false });
  let warningLinesGroup = scene.add.group();
  scene.warningLinesGroup = warningLinesGroup;

  // Colisiones y solapamientos
  scene.physics.add.overlap(player, spikes, () => playerDie(scene, 'spike'));
  scene.physics.add.overlap(player, enemies, (pl, en) => {
    if (playerState.state === 'downDashing' && (pl.body.velocity.y > 10 || pl.y < en.y)) {
      en.destroy();
      enemiesDefeated++;
      pl.body.setVelocityY(TUNING.PLAYER.DOWN_DASH_BOUNCE);
      playerState.setState('airborne');
    } else {
      playerDie(scene, 'enemy');
    }
  });
  scene.physics.add.overlap(player, enemyBullets, () => playerDie(scene, 'enemyBullet'));
  scene.physics.add.overlap(playerBullets, enemies, (bullet, enemy) => {
    let damage = bullet.getData('damage') || 1;
    let hp = enemy.getData('hp') || 1;
    hp -= damage;
    enemy.setData('hp', hp);

    bullet.destroy();

    if (hp <= 0) {
      spawnDeathExplosion(scene, enemy.x, enemy.y, enemy.getData('neonColor') || 0xff0044, 8);
      enemy.destroy();
      enemiesDefeated++;
      emit('enemy:die');
    } else {
      enemy.brilloExtra = 5;
      scene.time.delayedCall(100, () => {
        if (enemy.active) enemy.brilloExtra = 1;
      });
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
        playerState.invulnerableUntil = playTime + TUNING.PLAYER.IMMUNITY_POWERUP_MS;
      } else if (pt === 2) {
        shootMode = 'homing';
        ui.shootModeText.setText('◆ HOMING').setColor('#00ffff');
      } else if (pt === 3) {
        shootMode = 'triple';
        ui.shootModeText.setText('◆ TRIPLE').setColor('#ff00ff');
      } else if (pt === 4) {
        shootMode = 'auto';
        ui.shootModeText.setText('◆ AUTO').setColor('#ff8800');
      } else if (pt === 5) {
        if (playerState.health.max < TUNING.PLAYER.HEALTH_MAX) {
          playerState.health.max++;
          rebuildBarHUD(scene, 'healthBars', playerState.health.max,
            (sc, i, max) => { let hb = sc.add.star(GAME_WIDTH / 2 - (max - 1) * 14 + i * 28, GAME_HEIGHT - 14, 4, 5, 10, 0xff3333); hb.setDepth(202); return hb; });
        }
        playerState.health.current = playerState.health.max;
        updateHealthHUD();
      }
      emit('powerup:collect', { type: pt });
      pu.destroy();
    }
  });

  // Grupo de plataformas
  platforms = scene.physics.add.group({
    allowGravity: false,
    immovable: true
  });
  scene.physics.add.collider(player, platforms);

  // Suelo inicial
  let startFloor = scene.add.rectangle(GAME_WIDTH / 2, 550, GAME_WIDTH * 1.5, 40, COLORS.platform);
  platforms.add(startFloor);
  scene.physics.add.existing(startFloor);
  startFloor.body.allowGravity = false;
  startFloor.body.immovable = true;
  startFloor.body.checkCollision.down = false;
  startFloor.body.checkCollision.left = false;
  startFloor.body.checkCollision.right = false;

  // Barras de salto (HUD)
  ui.jumpBars = [];
  for (let i = 0; i < playerState.jumps.max; i++) {
    let bar = scene.add.rectangle(20 + i * 28, GAME_HEIGHT - 30, 24, 10, COLORS.powerupJump);
    bar.setOrigin(0, 0.5);
    ui.jumpBars.push(bar);
  }

  // Barras de vida (HUD) — diamantes rojos centrados abajo
  ui.healthBars = [];
  for (let i = 0; i < playerState.health.max; i++) {
    let hb = scene.add.star(GAME_WIDTH / 2 - (playerState.health.max - 1) * 14 + i * 28, GAME_HEIGHT - 14, 4, 5, 10, 0xff3333);
    hb.setDepth(202);
    ui.healthBars.push(hb);
  }

  // HUD de modo de disparo
  ui.shootModeText = scene.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 30, '◆ HOMING', {
    fontSize: '20px',
    fontFamily: 'Arial',
    color: '#00ffff',
    fontStyle: 'bold'
  }).setOrigin(1, 0.5).setDepth(202);

  // HUD de puntuación
  ui.scoreText = scene.add.text(20, 20, 'SCORE: 0', {
    fontSize: '24px',
    fontFamily: 'Arial',
    color: '#ffffff',
    fontStyle: 'bold'
  }).setOrigin(0, 0).setDepth(202);

  // Texto del leaderboard
  ui.leaderboardText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, '', {
    fontSize: '18px',
    fontFamily: 'Arial',
    color: '#aaaaaa',
    align: 'center'
  }).setOrigin(0.5).setDepth(101).setVisible(false);

  // Manejo de input de teclado
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
}

function consumePressed(code) {
  if (controls.pressed[code]) {
    controls.pressed[code] = false;
    return true;
  }
  return false;
}

// ── resetGame ──────────────────────────────────────────────────────────────

function resetGame(scene) {
  player.setPosition(200, 300);
  player.body.setVelocity(0, 0);
  player.body.allowGravity = true;
  player.setVisible(true);

  playerState.reset();
  rebuildBarHUD(scene, 'jumpBars', playerState.jumps.max,
    (sc, i) => { let b = sc.add.rectangle(20 + i * 28, GAME_HEIGHT - 30, 24, 10, COLORS.powerupJump); b.setOrigin(0, 0.5); return b; });
  rebuildBarHUD(scene, 'healthBars', playerState.health.max,
    (sc, i, max) => { let hb = sc.add.star(GAME_WIDTH / 2 - (max - 1) * 14 + i * 28, GAME_HEIGHT - 14, 4, 5, 10, 0xff3333); hb.setDepth(202); return hb; });
  updateHealthHUD();
  gameSpeed = TUNING.WORLD.GAME_SPEED_START;
  nextPlatformX = GAME_WIDTH + 200;
  playTime = 0;
  lastFireTime = 0;
  nextEnemyTime = TUNING.WORLD.FIRST_ENEMY_DELAY_MS;
  shootMode = 'homing';
  ui.shootModeText.setText('◆ HOMING').setColor('#00ffff');

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

  platforms.clear(true, true);
  spikes.clear(true, true);
  playerBullets.clear(true, true);
  enemies.clear(true, true);
  airTriangles.clear(true, true);
  enemyBullets.clear(true, true);
  powerups.clear(true, true);
  if (scene.warningLinesGroup) scene.warningLinesGroup.clear(true, true);
  let floor = scene.add.rectangle(GAME_WIDTH / 2, 550, GAME_WIDTH * 1.5, 40, COLORS.platform);
  platforms.add(floor);
  scene.physics.add.existing(floor);
  floor.body.allowGravity = false;
  floor.body.immovable = true;
  floor.body.checkCollision.down = false;
  floor.body.checkCollision.left = false;
  floor.body.checkCollision.right = false;
}

// ── State machine ──────────────────────────────────────────────────────────

const states = {
  start: {
    update(scene, time, delta) {
      if (consumePressed('START1') || consumePressed('P1_1') || consumePressed('P1_U')) {
        changeState(scene, 'playing');
      }
    },
    exit(scene) {
      ui.startText.setVisible(false);
      ui.startInstructions.setVisible(false);
      resetGame(scene);
    }
  },
  playing: {
    enter(scene) {
      scene.physics.resume();
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
      ui.pausedOverlay.setVisible(true);
      ui.pausedText.setVisible(true);
    },
    update(scene, time, delta) {
      if (consumePressed('START2') || consumePressed('P1_2') || consumePressed('START1')) {
        changeState(scene, 'playing');
      }
    },
    exit(scene) {
      ui.pausedOverlay.setVisible(false);
      ui.pausedText.setVisible(false);
    }
  },
  gameover: {
    enter(scene) {
      scene.physics.pause();
      ui.gameOverText.setVisible(true);
      ui.gameOverInstructions.setVisible(true);
      updateLeaderboard(currentScore);
    },
    update(scene, time, delta) {
      if (consumePressed('START1') || consumePressed('P1_U') || consumePressed('P1_1')) {
        changeState(scene, 'playing');
      }
    },
    exit(scene) {
      ui.gameOverText.setVisible(false);
      ui.gameOverInstructions.setVisible(false);
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

// ── Playing sub-updates (Paso 4) ───────────────────────────────────────────

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

    let plat = scene.add.rectangle(nextPlatformX + platWidth / 2, platY, platWidth, 20, isMoving ? COLORS.platformMoving : themeValue);
    plat.setData('isMoving', isMoving);
    platforms.add(plat);
    scene.physics.add.existing(plat);
    plat.body.allowGravity = false;
    plat.body.immovable = true;
    plat.body.checkCollision.down = false;
    plat.body.checkCollision.left = false;
    plat.body.checkCollision.right = false;

    if (isMoving) {
      scene.tweens.add({ targets: plat, y: plat.y - 80, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    if (hasSpikes) {
      let spikeWidth = Math.floor((platWidth * 0.5) / 20) * 20;
      if (spikeWidth < 20) spikeWidth = 20;
      let isLeft = Math.random() < 0.5;
      let spikeX = nextPlatformX + (isLeft ? (spikeWidth / 2) : (platWidth - spikeWidth / 2));
      let spike = scene.add.tileSprite(spikeX, platY - 20, spikeWidth, 20, 'spike');
      spikes.add(spike);
      scene.physics.add.existing(spike);
      spike.body.allowGravity = false;
      spike.body.immovable = true;
      spike.body.setSize(spikeWidth - 4, 16);
      spike.body.setOffset(2, 4);
    } else if (!isMoving && (pendingBonusPowerup || Math.random() < 0.15)) {
      pendingBonusPowerup = false;
      let pType = Phaser.Math.Between(0, 5);
      if (pType === 0 && playerState.jumps.max >= TUNING.PLAYER.JUMP_MAX) pType = 1;
      if (pType === 5 && playerState.health.max >= TUNING.PLAYER.HEALTH_MAX) pType = 1;
      let puX = nextPlatformX + platWidth / 2;
      let puY = platY - 40;
      let pu;
      if (pType === 0) pu = scene.add.triangle(puX, puY, 0, 15, 15, 15, 7.5, 0, COLORS.powerupJump);
      else if (pType === 1) pu = scene.add.circle(puX, puY, 10, COLORS.powerupInvune);
      else if (pType === 2) pu = scene.add.triangle(puX, puY, 0, 0, 15, 0, 7.5, 15, 0x00ffff);
      else if (pType === 3) pu = scene.add.triangle(puX, puY, 0, 0, 15, 0, 7.5, 15, 0xff00ff);
      else if (pType === 4) pu = scene.add.triangle(puX, puY, 0, 0, 15, 0, 7.5, 15, 0xff8800);
      else pu = scene.add.star(puX, puY, 4, 5, 12, 0xff3333);
      powerups.add(pu);
      scene.physics.add.existing(pu);
      pu.body.allowGravity = false;
      pu.body.immovable = true;
      pu.setData('type', pType);
      scene.tweens.add({ targets: pu, y: pu.y - 15, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    nextPlatformX += platWidth + Phaser.Math.Between(100, 250);
  }

  platforms.getChildren().forEach(plat => {
    if (!plat.getData('isMoving')) plat.setFillStyle(themeValue);
    plat.body.setVelocityX(-gameSpeed);
    if (plat.x + plat.width / 2 < 0) plat.destroy();
  });
  spikes.getChildren().forEach(s => {
    s.body.setVelocityX(-gameSpeed);
    if (s.x + s.width / 2 < 0) s.destroy();
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
      let tri = scene.add.triangle(850, spawnY, 0, 15, 30, 0, 30, 30,
        currentThemeColorRGB ? Phaser.Display.Color.GetColor(currentThemeColorRGB.r, currentThemeColorRGB.g, currentThemeColorRGB.b) : 0xffffff);
      airTriangles.add(tri);
      scene.physics.add.existing(tri);
      tri.body.allowGravity = false;
      tri.body.setVelocityX(lvl === 1 ? -300 : -500);
      tri.setData('level', lvl);
      tri.setData('fired', false);
    });
  }

  let enemiesInS1Loop = loopCount > 0 && currentSection === 0;
  if (playTime > nextEnemyTime && enemies.countActive(true) < 4 && (isMechanicActive('enemies') || enemiesInS1Loop) && !bossState) {
    let level = 1;
    if (enemiesInS1Loop) level = 2;
    else if (currentSection === 2) level = Math.random() < 0.5 ? 1 : 2;
    else if (currentSection === 3) level = 2;
    else if (currentSection >= 4) level = 3;

    let r = 14, hp = 2, neonColor = 0xff0044;
    if (level === 2) { r = 18; hp = 4; neonColor = 0xff3333; }
    else if (level === 3) { r = 22; hp = 6; neonColor = 0xff6600; }

    let e = scene.add.graphics({ x: GAME_WIDTH + 50, y: Phaser.Math.Between(150, 450) });
    e.setBlendMode(Phaser.BlendModes.ADD);
    e.setDepth(10);
    e.radioActual = r;
    e.brilloExtra = 1;
    e.velRotacion = (Math.random() > 0.5 ? 1 : -1) * 0.02;
    e.faseTiempo = Math.random() * 100;
    enemies.add(e);
    scene.physics.add.existing(e);
    e.body.allowGravity = false;
    e.body.setSize(r * 2, r * 2);
    e.body.offset.set(-r, -r);
    e.setData('lastFire', playTime + Phaser.Math.Between(1000, 2000));
    e.setData('hp', hp);
    e.setData('level', level);
    e.setData('radioBase', r);
    e.setData('neonColor', neonColor);
    e.setData('puntos', 2 + level);

    let targetX = GAME_WIDTH - 50 - Phaser.Math.Between(0, 40);
    scene.tweens.add({
      targets: e, x: targetX, duration: 800 + Phaser.Math.Between(0, 500), ease: 'Power2',
      onComplete: () => {
        scene.tweens.add({ targets: e, y: e.y + Phaser.Math.Between(-80, 80), duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    });
    nextEnemyTime = playTime + Math.max(2500, 6000 - (gameSpeed - 150) * 15);
  }
}

function updatePlayerInput(scene, delta, isOnGround) {
  if (consumePressed('P1_L')) {
    if (playTime - playerState.dash.lastTapL < TUNING.PLAYER.DOUBLE_TAP_WINDOW_MS && playTime > playerState.dash.cooldownUntil && playerState.jumps.current > 0) {
      playerState.dash.direction = -1;
      playerState.dash.activeUntil = playTime + TUNING.PLAYER.DASH_DURATION_MS;
      playerState.dash.cooldownUntil = playTime + TUNING.PLAYER.DASH_COOLDOWN_MS;
      playerState.invulnerableUntil = Math.max(playerState.invulnerableUntil, playTime + 200);
      playerState.jumps.current--;
      emit('player:dash');
    }
    playerState.dash.lastTapL = playTime;
  }
  if (consumePressed('P1_R')) {
    if (playTime - playerState.dash.lastTapR < TUNING.PLAYER.DOUBLE_TAP_WINDOW_MS && playTime > playerState.dash.cooldownUntil && playerState.jumps.current > 0) {
      playerState.dash.direction = 1;
      playerState.dash.activeUntil = playTime + TUNING.PLAYER.DASH_DURATION_MS;
      playerState.dash.cooldownUntil = playTime + TUNING.PLAYER.DASH_COOLDOWN_MS;
      playerState.invulnerableUntil = Math.max(playerState.invulnerableUntil, playTime + 200);
      playerState.jumps.current--;
      emit('player:dash');
    }
    playerState.dash.lastTapR = playTime;
  }

  let playerSpeedX = 0;
  if (playTime < playerState.dash.activeUntil) {
    playerSpeedX = TUNING.PLAYER.DASH_SPEED * playerState.dash.direction;
    if (Math.random() < 0.3) {
      let trail = scene.add.rectangle(player.x, player.y, 24, 32, COLORS.player, 0.5);
      scene.tweens.add({ targets: trail, alpha: 0, duration: 200, onComplete: () => trail.destroy() });
    }
  } else {
    if (controls.held['P1_L']) playerSpeedX = -TUNING.PLAYER.WALK_SPEED;
    else if (controls.held['P1_R']) playerSpeedX = TUNING.PLAYER.WALK_SPEED;
    else if (isOnGround) playerSpeedX = -gameSpeed;
  }
  player.body.setVelocityX(playerSpeedX);

  if (player.y > GAME_HEIGHT || player.x + player.width / 2 < 0) playerDie(scene, 'fall');

  if (playTime < playerState.invulnerableUntil) {
    player.alpha = (Math.floor(playTime / 100) % 2 === 0) ? 0.3 : 1;
  } else {
    player.alpha = 1;
  }

  if (player.x + player.width / 2 > GAME_WIDTH) player.setX(GAME_WIDTH - player.width / 2);

  if (isOnGround && playerState.state === 'downDashing') playerState.setState('idle');

  if (consumePressed('START1') || consumePressed('P1_U')) {
    if (controls.held['P1_D'] && !isOnGround) {
      if (playerState.jumps.current > 0) {
        playerState.setState('downDashing');
        player.body.setVelocityY(TUNING.PLAYER.DOWN_DASH_VELOCITY);
        playerState.jumps.current--;
        emit('player:downDash');
      }
    } else if (isOnGround) {
      player.body.setVelocityY(TUNING.PLAYER.JUMP_VELOCITY);
      emit('player:jump');
    } else if (playerState.jumps.current > 0) {
      player.body.setVelocityY(TUNING.PLAYER.JUMP_VELOCITY);
      playerState.jumps.current--;
      emit('player:jump');
    }
  }
}

function updateShooting(scene) {
  let firePressed = consumePressed('P1_1');
  if (shootMode === 'auto') {
    if (controls.held['P1_1'] && playTime > lastFireTime + TUNING.SHOOT.AUTO_INTERVAL_MS) {
      lastFireTime = playTime;
      createPlayerBullet(scene, 'auto');
    }
  } else {
    let cooldown = shootMode === 'triple' ? TUNING.SHOOT.TRIPLE_COOLDOWN_MS : TUNING.SHOOT.HOMING_COOLDOWN_MS;
    if (firePressed && playTime > lastFireTime + cooldown) {
      lastFireTime = playTime;
      if (shootMode === 'triple') {
        for (let angle of [-15, 0, 15]) {
          createPlayerBullet(scene, 'triple', Phaser.Math.DegToRad(angle));
        }
      } else {
        createPlayerBullet(scene, 'homing');
      }
    }
  }
}

function updateEnemies(scene, time) {
  enemies.getChildren().forEach(e => {
    drawNeonEnemy(e, time);
    let lastFire = e.getData('lastFire');
    let level = e.getData('level') || 1;
    let cooldown = level === 1 ? 2500 : 3000;
    if (playTime > lastFire + cooldown) {
      let rb = e.getData('radioBase') || 14;
      scene.tweens.add({ targets: e, radioActual: rb * 1.5, brilloExtra: 3.5, duration: 100, ease: 'Sine.easeOut', yoyo: true, hold: 50 });
      let jitter = level === 1 ? Phaser.Math.Between(-500, 500) : 0;
      e.setData('lastFire', playTime + jitter);
      if (level === 1) createEnemyBullet(scene, e.x - 14, e.y, -350, 0);
      else if (level === 2) {
        createEnemyBullet(scene, e.x - 18, e.y, -350, 0);
        scene.time.delayedCall(300, () => { if (e.active) createEnemyBullet(scene, e.x - 18, e.y, -350, 0); });
      } else if (level === 3) {
        for (let ang of [-10, 0, 10]) {
          let rad = Phaser.Math.DegToRad(ang + 180);
          createEnemyBullet(scene, e.x - 22, e.y, Math.cos(rad) * 350, Math.sin(rad) * 350);
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
      let rb = boss.getData('radioBase') || 42;
      let hw = rb + 8;
      if (Math.abs(b.x - boss.x) < hw && Math.abs(b.y - boss.y) < hw) {
        let dmg = b.getData('damage') || 1;
        bossHp -= dmg;
        b.destroy();
        boss.brilloExtra = 5;
        scene.time.delayedCall(80, () => { if (boss && boss.active) boss.brilloExtra = 1; });
        if (bossHp <= 0 && bossState !== 'dying') killBoss(scene);
        return;
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
    let trail = scene.add.circle(b.x, b.y, 4, COLORS.bullet, 0.5);
    scene.tweens.add({ targets: trail, alpha: 0, scale: 0.1, duration: 200, onComplete: () => trail.destroy() });
    if (b.x > GAME_WIDTH + 50 || b.y < -50 || b.y > GAME_HEIGHT + 50) b.destroy();
  });

  airTriangles.getChildren().forEach(tri => {
    if (tri.x < -50) tri.destroy();
    else if (tri.getData('level') === 3 && !tri.getData('fired') && tri.x < 600) {
      tri.setData('fired', true);
      let bullet = scene.add.rectangle(tri.x, tri.y, 12, 12, COLORS.enemyBullet);
      enemyBullets.add(bullet);
      scene.physics.add.existing(bullet);
      bullet.body.allowGravity = false;
      let angle = Phaser.Math.Angle.Between(tri.x, tri.y, player.x, player.y);
      bullet.body.setVelocity(Math.cos(angle) * 450, Math.sin(angle) * 450);
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
  updateSpawning(scene, delta, themeValue);
  updatePlayerInput(scene, delta, isOnGround);
  updateShooting(scene);
  updateEnemies(scene, time);
  updatePlayerBullets(scene, delta);
  updateBossLogic(scene, time);
  updateJumpRecharge(delta);
  updateHUD();
}

function update(time, delta) {
  const scene = this;
  states[currentState].update(scene, time, delta);
  for (const code in controls.pressed) {
    controls.pressed[code] = false;
  }
}

