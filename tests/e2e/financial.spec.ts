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
  await expect(page.getByText("Bayaran syer dihantar untuk semakan.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: ref })).toBeVisible();
  expect(await approvedCard.textContent()).toBe(before); // pending does not increase approved capital

  await logout(page);
  await login(page, ADMIN);
  await page.goto("/admin/saham");
  const row = page.getByRole("row").filter({ hasText: ref });
  await row.getByRole("button", { name: "Lulus" }).click();
  await expect(page.getByText("Bayaran syer diluluskan.")).toBeVisible();

  await logout(page);
  await login(page, MEMBER2);
  await page.goto("/ahli/saham");
  await expect(page.getByRole("row").filter({ hasText: ref }).getByText("Diluluskan")).toBeVisible();
  expect(await page.getByText("Baki diluluskan").locator("..").locator("..").textContent()).not.toBe(before);
});

test("project: admin creates and publishes → member joins with RM1,000 → admin approves → invests → declares 10% → member withdraws → paid", async ({ page }) => {
  const name = `Pelaburan E2E ${Date.now()}`;
  const ref = uniqueRef("E2E-PRJ");
  await login(page, ADMIN);
  await page.goto("/admin/projek/baharu");
  await page.getByLabel("Nama projek").fill(name);
  await page.getByLabel("Organisasi pelaburan / rakan kongsi").fill("KOPSYA");
  await page.getByLabel("Sasaran modal (RM)").fill("2000");
  await page.getByLabel("Minimum penyertaan (RM)").fill("500");
  await page.getByLabel("Gandaan penyertaan (RM)").fill("500");
  await page.getByLabel("Terma dan syarat").fill("Terma ujian E2E: modal tidak dijamin.");
  await page.getByLabel("Pendedahan risiko").fill("Pulangan lepas bukan jaminan pulangan masa hadapan.");
  await page.getByRole("button", { name: "Simpan sebagai draf" }).click();
  await page.waitForURL(/\/admin\/projek\/[0-9a-f-]{36}/);
  const adminUrl = page.url().split("?")[0];
  const projectId = adminUrl.split("/").pop()!;
  await page.getByRole("button", { name: "Terbitkan projek" }).click();
  await page.getByRole("button", { name: "Ya, teruskan" }).click();
  await expect(page.getByText("Projek diterbitkan dan dibuka kepada ahli.")).toBeVisible();

  // member: − / + follow the RM500 step; RM1,000 is submitted with a receipt
  await logout(page);
  await login(page, MEMBER2);
  await page.goto(`/ahli/projek/${projectId}`);
  const amount = page.locator("output");
  await expect(amount).toHaveText(/RM\s?500\.00/);
  await page.getByRole("button", { name: "Tambah" }).click();
  await expect(amount).toHaveText(/RM\s?1,000\.00/);
  await page.getByText("Saya telah membaca terma").click();
  await uploadReceipt(page);
  await page.getByLabel("Rujukan transaksi bank").fill(ref);
  await page.getByRole("button", { name: /Hantar Bukti Bayaran/ }).click();
  await expect(page.getByText("Bukti bayaran dihantar. Status: Menunggu Pengesahan.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Menunggu Pengesahan").first()).toBeVisible();

  // admin approves; the project closes when the remaining RM1,000 is approved too
  await logout(page);
  await login(page, ADMIN);
  await page.goto(`${adminUrl}?tab=bayaran`);
  await page.getByRole("row").filter({ hasText: ref }).getByRole("button", { name: "Lulus" }).click();
  await expect(page.getByText("Bayaran diluluskan sebagai modal.")).toBeVisible();
  await page.goto(adminUrl);
  await page.getByRole("button", { name: "Tutup penyertaan" }).click();
  await page.getByRole("button", { name: "Ya, teruskan" }).click();
  await expect(page.getByText("Penyertaan ditutup.")).toBeVisible();
  await page.getByRole("button", { name: "Rekod pelaburan" }).waitFor();
  await page.getByLabel("Rujukan pelaburan / pindahan").fill("KOPSYA-E2E-1");
  await page.getByRole("button", { name: "Rekod pelaburan" }).click();
  await expect(page.getByText("Pelaburan direkodkan. Projek kini aktif.")).toBeVisible();

  // profit announcement: 10% → member 9% (RM90 on RM1,000), cooperative 1%
  await page.goto(`${adminUrl}?tab=keuntungan`);
  await page.getByLabel("Tempoh keuntungan").fill("Tahun 2027");
  await page.getByLabel("Kadar keuntungan diumumkan (%)").fill("10");
  await expect(page.getByLabel("Jumlah keuntungan kasar (RM)")).toHaveValue("100.00");
  await expect(page.getByLabel("Bahagian koperasi (mata peratusan)")).toHaveValue("1");
  await page.getByRole("button", { name: "Simpan draf dan semak agihan" }).click();
  await page.waitForURL(/\/keuntungan\/[0-9a-f-]{36}/);
  await expect(page.getByRole("row").filter({ hasText: "Siti" }).getByText(/RM\s?90\.00/)).toBeVisible();
  await page.getByText("Sudah diterima.").click();
  await page.getByRole("button", { name: "Sahkan pengumuman" }).click();
  await expect(page.getByText("Keuntungan disahkan. Dividen ahli kini tersedia untuk pengeluaran.")).toBeVisible();

  // member: dividend RM90 available, request a partial withdrawal of RM50
  await logout(page);
  await login(page, MEMBER2);
  await page.goto(`/ahli/projek/${projectId}`);
  await expect(page.getByText("Tersedia untuk pengeluaran").locator("..").locator("..")).toContainText("90.00");
  await page.getByRole("button", { name: "Mohon Pengeluaran" }).click();
  await page.getByLabel("Jumlah pengeluaran (RM)").fill("50");
  await page.getByRole("button", { name: "Hantar permohonan" }).click();
  await expect(page.getByText("Permohonan pengeluaran dihantar. Status: Menunggu Semakan.")).toBeVisible();

  // admin approves, then records the treasurer's transfer with its receipt
  await logout(page);
  await login(page, ADMIN);
  await page.goto("/admin/projek/pengeluaran");
  const row = page.getByRole("row").filter({ hasText: name });
  await row.getByRole("button", { name: "Lulus" }).click();
  await expect(page.getByText("Permohonan diluluskan. Maklumkan Bendahari untuk pindahan.")).toBeVisible();
  await page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: "Rekod bayaran" }).click();
  await uploadReceipt(page);
  await page.getByLabel("Rujukan transaksi bank").fill(uniqueRef("TRF"));
  await page.getByRole("button", { name: "Sahkan telah dibayar" }).click();
  await expect(page.getByText("Bayaran direkodkan. Ahli telah dimaklumkan.")).toBeVisible();

  // member sees it paid in the Wallet; RM40 remains available
  await logout(page);
  await login(page, MEMBER2);
  await page.goto("/ahli/wallet");
  await expect(page.getByRole("row").filter({ hasText: name }).getByText("Telah Dibayar")).toBeVisible();
  await expect(page.locator("li").filter({ hasText: name }).first()).toContainText(/Tersedia\s*RM\s?40\.00/);
});

test("project amounts follow the configured step and the member can't exceed the remaining amount", async ({ page }) => {
  await login(page, MEMBER1);
  await page.goto("/ahli/projek");
  await page.locator("div").filter({ hasText: /^Pelaburan KOPSYA 2027 \(CONTOH DEV\)/ }).first().waitFor();
  await page.locator(".flex.flex-col").filter({ hasText: "Pelaburan KOPSYA 2027 (CONTOH DEV)" }).getByRole("link", { name: "Lihat Projek" }).first().click();
  await expect(page.getByRole("heading", { name: /KOPSYA 2027/ })).toBeVisible();
  const amount = page.locator("output");
  await expect(amount).toHaveText(/RM\s?500\.00/); // member 1 already has RM1,000 pending; top-ups are one step
  await expect(page.getByRole("button", { name: "Kurangkan" })).toBeDisabled();
  for (let i = 0; i < 7; i++) await page.getByRole("button", { name: "Tambah" }).click();
  await expect(amount).toHaveText(/RM\s?4,000\.00/); // RM5,000 per-member cap minus RM1,000 already submitted
  await expect(page.getByRole("button", { name: "Tambah" })).toBeDisabled();
});

test("admin dashboard, reports and audit log", async ({ page }) => {
  await login(page, ADMIN);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Modal syer diluluskan")).toBeVisible();
  await expect(page.getByText("Modal berjaya dikumpul")).toBeVisible();
  const csv = await page.request.get("/api/eksport/dividen-projek");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body).toContain("Ladang Cili Fertigasi");
  await page.goto("/admin/audit");
  await expect(page.getByText("report.exported").first()).toBeVisible();

  // members cannot export
  await logout(page);
  await login(page, MEMBER1);
  expect((await page.request.get("/api/eksport/ahli")).status()).toBe(403);
});
