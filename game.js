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
// To add local testing shortcuts, append extra keys to any array.
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
let lastFireTime = 0;
let nextEnemyTime = 0;
let gameSpeed = 150;
let nextPlatformX = 0;
let playTime = 0;
let immunityTimer = 0;
let jumps = { current: 3, max: 3, timer: 0 };
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

function isMechanicActive(name) {
  return SECTIONS[currentSection].mechanics.includes(name);
}

function playerDie(scene, type) {
  if (gameState === 'playing') {
    if ((type === 'enemy' || type === 'enemyBullet') && playTime < immunityTimer) return;
    gameState = 'gameover';
    scene.physics.pause();
    ui.gameOverText.setVisible(true);
    ui.gameOverInstructions.setVisible(true);
  }
}

function preload() {}

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

  // Enemy Bullets
  enemyBullets = scene.physics.add.group({ allowGravity: false });

  // Powerups Group
  powerups = scene.physics.add.group({ allowGravity: false });

  // Overlaps
  scene.physics.add.overlap(player, spikes, () => playerDie(scene, 'spike'));
  scene.physics.add.overlap(player, enemies, (pl, en) => {
    if (isDownDashing && (pl.body.velocity.y > 10 || pl.y < en.y)) {
      en.destroy();
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
    } else {
      enemy.setFillStyle(0xff0000);
      scene.time.delayedCall(100, () => {
        if (enemy.active) enemy.setFillStyle(COLORS.enemy);
      });
    }
  });

  scene.physics.add.overlap(player, powerups, (pl, pu) => {
    if (pl.body.velocity.y > 10 || pl.y < pu.y) {
        let pt = pu.getData('type');
        if (pt === 0) {
           if (jumps.current < jumps.max) jumps.current++;
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

  // Shoot Mode HUD
  ui.shootModeText = scene.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 30, '◆ HOMING', {
    fontSize: '20px',
    fontFamily: 'Arial',
    color: '#00ffff',
    fontStyle: 'bold'
  }).setOrigin(1, 0.5).setDepth(202);

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

      jumps.current = jumps.max;
      jumps.timer = 0;
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

      currentSection = 0;
      sectionProgress = 0;
      sectionTimer = 0;
      pendingBonusPowerup = false;
      currentThemeColorRGB = Phaser.Display.Color.IntegerToRGB(SECTIONS[0].color);

      // Reset platforms and spikes
      platforms.clear(true, true);
      spikes.clear(true, true);
      playerBullets.clear(true, true);
      enemies.clear(true, true);
      enemyBullets.clear(true, true);
      powerups.clear(true, true);
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
        if (currentSection < 4) {
          sectionTimer -= SECTIONS[currentSection].duration;
          sectionProgress = 0;
          currentSection++;
          pendingBonusPowerup = true;
          
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
        } else {
          sectionProgress = 1.0;
        }
      }
      
      ui.sectionBarFill.width = GAME_WIDTH * Math.min(sectionProgress, 1.0);
      ui.sectionBarFill.setFillStyle(SECTIONS[currentSection].color);
      ui.sectionText.setText('S' + (currentSection + 1));

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
        let hasSpikes = randSubtype < 0.25 && isMechanicActive('spikes');
        let isMoving = randSubtype >= 0.25 && randSubtype < 0.5 && isMechanicActive('moving');

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
          let pType = Phaser.Math.Between(0, 4);
          let pu;
          if (pType === 0) { // Jump: Green Triangle UP
              pu = scene.add.triangle(nextPlatformX + platWidth/2, platY - 40, 0, 15, 15, 15, 7.5, 0, COLORS.powerupJump);
          } else if (pType === 1) { // Invuln: Blue Circle
              pu = scene.add.circle(nextPlatformX + platWidth/2, platY - 40, 10, COLORS.powerupInvune);
          } else if (pType === 2) { // Homing mode: Cyan
              pu = scene.add.triangle(nextPlatformX + platWidth/2, platY - 40, 0, 0, 15, 0, 7.5, 15, 0x00ffff);
          } else if (pType === 3) { // Triple mode: Magenta
              pu = scene.add.triangle(nextPlatformX + platWidth/2, platY - 40, 0, 0, 15, 0, 7.5, 15, 0xff00ff);
          } else { // Auto mode: Orange
              pu = scene.add.triangle(nextPlatformX + platWidth/2, platY - 40, 0, 0, 15, 0, 7.5, 15, 0xff8800);
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

      // Spawning Enemies
      if (playTime > nextEnemyTime && enemies.countActive(true) < 4 && isMechanicActive('enemies')) {
        let e = scene.add.circle(GAME_WIDTH + 50, Phaser.Math.Between(150, 450), 14, COLORS.enemy);
        enemies.add(e);
        scene.physics.add.existing(e);
        e.body.allowGravity = false;
        e.setData('lastFire', playTime + Phaser.Math.Between(1000, 2000));
        e.setData('hp', 2);
        
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
        let lastFire = e.getData('lastFire');
        if (playTime > lastFire + 2500) {
          e.setData('lastFire', playTime + Phaser.Math.Between(-500, 500));
          
          let bullet = scene.add.rectangle(e.x - 14, e.y, 12, 12, COLORS.enemyBullet);
          enemyBullets.add(bullet);
          scene.physics.add.existing(bullet);
          bullet.body.allowGravity = false;
          bullet.body.setVelocityX(-350);
        }
      });
      enemyBullets.getChildren().forEach(b => {
        b.rotation += 0.1;
        if (b.x < -50 || b.y < -50 || b.y > GAME_HEIGHT + 50) {
          b.destroy();
        }
      });

      // Update Bullets
      playerBullets.getChildren().forEach(b => {
        if (b.getData('type') === 'homing') {
          let closestDest = null;
          let closestDist = Infinity;
          enemies.getChildren().forEach(e => {
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

      jumps.current = jumps.max;
      jumps.timer = 0;
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

      currentSection = 0;
      sectionProgress = 0;
      sectionTimer = 0;
      pendingBonusPowerup = false;
      currentThemeColorRGB = Phaser.Display.Color.IntegerToRGB(SECTIONS[0].color);

      // Reset platforms and spikes
      platforms.clear(true, true);
      spikes.clear(true, true);
      playerBullets.clear(true, true);
      enemies.clear(true, true);
      enemyBullets.clear(true, true);
      powerups.clear(true, true);
      let startFloor = scene.add.rectangle(GAME_WIDTH / 2, 550, GAME_WIDTH * 1.5, 40, COLORS.platform);
      platforms.add(startFloor);
      scene.physics.add.existing(startFloor);
      startFloor.body.allowGravity = false;
      startFloor.body.immovable = true;
      startFloor.body.checkCollision.down = false;
      startFloor.body.checkCollision.left = false;
      startFloor.body.checkCollision.right = false;
    }
  }

  // Clear pressed tracking every frame so we don't handle it multiple times
  for (const code in controls.pressed) {
    controls.pressed[code] = false;
  }
}
