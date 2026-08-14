// verify-install.mjs — read-only checks that the @minybear/dsh-pet install
// into a DSH profile is correct: package resolvable, manifest valid, patch layer parses.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dshHome = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME, '.dsh');
const profileDir = join(dshHome, 'profiles', 'web');
// DSH install root: only needed to borrow its js-yaml. Try DSH_INSTALL, then
// the well-known npx cache location for the current user, then give up and
// fall back to a regex check of the roster row.
const dshInstallCandidates = [
  process.env.DSH_INSTALL,
  process.env.USERPROFILE && join(process.env.USERPROFILE, 'AppData', 'Local', 'npm-cache', '_npx', '1e7f6d9597241db0'),
].filter(Boolean);

let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

// 1. @minybear/dsh-pet must resolve from the profile (Node module lookup order)
const req = createRequire(join(profileDir, 'package.json'));
let pkgDir;
for (const p of req.resolve.paths('@minybear/dsh-pet') ?? []) {
  const cand = join(p, '@minybear', 'dsh-pet');
  if (existsSync(join(cand, 'package.json'))) { pkgDir = cand; break; }
}
check(pkgDir != null, `@minybear/dsh-pet resolvable from ${profileDir}`);
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
const patchFile = join(profileDir, 'cordis.patch.yml');
const patchText = readFileSync(patchFile, 'utf8');
let yaml = null;
for (const root of dshInstallCandidates) {
  try {
    yaml = createRequire(join(root, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))('js-yaml');
    break;
  } catch { /* try the next candidate */ }
}
if (yaml) {
  const patch = yaml.load(patchText);
  check(Array.isArray(patch), 'cordis.patch.yml parses to an array');
  const rows = patch?.flatMap((entry) => entry?.insert ?? []) ?? [];
  const row = rows.find((r) => r?.id === 'ui-pet');
  check(row != null && row.name === '@minybear/dsh-pet', "roster row { id: ui-pet, name: '@minybear/dsh-pet' } present");
} else {
  console.log('       (js-yaml not found under any DSH install candidate; falling back to a text check)');
  check(/id:\s*ui-pet/.test(patchText) && /name:\s*'@minybear\/dsh-pet'/.test(patchText), "roster row { id: ui-pet, name: '@minybear/dsh-pet' } present (text match)");
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
