// Dev-all: arranca Express + Vite en paralelo y los une al stdout.
// Cross-platform (PowerShell, bash, cmd). Reemplaza el `npm run dev:all`
// que usaba `&` (bash-only).
import { spawn } from 'node:child_process';

const procs = [
  { name: 'server', cmd: 'npm', args: ['run', 'server'], color: '\x1b[36m' }, // cyan
  { name: 'vite',   cmd: 'npm', args: ['run', 'dev'],    color: '\x1b[35m' }, // magenta
];
const reset = '\x1b[0m';
const children = [];

for (const { name, cmd, args, color } of procs) {
  const child = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true, // necesario en Windows para resolver npm.cmd
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  children.push(child);

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
  child.on('exit', (code) => {
    process.stdout.write(`${tag} exited with code ${code}\n`);
    // Si uno muere, matá al otro para no dejar zombies.
    for (const c of children) {
      if (c !== child && !c.killed) c.kill();
    }
    process.exit(code ?? 0);
  });
}

const shutdown = (signal) => {
  process.stdout.write(`\n[dev-all] received ${signal}, shutting down...\n`);
  for (const c of children) {
    if (!c.killed) c.kill();
  }
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
