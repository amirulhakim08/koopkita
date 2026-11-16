import { expect, test } from "@playwright/test";
import { ADMIN, MEMBER1, login } from "./helpers";

test("member dashboard is usable on a phone", async ({ page }) => {
  await login(page, MEMBER1);
  await expect(page.getByRole("navigation", { name: "Navigasi utama" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tambah Jualan Korban" }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/mobile-dashboard.png", fullPage: true });
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
