import { expect, test } from "@playwright/test";

test.describe("public surface & PWA", () => {
  test("protected routes redirect signed-out visitors to login", async ({ page }) => {
    for (const p of ["/ahli", "/admin", "/admin/ahli", "/ahli/komisen"]) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/log-masuk/);
    }
    await expect(page.getByRole("heading", { name: "Log Masuk" })).toBeVisible();
  });

  test("API routes refuse unauthenticated access", async ({ request }) => {
    const exportRes = await request.get("/api/eksport/ahli", { maxRedirects: 0 });
    expect([302, 307, 403]).toContain(exportRes.status());
    const file = await request.get("/api/fail?b=receipts&p=00000000-0000-0000-0000-000000000000/x.pdf", { maxRedirects: 0 });
    expect([302, 307, 401]).toContain(file.status());
  });

  test("serves an installable web app manifest, icons and a privacy-safe service worker", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.name).toContain("KoopKITA");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
    expect((await request.get("/icons/icon-192.png")).ok()).toBe(true);
    const sw = await (await request.get("/sw.js")).text();
    expect(sw).toContain("NEVER cache authenticated pages");
    expect((await request.get("/offline")).ok()).toBe(true);
  });

  test("sends security headers", async ({ request }) => {
    const res = await request.get("/log-masuk");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["x-powered-by"]).toBeUndefined();
  });

  test("registration validates input server-side", async ({ page }) => {
    await page.goto("/daftar");
    await page.getByRole("button", { name: "Hantar Permohonan" }).click();
    await expect(page.getByText("Sila semak maklumat yang dimasukkan.")).toBeVisible();
    await expect(page.getByText("No. Kad Pengenalan mesti 12 digit")).toBeVisible();
  });
});

test.describe("app start", () => {
  test("the installed app opens on a static loading screen, then continues to the app", async ({ page, request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.start_url).toBe("/buka");
    const res = await request.get("/buka", { maxRedirects: 0 });
    expect(res.status()).toBe(200); // served without a session check or redirect
    expect(await res.text()).toContain("Memuatkan");
    await page.goto("/buka");
    await page.waitForURL(/\/log-masuk/); // signed out: the start page sends the visitor to sign in
    await expect(page.getByRole("button", { name: "Log Masuk" })).toBeVisible();
  });

  test("the service worker keeps the loading screen for an instant start", async ({ request }) => {
    const sw = await (await request.get("/sw.js")).text();
    expect(sw).toContain('const START_URL = "/buka"');
    expect(sw).toMatch(/PRECACHE = \[OFFLINE_URL, START_URL/);
  });
});
