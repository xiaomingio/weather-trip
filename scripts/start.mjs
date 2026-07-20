/**
 * 文件说明: 并发启动所有 app 的构建产物入口，用于本地 dist 验证和生产进程拓扑参考。
 * 对应文档: docs/runtime.md
 */
import { spawn } from 'node:child_process';
import { buildAppEnv } from './env.mjs';

const apps = ['web', 'worker'];

function startApp(app) {
  const child = spawn('npm', ['run', 'start', '--workspace', app], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...buildAppEnv(app),
      NODE_ENV: process.env.NODE_ENV ?? 'production'
    },
    stdio: 'inherit'
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`${app} start exited with ${signal ?? code}. Stopping all apps.`);
    shutdown(code ?? 1);
  });

  return child;
}

let shuttingDown = false;
const children = apps.map(startApp);

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // The child may already be gone.
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
