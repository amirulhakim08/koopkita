#!/usr/bin/env node
/**
 * Securely provision the initial KoopKITA Super Admin.
 *
 * Usage (run from a trusted machine, never from the browser):
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role or secret key> \
 *   node scripts/provision-super-admin.mjs --email admin@example.com --name "Nama Penuh"
 *
 * The password is read from SUPER_ADMIN_PASSWORD or prompted (input hidden).
 * The service-role key is used only by this script and must never be exposed
 * to the browser, committed to Git or added to Vercel as a NEXT_PUBLIC_ variable.
 * After provisioning, sign in and enrol MFA (TOTP) at /mfa.
 */
import { createClient } from "@supabase/supabase-js";
import readline from "node:readline";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : "*");
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = arg("email");
const fullName = arg("name") ?? "Super Admin";

if (!url || !key || !email) {
  console.error("Diperlukan: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY dan --email <e-mel>");
  process.exit(1);
}

const password = process.env.SUPER_ADMIN_PASSWORD ?? (await promptHidden("Kata laluan Super Admin: "));
if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
  console.error("Kata laluan mesti sekurang-kurangnya 12 aksara dengan huruf besar, huruf kecil dan nombor.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { error: createErr } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});
if (createErr && !/already|registered|exists/i.test(createErr.message)) {
  console.error("Gagal mencipta pengguna:", createErr.message);
  process.exit(1);
}
if (createErr) console.log("Pengguna sudah wujud — menaik taraf kepada Super Admin.");

const { data, error } = await supabase.rpc("provision_super_admin", { p_email: email });
if (error) {
  console.error("Gagal menyediakan Super Admin:", error.message);
  process.exit(1);
}
console.log(`✔ Super Admin disediakan: ${email} (${data})`);
console.log("Seterusnya: log masuk dan daftar MFA (TOTP) di /mfa sebelum menggunakan panel admin.");
