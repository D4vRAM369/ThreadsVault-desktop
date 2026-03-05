const { spawnSync } = require('node:child_process');

function testSpawn(cmd, args) {
  try {
    const result = spawnSync(cmd, args, { encoding: 'utf8' });
    if (result.error) {
      return { ok: false, error: result.error };
    }
    if (result.status !== 0) {
      return { ok: false, stderr: result.stderr, status: result.status };
    }
    return { ok: true, stdout: result.stdout.trim() };
  } catch (error) {
    return { ok: false, error };
  }
}

const tests = [
  ['cmd.exe', ['/c', 'echo', 'spawn-ok']],
  ['node', ['-v']],
];

let allOk = true;
for (const [cmd, args] of tests) {
  const out = testSpawn(cmd, args);
  if (!out.ok) {
    allOk = false;
    console.error(`[doctor-node-spawn] FAIL ${cmd} ${args.join(' ')}`);
    if (out.error) console.error(out.error);
    if (out.stderr) console.error(out.stderr);
  } else {
    console.log(`[doctor-node-spawn] OK   ${cmd} -> ${out.stdout}`);
  }
}

if (!allOk) {
  console.error('\n[doctor-node-spawn] El entorno bloquea child_process.spawn desde Node.');
  console.error('[doctor-node-spawn] Solucion: permitir Node en politicas de seguridad (App Control / CI / EDR) o usar un runner Linux/CI sin esa restriccion.');
  process.exit(1);
}

console.log('\n[doctor-node-spawn] Entorno listo para Vite/Tauri build.');
