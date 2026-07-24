/**
 * 文件说明: 配置 Astro 静态构建、React islands 和 Web app 的源码别名。
 * 对应文档: docs/plans/free-static-data-plan.md
 */
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  devToolbar: {
    enabled: false
  },
  output: 'static',
  integrations: [react()],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  }
});
