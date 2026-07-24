/**
 * 文件说明: 按 core、Web 的顺序执行静态公开数据版构建；静态数据生成由独立 npm scripts 显式触发。
 * 对应文档: docs/specs/31-data-flow.md, docs/specs/51-runtime.md
 */
import { spawn } from 'node:child_process';

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

await runCommand('npm', ['run', 'build', '--workspace', 'weather-core']);
await runCommand('npm', ['run', 'build', '--workspace', 'web']);
