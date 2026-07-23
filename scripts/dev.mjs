/**
 * 文件说明: 启动 Web 源码开发入口，读取已提交或手动生成的本地静态数据。
 * 对应文档: docs/specs/51-runtime.md
 */
import { spawn } from 'node:child_process';
import { buildAppEnv } from './env.mjs';

const apps = ['web'];

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit'
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? code}`));
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
await runCommand('npm', ['run', 'build', '--workspace', 'weather-core']);
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
