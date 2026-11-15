# KoopKITA V1.0

Internal cooperative management PWA for **Koperasi Industri Tani Agro Pelancongan Kedah Berhad**.

Interface language: Bahasa Melayu · Currency: MYR (stored as integer sen) · Timezone: Asia/Kuala_Lumpur

V1 covers membership registration and approval, share capital, Qurban campaigns and cattle slot allocation, Qurban sales with payment verification, the commission engine (including the full-cattle rule), manual commission payout tracking, dashboards, notifications, CSV reports and audit logs.

---

## Technology

| Layer | Choice |
| --- | --- |
| Web | Next.js 16 (App Router, `src/proxy.ts`), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui-style components (`src/components/ui`), Lucide icons, Recharts |
| Backend | Supabase Postgres, Auth (email verification, TOTP MFA), Storage (private buckets), RLS |
| Validation | Zod (client + server), plus database `CHECK` constraints and function-level validation |
| Tests | Vitest (unit + SQL integration on PostgreSQL), Playwright (E2E on a local Supabase stack) |
| Hosting | Vercel (app) + Supabase (database/auth/storage) |

> The shadcn/ui registry could not be reached from the build environment, so the components in `src/components/ui` were written by hand in the shadcn style (Radix `Slot`, `cva`, `tailwind-merge`). `components.json` is not needed.

---

## Architecture and security model

```
Browser ──(session cookie)──▶ Next.js server components / server actions ──(user JWT)──▶ Supabase
                                                                                         │
                                       RLS on every table  ◀──────────────────────────────┤
                                       SECURITY DEFINER functions for every write ◀───────┘
```

- **The database enforces the rules, not the UI.** Client roles (`anon`, `authenticated`) have **no** INSERT/UPDATE/DELETE privileges on any table. The one exception: a member may update a few non-sensitive columns of their own profile (column-level grants). Every other write goes through a `SECURITY DEFINER` function in `supabase/migrations/…_functions.sql`. Each function checks the caller's role and status, MFA level, input, idempotency key and rate limit, takes the row locks it needs, and writes an audit log entry.
- **RLS:** members can read only their own rows. Super Admins can read everything, and only with MFA (AAL2) when `admin_mfa_required` is on (the default).
- **The web app never uses the service-role key at runtime.** Every request runs as the signed-in user. The service-role key is used only by `scripts/provision-super-admin.mjs`.
- **Append-only financial history.** Triggers block `UPDATE`, `DELETE` and `TRUNCATE` on the commission ledger, payouts, payout items and audit logs, and they apply to every role, including `postgres` and `service_role`. Share transactions and payment submissions can move from `pending` to a final status exactly once. Corrections are made with adjustment or reversal entries.
- **Money** is stored as `bigint` sen everywhere. The UI shows `RM 1,234.56` and dates as `dd/mm/yyyy` (Malaysia time).
- **Concurrency:** slot allocation locks the campaign row (`SELECT … FOR UPDATE`), so concurrent bookings are serialised and overselling cannot happen. Unique constraints on `(cattle_id, slot_no)`, on `slot_no BETWEEN 1 AND 7` and on participant `slot_id` back this up.
- **Idempotency:** submissions carry a per-form UUID `idempotency_key`. Commission entries have a unique `source_key` (`std:<sale>`, `fci:<cattle>:<member>:<n>`, `rev:<entry>`), so approving a sale again cannot create duplicate commission.
- **Files:** receipts and payout proofs go into the private buckets `receipts` and `payout-proofs` (max 5 MB; JPG, PNG, WEBP or PDF). Files are uploaded straight to Storage under `<user_id>/<uuid>.<ext>`, and Storage RLS restricts that folder to its owner. Files are viewed only through `/api/fail`, which creates a 60-second signed URL using the caller's own session.
- **Privacy (Akta PDP 2010):** IC numbers and bank details live only in `profiles`, protected by RLS. The sign-up trigger removes them from auth metadata, which is embedded in JWTs. IC numbers are masked in member views and exports. Audit logs record which fields changed, not their values. Personal-data exports are rate-limited and audited. The service worker never caches authenticated pages or API responses.
- **Other protections:** security headers (`X-Frame-Options: DENY`, `nosniff`, HSTS, no `X-Powered-By`). Login and registration have an in-memory throttle on top of Supabase Auth's own limits. Database-level rate limits apply to financial submissions, sale creation, announcements and exports. Duplicate payments are detected by bank reference across share and Qurban payments, and by same amount and date for the same member; matches are flagged for review rather than silently rejected.

### Business rules implemented

| Rule | Where |
| --- | --- |
| Only approved share transactions count towards the balance | `v_share_balances`, `review_share_payment` |
| Share minimum/maximum limits are configurable | `system_settings`, `submit_share_payment` |
| Each cattle has exactly 7 slots with IDs like `KITA-2027-001` | `add_cattle`, constraints |
| Auto-allocation: one cattle when the order fits (fullest first), otherwise fill partly used cattle first; admin can override | `app_private.allocate_slots`, `admin_reassign_slot` |
| Reservations expire after N hours (default 48) without payment proof; sales already under review never auto-expire | `expire_reservations`, pg_cron every 15 minutes plus lazy expiry |
| Partial payments are recorded; approval (and commission) only when verified payments ≥ total | `submit_sale_payment`, `approve_qurban_sale` |
| RM40 per approved share | `generate_commission` (`standard` entry) |
| 7 shares of the same cattle by the same member = RM300 total (RM280 standard + RM20 `full_cattle_incentive` entry, a replacement amount, not a bonus) | `generate_commission` |
| Cancelling an approved sale reverses its commission and any dependent full-cattle incentive | `cancel_qurban_sale`, `reverse_ledger_entry` |
| A payout cannot be recorded until the admin confirms the bank transfer; partial payouts and payout reversals supported | `record_commission_payout`, `reverse_commission_payout` |
| Segregation of duties: admins cannot approve their own application, sale or share payment, or pay themselves | function checks |

---

## Project structure

```
src/
  app/                    routes (Bahasa Melayu URLs)
    (auth)/               log-masuk, daftar, status-akaun, mfa, lupa/tetapkan-kata-laluan, pasang
    (app)/ahli/…          member area
    (app)/admin/…         Super Admin area
    api/fail              signed-URL file access
    api/eksport/[report]  CSV exports
    auth/confirm          email verification / recovery callback
    manifest.ts, offline/ PWA
  components/             shell, forms, UI primitives
  features/               server actions + feature UI (auth, members, shares, qurban, commission, reports …)
  lib/                    supabase clients, auth guards, env validation, formatting, validation, csv
  types/                  row types
  proxy.ts                session refresh + optimistic redirect
supabase/
  migrations/             schema, functions, RLS, storage, export audit, scheduled jobs
  seed.sql                DEVELOPMENT-ONLY sample data (clearly labelled CONTOH/DEV)
  config.toml             local stack config (email confirmation, TOTP MFA, password policy)
scripts/provision-super-admin.mjs
tests/unit | tests/integration | tests/e2e
```

---

## Local development

Requirements: Node 22, Docker (for the local Supabase stack).

```bash
npm install
```

```bash
npx supabase start
```

`npx supabase start` applies the migrations and the dev seed. Then create `.env.local` from the values that `npx supabase status` prints:

```bash
cp .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>` and `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.

```bash
npm run dev
```

Dev accounts (local seed only): `admin@koopkita.test / DevAdmin#2026`, `ahli1@koopkita.test`, `ahli2@koopkita.test`, `ahli3@koopkita.test` (password `DevAhli#2026`), and `pemohon@koopkita.test`, who is awaiting approval. The seed turns admin MFA **off** for local convenience and uses a bank account labelled `BANK CONTOH (DEV)`. Verification emails appear in Mailpit at http://127.0.0.1:54324.

To reset the local database (destroys local data):

```bash
npx supabase db reset
```

## Testing

```bash
npm run test:unit
```

Runs the commission calculator, money and date formatting, validation and CSV tests.

```bash
npm run test:integration
```

Runs the real migrations on PostgreSQL and tests RLS, the commission engine, concurrency and immutability. It needs a PostgreSQL server; set `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`). The suite creates and drops `koopkita_*` databases on that server.

```bash
npm run build && npm run start
```

```bash
npm run test:e2e
```

E2E needs `npx supabase start` and a production build running. The tests cover sign-up, email verification, approval, shares, a sale through to commission and payout, real TOTP MFA, exports, PWA and mobile layout.

The required test cases from the specification map to `tests/integration/business-rules.test.ts` (tests are numbered `#1`–`#17`), with UI-level coverage in `tests/e2e`.

---

## Deployment (Supabase + GitHub + Vercel)

> Before you run anything against production: migrations change the production database, and `supabase/seed.sql` must **never** be run there.

1. **Create or choose the Supabase project** (a Singapore region such as `ap-southeast-1` keeps latency low for Malaysia).
2. **Apply the migrations** (not the seed):

   ```bash
   npx supabase link --project-ref <project-ref>
   ```

   ```bash
   npx supabase db push
   ```

3. **Configure Supabase Auth** (Dashboard → Authentication):
   - Email provider enabled, **Confirm email = ON**, password minimum 10+ characters with letters and digits.
   - **MFA → TOTP enabled.**
   - URL Configuration: Site URL `https://<your-domain>`; Redirect URLs `https://<your-domain>/**`.
   - SMTP: configure a transactional email provider (the built-in sender is rate-limited and not meant for production).
   - Email templates: the default "Confirm signup" link works with `/auth/confirm` (PKCE).
4. **Storage:** the buckets `receipts` and `payout-proofs` and their policies are created by the migration. Confirm that both are **private**.
5. **pg_cron:** the migration enables it and schedules `koopkita-expire-reservations` every 15 minutes. If your plan lacks pg_cron, reservations still expire lazily when new sales are made, and an admin can click "Proses tempahan tamat".
6. **Vercel:** import the GitHub repository and set the following variables (Production and Preview). Do **not** add the service-role key to Vercel.
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL=https://<your-domain>`
7. **Provision the first Super Admin** from a trusted machine:

   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/provision-super-admin.mjs --email <admin email> --name "<Nama Penuh>"
   ```

   Sign in, enrol MFA at `/mfa`, then in **Tetapan** enter the cooperative's **official** bank account details. Sales are blocked until this is done, and the system never invents bank details. Review the share limits against the by-laws.
8. **Post-deploy checks:** register a test account and verify its email. Confirm it cannot access `/ahli` until approved and that an approved member cannot open `/admin`. Run Supabase Security Advisors (Dashboard → Advisors).

## Operations notes

- Corrections: share capital is corrected with **Pelarasan** in Modal Saham; commission is corrected by cancelling the sale (automatic reversal entries); payouts are corrected by reversing them (**Balikkan**).
- Refunds of customer money for rejected or cancelled sales happen outside the system. The verified amounts are recorded in the audit log entry.
- Data retention: profiles and financial records are never hard-deleted (financial record-keeping obligations). Anonymising a departed member's personal data is a planned admin procedure (see PROGRESS.md).
