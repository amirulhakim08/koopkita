import { Client, Pool, type PoolClient } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
export const TEMPLATE_DB = "koopkita_tpl";

function urlFor(db: string) {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${db}`;
  return u.toString();
}

export async function buildTemplate() {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname like 'koopkita_%' and pid <> pg_backend_pid()`);
  const { rows } = await admin.query(`select datname from pg_database where datname like 'koopkita_%'`);
  for (const r of rows) {
    await admin.query(`alter database "${r.datname}" is_template false`).catch(() => {});
    await admin.query(`drop database if exists "${r.datname}"`);
  }
  await admin.query(`create database ${TEMPLATE_DB}`);
  await admin.end();

  const db = new Client({ connectionString: urlFor(TEMPLATE_DB) });
  await db.connect();
  const root = path.resolve(__dirname, "../..");
  await db.query(readFileSync(path.join(root, "tests/integration/supabase-stub.sql"), "utf8"));
  const migDir = path.join(root, "supabase/migrations");
  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.query(readFileSync(path.join(migDir, f), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
    }
  }
  await db.end();
}

/** Fresh database cloned from the migrated template. */
export async function freshDatabase(name: string): Promise<Pool> {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists "${name}"`);
  await admin.query(`create database "${name}" template ${TEMPLATE_DB}`);
  await admin.end();
  return new Pool({ connectionString: urlFor(name), max: 10 });
}

export type Claims = { sub?: string; role?: string; aal?: "aal1" | "aal2" };

/** Run `sql` in its own transaction as a Supabase client role with the given JWT claims. */
export async function asRole<T = Record<string, unknown>>(
  pool: Pool,
  role: "anon" | "authenticated" | "service_role",
  claims: Claims,
  sql: string,
  params: unknown[] = [],
  client?: PoolClient,
): Promise<T[]> {
  const c = client ?? (await pool.connect());
  try {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role, ...claims })]);
    await c.query(`set local role ${role}`);
    const res = await c.query(sql, params);
    await c.query("commit");
    return res.rows as T[];
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    if (!client) c.release();
  }
}

export const asUser = <T = Record<string, unknown>>(pool: Pool, uid: string, sql: string, params: unknown[] = [], aal: "aal1" | "aal2" = "aal2") =>
  asRole<T>(pool, "authenticated", { sub: uid, aal }, sql, params);

export const asService = <T = Record<string, unknown>>(pool: Pool, sql: string, params: unknown[] = []) =>
  asRole<T>(pool, "service_role", { role: "service_role" }, sql, params);

let counter = 0;
function fakeIc() {
  counter += 1;
  return `900101${String(Math.floor(Math.random() * 90) + 10)}${String(counter).padStart(4, "0")}`;
}

/** Simulates Supabase Auth sign-up (the on_auth_user_created trigger builds the profile). */
export async function signUp(pool: Pool, email: string, opts: { confirmed?: boolean; meta?: Record<string, unknown> } = {}) {
  const meta = { full_name: `Ahli Ujian ${email.split("@")[0]}`, phone: "0123456789", ic_number: fakeIc(), state: "Kedah", postcode: "05000",
    bank_name: "Maybank", bank_account_no: "112233445566", bank_account_holder: "Ahli Ujian", ...opts.meta };
  const { rows } = await pool.query(
    `insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3) returning id`,
    [email, meta, opts.confirmed === false ? null : new Date()],
  );
  return rows[0].id as string;
}

export async function confirmEmail(pool: Pool, uid: string) {
  await pool.query(`update auth.users set email_confirmed_at = now() where id = $1`, [uid]);
}

export async function createAdmin(pool: Pool, email = "admin@kita.test") {
  const id = await signUp(pool, email);
  await asService(pool, `select public.provision_super_admin($1)`, [email]);
  return id;
}

export async function createActiveMember(pool: Pool, adminId: string, email: string) {
  const id = await signUp(pool, email);
  await asUser(pool, adminId, `select public.approve_member($1, null)`, [id]);
  return id;
}

export async function configureBank(pool: Pool, adminId: string) {
  await asUser(pool, adminId, `select public.update_system_setting('coop_bank_account_no', '"0000000000 (UJIAN)"'::jsonb)`);
  await asUser(pool, adminId, `select public.update_system_setting('coop_bank_name', '"Bank Ujian"'::jsonb)`);
}

let idem = 0;
export const key = (p = "k") => `${p}-${Date.now()}-${++idem}-${Math.random().toString(36).slice(2)}`;

type ProjectOpts = { target_sen?: number; min_sen?: number; step_sen?: number; max_per_member_sen?: number | null; name?: string };

/** Super Admin creates and publishes a project (defaults: RM20,000 target, RM500 minimum and step). */
export async function createOpenProject(pool: Pool, adminId: string, opts: ProjectOpts = {}) {
  const data = {
    name: opts.name ?? `Pelaburan Ujian ${++idem}`, partner: "KOPSYA", category: "pelaburan",
    target_sen: opts.target_sen ?? 2000000, min_sen: opts.min_sen ?? 50000, step_sen: opts.step_sen ?? 50000,
    max_per_member_sen: opts.max_per_member_sen ?? null, duration_months: 12,
    terms: "Terma ujian: modal tidak dijamin.", risk_disclosure: "Pelaburan berisiko; pulangan lepas bukan jaminan.",
  };
  const [{ id }] = await asUser<{ id: string }>(pool, adminId, `select public.save_project(null, $1) as id`, [data]);
  await asUser(pool, adminId, `select public.publish_project($1)`, [id]);
  return id;
}

/** Member submits a contribution with a receipt; returns the participation id. */
export async function joinProject(pool: Pool, memberId: string, projectId: string, amountSen: number, ref = `PRJ-${key()}`) {
  const [{ v }] = await pool.query(`select terms_version v from public.projects where id = $1`, [projectId]).then((r) => r.rows);
  const [{ id }] = await asUser<{ id: string }>(
    pool, memberId, `select public.join_project($1, $2, current_date, $3, $4, $5, $6) as id`,
    [projectId, amountSen, ref, `${memberId}/prj-${++idem}.pdf`, v, key("join")],
  );
  return id;
}

/** Contribution submitted and approved. */
export async function invest(pool: Pool, adminId: string, memberId: string, projectId: string, amountSen: number) {
  const id = await joinProject(pool, memberId, projectId, amountSen);
  await asUser(pool, adminId, `select public.review_project_participation($1, true, null)`, [id]);
  return id;
}
