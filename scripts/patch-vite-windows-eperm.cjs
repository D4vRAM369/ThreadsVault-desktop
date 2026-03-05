const fs = require('node:fs');
const path = require('node:path');

const target = path.join(
  process.cwd(),
  'node_modules',
  'vite',
  'dist',
  'node',
  'chunks',
  'config.js'
);

if (!fs.existsSync(target)) {
  console.log('[patch-vite-windows-eperm] Skip: vite config chunk not found');
  process.exit(0);
}

const source = fs.readFileSync(target, 'utf8');
const marker = 'Some locked-down Windows environments block child_process spawn.';
if (source.includes(marker)) {
  console.log('[patch-vite-windows-eperm] Already patched');
  process.exit(0);
}

const before = `\texec("net use", (error$1, stdout) => {
\t\tif (error$1) return;
\t\tconst lines = stdout.split("\\n");
\t\tfor (const line of lines) {
\t\t\tconst m = parseNetUseRE.exec(line);
\t\t\tif (m) windowsNetworkMap.set(m[2], m[1]);
\t\t}
\t\tif (windowsNetworkMap.size === 0) safeRealpathSync = fs.realpathSync.native;
\t\telse safeRealpathSync = windowsMappedRealpathSync;
\t});`;

const after = `\ttry {
\t\texec("net use", (error$1, stdout) => {
\t\t\tif (error$1) return;
\t\t\tconst lines = stdout.split("\\n");
\t\t\tfor (const line of lines) {
\t\t\t\tconst m = parseNetUseRE.exec(line);
\t\t\t\tif (m) windowsNetworkMap.set(m[2], m[1]);
\t\t\t}
\t\t\tif (windowsNetworkMap.size === 0) safeRealpathSync = fs.realpathSync.native;
\t\t\telse safeRealpathSync = windowsMappedRealpathSync;
\t\t});
\t} catch {
\t\t// Some locked-down Windows environments block child_process spawn.
\t\t// Fallback to native realpath to avoid crashing during config load.
\t\tsafeRealpathSync = fs.realpathSync.native;
\t}`;

if (!source.includes(before)) {
  console.log('[patch-vite-windows-eperm] Pattern not found, nothing changed');
  process.exit(0);
}

fs.writeFileSync(target, source.replace(before, after), 'utf8');
console.log('[patch-vite-windows-eperm] Patch applied');
