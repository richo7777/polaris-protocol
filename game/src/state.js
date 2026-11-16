// Polaris Protocol — shared constants, weapon catalogue and agent factory.
// One place owns every number the simulation and the HUD both read.
export const WIN_SCORE = 7;
export const MAX_ROUNDS = 13;
export const ROUND_TIME = 100; // seconds of live play per round
export const BUY_TIME = 12; // seconds of buy phase before each round
export const CAPTURE_TIME = 8; // seconds of uncontested hold to take the Reactor
export const CAPTURE_RADIUS = 5;
export const PLAYER_SPEED = 4.3;
export const WALK_SPEED = 2.3;
export const CROUCH_SPEED = 2.0;
export const AGENT_RADIUS = 0.42;
export const EYE_HEIGHT = 1.62;
export const CROUCH_EYE = 1.05;

export const TEAMS = {
  polaris: { key: 'polaris', name: 'Polaris', color: 0x4da6ff, css: '#5db4ff', dark: '#16324d' },
  glacier: { key: 'glacier', name: 'Glacier', color: 0xff5a4d, css: '#ff6a5e', dark: '#4d1a16' },
};

// Money: start 800, kill +300, round win +3250, round loss +1900.
export const ECON = { start: 800, kill: 300, win: 3250, loss: 1900, armor: 650, flash: 200, smoke: 300 };

// dmg per pellet for the shotgun; hs = headshot multiplier; rpm = rounds per minute.
export const WEAPONS = {
  frostbite: { id: 'frostbite', name: 'P9 Frostbite', kind: 'pistol', price: 0, dmg: 30, hs: 3.0, rpm: 320, mag: 12, reserve: 48, reload: 1.1, spread: 0.55, bloom: 0.35, recoil: 0.55, auto: false, pellets: 1, zoom: 1, range: 60, tracer: 0xffe08a },
  blizzard: { id: 'blizzard', name: 'VK-9 Blizzard', kind: 'rifle', price: 2700, dmg: 32, hs: 3.0, rpm: 600, mag: 30, reserve: 90, reload: 2.2, spread: 0.5, bloom: 0.28, recoil: 0.7, auto: true, pellets: 1, zoom: 1, range: 90, tracer: 0xffe08a },
  hailstorm: { id: 'hailstorm', name: 'SN-12 Hailstorm', kind: 'smg', price: 1500, dmg: 24, hs: 3.0, rpm: 780, mag: 32, reserve: 96, reload: 1.9, spread: 0.9, bloom: 0.22, recoil: 0.45, auto: true, pellets: 1, zoom: 1, range: 55, tracer: 0xffe08a },
  avalanche: { id: 'avalanche', name: 'RG-8 Avalanche', kind: 'shotgun', price: 1700, dmg: 9, hs: 2.0, rpm: 75, mag: 6, reserve: 24, reload: 2.6, spread: 3.4, bloom: 0.9, recoil: 2.4, auto: false, pellets: 8, zoom: 1, range: 26, tracer: 0xffb36b },
  northstar: { id: 'northstar', name: 'LW-77 Northstar', kind: 'sniper', price: 4750, dmg: 96, hs: 2.5, rpm: 48, mag: 5, reserve: 15, reload: 3.0, spread: 0.12, bloom: 1.4, recoil: 3.2, auto: false, pellets: 1, zoom: 2.6, range: 140, tracer: 0x9fd8ff },
};

export const BUY_ORDER = ['blizzard', 'hailstorm', 'avalanche', 'northstar', 'frostbite'];

export const ALLY_NAMES = ['Vega', 'Rigel', 'Deneb', 'Altair'];
export const ENEMY_NAMES = ['Fenrir', 'Sastrugi', 'Katabatic', 'Whiteout', 'Crevasse'];

let nextId = 1;
export function newAgent(team, name, isPlayer, spawn) {
  return {
    id: nextId++, team, name, isPlayer: !!isPlayer,
    x: spawn.x, z: spawn.z, y: 0, yaw: spawn.yaw, pitch: 0,
    hp: 100, armor: 0, alive: true,
    weapon: 'frostbite', ammo: WEAPONS.frostbite.mag, reserve: WEAPONS.frostbite.reserve,
    money: ECON.start, kills: 0, deaths: 0, assists: 0,
    flash: 0, smoke: 0, grenadeSel: 'flash',
    // movement / gunplay state
    vx: 0, vz: 0, speed: 0, moving: false, crouch: false, scoped: false,
    spread: 0, recoilP: 0, lastShot: -9, reloadUntil: 0, reloading: false,
    blindUntil: 0, frozen: false,
    // bot brain (unused for the player)
    ai: null,
    // render handles, filled by main.js
    mesh: null, headMesh: null, gunMesh: null,
  };
}

export function resetAgentForRound(a, spawn, keepMoney) {
  a.x = spawn.x; a.z = spawn.z; a.yaw = spawn.yaw; a.pitch = 0;
  a.hp = 100; a.alive = true; a.reloading = false; a.reloadUntil = 0;
  a.spread = 0; a.recoilP = 0; a.blindUntil = 0; a.scoped = false; a.crouch = false;
  a.vx = 0; a.vz = 0; a.speed = 0;
  if (!keepMoney) a.money = ECON.start;
  if (a.ai) { a.ai.state = 'patrol'; a.ai.target = null; a.ai.path = []; a.ai.wp = 0; a.ai.thinkAt = 0; a.ai.reactAt = 0; a.ai.burstLeft = 0; }
}

export function createMatch() {
  return {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 1,
    score: { polaris: 0, glacier: 0 },
    timer: BUY_TIME,
    buyTime: BUY_TIME,
    capture: { team: null, progress: 0 },
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    time: 0,
    freeze: false,
    killfeed: [],
    smokes: [],
    grenades: [],
    events: [], // {t, kind, ...} for HUD one-shots
  };
}
