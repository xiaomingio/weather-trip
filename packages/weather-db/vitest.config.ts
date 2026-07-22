/**
 * 文件说明: 配置 weather-db 的独立测试目录，避免 Vitest 扫描 dist 构建产物。
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts']
  }
});
