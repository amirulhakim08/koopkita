import { expect, type Page } from "@playwright/test";
import path from "node:path";

export const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
export const ADMIN = { email: "admin@koopkita.test", password: "DevAdmin#2026" };
export const MEMBER1 = { email: "ahli1@koopkita.test", password: "DevAhli#2026" };
export const MEMBER2 = { email: "ahli2@koopkita.test", password: "DevAhli#2026" };
export const RECEIPT = path.join(__dirname, "fixtures/resit.png");

export async function login(page: Page, who: { email: string; password: string }) {
  await page.goto("/log-masuk");
  await page.getByLabel("E-mel").fill(who.email);
  await page.getByLabel("Kata laluan").fill(who.password);
  await page.getByRole("button", { name: "Log Masuk" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/log-masuk"));
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}

/** Latest email to `to` from the local Mailpit inbox. */
export async function latestEmail(to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const json = (await res.json()) as { messages: { ID: string }[] };
    if (json.messages?.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${json.messages[0].ID}`)).json();
      return (msg.HTML as string) || (msg.Text as string);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email for ${to}`);
}

export async function uploadReceipt(page: Page, inputIndex = 0) {
  await page.locator('input[type="file"]').nth(inputIndex).setInputFiles(RECEIPT);
  await expect(page.getByText("resit.png")).toBeVisible();
}

export const uniqueRef = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
