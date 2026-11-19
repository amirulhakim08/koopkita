import path from "node:path";
import { expect, test } from "@playwright/test";
import { ADMIN, MEMBER2, login } from "./helpers";

test.describe("receipt OCR autofill (runs in the browser, self-hosted engine)", () => {
  test("reads amount, date and reference from a bank receipt image", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, MEMBER2);
    await page.goto("/ahli/saham");
    await page.waitForLoadState("networkidle"); // let the upload control hydrate before choosing a file
    await page.locator('input[type="file"]').first().setInputFiles(path.join(__dirname, "fixtures/resit-bank.png"));
    await expect(page.getByRole("status").filter({ hasText: "Sila semak sebelum hantar" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByLabel("Jumlah (RM)")).toHaveValue("150.00");
    await expect(page.getByLabel("Tarikh bayaran")).toHaveValue("2026-11-15");
    await expect(page.getByLabel("Rujukan transaksi bank")).toHaveValue("4567891234");
  });

  test("reads a PDF e-receipt via its text layer", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, ADMIN);
    await page.goto("/admin/kewangan");
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "Wang masuk" }).click();
    await page.locator('input[type="file"]').first().setInputFiles(path.join(__dirname, "fixtures/resit-bank.pdf"));
    await expect(page.getByRole("status").filter({ hasText: "Sila semak sebelum hantar" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByLabel("Jumlah (RM)")).toHaveValue("1700.00");
    await expect(page.locator("#entry_date")).toHaveValue("2026-11-03");
    await expect(page.locator("#reference")).toHaveValue("CT20261103ABC123");
  });
});
