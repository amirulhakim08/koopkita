import { expect, test } from "@playwright/test";
import { ADMIN, latestEmail, login, logout } from "./helpers";

test("register → verify email → pending → admin approval → member dashboard", async ({ page }) => {
  const stamp = Date.now();
  const email = `e2e-${stamp}@koopkita.test`;
  const ic = `9505050${String(stamp).slice(-5)}`;
  const password = "UjianE2e#2026";

  await page.goto("/daftar");
  await page.getByLabel("Nama penuh (seperti dalam MyKad)").fill("Pengguna Ujian E2E");
  await page.getByLabel("No. Kad Pengenalan").fill(ic);
  await page.getByLabel("No. telefon").fill("0129876543");
  await page.getByLabel("Alamat").fill("No 9, Jalan Ujian, Alor Setar");
  await page.getByLabel("Poskod").fill("05400");
  await page.getByLabel("E-mel").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#confirm_password").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Hantar Permohonan" }).click();
  await expect(page).toHaveURL(/\/daftar\/semak-emel/);

  // unverified users cannot log in
  await page.goto("/log-masuk");
  await page.getByLabel("E-mel").fill(email);
  await page.getByLabel("Kata laluan").fill(password);
  await page.getByRole("button", { name: "Log Masuk" }).click();
  await expect(page.getByText("Akaun anda belum diaktifkan")).toBeVisible();

  // click the verification link from the local Mailpit inbox
  const html = await latestEmail(email);
  const link = html.match(/href="([^"]*verify[^"]*)"/)?.[1]?.replace(/&amp;/g, "&");
  expect(link).toBeTruthy();
  await page.goto(link!);
  await expect(page).toHaveURL(/\/status-akaun/);
  await expect(page.getByText("Permohonan sedang disemak")).toBeVisible();

  // pending users cannot reach member or admin areas
  await page.goto("/ahli");
  await expect(page).toHaveURL(/\/status-akaun/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/status-akaun/);

  // Super Admin approves
  await logout(page);
  await login(page, ADMIN);
  await page.goto("/admin/ahli?status=pending_approval");
  await page.getByRole("link", { name: "Pengguna Ujian E2E" }).first().click();
  await expect(page.getByText(ic.slice(0, 6))).toBeVisible(); // full IC visible to admin
  await page.getByRole("button", { name: "Luluskan & beri No. Ahli" }).click();
  await expect(page.getByText("Ahli diluluskan.")).toBeVisible();

  // member can now log in and sees a KITA-#### membership ID
  await logout(page);
  await login(page, { email, password });
  await expect(page).toHaveURL(/\/ahli$/);
  await expect(page.getByText(/KITA-\d{4}/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Tambah Jualan Korban" }).first()).toBeVisible();
  // and still cannot open the admin panel
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/ahli$/);
});

test("Super Admin approval activates an applicant who never verified their email", async ({ page }) => {
  const stamp = Date.now();
  const email = `tanpa-sah-${stamp}@koopkita.test`;
  const password = "UjianE2e#2026";
  await page.goto("/daftar");
  await page.getByLabel("Nama penuh (seperti dalam MyKad)").fill("Pemohon Tanpa Pengesahan");
  await page.getByLabel("No. Kad Pengenalan").fill(`9606060${String(stamp).slice(-5)}`);
  await page.getByLabel("No. telefon").fill("0128887777");
  await page.getByLabel("Alamat").fill("No 7, Jalan Ujian, Jitra");
  await page.getByLabel("Poskod").fill("06000");
  await page.getByLabel("E-mel").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#confirm_password").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Hantar Permohonan" }).click();
  await expect(page).toHaveURL(/\/daftar\/semak-emel/);

  await login(page, ADMIN);
  await page.goto("/admin/ahli?status=menunggu");
  await page.getByRole("link", { name: "Pemohon Tanpa Pengesahan" }).first().click();
  await expect(page.getByText("akan mengesahkan e-mel secara automatik")).toBeVisible();
  await page.getByRole("button", { name: "Luluskan & beri No. Ahli" }).click();
  await expect(page.getByText("Ahli diluluskan.")).toBeVisible();

  await logout(page);
  await login(page, { email, password }); // no email link was ever clicked
  await expect(page).toHaveURL(/\/ahli$/);
  await expect(page.getByText(/KITA-\d{4}/).first()).toBeVisible();
});
