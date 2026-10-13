import { defineConfig } from 'vitest/config';

// 注：M0 工程合并后，引擎编译用根目录 tsconfig.json（extends ./temp/tsconfig.cocos.json，
// 由 Cocos 编辑器首次打开工程时生成）；本文件与 npm run typecheck 统一指向
// tsconfig.node.json（原 tsconfig.json 改名），二者 include 互不重叠（06-架构设计 V-02）。
export default defineConfig({
  test: {
    // 测试目录在 assets/ 之外，避免被 Cocos 打进包里（TDD 3 节关键约束）
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    reporters: 'verbose',
  },
});
