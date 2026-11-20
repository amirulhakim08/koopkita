import { expect, test } from "@playwright/test";
import { ADMIN, MEMBER1, login } from "./helpers";

test("member dashboard is usable on a phone", async ({ page }) => {
  await login(page, MEMBER1);
  await expect(page.getByRole("navigation", { name: "Navigasi utama" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tambah Jualan Korban" }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/mobile-dashboard.png", fullPage: true });
  await expect(page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("link", { name: "Bisnes" })).toBeVisible();
  await page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("link", { name: "Komisen" }).click();
  await expect(page).toHaveURL(/\/ahli\/komisen/);
  await expect(page.getByText("RM 300.00").first()).toBeVisible(); // seeded full-cattle sale
});

test("the mobile menu opens over the whole screen and navigates", async ({ page }) => {
  await login(page, ADMIN);
  await page.getByRole("button", { name: "Buka menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box!.height).toBeGreaterThan(500); // not clipped to the header
  await menu.getByRole("link", { name: "Kewangan" }).click();
  await expect(page).toHaveURL(/\/admin\/kewangan$/);
  await expect(menu).toHaveCount(0);
});

// Pages with a wide table or form next to other content used to be wider than the phone screen.
const pageWidthOverflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("member pages fit the phone screen width", async ({ page }) => {
  await login(page, MEMBER1);
  for (const url of ["/ahli/saham", "/ahli/korban", "/ahli/komisen", "/ahli/bisnes?tab=resit", "/ahli/bisnes/resit/baharu"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    expect(await pageWidthOverflow(page), url).toBeLessThanOrEqual(0);
  }
});

test("admin pages fit the phone screen width", async ({ page }) => {
  await login(page, ADMIN);
  for (const url of ["/admin/kempen", "/admin/kewangan", "/admin/saham", "/admin/bisnes"]) {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(800);
    expect(await pageWidthOverflow(page), url).toBeLessThanOrEqual(0);
  }
  await page.goto("/admin/komisen", { waitUntil: "load" });
  await page.locator('a[href^="/admin/komisen/"]').filter({ hasNotText: "Bayaran" }).first().click();
  await page.waitForURL(/\/admin\/komisen\/[0-9a-f-]{36}/);
  await page.waitForTimeout(800);
  expect(await pageWidthOverflow(page)).toBeLessThanOrEqual(0);
});
