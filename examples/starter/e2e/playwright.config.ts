import { defineConfig, devices } from "@playwright/test";

const MOCK_ABP = "http://127.0.0.1:44399";
const APP = "http://localhost:4173";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  retries: 0,
  use: { baseURL: APP, ...devices["Desktop Chrome"] },
  webServer: [
    {
      command: "node e2e/mock-abp.mjs",
      cwd: "..",
      url: `${MOCK_ABP}/api/abp/application-configuration`,
      reuseExistingServer: false,
    },
    {
      // 生产构建才注册 SW（开发态刻意不注册）。starter 的 start 脚本不可用：构建出的 server.js 只导出 fetch 处理函数。
      command: "bun run build && bunx vite preview --port 4173 --strictPort",
      cwd: "..",
      url: APP,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        AUTH_ISSUER: MOCK_ABP,
        AUTH_CLIENT_ID: "e2e",
        AUTH_SESSION_SECRET: "e2e-session-secret-0123456789abcdef",
        AUTH_REDIRECT_URI: `${APP}/api/auth/callback`,
        AUTH_POST_LOGOUT_REDIRECT_URI: `${APP}/`,
        AUTH_ABP_BASE_URL: MOCK_ABP,
        AUTH_SCOPE: "openid profile",
      },
    },
  ],
});
