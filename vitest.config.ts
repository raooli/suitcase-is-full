import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 测试目录在 assets/ 之外，避免被 Cocos 打进包里（TDD 3 节关键约束）
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    reporters: 'verbose',
  },
});
