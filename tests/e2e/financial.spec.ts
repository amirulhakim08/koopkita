import { expect, test } from "@playwright/test";
import { ADMIN, MEMBER1, MEMBER2, login, logout, uniqueRef, uploadReceipt } from "./helpers";

test("share payment: pending does not count, admin approval updates the balance", async ({ page }) => {
  const ref = uniqueRef("E2E-SHR");
  await login(page, MEMBER2);
  await page.goto("/ahli/saham");
  const approvedCard = page.getByText("Baki diluluskan").locator("..").locator("..");
  const before = await approvedCard.textContent();
  await page.getByLabel("Jumlah (RM)").fill("150");
  await page.getByLabel("Rujukan transaksi bank").fill(ref);
  await uploadReceipt(page);
  await page.getByRole("button", { name: "Hantar untuk semakan" }).click();
  await expect(page.getByText("Bayaran saham dihantar untuk semakan.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: ref })).toBeVisible();
  expect(await approvedCard.textContent()).toBe(before); // pending does not increase approved capital

  await logout(page);
  await login(page, ADMIN);
  await page.goto("/admin/saham");
  const row = page.getByRole("row").filter({ hasText: ref });
  await row.getByRole("button", { name: "Lulus" }).click();
  await expect(page.getByText("Bayaran saham diluluskan.")).toBeVisible();

  await logout(page);
  await login(page, MEMBER2);
  await page.goto("/ahli/saham");
  await expect(page.getByRole("row").filter({ hasText: ref }).getByText("Diluluskan")).toBeVisible();
  expect(await page.getByText("Baki diluluskan").locator("..").locator("..").textContent()).not.toBe(before);
});

test("qurban sale: reserve → upload proof → admin verifies & approves → RM40 commission → payout", async ({ page }) => {
  const ref = uniqueRef("E2E-SALE");
  await login(page, MEMBER2);
  await page.goto("/ahli/korban/jualan-baru");
  await expect(page.getByText("0000000000")).toBeVisible(); // configured cooperative bank account
  await page.getByLabel("Nama penuh pembeli").fill("Pembeli Ujian E2E");
  await page.getByLabel("No. telefon").fill("0137778888");
  await page.getByLabel("Nama peserta").fill("Peserta Ujian E2E");
  await expect(page.getByText("RM 850.00").last()).toBeVisible();
  await page.getByRole("button", { name: "Tempah slot" }).click();
  await expect(page).toHaveURL(/\/ahli\/korban\/jualan\/[0-9a-f-]{36}/);
  await expect(page.getByText("Slot berjaya ditempah")).toBeVisible();
  await expect(page.getByText(/KITA-2027-\d{3} · slot \d/)).toBeVisible();
  const saleUrl = page.url();
  const saleNo = (await page.getByText(/^QS-\d{4}-\d{5}$/).first().textContent())!;

  await page.getByLabel("Rujukan transaksi bank").fill(ref);
  await uploadReceipt(page);
  await page.getByRole("button", { name: "Hantar untuk semakan" }).click();
  await expect(page.getByText("Bukti bayaran dihantar untuk semakan.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Menunggu Semakan").first()).toBeVisible();

  // another member cannot open this sale
  await logout(page);
  await login(page, MEMBER1);
  const res = await page.goto(saleUrl);
  expect(res?.status()).toBe(404);

  // admin verifies the payment and approves
  await logout(page);
  await login(page, ADMIN);
  await page.goto(`/admin/jualan?q=${saleNo}`);
  await page.getByRole("link", { name: saleNo }).click();
  await page.getByRole("button", { name: "Sahkan" }).click();
  await expect(page.getByText("Bayaran disahkan.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Luluskan jualan" }).click();
  await expect(page.getByText("Jualan diluluskan dan komisen dijana.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Komisen 1 bahagian")).toBeVisible();

  // member sees RM40 commission
  await logout(page);
  await login(page, MEMBER2);
  await page.goto("/ahli/komisen");
  await expect(page.getByRole("row").filter({ hasText: saleNo }).getByText("RM 40.00")).toBeVisible();

  // admin records a partial payout of RM15
  await logout(page);
  await login(page, ADMIN);
  await page.goto("/admin/komisen");
  await page.getByRole("row").filter({ hasText: "Siti Contoh" }).getByRole("link").click();
  await page.waitForURL(/\/admin\/komisen\/[0-9a-f-]{36}$/);
  const outstandingCard = page.getByText("Tertunggak", { exact: true }).locator("..").locator("..");
  const toSen = (t: string | null) => Math.round(Number(t!.match(/RM\s?([\d,.]+)/)![1].replace(/,/g, "")) * 100);
  const before = toSen(await outstandingCard.textContent());
  expect(before).toBeGreaterThanOrEqual(4000);
  await page.getByLabel("Jumlah dibayar (RM)").fill("15");
  await page.getByLabel("Rujukan transaksi bank").fill(uniqueRef("E2E-PO"));
  await page.getByRole("button", { name: "Rekod bayaran komisen" }).click();
  await expect(page.getByText("Sahkan pemindahan bank telah dibuat")).toBeVisible(); // confirmation required
  await page.getByText("telah berjaya dibuat").click();
  await page.getByRole("button", { name: "Rekod bayaran komisen" }).click();
  await expect(page.getByText("Bayaran komisen direkodkan.")).toBeVisible();
  await page.reload();
  expect(toSen(await outstandingCard.textContent())).toBe(before - 1500); // partial payout reduces outstanding
});

test("admin dashboard, reports and audit log", async ({ page }) => {
  await login(page, ADMIN);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Modal saham diluluskan")).toBeVisible();
  await expect(page.getByText("Papan pendahulu jualan ahli")).toBeVisible();
  const csv = await page.request.get("/api/eksport/komisen");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body).toContain("Insentif Seekor Penuh");
  await page.goto("/admin/audit");
  await expect(page.getByText("report.exported").first()).toBeVisible();

  // members cannot export
  await logout(page);
  await login(page, MEMBER1);
  expect((await page.request.get("/api/eksport/ahli")).status()).toBe(403);
});
