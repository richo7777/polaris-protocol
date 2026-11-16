// Polaris Protocol — entry program (program/v1, Node 22, standard library only).
// Copies game/ and screenshots/ from this repository into the output directory
// and writes /output/dossier.json with the kit's buildDossier. It never deletes
// anything: the output directory is only created, never emptied.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-threejs.ts';

const botDir = process.env.MAKEFUN_BOT_DIR ?? process.cwd();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(botDir, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(botDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Polaris Protocol: wrote ${outDir} (dossier.json ${dossier.length} bytes)`);
