// Dev-all: arranca Express + Vite en paralelo y los une al stdout.
// Cross-platform (PowerShell, bash, cmd).
//
// Tolerante a EADDRINUSE en el server: si el puerto 3001 ya está ocupado
// (típicamente porque quedó un Express de una sesión anterior que no
// se cerró limpio), NO mata a Vite ni entra en loop — solo loguea
// "ya hay un server en 3001, reusándolo" y deja que Vite haga proxy
// contra ese server existente.
import { spawn } from 'node:child_process';
import net from 'node:net';

const reset = '\x1b[0m';
const COLOR_SERVER = '\x1b[36m'; // cyan
const COLOR_VITE   = '\x1b[35m'; // magenta

/** ¿El puerto 3001 ya está ocupado por otro proceso? */
async function isPortTaken(port, host = '127.0.0.1', timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (taken) => { if (!done) { done = true; socket.destroy(); resolve(taken); } };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

const portAlreadyTaken = await isPortTaken(3001);
const procs = [
  // Si el server ya está corriendo, lo saltamos. Si no, lo levantamos.
  ...(portAlreadyTaken ? [] : [{ name: 'server', cmd: 'npm', args: ['run', 'server'], color: COLOR_SERVER }]),
  { name: 'vite', cmd: 'npm', args: ['run', 'dev:client'], color: COLOR_VITE },
];
const children = [];

if (portAlreadyTaken) {
  console.log(`${COLOR_SERVER}[server]${reset} puerto 3001 ya ocupado — reusando el Express que esté escuchando ahí.`);
  console.log(`${COLOR_SERVER}[server]${reset} Si querés un server limpio, cerrá el proceso que tiene 3001 y volvé a correr dev.`);
}

for (const { name, cmd, args, color } of procs) {
  const child = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true, // necesario en Windows para resolver npm.cmd
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  children.push({ child, name });

  const tag = `${color}[${name}]${reset}`;
  const pipe = (src, prefix) => {
    let buf = '';
    src.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) {
        process.stdout.write(`${tag} ${prefix}${line}\n`);
      }
    });
  };
  pipe(child.stdout, ' ');
  pipe(child.stderr, ' ');

  /** Si el server muere con EADDRINUSE, NO propagamos el exit a Vite. */
  let suppressExit = false;
  if (name === 'server' && portAlreadyTaken) {
    // Nunca debería pasar (no spawneamos server), pero por las dudas.
    suppressExit = true;
  }
  child.stderr.on('data', (chunk) => {
    // Detectar EADDRINUSE en el server: si pasa, lo tratamos como "ya hay
    // un server" y dejamos que Vite siga. Cualquier otro error sí propaga.
    if (name === 'server' && /EADDRINUSE.*3001/.test(chunk.toString())) {
      suppressExit = true;
      console.log(`${tag} puerto 3001 ocupado por otro proceso — reusando. Vite sigue con proxy al server existente.`);
    }
  });

  child.on('exit', (code) => {
    process.stdout.write(`${tag} exited with code ${code}${suppressExit ? ' (suprimido — Vite sigue)' : ''}\n`);
    if (suppressExit) return; // no matar al otro ni salir
    // Si uno muere por otra razón, matá al otro para no dejar zombies.
    for (const c of children) {
      if (c.child !== child && !c.child.killed) c.child.kill();
    }
    process.exit(code ?? 0);
  });
}

const shutdown = (signal) => {
  process.stdout.write(`\n[dev-all] received ${signal}, shutting down...\n`);
  for (const c of children) {
    if (!c.child.killed) c.child.kill();
  }
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
