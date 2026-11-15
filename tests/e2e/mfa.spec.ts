import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { ADMIN, login } from "./helpers";

const DB = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function base32Decode(s: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
}
function totp(secret: string) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

test("Super Admin must enrol and verify TOTP MFA before reaching the admin panel", async ({ page }) => {
  const db = new Client({ connectionString: DB });
  await db.connect();
  // enable the production setting (the dev seed disables it) and start from no factors
  await db.query(`update public.system_settings set value = 'true' where key = 'admin_mfa_required'`);
  await db.query(`delete from auth.mfa_factors where user_id = (select id from auth.users where email = $1)`, [ADMIN.email]);
  try {
    await login(page, ADMIN);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/mfa$/);
    await expect(page.getByAltText("Kod QR MFA")).toBeVisible();
    // data endpoints are also closed at AAL1
    expect((await page.request.get("/api/eksport/ahli")).status()).toBe(403);

    const secret = (await page.locator("p.font-mono").textContent())!.trim();
    await page.getByLabel("Kod MFA").fill("000000");
    await page.getByRole("button", { name: "Sahkan" }).click();
    await expect(page.getByText("Kod tidak sah")).toBeVisible();
    await page.getByLabel("Kod MFA").fill(totp(secret));
    await page.getByRole("button", { name: "Sahkan" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Papan pemuka" })).toBeVisible();
  } finally {
    await db.query(`update public.system_settings set value = 'false' where key = 'admin_mfa_required'`);
    await db.query(`delete from auth.mfa_factors where user_id = (select id from auth.users where email = $1)`, [ADMIN.email]);
    await db.end();
  }
});
