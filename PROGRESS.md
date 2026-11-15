# KoopKITA V1.0 — Development progress

Last updated: 2026-11-15

Legend: ✅ implemented and tested · 🟡 implemented, partially tested · ⏳ not started / outstanding

## Test summary (latest run)

| Suite | Command | Result |
| --- | --- | --- |
| Unit | `npm run test:unit` | ✅ 25 / 25 |
| SQL integration (real migrations on PostgreSQL 16, RLS as `anon`/`authenticated`/`service_role`) | `npm run test:integration` | ✅ 42 / 42 |
| E2E (Playwright, production build + local Supabase stack on Postgres 17, real GoTrue/Storage/Mailpit) | `npm run test:e2e` | ✅ 11 / 11 (desktop + Pixel 7) |
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

## Phase 7 — Deployment ⏳ (waiting on owner confirmation)
- Instructions are in README → Deployment.
- Not yet done, because each step changes production or needs credentials:
  - Apply the migrations to the production Supabase project (two projects are visible in the connected Supabase account; which one is KoopKITA's must be confirmed).
  - Configure Auth (confirm email, TOTP MFA, redirect URLs, SMTP).
  - Connect the GitHub repo to Vercel and set the environment variables.
  - Provision the Super Admin and enter the official bank account.
  - Production smoke test of auth and access control.

## Outstanding issues / next steps
- ⏳ **Production deployment** (Phase 7 above).
- ⏳ **Transactional email** for notifications (in-app only today). The in-app notification insert is designed so that an email worker (e.g. a Supabase Edge Function on `notifications` inserts) can be added without touching financial code.
- ⏳ **Member data anonymisation procedure** for retention requests (records are never hard-deleted).
- 🟡 Login and registration throttling is per server instance (in-memory) on top of Supabase Auth limits. For stricter global limits, add Vercel WAF / Upstash.
- 🟡 Rejected applicants cannot re-apply with the same email or IC. An admin would need to handle this manually (V2: re-application flow).
- 🟡 Admin slot override is limited to sales that are not yet approved (avoids silently changing commission eligibility).
- 🟡 A Super Admin's own sales, share payments and payouts must be handled by a second Super Admin (segregation of duties). Provision at least two admins.
- 🟡 E2E tests share the seeded local database. Run `npx supabase db reset` for a clean slate; the login throttle (20/IP per 15 min) can trip if the suite is run many times against one server process.
- Out of scope for V1 (per spec): marketplace, tourism bookings, dividends, share withdrawals.
