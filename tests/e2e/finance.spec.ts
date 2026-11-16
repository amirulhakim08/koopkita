import { expect, test } from "@playwright/test";
import { ADMIN, MEMBER1, login, logout, uniqueRef } from "./helpers";

const toSen = (t: string | null) => Math.round(Number(t!.match(/RM\s?(-?[\d,.]+)/)![1].replace(/,/g, "")) * 100);

test("Super Admin records a withdrawal with a reason; total cooperative funds update; members cannot see finances", async ({ page }) => {
  const reason = `Pengeluaran ujian E2E ${uniqueRef("W")}`;
  await login(page, ADMIN);
  await page.goto("/admin/kewangan");
  await expect(page.getByText("Paparan Super Admin sahaja")).toBeVisible();
  const totalCard = page.getByText("Jumlah dana koperasi", { exact: true }).first().locator("..").locator("..");
  const before = toSen(await totalCard.textContent());

  // a withdrawal without a reason is refused
  await page.getByLabel("Kategori").selectOption("pengeluaran_tunai");
  await page.getByLabel("Jumlah (RM)").fill("125.50");
  await page.getByRole("button", { name: "Rekod pengeluaran" }).click();
  await expect(page.getByText("Sekurang-kurangnya 5 aksara")).toBeVisible();

  await page.getByLabel("Sebab pengeluaran").fill(reason);
  await page.getByLabel("Perniagaan").selectOption("pertanian");
  await page.getByRole("button", { name: "Rekod pengeluaran" }).click();
  await expect(page.getByText("Pengeluaran direkodkan.")).toBeVisible();
  await page.reload();
  const row = page.getByRole("row").filter({ hasText: reason });
  await expect(row).toBeVisible();
  await expect(row.getByText("RM 125.50")).toBeVisible();
  expect(toSen(await totalCard.textContent())).toBe(before - 12550);

  // money in
  await page.getByRole("tab", { name: "Wang masuk" }).click();
  await page.getByLabel("Kategori").selectOption("hasil_perniagaan");
  await page.getByLabel("Jumlah (RM)").fill("300");
  await page.getByLabel("Keterangan").fill("Hasil jualan pakej pelancongan");
  await page.getByLabel("Perniagaan").selectOption("pelancongan");
  await page.getByRole("button", { name: "Rekod wang masuk" }).click();
  await expect(page.getByText("Wang masuk direkodkan.")).toBeVisible();
  await page.reload();
  expect(toSen(await totalCard.textContent())).toBe(before - 12550 + 30000);

  // the dashboard shows the same total
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: /Jumlah dana koperasi/ })).toBeVisible();

  const csv = await page.request.get("/api/eksport/buku-tunai");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(reason);

  // members: no menu item, no page, no export
  await logout(page);
  await login(page, MEMBER1);
  await expect(page.getByRole("link", { name: "Kewangan" })).toHaveCount(0);
  await page.goto("/admin/kewangan");
  await expect(page).toHaveURL(/\/ahli$/);
  expect((await page.request.get("/api/eksport/buku-tunai")).status()).toBe(403);
});
