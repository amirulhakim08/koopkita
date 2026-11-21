# KoopKITA V1.0 — Development progress

Last updated: 2026-11-19

Legend: ✅ implemented and tested · 🟡 implemented, partially tested · ⏳ not started / outstanding

## Test summary (latest run)

| Suite | Command | Result |
| --- | --- | --- |
| Unit | `npm run test:unit` | ✅ 25 / 25 |
| SQL integration (real migrations on PostgreSQL 16, RLS as `anon`/`authenticated`/`service_role`) | `npm run test:integration` | ✅ 50 / 50 |
| E2E (Playwright, production build + local Supabase stack on Postgres 17, real GoTrue/Storage/Mailpit) | `npm run test:e2e` | ✅ 14 / 14 (desktop + Pixel 7) |
| Typecheck / lint / build | `npm run typecheck`, `npm run lint`, `npm run build` | ✅ clean |
| `supabase db lint` | | ✅ no errors (only intentional "never read variable v_admin" notes: that call exists for its authorization side effect) |

### Required test cases (spec §18)

| # | Case | Covered by |
| --- | --- | --- |
| 1 | Unapproved members cannot access protected dashboards | integration #1, e2e membership |
| 2 | Members cannot approve their own applications | integration #2 |
| 3 | Pending share payments do not increase approved capital | integration #3, e2e financial |
| 4 | Duplicate payment submissions flagged | integration #4 |
| 5 | Cattle cannot exceed seven shares | integration #5 |
| 6 | Concurrent bookings cannot reserve the same slot | integration #6 (6 parallel connections) |
| 7 | Pending sales generate no commission | integration #7 |
| 8 | 1 share = RM40 | integration #8, unit, e2e |
| 9 | 6 shares = RM240 | integration #9, unit |
| 10 | 7 shares same cattle, same member = RM300 (RM280 + RM20 entries) | integration #10, #10b, unit, e2e mobile (seed) |
| 11 | 7 shares split among members = RM280 total | integration #11, unit |
| 12 | 7 shares across different cattle ≠ RM300 | integration #12, unit |
| 13 | Repeated approval does not duplicate commission | integration #13 (5 concurrent approvals) |
| 14 | Cancelled sales reverse commission | integration #14 |
| 15 | Partial payouts update outstanding balances | integration #15, e2e financial |
| 16 | Members cannot access other members' private data | integration #16 + storage policies, e2e (404 on another member's sale) |
| 17 | Financial records cannot be silently deleted or modified | integration #17 (also as DB owner, incl. TRUNCATE) |

## Phase 1 — Project foundation ✅
- Next.js 16 + TypeScript + Tailwind 4, shadcn-style UI kit, design tokens (forest green / sage), Plus Jakarta Sans.
- Supabase server/browser clients (`@supabase/ssr`), `src/proxy.ts` session refresh, lazy env validation (Zod), `.env.example`.
- Security headers, `.gitignore` (env files excluded, `.env.example` included), GitHub Actions CI (`.github/workflows/ci.yml`).
- Files: `package.json`, `next.config.ts`, `tsconfig.json`, `src/lib/*`, `src/components/ui/*`, `vitest.config.mts`, `playwright.config.ts`.

## Phase 2 — Authentication ✅
- Registration (Zod-validated, PDPA consent), Supabase email verification (`/auth/confirm` handles PKCE code and token_hash), login, logout, forgot/reset password.
- Statuses: pending_verification → pending_approval → active / rejected / suspended. Account-status page for non-active users.
- Role-based routing (`requireActiveMember`, `requireAdmin`, `getAdminOrNull`), enforced again in the database.
- Super Admin MFA (TOTP enrol + verify at `/mfa`); the DB requires AAL2 for admin functions (`admin_mfa_required`).
- Secure provisioning: `scripts/provision-super-admin.mjs` (service role, run locally; tested against the local stack).

## Phase 3 — Membership & shares ✅
- Member profile (self-service non-sensitive fields; IC/email admin-only), admin member list/search/filter/detail/edit, approve (KITA-#### IDs), reject, suspend/reactivate.
- Share payments with direct-to-storage receipt upload, duplicate flagging, configurable min/max limits, admin approve/reject, adjustment entries, balances view.

## Phase 4 — Qurban business ✅
- Campaigns (create/edit with locks after sales, status lifecycle with member announcement), cattle (per-year codes, 7 slots each), slot grid, slot cancel/restore, cattle notes.
- Sales: campaign availability, auto-allocation, buyer and participant capture (qurban type, on behalf of), commission estimate, official bank instruction screen, reservation expiry (pg_cron + lazy), partial payments, payment verification, approve/reject/cancel, admin slot override.

## Phase 5 — Commission ✅
- Commission engine in SQL (idempotent `source_key`), separate standard and full-cattle incentive entries, reversal entries on cancellation.
- Payouts: outstanding by member, entry selection or FIFO allocation, partial payouts, bank-transfer confirmation required, optional proof upload, payout reversal, payout history (admin + member).

## Phase 6 — Reporting, notifications, PWA ✅
- Admin dashboard (all requested KPIs, leaderboard, 4 charts), member dashboard (all requested KPIs, "Tambah Jualan Korban").
- In-app notifications for every listed event plus announcements; delivery failures never roll back transactions (tested).
- 11 CSV exports (members, share capital, share payment history, campaign, cattle allocation, buyers & participants, sales, sales by member, commission, payouts, outstanding payments) with formula-injection protection; exports are audited and rate-limited.
- Audit log viewer with filters and paging.
- PWA: manifest, icons (incl. maskable), privacy-safe service worker, offline page, install instructions (`/pasang`).
- Mobile layout: bottom navigation + drawer, verified at Pixel 7 size with no horizontal overflow.

## Phase 7 — Deployment ✅ (live, iterating)
- ✅ Supabase project **mydevelopment** (`pikifjnwjpzoeqhorvpe`, ap-southeast-1 Singapore), used for KoopKITA only.
- ✅ Migrations 000001–000018 applied (schema only, **no seed data**). After each one, the full schema fingerprint (functions, columns, constraints, policies, triggers, grants) matched the tested local stack.
- ✅ Private buckets `receipts`, `payout-proofs`, `business-proofs`; public `business-logos`. The pg_cron job `koopkita-expire-reservations` was removed with the Qurban module (000018).
- ✅ Vercel project `koopkita` deployed from `main` at https://koopkita.vercel.app with the 3 public env vars.
- ✅ First Super Admin provisioned (KITA-0001).
- ✅ Security Advisors: no errors. Expected findings only:
  - WARN "authenticated can execute SECURITY DEFINER function": intentional. These functions are the API surface, and each one enforces authorization internally.
  - WARN "anon can execute SECURITY DEFINER function" on `public_document`: intentional (shared invoice/receipt links; 32-char random token, returns one document).
  - INFO "RLS enabled, no policy" on `app_private.rate_limits` and `app_private.business_counters`: intentional deny-all.
  - WARN "leaked password protection disabled": an Auth dashboard setting; see outstanding issues.
- ⏳ Owner actions in the Supabase dashboard:
  - Site URL / redirect URLs → `https://koopkita.vercel.app`
  - Custom SMTP
  - Re-enable admin MFA before onboarding real members (`admin_mfa_required` is currently **off** at the owner's request)
  - Enter the official cooperative bank account and cooperative details (reg. no, address, logo) in Tetapan

## Change log
- **2026-11-21: Projek (investment projects), profit sharing, dividend withdrawals and Wallet; Korban and Komisen retired (migration 000018, applied after PR #13 merged; production fingerprint matches local, including RLS flags).**
  - **Projek:** Super Admin sets target, minimum, step and an optional per-member maximum. Members join with multiples of the step, accept versioned terms and upload the receipt; only approved contributions count, and approved + pending never exceed the target.
  - **Profit declarations:** rate, gross profit, charges (deducted before the split, borne pro rata by members and cooperative), cooperative points (default: the part above 6%, max 1). Integer-sen largest-remainder allocations; draft → confirmed → money received; voiding with a reason.
  - **Withdrawals:** member requests reserve the amount; admin approves, the treasurer transfers outside the app, the admin records reference and receipt. Capital returns and refunds are separate.
  - **Wallet:** Modal Syer, Prestasi Bisnes, Wallet Projek. Kewangan cash book includes all project flows; new CSV reports.
  - **Removed:** Korban and Komisen pages, functions and tables (production held trial data only: 2 campaigns, 20 cattle; the Super Admin confirmed deletion).
  - Tests: unit 27/27, integration 74/74 (27 new project tests), e2e 27/27.
- **2026-11-20: quotations (Sebut Harga), loading screen, phone-width fixes (migration 000017, applied; production fingerprint matches local).**
  - **Sebut Harga:**
    - Draft → send (`QT-YYMMDDNNN`) → accepted / rejected → **Tukar ke Invois**, which copies items, scope of work and terms into an invoice draft.
    - Deposit and balance are recorded as partial payments.
    - Own tab, PDF with a "SAH n HARI" stamp, customer link, and "Salin & ubah".
    - Default terms are kept on the business profile. Quotations are not counted as sales.
  - **Loading screen:** the installed app starts on the static `/buka` page (logo and spinner), which the service worker keeps on the device, so it appears at once while the server checks the session.
  - **Phone width:** grid columns may shrink below their content. Modal Syer and admin Kempen, Kewangan and member commission pages now fit the screen. E2E checks were added.
  - Tests: unit 36/36, integration 72/72, e2e 27/27.
- **2026-11-20: catalogue hide / show / delete (migration 000016, applied; production fingerprint matches local).**
  - Each catalogue item shows its buttons directly. Hidden items have their own "Disembunyikan" section with a clear "Paparkan semula" button; before this, the button was tucked inside "Ubah" on a faded card.
  - Members can delete items they no longer sell, after a confirmation. Catalogue rows are only templates, so issued invoices and receipts are unaffected. Only the owner can delete.
  - Fixed a date test that failed between midnight and 8am Malaysian time.
  - Tests: unit 36/36, integration 68/68, e2e 22/22.
- **2026-11-19: daily document numbers (migration 000015, applied; production fingerprint matches local).**
  - New invoices and receipts are numbered `INV-YYMMDDNNN` and `RCP-YYMMDDNNN`, e.g. `INV-260125001` for the first invoice dated 25 January 2026.
  - The sequence restarts daily, separately per business and per kind. Invoices use the invoice date; receipts use the payment or sale date.
  - The 1000th document of a day grows to 4 digits instead of wrapping.
  - Issued documents keep their old numbers. The cooperative Qurban receipt is unchanged.
  - Payment receipts now list the invoice's items, with "Telah dibayar sebelum ini" and the balance after the payment.
  - Item rows are numbered (No. 1, 2, 3 …) on pages, PDFs and public links.
  - Tests: unit 36/36, integration 68/68, e2e 21/21.
- **2026-11-19: product/service catalogue + Super Admin sales report (migration 000014, applied; production fingerprint matches local).**
  - **Katalog** tab in Bisnes Saya. Each member lists their own products or services with a preferred price; the catalogue starts empty. Items are hidden, never deleted. Owner only (admin cannot see it).
  - On invoices and receipts, tapping the item field opens the catalogue. The member ticks one or more items and taps **Pilih**, then **confirms the prices** once; the items fill Perkara 1, 2 … (adding rows when needed). The catalogue price stays unchanged. "Lain-lain" lets the member type an item; ticking "Simpan ke katalog" adds it to the catalogue.
  - The quantity column is now called **Unit** (sizes go in the product name, e.g. "Ikan 1kg").
  - **Super Admin "Bisnes Ahli":**
    - Periods: this month, this year, all time, or custom dates.
    - Per business: total sales (invoices + direct sales), money received and current unpaid balance.
    - CSV export `bisnes-ahli`.
  - Tests: unit 36/36, integration 67/67, e2e 21/21.
- **2026-11-19: direct-sale receipts + customer search (migration 000013, applied; production fingerprint matches local).**
  - **Resit Jualan Langsung:** a receipt for a sale paid on the spot, with no invoice. Items, SST, payment method, optional OCR'd proof. Numbered `RCP-YYYY-NNNN` from the same sequence.
  - Stored as a paid "direct" sale that is never listed, shared or paid as an invoice. Reversing its receipt cancels the sale.
  - The customer is optional ("Pelanggan Tunai").
  - **Customer box** (invoices and receipts): search by name or phone, or add a new customer on the spot (phone optional). It is saved to the member's Pelanggan list. A phone number that already belongs to a customer is offered instead of creating a duplicate, and the server reuses it too.
  - Receipt detail page `/ahli/bisnes/resit/<id>`. The PDF and public link show the items for direct-sale receipts.
  - "Catatan lalai" renamed to "Nota tetap".
  - Tests: unit 36/36, integration 65/65, e2e 20/20.
- **2026-11-19: "Bisnes Saya" — member business invoices and receipts (migration 000012, applied; production fingerprint matches local).**
  - Business profile: name, optional SSM (format-checked), phone, e-mail, address, bank, logo (public `business-logos` bucket), optional SST.
  - Customers; invoices (draft → issue with `INV-YYYY-NNNN`, locked after issue, cancel with reason).
  - Payments with OCR'd proof (private `business-proofs` bucket) → automatic receipts `RCP-YYYY-NNNN`; partial payments; reversal.
  - Statuses: draft / issued / partially paid / paid / overdue / cancelled.
  - PDFs generated on demand with `@react-pdf/renderer`; nothing is stored as a file.
  - **Kongsi PDF** opens the device share sheet with the PDF attached, with a fallback (download / e-mail / WhatsApp / copy link) where the browser cannot share files. Also a WhatsApp button and revocable public links `/d/<token>`.
  - Super Admin "Bisnes Ahli": SSM verification and per-member suspension; aggregates only, no customer or item data.
  - Official cooperative receipt PDF for approved Qurban sales; cooperative details are set in Tetapan.
  - Tests: unit + integration 94/94 (business suite + cooperative receipt), e2e 20/20 (full business flow incl. real PDF in the share sheet, desktop fallback, public link revoke, privacy, admin SSM, cooperative receipt).
- **2026-11-17: cooperative finance + targeted notifications (migrations 000010–000011, applied).**
  - Admin-only **Kewangan Koperasi**: money in / out records per business, a mandatory reason, optional proof, and reversal-only corrections.
  - Total funds = share capital + verified Qurban payments − commission payouts + other money in − money out.
  - Combined cash book with CSV export (`buku-tunai`); the total is also on the admin dashboard.
  - Members cannot read or call any of it (RLS + `require_admin`, tested).
  - **Notifikasi Ahli**: send to all active members or to selected members, with a sent history.
  - Label changed to "Bayaran syer belum disemak".
- **2026-11-16: terminology + icon (migration 000009, applied).** "Modal saham" became "modal syer" in the UI, notifications, database messages and reports; URLs are unchanged. The piggy-bank icon was replaced with coins.
- **2026-11-16: admin approval without email verification (migration 000008, applied).** Approving an unverified applicant confirms their email so they can sign in at once.
- **2026-11-16: sales before bank setup + commission payout requests (migration 000007, applied).**
  - Sales no longer require the cooperative bank account.
  - Members request a commission transfer to a valid bank account on their profile; payouts require valid bank details.
  - Malaysian bank picker.

## Outstanding issues / next steps
- ⏳ **Owner dashboard actions** (Phase 7 above). Also consider enabling leaked-password protection (Supabase Auth, Pro plan).
- ⏳ **Transactional email** for notifications (in-app only today). The in-app notification insert is designed so that an email worker (e.g. a Supabase Edge Function on `notifications` inserts) can be added without touching financial code.
- ⏳ **Member data anonymisation procedure** for retention requests (records are never hard-deleted).
- 🟡 Login and registration throttling is per server instance (in-memory) on top of Supabase Auth limits. For stricter global limits, add Vercel WAF / Upstash.
- 🟡 Rejected applicants cannot re-apply with the same email or IC. An admin would need to handle this manually (V2: re-application flow).
- 🟡 Admin slot override is limited to sales that are not yet approved (avoids silently changing commission eligibility).
- 🟡 A Super Admin's own sales, share payments and payouts must be handled by a second Super Admin (segregation of duties). Provision at least two admins.
- 🟡 E2E tests share the seeded local database. Run `npx supabase db reset` for a clean slate; start the server with `AUTH_RATE_LIMIT_MULTIPLIER=50` so the login throttle does not trip.
- Out of scope for V1 (per spec): marketplace, tourism bookings, dividends, share withdrawals.
