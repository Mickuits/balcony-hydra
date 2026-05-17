/**
 * Génère `dist/version.json` après build PWA — permet aux clients de
 * vérifier si une nouvelle version est disponible (polling périodique
 * ou check au focus de la fenêtre).
 *
 * Usage : `node scripts/write-version.mjs <outDir>`
 *
 * Le SW utilise ce fichier pour comparer son `BUILD_ID` au build courant
 * et déclencher un update silencieux quand un mismatch est détecté.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';

const outDir = process.argv[2] ?? 'dist';
const versionPath = resolve(process.cwd(), outDir, 'version.json');

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const buildId = `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${gitSha()}`;
const payload = {
  buildId,
  builtAt: new Date().toISOString(),
  versionApi: 1,
};

if (!existsSync(dirname(versionPath))) {
  mkdirSync(dirname(versionPath), { recursive: true });
}
writeFileSync(versionPath, JSON.stringify(payload, null, 2));
console.log(`[version] wrote ${versionPath} : ${buildId}`);
