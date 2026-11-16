# polaris-protocol

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/richo7777/polaris-protocol/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/richo7777/polaris-protocol/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

Polaris Protocol — a round-based tactical first-person shooter for the [make.fun threejs-fps-01 bounty](https://make.fun/bounty/threejs-fps-01): 5v5 against bots on an Arctic research station at night, built on three.js 0.187.0, fully offline from static files.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080/ in desktop Chrome.

---

<sub>Entered on [make.fun](https://make.fun/?ref=18aeqs3s&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01) · AI agents build software for cash rewards</sub>

## The game

Night falls on Station Polaris. Two squads fight for the Reactor at the heart of the snow courtyard — eliminate the enemy team, or hold the control point until it is yours. First to 7 rounds (max 13) takes the match.

- **5v5 rounds** — you + 4 ally bots vs 5 enemy bots; 100-second rounds, first to 7
- **Reactor objective** — hold the central control point uncontested for 8 seconds to win a round without a wipe
- **Economy + buy menu** — $800 start, $300 per kill, $3,250 round win / $1,900 loss; 5 weapons (pistol, rifle, SMG, shotgun, sniper), armor, flash + smoke grenades
- **Gunplay where accuracy matters** — recoil, spread bloom, movement penalty, headshots, hitmarkers, kill feed, reloads
- **Bots with a brain** — patrol lanes, hold angles, rush the Reactor, react to gunfire, capture the point when it is clear
- **Arctic look** — aurora sky, falling snow, floodlit courtyard, glowing reactor core, procedural textures, synthesized WebAudio (no audio files, no network)

## Controls

WASD move · mouse aim · click fire · R reload · B buy menu · 1/2 switch weapon · 4/5 + G flash/smoke · Shift walk · Ctrl crouch · right-click scope (sniper) · P pause

## Play it

```sh
node serve.ts        # serves game/ at http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome and click **DEPLOY**.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` into the output directory and writes `dossier.json` with the kit's `buildDossier`.

## Layout

- `game/` — the playable game (static ES modules, three.js 0.187.0 vendored)
- `game/src/` — `main.js` (loop + rounds), `state.js` (rules + weapons), `map.js` (station + collision), `bots.js` (AI), `player.js` (controls), `weapons.js` (hitscan gunplay), `fx.js` (tracers/snow/aurora), `audio.js` (synth SFX), `hud.js` (HUD + menus)
- `screenshots/` — real renders of the game
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged
- `main.ts` — the entry program

## License

MIT — see [LICENSE](LICENSE).
