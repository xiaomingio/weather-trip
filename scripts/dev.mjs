/**
 * 文件说明: 并发启动所有 app 的源码开发入口，并在任一进程退出时清理整组进程。
 * 对应文档: docs/runtime.md
 */
import { spawn } from 'node:child_process';
import { buildAppEnv } from './env.mjs';

const apps = ['web', 'worker'];

function buildPackages() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build', '--workspace', 'weather-core', '--workspace', 'weather-db'], {
      cwd: process.cwd(),
      stdio: 'inherit'
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`package build failed with ${signal ?? code}`));
    });
  });
}

function startApp(app) {
  const child = spawn('npm', ['run', 'dev', '--workspace', app], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...buildAppEnv(app),
      NODE_ENV: 'development'
    },
    stdio: 'inherit'
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`${app} dev exited with ${signal ?? code}. Stopping all apps.`);
    shutdown(code ?? 1);
  });

  return child;
}

let shuttingDown = false;
await buildPackages();
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
