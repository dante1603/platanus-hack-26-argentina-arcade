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
  P1_1: ['u', 'z'],
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

function preload() {}

function create() {
  const scene = this;

  // Background
  const bg = scene.add.graphics();
  bg.fillStyle(COLORS.background, 1);
  bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

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
  player.body.setAllowGravity(false);
  player.setVisible(false);

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
      player.body.setAllowGravity(true);
      player.setVisible(true);
    }
  } else if (gameState === 'playing') {
    if (consumePressed('START2') || consumePressed('P1_2')) { // Use START2 (Escape) or P1_2 to pause
      gameState = 'paused';
      scene.physics.pause();
      ui.pausedOverlay.setVisible(true);
      ui.pausedText.setVisible(true);
    } else {
      // Movimiento horizontal (220px/s)
      if (controls.held['P1_L']) {
        player.body.setVelocityX(-220);
      } else if (controls.held['P1_R']) {
        player.body.setVelocityX(220);
      } else {
        player.body.setVelocityX(0);
      }

      // Muerte por caída
      if (player.y > GAME_HEIGHT) {
        gameState = 'gameover';
        scene.physics.pause();
        ui.gameOverText.setVisible(true);
        ui.gameOverInstructions.setVisible(true);
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
    }
  }

  // Clear pressed tracking every frame so we don't handle it multiple times
  for (const code in controls.pressed) {
    controls.pressed[code] = false;
  }
}
