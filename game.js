const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

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

// DO NOT replace existing keys — they match the physical arcade cabinet wiring.
// To add local testing shortcuts, append extra keys to any array a.
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
  P2_U: ['ArrowUp'],
  P2_D: ['ArrowDown'],
  P2_L: ['ArrowLeft'],
  P2_R: ['ArrowRight'],
  P2_1: ['r'],
  P2_2: ['t'],
  P2_3: ['y'],
  P2_4: ['f'],
  P2_5: ['g'],
  P2_6: ['h'],
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

let gameState = 'start'; // 'start' | 'playing' | 'paused' | 'gameover'
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
let gameSpeed = 150;
let nextPlatformX = 0;
let playTime = 0;
let immunityTimer = 0;
let jumps = { current: 3, max: 3, timer: 0 };
let health = { current: 3, max: 3 };
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

let lastTapA = 0;
let lastTapD = 0;
let dashActiveTimer = 0;
let dashCooldownTimer = 0;
let isDownDashing = false;
let dashDirection = 0;

let enemiesDefeated = 0;
let currentScore = 0;

let bossMode = false;
let bossEntering = false;
let bossDying = false;
let boss = null;
let bossHp = 0;
let bossHpMax = 30;
let bossPattern = 0;
let bossNextAction = 0;
let bossSection = 0;
let loopCount = 0;

function isMechanicActive(name) {
  return SECTIONS[currentSection].mechanics.includes(name);
}

function updateHealthHUD() {
  for (let i = 0; i < ui.healthBars.length; i++) {
    ui.healthBars[i].setFillStyle(i < health.current ? 0xff3333 : 0x555555);
  }
}

function spawnBoss(scene, sectionIdx) {
  bossSection = sectionIdx;
  bossMode = true;
  bossEntering = true;
  let isBoss2 = sectionIdx === 4;
  bossHpMax = (isBoss2 ? 60 : 30) + loopCount * 15;
  bossHp = bossHpMax;
  bossPattern = 0;
  bossNextAction = 0;
  enemies.clear(true, true);
  enemyBullets.clear(true, true);
  let w = isBoss2 ? 100 : 80;
  let h = isBoss2 ? 100 : 80;
  let color = isBoss2 ? 0xff2200 : 0xff8800;
  boss = scene.add.rectangle(GAME_WIDTH + 60, GAME_HEIGHT / 2 - 50, w, h, color);
  boss.setDepth(20);
  scene.tweens.add({
    targets: boss,
    x: GAME_WIDTH - 120,
    duration: 1200,
    ease: 'Power2',
    onComplete: () => {
      bossEntering = false;
      bossNextAction = playTime + 1500;
    }
  });
}

function killBoss(scene) {
  if (bossDying) return;
  bossDying = true;
  let bx = boss.x, by = boss.y;
  boss.destroy();
  boss = null;
  let flash = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 1).setOrigin(0, 0).setDepth(300);
  scene.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
  for (let i = 0; i < 8; i++) {
    let p = scene.add.circle(bx, by, Phaser.Math.Between(5, 10), 0xff8800).setDepth(200);
    let angle = (i / 8) * Math.PI * 2;
    let dist = Phaser.Math.Between(80, 200);
    scene.tweens.add({
      targets: p,
      x: bx + Math.cos(angle) * dist,
      y: by + Math.sin(angle) * dist,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => p.destroy()
    });
  }
  scene.time.delayedCall(1000, () => {
    if (gameState !== 'playing') return;
    bossMode = false;
    bossDying = false;
    enemyBullets.clear(true, true);
    if (bossSection === 4) {
      loopCount++;
      currentSection = 0;
      sectionTimer = 0;
      sectionProgress = 0;
      gameSpeed = SECTIONS[0].speedFloor + loopCount * 30;
      pendingBonusPowerup = true;
    } else {
      currentSection++;
      sectionTimer = 0;
      sectionProgress = 0;
      gameSpeed = Math.max(SECTIONS[currentSection].speedFloor, gameSpeed * 0.8);
      pendingBonusPowerup = true;
    }
    health.current = health.max;
    updateHealthHUD();
    let flash2 = scene.add.graphics();
    flash2.fillStyle(SECTIONS[currentSection].color, 1);
    flash2.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    flash2.setDepth(200);
    scene.tweens.add({ targets: flash2, alpha: 0, duration: 300, onComplete: () => flash2.destroy() });
  });
}

function executeBossPattern(scene) {
  if (!boss || !boss.active || bossDying) return;
  let numPatterns = bossSection === 4 ? 4 : 3;
  let pat = bossPattern % numPatterns;
  let spawnBB = (x, y, vx, vy) => {
    if (!bossMode || bossDying || !scene.physics) return;
    let b = scene.add.circle(x, y, 9, 0xff2200).setDepth(50);
    enemyBullets.add(b);
    scene.physics.add.existing(b);
    b.body.allowGravity = false;
    b.body.setVelocity(vx, vy);
  };
  if (pat === 0) {
    let baseAngle = Phaser.Math.Angle.Between(boss.x, boss.y, player.x, player.y);
    for (let i = 0; i < 6; i++) {
      let a = baseAngle - Phaser.Math.DegToRad(50) + i * Phaser.Math.DegToRad(20);
      spawnBB(boss.x - 40, boss.y, Math.cos(a) * 300, Math.sin(a) * 300);
    }
    bossNextAction = playTime + 4000;
  } else if (pat === 1) {
    let heights = [100, 230, 360, 480];
    heights.forEach((h, i) => {
      scene.time.delayedCall(i * 300, () => {
        if (!bossMode || bossDying) return;
        spawnBB(boss ? boss.x - 40 : GAME_WIDTH - 160, h, -380, 0);
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
      if (!bossMode || bossDying || !boss) return;
      positions.forEach(p => {
        let a = Phaser.Math.Angle.Between(boss.x, boss.y, p.x, p.y);
        spawnBB(boss.x - 40, boss.y, Math.cos(a) * 320, Math.sin(a) * 320);
      });
    });
    bossNextAction = playTime + 4500;
  } else {
    // Spiral: 8 projectiles expanding outward in circle (boss 2 only)
    for (let i = 0; i < 8; i++) {
      let a = (i / 8) * Math.PI * 2;
      spawnBB(boss.x, boss.y, Math.cos(a) * 320, Math.sin(a) * 320);
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
  if (gameState !== 'playing') return;
  if ((type === 'enemy' || type === 'enemyBullet' || type === 'airTriangle') && playTime < immunityTimer) return;
  health.current--;
  updateHealthHUD();
  if (health.current <= 0) {
    gameState = 'gameover';
    scene.physics.pause();
    ui.gameOverText.setVisible(true);
    ui.gameOverInstructions.setVisible(true);
    updateLeaderboard(currentScore);
  } else {
    immunityTimer = playTime + 2000;
    let flash = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0.25).setOrigin(0, 0).setDepth(250);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
  }
}

function preload() { }

function create() {
  const scene = this;

  // Background
  currentThemeColorRGB = Phaser.Display.Color.IntegerToRGB(SECTIONS[0].color);
  let initRGB = Phaser.Display.Color.IntegerToRGB(SECTIONS[0].color);
  let initialBgC = Phaser.Display.Color.GetColor(
    Math.floor(initRGB.r * 0.4),
    Math.floor(initRGB.g * 0.4),
    Math.floor(initRGB.b * 0.4)
  );
  ui.bgRect = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, initialBgC).setOrigin(0, 0).setDepth(0);

  // Section HUD
  ui.sectionBarBg = scene.add.rectangle(0, 0, GAME_WIDTH, 12, 0x333333).setOrigin(0, 0).setDepth(200);
  ui.sectionBarFill = scene.add.rectangle(0, 0, 0, 12, SECTIONS[0].color).setOrigin(0, 0).setDepth(201);
  ui.sectionText = scene.add.text(GAME_WIDTH - 10, 6, 'S1', {
    fontSize: '12px',
    fontFamily: 'Arial',
    color: '#ffffff',
    fontStyle: 'bold'
  }).setOrigin(1, 0.5).setDepth(202);

  // Start Screen UI
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

  // Paused UI
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

  // Game Over UI
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

  // Player
  player = scene.add.rectangle(200, 300, 24, 32, COLORS.player);
  scene.physics.add.existing(player);
  player.body.allowGravity = false;
  player.setVisible(false);

  // Texture for spikes
  let g = scene.make.graphics({ add: false });
  g.fillStyle(COLORS.spike, 1);
  g.fillTriangle(0, 20, 10, 0, 20, 20);
  g.generateTexture('spike', 20, 20);

  // Spikes Group
  spikes = scene.physics.add.group({
    allowGravity: false,
    immovable: true
  });

  // Player Bullets
  playerBullets = scene.physics.add.group({ allowGravity: false });

  // Enemies
  enemies = scene.physics.add.group({ allowGravity: false });
  airTriangles = scene.physics.add.group({ allowGravity: false });

  scene.physics.add.overlap(player, airTriangles, (pl, tri) => playerDie(scene, 'airTriangle'));
  scene.physics.add.overlap(playerBullets, airTriangles, (bullet, tri) => {
    bullet.destroy();
    tri.destroy();
    enemiesDefeated++;
  });

  // Enemy Bullets
  enemyBullets = scene.physics.add.group({ allowGravity: false });

  // Powerups Group
  powerups = scene.physics.add.group({ allowGravity: false });
  let warningLinesGroup = scene.add.group();
  scene.warningLinesGroup = warningLinesGroup;

  // Overlaps
  scene.physics.add.overlap(player, spikes, () => playerDie(scene, 'spike'));
  scene.physics.add.overlap(player, enemies, (pl, en) => {
    if (isDownDashing && (pl.body.velocity.y > 10 || pl.y < en.y)) {
      en.destroy();
      enemiesDefeated++;
      pl.body.setVelocityY(-300);
      isDownDashing = false;
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
      enemy.destroy();
      enemiesDefeated++;
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
        if (jumps.max < 6) {
          jumps.max++;
          let bar = scene.add.rectangle(20 + (jumps.max - 1) * 28, GAME_HEIGHT - 30, 24, 10, COLORS.powerupJump);
          bar.setOrigin(0, 0.5);
          ui.jumpBars.push(bar);
        }
        jumps.current = jumps.max;
      } else if (pt === 1) {
        immunityTimer = playTime + 5000;
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
        if (health.max < 6) {
          health.max++;
          let hb = scene.add.star(GAME_WIDTH / 2 - (health.max - 1) * 14 + (health.max - 1) * 28, GAME_HEIGHT - 14, 4, 5, 10, 0xff3333);
          hb.setDepth(202);
          ui.healthBars.push(hb);
          // Reposition all health bars for new max
          for (let i = 0; i < ui.healthBars.length; i++) {
            ui.healthBars[i].setX(GAME_WIDTH / 2 - (health.max - 1) * 14 + i * 28);
          }
        }
        health.current = health.max;
        updateHealthHUD();
      }
      pu.destroy();
    }
  });

  // Platforms Group
  platforms = scene.physics.add.group({
    allowGravity: false,
    immovable: true
  });
  scene.physics.add.collider(player, platforms);

  // Initial Floor
  let startFloor = scene.add.rectangle(GAME_WIDTH / 2, 550, GAME_WIDTH * 1.5, 40, COLORS.platform);
  platforms.add(startFloor);
  scene.physics.add.existing(startFloor);
  startFloor.body.allowGravity = false;
  startFloor.body.immovable = true;
  startFloor.body.checkCollision.down = false;
  startFloor.body.checkCollision.left = false;
  startFloor.body.checkCollision.right = false;

  // Jump Bars (HUD)
  ui.jumpBars = [];
  for (let i = 0; i < jumps.max; i++) {
    let bar = scene.add.rectangle(20 + i * 28, GAME_HEIGHT - 30, 24, 10, COLORS.powerupJump);
    bar.setOrigin(0, 0.5);
    ui.jumpBars.push(bar);
  }

  // Health Bars (HUD) — red diamonds centered at bottom
  ui.healthBars = [];
  for (let i = 0; i < health.max; i++) {
    let hb = scene.add.star(GAME_WIDTH / 2 - (health.max - 1) * 14 + i * 28, GAME_HEIGHT - 14, 4, 5, 10, 0xff3333);
    hb.setDepth(202);
    ui.healthBars.push(hb);
  }

  // Shoot Mode HUD
  ui.shootModeText = scene.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 30, '◆ HOMING', {
    fontSize: '20px',
    fontFamily: 'Arial',
    color: '#00ffff',
    fontStyle: 'bold'
  }).setOrigin(1, 0.5).setDepth(202);

  // Score HUD
  ui.scoreText = scene.add.text(20, 20, 'SCORE: 0', {
    fontSize: '24px',
    fontFamily: 'Arial',
    color: '#ffffff',
    fontStyle: 'bold'
  }).setOrigin(0, 0).setDepth(202);

  // Leaderboard Text
  ui.leaderboardText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, '', {
    fontSize: '18px',
    fontFamily: 'Arial',
    color: '#aaaaaa',
    align: 'center'
  }).setOrigin(0.5).setDepth(101).setVisible(false);

  // Input Handling
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

function update(time, delta) {
  const scene = this;

  if (gameState === 'start') {
    if (consumePressed('START1') || consumePressed('P1_1') || consumePressed('P1_U')) {
      gameState = 'playing';
      ui.startText.setVisible(false);
      ui.startInstructions.setVisible(false);

      player.setPosition(200, 300);
      player.body.setVelocity(0, 0);
      player.body.allowGravity = true;
      player.setVisible(true);

      if (ui.jumpBars.length > 3) {
        for (let i = 3; i < ui.jumpBars.length; i++) {
          ui.jumpBars[i].destroy();
        }
        ui.jumpBars = ui.jumpBars.slice(0, 3);
      }
      jumps.max = 3;
      jumps.current = jumps.max;
      jumps.timer = 0;
      if (ui.healthBars.length > 3) {
        for (let i = 3; i < ui.healthBars.length; i++) ui.healthBars[i].destroy();
        ui.healthBars = ui.healthBars.slice(0, 3);
      }
      health.max = 3;
      health.current = 3;
      for (let i = 0; i < ui.healthBars.length; i++) {
        ui.healthBars[i].setX(GAME_WIDTH / 2 - (health.max - 1) * 14 + i * 28);
      }
      updateHealthHUD();
      gameSpeed = 150;
      nextPlatformX = GAME_WIDTH + 200;
      playTime = 0;
      lastFireTime = 0;
      nextEnemyTime = 3000;
      immunityTimer = 0;
      shootMode = 'homing';
      ui.shootModeText.setText('◆ HOMING').setColor('#00ffff');
      lastTapA = 0;
      lastTapD = 0;
      dashActiveTimer = 0;
      dashCooldownTimer = 0;
      isDownDashing = false;

      enemiesDefeated = 0;
      currentScore = 0;
      ui.scoreText.setText('SCORE: 0');
      ui.leaderboardText.setVisible(false);

      currentSection = 0;
      sectionProgress = 0;
      sectionTimer = 0;
      pendingBonusPowerup = false;
      currentThemeColorRGB = Phaser.Display.Color.IntegerToRGB(SECTIONS[0].color);

      bossMode = false;
      bossEntering = false;
      bossDying = false;
      if (boss && boss.active) boss.destroy();
      boss = null;
      bossHp = 0;
      bossPattern = 0;
      bossNextAction = 0;
      bossSection = 0;
      loopCount = 0;

      // Reset platforms and spikes
      platforms.clear(true, true);
      spikes.clear(true, true);
      playerBullets.clear(true, true);
      enemies.clear(true, true);
      if (typeof airTriangles !== 'undefined') airTriangles.clear(true, true);
      enemyBullets.clear(true, true);
      powerups.clear(true, true);
      if (scene.warningLinesGroup) scene.warningLinesGroup.clear(true, true);
      let startFloor = scene.add.rectangle(GAME_WIDTH / 2, 550, GAME_WIDTH * 1.5, 40, COLORS.platform);
      platforms.add(startFloor);
      scene.physics.add.existing(startFloor);
      startFloor.body.allowGravity = false;
      startFloor.body.immovable = true;
      startFloor.body.checkCollision.down = false;
      startFloor.body.checkCollision.left = false;
      startFloor.body.checkCollision.right = false;
    }
  } else if (gameState === 'playing') {
    if (consumePressed('START2') || consumePressed('P1_2')) { // Use START2 (Escape) or P1_2 to pause
      gameState = 'paused';
      scene.physics.pause();
      ui.pausedOverlay.setVisible(true);
      ui.pausedText.setVisible(true);
    } else {
      playTime += delta;
      let isOnGround = player.body.touching.down;

      // Section Progress
      sectionTimer += delta;
      sectionProgress = sectionTimer / SECTIONS[currentSection].duration;

      if (sectionProgress >= 1.0) {
        if ((currentSection === 1 || currentSection === 4) && !bossMode && !bossDying) {
          sectionProgress = 1.0;
          sectionTimer = SECTIONS[currentSection].duration;
          if (!boss && !bossEntering) spawnBoss(scene, currentSection);
        } else if (currentSection < 4 && !bossMode) {
          sectionTimer -= SECTIONS[currentSection].duration;
          sectionProgress = 0;
          currentSection++;
          pendingBonusPowerup = true;
          health.current = health.max;
          updateHealthHUD();

          let flash = scene.add.graphics();
          flash.fillStyle(SECTIONS[currentSection].color, 1);
          flash.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
          flash.setDepth(200);
          scene.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 300,
            onComplete: () => flash.destroy()
          });

          gameSpeed = Math.max(SECTIONS[currentSection].speedFloor, gameSpeed * 0.8);
        } else if (currentSection >= 4) {
          sectionProgress = 1.0;
        }
      }

      if (bossMode) {
        ui.sectionBarFill.width = GAME_WIDTH * Math.max(0, bossHp / bossHpMax);
        ui.sectionBarFill.setFillStyle(0xff0000);
        ui.sectionText.setText('BOSS');
      } else {
        ui.sectionBarFill.width = GAME_WIDTH * Math.min(sectionProgress, 1.0);
        ui.sectionBarFill.setFillStyle(SECTIONS[currentSection].color);
        ui.sectionText.setText(loopCount > 0 ? 'S' + (currentSection + 1) + ' L' + (loopCount + 1) : 'S' + (currentSection + 1));
      }

      // Color Transition
      let tRGB = Phaser.Display.Color.IntegerToRGB(SECTIONS[currentSection].color);
      currentThemeColorRGB.r += (tRGB.r - currentThemeColorRGB.r) * 0.02;
      currentThemeColorRGB.g += (tRGB.g - currentThemeColorRGB.g) * 0.02;
      currentThemeColorRGB.b += (tRGB.b - currentThemeColorRGB.b) * 0.02;
      let themeValue = Phaser.Display.Color.GetColor(Math.floor(currentThemeColorRGB.r), Math.floor(currentThemeColorRGB.g), Math.floor(currentThemeColorRGB.b));

      let bgC = Phaser.Display.Color.GetColor(
        Math.floor(currentThemeColorRGB.r * 0.4),
        Math.floor(currentThemeColorRGB.g * 0.4),
        Math.floor(currentThemeColorRGB.b * 0.4)
      );
      ui.bgRect.setFillStyle(bgC);

      // Increase Speed (max 450, +5 per 10s => +0.5 per s)
      gameSpeed += 0.5 * (delta / 1000);
      if (gameSpeed > 450) gameSpeed = 450;

      // Spawning Platforms
      while (nextPlatformX < GAME_WIDTH + 800) {
        let platY = Phaser.Math.Between(250, 500);
        let platWidth = Phaser.Math.Between(150, 300);
        let randSubtype = Math.random();
        let boss2Active = bossMode && bossSection === 4;
        let hasSpikes = randSubtype < 0.25 && isMechanicActive('spikes') && (!bossMode || boss2Active);
        let isMoving = randSubtype >= 0.25 && randSubtype < 0.5 && isMechanicActive('moving') && !bossMode;

        let platColor = isMoving ? COLORS.platformMoving : themeValue;
        let plat = scene.add.rectangle(nextPlatformX + platWidth / 2, platY, platWidth, 20, platColor);
        plat.setData('isMoving', isMoving);
        platforms.add(plat);
        scene.physics.add.existing(plat);
        plat.body.allowGravity = false;
        plat.body.immovable = true;
        plat.body.checkCollision.down = false;
        plat.body.checkCollision.left = false;
        plat.body.checkCollision.right = false;

        if (isMoving) {
          scene.tweens.add({
            targets: plat,
            y: plat.y - 80,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });
        }

        if (hasSpikes) {
          let spikeWidth = Math.floor((platWidth * 0.5) / 20) * 20;
          if (spikeWidth < 20) spikeWidth = 20;
          let isLeft = Math.random() < 0.5;
          let spikeX = nextPlatformX + (isLeft ? (spikeWidth / 2) : (platWidth - spikeWidth / 2));
          let spikeY = platY - 20;

          let spike = scene.add.tileSprite(spikeX, spikeY, spikeWidth, 20, 'spike');
          spikes.add(spike);
          scene.physics.add.existing(spike);
          spike.body.allowGravity = false;
          spike.body.immovable = true;
          spike.body.setSize(spikeWidth - 4, 16);
          spike.body.setOffset(2, 4);
        } else if (!isMoving && (pendingBonusPowerup || Math.random() < 0.15)) {
          pendingBonusPowerup = false;
          let pType = Phaser.Math.Between(0, 5);
          if (pType === 0 && jumps.max >= 6) pType = 1;
          if (pType === 5 && health.max >= 6) pType = 1;
          let pu;
          let puX = nextPlatformX + platWidth / 2;
          let puY = platY - 40;
          if (pType === 0) { // Jump: Green Triangle UP
            pu = scene.add.triangle(puX, puY, 0, 15, 15, 15, 7.5, 0, COLORS.powerupJump);
          } else if (pType === 1) { // Invuln: Blue Circle
            pu = scene.add.circle(puX, puY, 10, COLORS.powerupInvune);
          } else if (pType === 2) { // Homing mode: Cyan
            pu = scene.add.triangle(puX, puY, 0, 0, 15, 0, 7.5, 15, 0x00ffff);
          } else if (pType === 3) { // Triple mode: Magenta
            pu = scene.add.triangle(puX, puY, 0, 0, 15, 0, 7.5, 15, 0xff00ff);
          } else if (pType === 4) { // Auto mode: Orange
            pu = scene.add.triangle(puX, puY, 0, 0, 15, 0, 7.5, 15, 0xff8800);
          } else { // Health +1: Red diamond (4-pointed star)
            pu = scene.add.star(puX, puY, 4, 5, 12, 0xff3333);
          }

          powerups.add(pu);
          scene.physics.add.existing(pu);
          pu.body.allowGravity = false;
          pu.body.immovable = true;
          pu.setData('type', pType);

          scene.tweens.add({
            targets: pu,
            y: pu.y - 15,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });
        }

        nextPlatformX += platWidth + Phaser.Math.Between(100, 250);
      }

      // Move and recycle platforms and spikes
      platforms.getChildren().forEach(plat => {
        if (!plat.getData('isMoving')) plat.setFillStyle(themeValue);
        plat.body.setVelocityX(-gameSpeed);
        if (plat.x + plat.width / 2 < 0) {
          plat.destroy();
        }
      });
      spikes.getChildren().forEach(s => {
        s.body.setVelocityX(-gameSpeed);
        if (s.x + s.width / 2 < 0) s.destroy();
      });
      powerups.getChildren().forEach(p => {
        p.body.setVelocityX(-gameSpeed);
        if (p.x + p.width < 0) p.destroy();
      });
      // Also scroll nextPlatformX to the left so it stays relative to the world
      nextPlatformX -= gameSpeed * (delta / 1000);

      // Spawning Air Triangles
      if (currentSection >= 3 && (!bossMode || bossSection === 4) && airTriangles.countActive(true) < 2 && Math.random() < 0.005) {
        let lvl = 1;
        if (currentSection === 3) lvl = Math.random() < 0.5 ? 1 : 2;
        else if (currentSection === 4) lvl = Math.random() < 0.3 ? 2 : 3;

        let zones = [Phaser.Math.Between(50, 150), Phaser.Math.Between(200, 350), Phaser.Math.Between(400, 520)];
        let spawnY = zones[Phaser.Math.Between(0, 2)];

        let wLine = scene.add.rectangle(GAME_WIDTH / 2, spawnY, GAME_WIDTH, 2, 0xff0000, 0.5).setDepth(50);
        if (scene.warningLinesGroup) scene.warningLinesGroup.add(wLine);
        scene.time.delayedCall(800, () => wLine.destroy());

        scene.time.delayedCall(1000, () => {
          if (gameState !== 'playing') return;
          let tri = scene.add.triangle(850, spawnY, 0, 15, 30, 0, 30, 30, currentThemeColorRGB ? Phaser.Display.Color.GetColor(currentThemeColorRGB.r, currentThemeColorRGB.g, currentThemeColorRGB.b) : 0xffffff);
          airTriangles.add(tri);
          scene.physics.add.existing(tri);
          tri.body.allowGravity = false;
          let velX = lvl === 1 ? -300 : -500;
          tri.body.setVelocityX(velX);
          tri.setData('level', lvl);
          tri.setData('fired', false);
        });
      }

      // Spawning Enemies
      let enemiesInS1Loop = loopCount > 0 && currentSection === 0;
      if (playTime > nextEnemyTime && enemies.countActive(true) < 4 && (isMechanicActive('enemies') || enemiesInS1Loop) && !bossMode) {
        let level = 1;
        if (enemiesInS1Loop) level = 2;
        else if (currentSection === 2) level = Math.random() < 0.5 ? 1 : 2;
        else if (currentSection === 3) level = 2;
        else if (currentSection >= 4) level = 3;

        let r = 14;
        let hp = 2;
        let neonColor = 0xff0044;
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
          targets: e,
          x: targetX,
          duration: 800 + Phaser.Math.Between(0, 500),
          ease: 'Power2',
          onComplete: () => {
            scene.tweens.add({
              targets: e,
              y: e.y + Phaser.Math.Between(-80, 80),
              duration: 1500,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut'
            });
          }
        });

        let interval = Math.max(2500, 6000 - (gameSpeed - 150) * 15);
        nextEnemyTime = playTime + interval;
      }

      // Dash Horizontal Input
      if (consumePressed('P1_L')) {
        if (playTime - lastTapA < 200 && playTime > dashCooldownTimer && jumps.current > 0) {
          dashDirection = -1;
          dashActiveTimer = playTime + 150;
          dashCooldownTimer = playTime + 500;
          immunityTimer = Math.max(immunityTimer, playTime + 200);
          jumps.current--;
        }
        lastTapA = playTime;
      }
      if (consumePressed('P1_R')) {
        if (playTime - lastTapD < 200 && playTime > dashCooldownTimer && jumps.current > 0) {
          dashDirection = 1;
          dashActiveTimer = playTime + 150;
          dashCooldownTimer = playTime + 500;
          immunityTimer = Math.max(immunityTimer, playTime + 200);
          jumps.current--;
        }
        lastTapD = playTime;
      }

      // Movimiento horizontal
      let playerSpeedX = 0;
      if (playTime < dashActiveTimer) {
        playerSpeedX = 500 * dashDirection;
        if (Math.random() < 0.3) {
          let trail = scene.add.rectangle(player.x, player.y, 24, 32, COLORS.player, 0.5);
          scene.tweens.add({ targets: trail, alpha: 0, duration: 200, onComplete: () => trail.destroy() });
        }
      } else {
        if (controls.held['P1_L']) {
          playerSpeedX = -220;
        } else if (controls.held['P1_R']) {
          playerSpeedX = 220;
        } else if (isOnGround) {
          playerSpeedX = -gameSpeed;
        }
      }
      player.body.setVelocityX(playerSpeedX);

      // Muerte por caída o salir por la izquierda
      if (player.y > GAME_HEIGHT || player.x + player.width / 2 < 0) {
        playerDie(scene, 'fall');
      }

      currentScore = Math.floor(playTime / 1000) * 10 + enemiesDefeated * 50;
      ui.scoreText.setText(`SCORE: ${currentScore}`);

      // Invulnerability blink effect
      if (playTime < immunityTimer) {
        player.alpha = (Math.floor(playTime / 100) % 2 === 0) ? 0.3 : 1;
      } else {
        player.alpha = 1;
      }

      // Limit X going off right
      if (player.x + player.width / 2 > GAME_WIDTH) {
        player.setX(GAME_WIDTH - player.width / 2);
      }

      // Salto y Dash Descendente
      if (isOnGround) {
        isDownDashing = false;
      }

      if (consumePressed('START1') || consumePressed('P1_U')) {
        if (controls.held['P1_D'] && !isOnGround) {
          if (jumps.current > 0) {
            isDownDashing = true;
            player.body.setVelocityY(700);
            jumps.current--;
          }
        } else if (isOnGround) {
          player.body.setVelocityY(-500);
        } else if (jumps.current > 0) {
          player.body.setVelocityY(-500);
          jumps.current--;
        }
      }

      // Disparo
      let firePressed = consumePressed('P1_1');
      if (shootMode === 'auto') {
        if (controls.held['P1_1'] && playTime > lastFireTime + 100) {
          lastFireTime = playTime;
          let bullet = scene.add.circle(player.x + 15, player.y, 6, COLORS.bullet);
          playerBullets.add(bullet);
          scene.physics.add.existing(bullet);
          bullet.body.allowGravity = false;
          bullet.body.setVelocityX(600);
          bullet.setData('damage', 0.5);
          bullet.setData('type', 'auto');
        }
      } else {
        let cooldown = shootMode === 'triple' ? 500 : 400;
        if (firePressed && playTime > lastFireTime + cooldown) {
          lastFireTime = playTime;
          if (shootMode === 'triple') {
            for (let angle of [-15, 0, 15]) {
              let bullet = scene.add.circle(player.x + 15, player.y, 6, COLORS.bullet);
              playerBullets.add(bullet);
              scene.physics.add.existing(bullet);
              bullet.body.allowGravity = false;
              let rad = Phaser.Math.DegToRad(angle);
              bullet.body.setVelocity(600 * Math.cos(rad), 600 * Math.sin(rad));
              bullet.setData('damage', 1);
              bullet.setData('type', 'triple');
            }
          } else {
            let bullet = scene.add.circle(player.x + 15, player.y, 6, COLORS.bullet);
            playerBullets.add(bullet);
            scene.physics.add.existing(bullet);
            bullet.body.allowGravity = false;
            bullet.body.setVelocityX(600);
            bullet.setData('damage', 1);
            bullet.setData('type', 'homing');
          }
        }
      }

      // Update Enemy behavior and Bullets
      enemies.getChildren().forEach(e => {
        drawNeonEnemy(e, time);

        let lastFire = e.getData('lastFire');
        let level = e.getData('level') || 1;
        let cooldown = level === 1 ? 2500 : 3000;

        if (playTime > lastFire + cooldown) {
          // Fire animation synchronized with bullet spawn
          let rb = e.getData('radioBase') || 14;
          scene.tweens.add({ targets: e, radioActual: rb * 1.5, brilloExtra: 3.5, duration: 100, ease: 'Sine.easeOut', yoyo: true, hold: 50 });

          let jitter = level === 1 ? Phaser.Math.Between(-500, 500) : 0;
          e.setData('lastFire', playTime + jitter);

          let spawnEnemyBullet = (x, y, vx, vy) => {
            if (!scene || !scene.physics || !e.active) return;
            let bullet = scene.add.rectangle(x, y, 10, 10, 0xffffff);
            bullet.setBlendMode(Phaser.BlendModes.ADD);
            enemyBullets.add(bullet);
            scene.physics.add.existing(bullet);
            bullet.body.allowGravity = false;
            bullet.body.setVelocity(vx, vy);
          };

          if (level === 1) {
            spawnEnemyBullet(e.x - 14, e.y, -350, 0);
          } else if (level === 2) {
            spawnEnemyBullet(e.x - 18, e.y, -350, 0);
            scene.time.delayedCall(300, () => {
              if (e.active) spawnEnemyBullet(e.x - 18, e.y, -350, 0);
            });
          } else if (level === 3) {
            for (let ang of [-10, 0, 10]) {
              let rad = Phaser.Math.DegToRad(ang + 180);
              spawnEnemyBullet(e.x - 22, e.y, Math.cos(rad) * 350, Math.sin(rad) * 350);
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

      // Update Bullets
      playerBullets.getChildren().forEach(b => {
        if (bossMode && boss && boss.active && !bossDying) {
          let hw = boss.width / 2 + 8;
          let hh = boss.height / 2 + 8;
          if (Math.abs(b.x - boss.x) < hw && Math.abs(b.y - boss.y) < hh) {
            let dmg = b.getData('damage') || 1;
            bossHp -= dmg;
            b.destroy();
            boss.setFillStyle(0xffffff);
            scene.time.delayedCall(80, () => { if (boss && boss.active) boss.setFillStyle(0xff8800); });
            if (bossHp <= 0 && !bossDying) killBoss(scene);
            return;
          }
        }
        if (b.getData('type') === 'homing') {
          let closestDest = null;
          let closestDist = Infinity;
          let homingTargets = [...enemies.getChildren()];
          if (bossMode && boss && boss.active && !bossDying) homingTargets.push(boss);
          homingTargets.forEach(e => {
            let dist = Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y);
            if (dist < closestDist && e.x > b.x) {
              closestDist = dist;
              closestDest = e;
            }
          });

          if (closestDest) {
            if (b.y < closestDest.y) b.body.velocity.y += 20 * (delta / 16);
            else if (b.y > closestDest.y) b.body.velocity.y -= 20 * (delta / 16);
            b.body.velocity.y *= 0.92;
          } else {
            b.body.velocity.y *= 0.95;
          }
        }

        // Estela
        let trail = scene.add.circle(b.x, b.y, 4, COLORS.bullet, 0.5);
        scene.tweens.add({
          targets: trail,
          alpha: 0,
          scale: 0.1,
          duration: 200,
          onComplete: () => trail.destroy()
        });

        if (b.x > GAME_WIDTH + 50 || b.y < -50 || b.y > GAME_HEIGHT + 50) {
          b.destroy();
        }
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

      // Boss pattern execution
      if (bossMode && boss && boss.active && !bossEntering && !bossDying) {
        if (playTime > bossNextAction) executeBossPattern(scene);
      }

      // Recarga de saltos
      if (jumps.current < jumps.max) {
        jumps.timer += delta;
        if (jumps.timer >= 6000) {
          jumps.current++;
          jumps.timer -= 6000;
        }
      } else {
        jumps.timer = 0;
      }

      // Actualizar UI de saltos
      for (let i = 0; i < jumps.max; i++) {
        if (i < jumps.current) {
          ui.jumpBars[i].setFillStyle(COLORS.powerupJump);
        } else {
          ui.jumpBars[i].setFillStyle(0x555555);
        }
      }
    }
  } else if (gameState === 'paused') {
    if (consumePressed('START2') || consumePressed('P1_2') || consumePressed('START1')) {
      gameState = 'playing';
      scene.physics.resume();
      ui.pausedOverlay.setVisible(false);
      ui.pausedText.setVisible(false);
    }
  } else if (gameState === 'gameover') {
    if (consumePressed('START1') || consumePressed('P1_U') || consumePressed('P1_1')) {
      gameState = 'playing';
      ui.gameOverText.setVisible(false);
      ui.gameOverInstructions.setVisible(false);
      scene.physics.resume();

      // Restart position
      player.setPosition(200, 300);
      player.body.setVelocity(0, 0);

      if (ui.jumpBars.length > 3) {
        for (let i = 3; i < ui.jumpBars.length; i++) {
          ui.jumpBars[i].destroy();
        }
        ui.jumpBars = ui.jumpBars.slice(0, 3);
      }
      jumps.max = 3;
      jumps.current = jumps.max;
      jumps.timer = 0;
      if (ui.healthBars.length > 3) {
        for (let i = 3; i < ui.healthBars.length; i++) ui.healthBars[i].destroy();
        ui.healthBars = ui.healthBars.slice(0, 3);
      }
      health.max = 3;
      health.current = 3;
      for (let i = 0; i < ui.healthBars.length; i++) {
        ui.healthBars[i].setX(GAME_WIDTH / 2 - (health.max - 1) * 14 + i * 28);
      }
      updateHealthHUD();
      gameSpeed = 150;
      nextPlatformX = GAME_WIDTH + 200;
      playTime = 0;
      lastFireTime = 0;
      nextEnemyTime = 3000;
      immunityTimer = 0;
      shootMode = 'homing';
      ui.shootModeText.setText('◆ HOMING').setColor('#00ffff');
      lastTapA = 0;
      lastTapD = 0;
      dashActiveTimer = 0;
      dashCooldownTimer = 0;
      isDownDashing = false;

      enemiesDefeated = 0;
      currentScore = 0;
      ui.scoreText.setText('SCORE: 0');
      ui.leaderboardText.setVisible(false);

      currentSection = 0;
      sectionProgress = 0;
      sectionTimer = 0;
      pendingBonusPowerup = false;
      currentThemeColorRGB = Phaser.Display.Color.IntegerToRGB(SECTIONS[0].color);

      bossMode = false;
      bossEntering = false;
      bossDying = false;
      if (boss && boss.active) boss.destroy();
      boss = null;
      bossHp = 0;
      bossPattern = 0;
      bossNextAction = 0;
      bossSection = 0;
      loopCount = 0;

      // Reset platforms and spikes
      platforms.clear(true, true);
      spikes.clear(true, true);
      playerBullets.clear(true, true);
      enemies.clear(true, true);
      if (typeof airTriangles !== 'undefined') airTriangles.clear(true, true);
      enemyBullets.clear(true, true);
      powerups.clear(true, true);
      if (scene.warningLinesGroup) scene.warningLinesGroup.clear(true, true);
      let startFloor2 = scene.add.rectangle(GAME_WIDTH / 2, 550, GAME_WIDTH * 1.5, 40, COLORS.platform);
      platforms.add(startFloor2);
      scene.physics.add.existing(startFloor2);
      startFloor2.body.allowGravity = false;
      startFloor2.body.immovable = true;
      startFloor2.body.checkCollision.down = false;
      startFloor2.body.checkCollision.left = false;
      startFloor2.body.checkCollision.right = false;
    }
  }

  // Clear pressed tracking every frame so we don't handle it multiple times
  for (const code in controls.pressed) {
    controls.pressed[code] = false;
  }
}
