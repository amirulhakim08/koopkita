import { expect, test } from "@playwright/test";
import { ADMIN, MEMBER1, login, logout, uniqueRef } from "./helpers";

test("Super Admin sends a notification to selected members only, and to all members", async ({ page }) => {
  const targeted = `Peringatan khas ${uniqueRef("N")}`;
  const broadcast = `Makluman semua ${uniqueRef("N")}`;
  await login(page, ADMIN);
  await page.goto("/admin/pengumuman");

  await page.getByText("Ahli tertentu", { exact: true }).click();
  await page.getByLabel("Cari ahli").fill("Ahmad");
  await page.getByRole("checkbox", { name: "Ahmad Contoh bin Dev" }).check();
  await page.getByLabel("Tajuk").fill(targeted);
  await page.getByLabel("Mesej").fill("Sila kemas kini akaun bank anda.");
  await page.getByRole("button", { name: "Hantar kepada 1 ahli dipilih" }).click();
  await expect(page.getByText("Notifikasi dihantar kepada 1 ahli.")).toBeVisible();

  await page.getByText("Semua ahli aktif", { exact: true }).click();
  await page.getByLabel("Tajuk").fill(broadcast);
  await page.getByLabel("Mesej").fill("Mesyuarat agung pada hujung bulan.");
  await page.getByRole("button", { name: /Hantar kepada semua ahli/ }).click();
  await expect(page.getByText(/Notifikasi dihantar kepada \d+ ahli\./)).toBeVisible();
  await page.reload();
  await expect(page.getByText(targeted)).toBeVisible(); // history

  await logout(page);
  await login(page, MEMBER1);
  await page.goto("/ahli/notifikasi");
  await expect(page.getByText(targeted)).toBeVisible();
  await expect(page.getByText(broadcast)).toBeVisible();

  await logout(page);
  await login(page, { email: "ahli3@koopkita.test", password: "DevAhli#2026" });
  await page.goto("/ahli/notifikasi");
  await expect(page.getByText(broadcast)).toBeVisible();
  await expect(page.getByText(targeted)).toHaveCount(0);
});
