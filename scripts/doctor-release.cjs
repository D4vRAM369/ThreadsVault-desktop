const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const results = [];

function addResult(check, ok, detail, critical = true) {
  results.push({ check, ok, detail, critical });
  const icon = ok ? 'OK  ' : 'FAIL';
  console.log(`[doctor:release] ${icon} ${check}: ${detail}`);
}

function checkFileExists(relPath, critical = true) {
  const fullPath = path.join(root, relPath);
  const ok = fs.existsSync(fullPath);
  addResult(
    `file:${relPath}`,
    ok,
    ok ? fullPath : `No existe: ${fullPath}`,
    critical
  );
}

function checkWritableDir(relPath, critical = true) {
  const fullPath = path.join(root, relPath);
  try {
    fs.mkdirSync(fullPath, { recursive: true });
    fs.accessSync(fullPath, fs.constants.W_OK);
    const probe = path.join(fullPath, `.doctor-write-${Date.now()}.tmp`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    addResult(`writable:${relPath}`, true, fullPath, critical);
  } catch (error) {
    addResult(`writable:${relPath}`, false, String(error.message || error), critical);
  }
}

function checkSpawn(cmd, args, critical = true) {
  try {
    const out = spawnSync(cmd, args, { encoding: 'utf8' });
    if (out.error) {
      addResult(`spawn:${cmd}`, false, `${out.error.code || 'ERR'} ${out.error.message}`, critical);
      return;
    }
    if (out.status !== 0) {
      addResult(`spawn:${cmd}`, false, `exit ${out.status} ${out.stderr || ''}`.trim(), critical);
      return;
    }
    const line = (out.stdout || '').trim().split(/\r?\n/)[0] || 'ok';
    addResult(`spawn:${cmd}`, true, line, critical);
  } catch (error) {
    addResult(`spawn:${cmd}`, false, String(error.message || error), critical);
  }
}

console.log('[doctor:release] Iniciando chequeos de release...');
console.log(`[doctor:release] Platform=${process.platform} Node=${process.version} CWD=${root}`);

// 1) Integridad de proyecto
checkFileExists('package.json');
checkFileExists('src-tauri/tauri.conf.json');
if (process.platform === 'win32') {
  checkFileExists('src-tauri/bin/yt-dlp.exe', false);
  checkFileExists('src-tauri/bin/ffmpeg.exe', false);
} else {
  addResult(
    'file:src-tauri/bin/*.exe',
    true,
    'Skip en no-Windows (binarios .exe no aplican en este target)',
    false
  );
}

// 2) Permisos de escritura para build
checkWritableDir('dist');
checkWritableDir('src-tauri/target');

// 3) Capacidad de spawn (requisito duro para vite/esbuild)
if (process.platform === 'win32') {
  checkSpawn('cmd.exe', ['/c', 'echo', 'spawn-ok']);
} else {
  checkSpawn('sh', ['-lc', 'echo spawn-ok']);
}
checkSpawn(process.execPath, ['-v']);

// 4) Sugerencia para bundles Linux
if (process.platform !== 'linux') {
  addResult(
    'target:linux-bundles',
    false,
    'AppImage/deb deben generarse en Linux (host o CI Linux)',
    false
  );
}

const criticalFailures = results.filter((r) => r.critical && !r.ok);
const failures = results.filter((r) => !r.ok);

console.log('');
console.log(`[doctor:release] Resumen: ${results.length - failures.length}/${results.length} checks OK`);

if (criticalFailures.length > 0) {
  console.error(`[doctor:release] BLOQUEADO: ${criticalFailures.length} check(s) criticos fallaron.`);
  console.error('[doctor:release] No intentes empaquetar hasta resolverlos.');
  process.exit(1);
}

if (failures.length > 0) {
  console.warn(`[doctor:release] Advertencias: ${failures.length} check(s) no criticos.`);
}

console.log('[doctor:release] Entorno listo para avanzar con release.');
