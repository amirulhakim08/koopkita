import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { Client } from "pg";
import { ADMIN, login, logout } from "./helpers";

const DB = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const member = (n: number) => ({ email: `ahli${n}@koopkita.test`, password: "DevAhli#2026" });
const MEET = "https://meet.google.com/abc-defg-hij";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());

test("board meeting: 10 invitees → notification → Utama card → code 31234 → Hadir → grace period → Tidak Hadir → PDF, Excel, share", async ({ page }) => {
  const title = `Mesyuarat Ahli Lembaga ${Date.now()}`;
  const db = new Client({ connectionString: DB });
  await db.connect();
  try {
    const { rows: board } = await db.query(
      `select id, full_name, membership_id from public.profiles where email = any($1) order by member_no`,
      [Array.from({ length: 10 }, (_, i) => `ahli${i + 1}@koopkita.test`)]);
    expect(board).toHaveLength(10);

    // 1–2. admin creates the meeting and picks 10 members by searching
    await login(page, ADMIN);
    await page.goto("/admin/mesyuarat/baharu");
    await page.getByLabel("Tajuk mesyuarat").fill(title);
    await page.getByLabel("Tarikh").fill(today());
    await page.getByText("Online", { exact: true }).click();
    await page.getByLabel("Pautan mesyuarat (Google Meet, Zoom atau Teams)").fill(MEET);
    await expect(page.getByText("Dikesan: Google Meet")).toBeVisible();
    await page.getByText("Ahli Terpilih").click();
    for (const b of board) {
      await page.getByLabel("Cari ahli").fill(b.membership_id);
      await page.getByRole("list", { name: "Senarai ahli" }).getByRole("checkbox").first().check();
    }
    await page.getByLabel("Cari ahli").fill("");
    await expect(page.getByText("10 dipilih")).toBeVisible();
    await page.getByRole("button", { name: "Simpan sebagai draf" }).click();
    await page.waitForURL(/\/admin\/mesyuarat\/[0-9a-f-]{36}$/);
    const adminUrl = page.url();
    const id = adminUrl.split("/").pop()!;
    await page.getByRole("button", { name: "Terbitkan & hantar notifikasi" }).click();
    await page.getByRole("button", { name: "Ya, teruskan" }).click();
    await expect(page.getByText("Mesyuarat diterbitkan. Notifikasi dihantar kepada peserta.")).toBeVisible();

    // 3. only the 10 invitees are notified
    const { rows: notified } = await db.query(
      `select user_id from public.notifications where type = 'meeting_invited' and link = $1`, [`/ahli/mesyuarat/${id}`]);
    expect(new Set(notified.map((r) => r.user_id))).toEqual(new Set(board.map((b) => b.id)));

    // 4–5. the meeting is on Utama of an invitee; Sertai Mesyuarat opens Google Meet (not attendance)
    await logout(page);
    await login(page, member(1));
    const card = page.getByRole("region", { name: "Mesyuarat" }).locator("div.rounded-xl").filter({ hasText: title });
    await expect(card.getByText("MESYUARAT HARI INI")).toBeVisible();
    await expect(card.getByText(title)).toBeVisible();
    await expect(card.getByText(/Online — Google Meet/)).toBeVisible();
    const join = card.getByRole("link", { name: "Sertai Mesyuarat" });
    await expect(join).toHaveAttribute("href", MEET);
    await expect(join).toHaveAttribute("target", "_blank");
    // a member who was not invited does not see it
    await logout(page);
    await login(page, member(11));
    await expect(page.getByText(title)).toHaveCount(0);
    await page.goto(`/ahli/mesyuarat/${id}`);
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0); // not found for non-invitees

    // 6–7. admin opens the session and gives code 31234
    await logout(page);
    await login(page, ADMIN);
    await page.goto(adminUrl);
    await page.getByRole("button", { name: "Buka sesi kehadiran" }).click();
    await page.getByRole("button", { name: "Ya, teruskan" }).click();
    await expect(page.getByText("Sesi kehadiran dibuka. Berikan kod kepada peserta.")).toBeVisible();
    await page.getByRole("button", { name: "Tetapkan kod sendiri" }).click();
    await page.getByLabel("Kod 5 digit").fill("31234");
    await page.getByRole("button", { name: "Tetapkan", exact: true }).click();
    await expect(page.getByLabel("Kod kehadiran")).toHaveText("31234");

    // 8–9. member confirms: a wrong code is refused, the right one records Hadir
    await logout(page);
    await login(page, member(1));
    await page.goto(`/ahli/mesyuarat/${id}#hadir`);
    await page.getByLabel("Kod kehadiran (5 digit)").fill("11111");
    await page.getByRole("button", { name: "Sahkan Hadir" }).click();
    await expect(page.getByText(/Kod tidak sah. Baki percubaan: 4/).first()).toBeVisible();
    await page.getByLabel("Kod kehadiran (5 digit)").fill("31234");
    await page.getByRole("button", { name: "Sahkan Hadir" }).click();
    await expect(page.getByText("Kehadiran disahkan. Terima kasih.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Kehadiran disahkan", { exact: true })).toBeVisible();

    // 10. the others stay "Belum Mengesahkan"; the admin view shows live numbers
    await logout(page);
    await login(page, ADMIN);
    await page.goto(adminUrl);
    await expect(page.getByText("Dikemas kini secara langsung")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: board[0].full_name }).getByText("Hadir")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: board[0].full_name }).getByText("Kod")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: board[1].full_name }).getByText("Belum Mengesahkan")).toBeVisible();

    // 11. end the meeting; after the 00:01 grace period the rest become Tidak Hadir
    await page.getByRole("button", { name: "Tamatkan mesyuarat" }).click();
    await page.getByRole("button", { name: "Ya, teruskan" }).click();
    await expect(page.getByText(/Ahli masih boleh mengesahkan kehadiran sehingga 12:01 pagi/).first()).toBeVisible();
    await db.query(`update public.meetings set attendance_closes_at = now() - interval '1 minute' where id = $1`, [id]); // time passes
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: board[1].full_name }).getByText("Tidak Hadir")).toBeVisible();

    // 12. PDF and Excel
    const pdf = await page.request.get(`/api/mesyuarat/${id}/laporan?format=pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    const xlsx = await page.request.get(`/api/mesyuarat/${id}/laporan?format=xlsx`);
    expect(xlsx.status()).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await xlsx.body()) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Ringkasan Mesyuarat", "Senarai Hadir", "Senarai Tidak Hadir", "Semua Peserta Dijemput"]);
    expect(wb.getWorksheet("Senarai Hadir")!.rowCount).toBe(2); // header + 1
    expect(wb.getWorksheet("Senarai Tidak Hadir")!.rowCount).toBe(10); // header + 9
    expect(wb.getWorksheet("Semua Peserta Dijemput")!.rowCount).toBe(11);
    const pdfDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Muat Turun PDF" }).click();
    expect((await pdfDownload).suggestedFilename()).toMatch(/^Kehadiran-MSY-\d{4}-\d{3}-\d{4}-\d{2}-\d{2}\.pdf$/);

    // 13. Kongsi: desktop Chromium cannot share files, so the file is downloaded instead
    const shared = page.waitForEvent("download");
    await page.getByRole("button", { name: "Kongsi Excel" }).click();
    expect((await shared).suggestedFilename()).toMatch(/\.xlsx$/);

    // 14. the database agrees with what the app shows
    const { rows: counts } = await db.query(`select status, count(*)::int c from public.meeting_invitees where meeting_id = $1 group by status`, [id]);
    expect(Object.fromEntries(counts.map((r) => [r.status, r.c]))).toEqual({ present: 1, absent: 9 });

    // members cannot download reports
    await logout(page);
    await login(page, member(1));
    expect((await page.request.get(`/api/mesyuarat/${id}/laporan?format=pdf`)).status()).toBe(403);
  } finally {
    await db.end();
  }
});
