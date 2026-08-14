// verify-install.mjs — read-only checks that the dsh-pet install into a DSH
// profile is correct: package resolvable, manifest valid, patch layer parses.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dshHome = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME, '.dsh');
const profileDir = join(dshHome, 'profiles', 'web');
const dshInstall = process.env.DSH_INSTALL || 'C:/Users/redtea/AppData/Local/npm-cache/_npx/1e7f6d9597241db0';

let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

// 1. dsh-pet must resolve from the profile (Node module lookup order)
const req = createRequire(join(profileDir, 'package.json'));
let pkgDir;
for (const p of req.resolve.paths('dsh-pet') ?? []) {
  const cand = join(p, 'dsh-pet');
  if (existsSync(join(cand, 'package.json'))) { pkgDir = cand; break; }
}
check(pkgDir != null, `dsh-pet resolvable from ${profileDir}`);
if (pkgDir == null) process.exit(1);
console.log('       -> ' + pkgDir);

// 2. manifest declares a web client half with a resolvable ./client export
const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const dc = manifest.dsh?.client;
check(dc != null && dc.platform === 'web', 'package.json dsh.client.platform === "web"');
const clientExport = typeof manifest.exports?.['./client'] === 'string'
  ? manifest.exports['./client']
  : manifest.exports?.['./client']?.default;
check(typeof clientExport === 'string' && existsSync(join(pkgDir, clientExport)), `./client export resolves (${clientExport})`);
check(existsSync(join(pkgDir, 'lib', 'index.js')), 'host half lib/index.js present');

// 3. the profile patch layer parses as YAML and contains the ui-pet roster row
const { load } = createRequire(join(dshInstall, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))('js-yaml');
const patchFile = join(profileDir, 'cordis.patch.yml');
const patch = load(readFileSync(patchFile, 'utf8'));
check(Array.isArray(patch), 'cordis.patch.yml parses to an array');
const rows = patch?.flatMap((entry) => entry?.insert ?? []) ?? [];
const row = rows.find((r) => r?.id === 'ui-pet');
check(row != null && row.name === 'dsh-pet', "roster row { id: ui-pet, name: 'dsh-pet' } present");

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
