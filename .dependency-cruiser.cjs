/*
 * 文件说明: 固定 workspace 依赖方向，禁止 app 之间互相穿透和绕过 package exports。
 */
module.exports = {
  forbidden: [
    {
      name: 'no-app-to-app-source-import',
      severity: 'error',
      from: { path: '^apps/([^/]+)/src' },
      to: { path: '^apps/([^/]+)/src', pathNot: '^apps/$1/src' }
    },
    {
      name: 'packages-do-not-import-apps',
      severity: 'error',
      from: { path: '^packages/[^/]+/src' },
      to: { path: '^apps/[^/]+/src' }
    },
    {
      name: 'web-app-does-not-depend-on-root-data',
      severity: 'error',
      from: { path: '^apps/web/(?:src|tests)' },
      to: { path: '^data/' }
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules'
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json'
    }
  }
};
