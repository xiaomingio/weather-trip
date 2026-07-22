/**
 * 文件说明: 配置 weather-core 共享契约测试，只覆盖真实跨 app 复用的核心逻辑。
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts']
  }
});
