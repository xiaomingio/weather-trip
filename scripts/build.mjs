/**
 * 文件说明: 按 package 到 app 的顺序执行 workspace 构建，避免应用先于共享能力构建。
 * 对应文档: docs/runtime.md
 */
import { spawn } from 'node:child_process';

const workspaces = ['weather-core', 'weather-db', 'worker', 'web'];

function runBuild(workspace) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build', '--workspace', workspace], {
      cwd: process.cwd(),
      stdio: 'inherit'
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${workspace} build failed with ${signal ?? code}`));
    });
  });
}

for (const workspace of workspaces) {
  await runBuild(workspace);
}
