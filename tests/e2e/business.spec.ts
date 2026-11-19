import path from "node:path";
import { expect, test } from "@playwright/test";
import { ADMIN, MEMBER2, login, logout } from "./helpers";

const LOGO = path.join(__dirname, "fixtures/logo-kedai.png");

test("Bisnes Saya: profile + logo → customer → invoice → share PDF → public link → payment → receipt; privacy; admin SSM", async ({ page, browser }) => {
  test.setTimeout(120_000);
  // capture what the device share sheet would receive
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: unknown[] };
    w.__shared = [];
    Object.defineProperty(navigator, "canShare", { configurable: true, value: (d: ShareData) => !!d.files?.length });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (d: ShareData) => { w.__shared.push({ name: d.files![0].name, type: d.files![0].type, size: d.files![0].size, text: d.text }); },
    });
  });
  const shared = () => page.evaluate(() => (window as unknown as { __shared: { name: string; type: string; size: number; text: string }[] }).__shared);

  await login(page, MEMBER2);
  await page.goto("/ahli/bisnes");
  await expect(page.getByText("Mulakan dengan Profil Bisnes")).toBeVisible();

  // 1. business profile with logo
  await page.locator('input[type="file"][accept="image/png,image/jpeg"]').setInputFiles(LOGO);
  await expect(page.getByAltText("Logo")).toBeVisible();
  await page.getByLabel("Nama syarikat / bisnes").fill("Homestay Ujian Siti");
  await page.getByLabel("No. SSM (pilihan)").fill("JM0812345-K");
  await page.locator("#phone").fill("0122222222");
  await page.locator("#bank_name").selectOption("Bank Islam");
  await page.locator("#bank_account_no").fill("2222222222");
  await page.getByRole("button", { name: "Simpan profil bisnes" }).click();
  await expect(page.getByText("Profil bisnes disimpan.")).toBeVisible();

  // 2. customer
  await page.goto("/ahli/bisnes?tab=pelanggan");
  await page.getByLabel("Nama pelanggan").fill("Puan Aminah Ujian");
  await page.getByLabel("No. telefon").fill("0135556666");
  await page.getByRole("button", { name: "Tambah pelanggan" }).click();
  await expect(page.getByText("Pelanggan ditambah.")).toBeVisible();

  // 2b. catalogue: the member lists their own product with a preferred price
  await page.goto("/ahli/bisnes?tab=katalog");
  await expect(page.getByText("Katalog masih kosong")).toBeVisible();
  await page.getByLabel("Nama produk / servis").fill("Sarapan (set)");
  await page.getByLabel("Harga (RM)").fill("15");
  await page.getByRole("button", { name: "Tambah ke katalog" }).click();
  await expect(page.getByText("Item ditambah ke katalog.")).toBeVisible();

  // 3. invoice
  await page.goto("/ahli/bisnes/invois/baharu");
  // the customer box finds an existing customer by phone number
  await page.getByPlaceholder("Cari nama atau no. telefon").fill("013555");
  await page.getByRole("option", { name: /Puan Aminah Ujian/ }).click();
  await expect(page.getByTestId("customer-chosen")).toHaveText("Puan Aminah Ujian");
  await page.getByLabel("Perkara 1").fill("Sewa homestay 2 malam");
  await page.locator('input[name="items.0.quantity"]').fill("2");
  await page.locator('input[name="items.0.unit_price"]').fill("180");
  await page.getByRole("button", { name: "Tambah item" }).click();
  // item 1 is typed in and saved to the catalogue for next time
  await page.getByText("Simpan ke katalog untuk kegunaan akan datang").click();
  // item 2 comes from the catalogue: the price is confirmed (changed for this invoice only)
  await page.getByLabel("Perkara 2").fill("sarap");
  await page.getByRole("option", { name: /Sarapan \(set\)/ }).click();
  await page.getByRole("button", { name: "Pilih (1)" }).click();
  const confirm = page.getByRole("group", { name: "Sahkan harga" });
  await expect(confirm.getByLabel("Harga Sarapan (set)")).toHaveValue("15.00");
  await confirm.getByLabel("Harga Sarapan (set)").fill("12.50");
  await confirm.getByRole("button", { name: "Sahkan harga" }).click();
  await expect(page.getByLabel("Perkara 2")).toHaveValue("Sarapan (set)");
  await expect(page.locator('input[name="items.1.unit_price"]')).toHaveValue("12.50");
  await page.locator('input[name="items.1.quantity"]').fill("4");
  await page.locator('input[name="items.1.discount"]').fill("10");
  await expect(page.getByText("RM 400.00").last()).toBeVisible(); // 360 + 50 - 10
  await page.getByRole("button", { name: "Keluarkan" }).click();
  await expect(page.getByText("Invois dikeluarkan").first()).toBeVisible();
  const invoiceNo = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  expect(invoiceNo).toMatch(/^INV-\d{6}001$/);
  const invoiceUrl = page.url();
  // the typed-in item is now in the catalogue; the catalogue price of the picked item is unchanged
  await page.goto("/ahli/bisnes?tab=katalog");
  await expect(page.getByText("Sewa homestay 2 malam")).toBeVisible();
  await expect(page.getByText("RM 180.00")).toBeVisible();
  await expect(page.getByText("RM 15.00")).toBeVisible();
  await page.goto(invoiceUrl);

  // 4. "Kongsi PDF" hands a real PDF file to the device share sheet
  await page.getByRole("button", { name: "Kongsi PDF" }).first().click();
  await expect.poll(async () => (await shared()).length).toBe(1);
  const [file] = await shared();
  expect(file.name).toBe(`Invois-${invoiceNo}.pdf`);
  expect(file.type).toBe("application/pdf");
  expect(file.size).toBeGreaterThan(2000);
  expect(file.text).toContain("/d/");

  // 5. the customer opens the public link without signing in
  const waHref = await page.getByRole("link", { name: "WhatsApp" }).first().getAttribute("href");
  expect(waHref).toContain("wa.me/60135556666");
  const publicUrl = decodeURIComponent(waHref!).match(/https?:\/\/[^\s]+\/d\/[A-Za-z0-9_-]{32}/)![0];
  const anon = await browser.newContext();
  const cust = await anon.newPage();
  await cust.goto(publicUrl);
  await expect(cust.locator("header").getByText("Homestay Ujian Siti")).toBeVisible();
  await expect(cust.getByText(invoiceNo, { exact: true })).toBeVisible();
  await expect(cust.getByText("RM 400.00").first()).toBeVisible();
  await expect(cust.getByText("2222222222")).toBeVisible();
  const pdf = await cust.request.get(`${publicUrl}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  // 6. record a full payment → receipt with its own share button
  await page.getByLabel("Kaedah").selectOption("duitnow");
  await page.getByLabel("Rujukan (pilihan)").fill("DN-UJIAN-1");
  await page.getByRole("button", { name: "Rekod bayaran & jana resit" }).click();
  await expect(page.getByText("Bayaran direkodkan dan resit dijana.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Dibayar", { exact: true }).first()).toBeVisible();
  const receiptNo = (await page.getByText(/^RCP-\d{6}001/).first().textContent())!.trim().slice(0, 13);
  await page.locator("#resit").getByRole("button", { name: "Kongsi PDF" }).click();
  await expect.poll(async () => (await shared()).length).toBe(1); // the reload reset the capture
  expect((await shared())[0].name).toBe(`Resit-${receiptNo}.pdf`);

  // 7. a direct-sale receipt (no invoice): a new customer is typed in and saved
  await page.goto("/ahli/bisnes?tab=resit");
  await page.getByRole("link", { name: "Resit Jualan Langsung" }).click();
  await page.getByPlaceholder("Cari nama atau no. telefon").fill("Encik Hamid Ujian");
  await page.getByRole("option", { name: /Tambah pelanggan baharu/ }).click();
  await expect(page.getByLabel("Nama pelanggan")).toHaveValue("Encik Hamid Ujian");
  // a number that already belongs to a customer is offered instead of creating a duplicate
  await page.getByLabel("No. telefon (pilihan)").fill("013-555 6666");
  await expect(page.getByText("Nombor ini milik")).toContainText("Puan Aminah Ujian");
  await page.getByLabel("No. telefon (pilihan)").fill("0177778888");
  await expect(page.getByText("Nombor ini milik")).toHaveCount(0);
  await page.getByLabel("Perkara 1").fill("Jem nanas");
  await page.locator('input[name="items.0.quantity"]').fill("3");
  await page.locator('input[name="items.0.unit_price"]').fill("8");
  await expect(page.getByText("RM 24.00").last()).toBeVisible();
  await page.getByRole("button", { name: "Jana resit" }).click();
  await expect(page.getByText("Resit dijana").first()).toBeVisible();
  const directNo = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  expect(directNo).toMatch(/^RCP-\d{6}002$/);
  await expect(page.getByText("Jualan langsung")).toBeVisible();
  await expect(page.getByText("Jem nanas")).toBeVisible();
  await page.getByRole("button", { name: "Kongsi PDF" }).click();
  await expect.poll(async () => (await shared()).length).toBe(1);
  expect((await shared())[0].name).toBe(`Resit-${directNo}.pdf`);
  const directWa = await page.getByRole("link", { name: "WhatsApp" }).first().getAttribute("href");
  expect(directWa).toContain("wa.me/60177778888");
  const directUrl = decodeURIComponent(directWa!).match(/https?:\/\/[^\s]+\/d\/[A-Za-z0-9_-]{32}/)![0];
  // not listed as an invoice; the new customer is saved and can be found next time
  await page.goto("/ahli/bisnes?tab=invois");
  await expect(page.getByRole("row")).toHaveCount(2); // header + the one invoice
  await page.goto("/ahli/bisnes?tab=pelanggan");
  await expect(page.getByText("Encik Hamid Ujian")).toBeVisible();
  await page.goto("/ahli/bisnes/resit/baharu");
  await page.getByPlaceholder("Cari nama atau no. telefon").fill("hamid");
  await expect(page.getByRole("option", { name: /Encik Hamid Ujian/ })).toBeVisible();
  const anon2 = await browser.newContext();
  const cust2 = await anon2.newPage();
  await cust2.goto(directUrl);
  await expect(cust2.getByText(directNo, { exact: true })).toBeVisible();
  await expect(cust2.getByText("Jem nanas")).toBeVisible();
  await expect(cust2.getByText("Invois:")).toHaveCount(0);
  await anon2.close();
  await page.goto(invoiceUrl);

  // 8. turning off the link stops the customer page
  await page.getByRole("button", { name: "Matikan pautan" }).click();
  await expect(page.getByText("Pautan dimatikan.")).toBeVisible();
  await cust.goto(publicUrl);
  await expect(cust.getByText("Dokumen tidak tersedia")).toBeVisible();
  await anon.close();

  // 9. another member cannot open the invoice or its PDF
  await logout(page);
  await login(page, { email: "ahli3@koopkita.test", password: "DevAhli#2026" });
  await page.goto(invoiceUrl);
  await expect(page.getByRole("heading", { name: "Halaman tidak dijumpai" })).toBeVisible();
  const invoiceId = invoiceUrl.split("/").pop()!.split("?")[0];
  expect((await page.request.get(`/api/bisnes/dokumen?jenis=invoice&id=${invoiceId}`)).status()).toBe(404);

  // 10. Super Admin sees the business (totals only) and verifies the SSM
  await logout(page);
  await login(page, ADMIN);
  await page.goto("/admin/bisnes");
  const row = page.getByRole("row").filter({ hasText: "Homestay Ujian Siti" });
  await expect(row.getByText("RM 400.00").first()).toBeVisible();
  await expect(page.getByText("Jumlah jualan").first()).toBeVisible();
  await expect(row.getByText("RM 424.00").first()).toBeVisible(); // invoice 400 + direct sale 24
  await page.getByRole("link", { name: "Semua" }).click();
  await expect(row.getByText("RM 424.00").first()).toBeVisible();
  const csv = await page.request.get("/api/eksport/bisnes-ahli");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Homestay Ujian Siti");
  await row.getByRole("button", { name: "Sahkan SSM" }).click();
  await expect(page.getByText("SSM disahkan.")).toBeVisible();
  await expect(page.getByText("Puan Aminah Ujian")).toHaveCount(0); // no customer details for admin
});

test("without a file share sheet (desktop browsers), Kongsi PDF offers download / e-mail / WhatsApp / copy link", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
  });
  await login(page, { email: "ahli1@koopkita.test", password: "DevAhli#2026" });
  await page.goto("/ahli/bisnes");
  await page.getByRole("link", { name: /INV-\d{6}001/ }).first().click();
  await page.getByRole("button", { name: "Kongsi PDF" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Pilihan kongsi" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "E-mel" })).toHaveAttribute("href", /^mailto:/);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Muat turun PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/^Invois-INV-\d{6}001\.pdf$/);
});

test("official cooperative receipt PDF for an approved Qurban sale", async ({ page }) => {
  await login(page, { email: "ahli1@koopkita.test", password: "DevAhli#2026" });
  await page.goto("/ahli/korban");
  await page.getByRole("link", { name: "QS-2027-00001" }).click();
  await expect(page.getByText("Resit Rasmi Koperasi")).toBeVisible();
  const res = await page.request.get(page.url().replace(/\/ahli\/korban\/jualan\//, "/api/korban/resit/"));
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
});

test("catalogue: tick several items, confirm their prices once, and they fill Perkara 1, 2 …", async ({ page }) => {
  await login(page, { email: "ahli1@koopkita.test", password: "DevAhli#2026" });
  await page.goto("/ahli/bisnes/resit/baharu");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Perkara 1").click(); // the catalogue opens without typing
  await page.getByRole("option", { name: /Ikan kembung 1kg/ }).click();
  await page.getByRole("option", { name: /Penghantaran/ }).click();
  await expect(page.getByRole("listbox", { name: "Katalog" }).getByRole("option", { selected: true })).toHaveCount(2);
  // narrowing the list keeps earlier ticks, and the footer lists every ticked item
  await page.getByLabel("Perkara 1").fill("baja");
  await expect(page.getByRole("listbox", { name: "Katalog" }).getByRole("option")).toHaveCount(1);
  await expect(page.getByTestId("catalog-chosen")).toHaveText("Ditanda: Ikan kembung 1kg, Penghantaran");
  await page.getByLabel("Perkara 1").fill("");
  await page.getByRole("button", { name: "Pilih (2)" }).click();
  const confirm = page.getByRole("group", { name: "Sahkan harga" });
  await expect(confirm.getByLabel("Harga Ikan kembung 1kg")).toHaveValue("18.00");
  await confirm.getByLabel("Harga Penghantaran")
    .fill("10");
  await confirm.getByRole("button", { name: "Sahkan harga" }).click();
  await expect(page.getByLabel("Perkara 1")).toHaveValue("Ikan kembung 1kg");
  await expect(page.getByLabel("Perkara 2")).toHaveValue("Penghantaran");
  await expect(page.locator('input[name="items.1.unit_price"]')).toHaveValue("10");
  await page.locator('input[name="items.0.quantity"]').fill("5");
  await expect(page.getByText("RM 100.00").last()).toBeVisible(); // 5 x 18 + 10
});
