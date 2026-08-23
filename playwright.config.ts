import { defineConfig } from "@playwright/test";

const useExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 20_000,
  workers: 1,
  expect: { timeout: 5_000 },
  reporter: "line",
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: useExternalServer
    ? undefined
    : {
        command: "pnpm dev",
        env: { PLAYWRIGHT_TEST: "1" },
        url: "http://localhost:3000/",
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    { name: "small-mobile", use: { viewport: { width: 320, height: 720 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop", use: { viewport: { width: 1280, height: 720 } } },
  ],
});
