// Spawn helper for Express dev server. Detached so the agent shell can return.
import { spawn } from 'node:child_process';
import { openSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const projectRoot = 'D:/desarrollos/Inmocontrol';
const out = path.join(projectRoot, 'server.log');
const err = path.join(projectRoot, 'server.err');

mkdirSync(projectRoot, { recursive: true });

const outFd = openSync(out, 'a');
const errFd = openSync(err, 'a');

const child = spawn(
  'npx.cmd',
  ['tsx', 'server.ts'],
  {
    cwd: projectRoot,
    detached: true,
    stdio: ['ignore', outFd, errFd],
    windowsHide: true,
    env: { ...process.env },
    shell: true,
  },
);

child.unref();
console.log(`Spawned PID ${child.pid}, logs: ${out} / ${err}`);
