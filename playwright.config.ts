import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a real local Supabase stack (`npx supabase start`,
 * seeded from supabase/seed.sql) and the production build (`npm run build && npm start`).
 * See README → Testing.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "ms-MY",
    timezoneId: "Asia/Kuala_Lumpur",
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: "http://localhost:3000/log-masuk", reuseExistingServer: true, timeout: 120_000 },
});
