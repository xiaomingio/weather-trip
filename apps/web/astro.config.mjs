/**
 * 文件说明: 配置 Astro SSR、React islands 和 Web app 的源码别名。
 * 对应文档: docs/runtime.md
 */
import node from '@astrojs/node';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
  integrations: [react()],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  }
});
