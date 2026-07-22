/**
 * 文件说明: 配置 Web app 私有领域逻辑测试，覆盖筛选、评分和预设规则。
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname
    }
  },
  test: {
    include: ['tests/**/*.test.ts']
  }
});
