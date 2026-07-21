/**
 * 文件说明: 定义 Weather Trip 线上 PM2 进程拓扑，供 TinyShip 发布后启动 Web 和 Worker。
 * 对应文档: docs/runtime.md
 */
module.exports = {
  apps: [
    {
      name: 'weather-trip-web',
      script: 'apps/web/dist/server/entry.mjs',
      interpreter: 'node',
      node_args: '--env-file=apps/web/.env.production',
      cwd: '/var/www/weather-trip',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '384M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3020'
      }
    },
    {
      name: 'weather-trip-worker',
      script: 'apps/worker/dist/scheduler.js',
      interpreter: 'node',
      node_args: '--env-file=apps/worker/.env.production',
      cwd: '/var/www/weather-trip',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
