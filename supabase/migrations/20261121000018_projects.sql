-- =============================================================================
-- KoopKITA V1.0 — Investment projects (Projek), profit sharing and dividend
-- withdrawals. Removes the Qurban and commission modules.
--
-- 1. Qurban (Korban) and commission (Komisen) are retired. The production data
--    was trial data only and the Super Admin confirmed its deletion, so the
--    tables, functions, views, policies and the reservation cron job go away.
--
-- 2. Projects. The Super Admin creates a project (target, minimum, step,
--    optional maximum per member) and publishes it. Every contribution must be
--    a multiple of the step and a member's total must reach the minimum.
--    Members pay the cooperative by bank transfer and upload the receipt; only
--    contributions approved by the Super Admin count as capital. Pending plus
--    approved contributions can never exceed the target (the project row is
--    locked for every check). The app only records: investing, collecting
--    profit and paying members all happen outside the app.
--
--    Status: draft -> open -> full -> active -> matured -> completed
--            (draft/open/full -> cancelled)
--
-- 3. Profit declarations. Per period the Super Admin enters the rate announced
--    by the partner (e.g. 10%), the gross profit, any charges deducted (e.g. an
--    admin fee) and the cooperative's share in percentage points. Default:
--    the part of the rate above 6%, at most 1 point (6.5% -> 0.5 point,
--    10% -> 1 point). Money is split in integer sen by the largest-remainder
--    method, so the allocations always add up to the distributable profit.
--    A declaration is a draft until confirmed; after that it is frozen. A
--    member's dividend becomes available for withdrawal only once the Super
--    Admin confirms the money was received. Corrections void the declaration
--    (with a reason) while nothing of it has been withdrawn.
--
-- 4. Withdrawals. A member requests (part of) the available dividend of a
--    project; the amount is reserved at once. The Super Admin approves or
--    rejects, passes it to the treasurer outside the app, and records the
--    transfer with its reference and receipt. Rejected or cancelled requests
--    release the amount. Capital is never withdrawn this way: capital returns
--    and refunds are separate records.
--
-- 5. Kewangan: the cash book and fund summary now include project capital,
--    money sent to the partner, profit received, dividends paid, capital
--    received back and capital returned to members.
-- =============================================================================

-- 1. Retire Qurban and commission ---------------------------------------------

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      perform cron.unschedule('koopkita-expire-reservations');
    exception when others then
      raise notice 'cron job not removed: %', sqlerrm;
    end;
  end if;
end $$;

drop policy if exists "payout-proofs: admin or payee can read" on storage.objects;

drop view if exists public.v_commission_summary;
drop view if exists public.v_campaign_progress;


drop table public.commission_payout_requests;
drop table public.commission_payout_items;
drop table public.commission_payouts;
drop table public.commission_ledger;
drop table public.payment_submissions;
drop table public.qurban_participants;
drop table public.cattle_slots;
drop table public.qurban_sales;
drop table public.buyers;
drop table public.cattle;
drop table public.campaigns;
drop sequence if exists public.sale_no_seq;
drop sequence if exists public.payout_no_seq;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'app_private')
       and p.proname in (
         'allocate_slots', 'expire_reservations', 'generate_commission', 'release_sale_slots',
         'reverse_ledger_entry', 'settle_payout_request', 'payout_requires_bank', 'guard_sale',
         'add_cattle', 'admin_reassign_slot', 'approve_qurban_sale', 'cancel_payout_request',
         'cancel_qurban_sale', 'coop_sale_receipt', 'create_qurban_sale', 'record_commission_payout',
         'reject_payout_request', 'reject_qurban_sale', 'request_commission_payout',
         'reverse_commission_payout', 'review_sale_payment', 'save_campaign', 'set_campaign_status',
         'set_slot_cancelled', 'submit_sale_payment', 'update_cattle_notes', 'expire_stale_reservations')
  loop
    execute 'drop function ' || r.sig::text;
  end loop;
end $$;

delete from public.system_settings where key = 'reservation_expiry_hours';

-- Duplicate detection now only looks at share payments and project contributions.
create or replace function app_private.find_duplicate_payment(
  p_ref text, p_amount_sen bigint, p_payment_date date, p_member_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ref text := lower(btrim(p_ref));
begin
  if exists (select 1 from public.share_transactions
              where lower(btrim(transaction_ref)) = v_ref and status <> 'rejected')
     or exists (select 1 from public.project_participations
              where lower(btrim(transaction_ref)) = v_ref and status <> 'rejected') then
    return 'Rujukan transaksi bank yang sama telah dihantar sebelum ini.';
  end if;
  if exists (select 1 from public.share_transactions
              where member_id = p_member_id and txn_type = 'payment' and status <> 'rejected'
                and amount_sen = p_amount_sen and payment_date = p_payment_date)
     or exists (select 1 from public.project_participations
              where member_id = p_member_id and status <> 'rejected'
                and amount_sen = p_amount_sen and payment_date = p_payment_date) then
    return 'Bayaran dengan jumlah dan tarikh yang sama telah dihantar oleh ahli ini.';
  end if;
  return null;
end;
$$;

-- Manual cash-book entries: "korban" is gone, investments get their own line.
alter table public.coop_ledger_entries drop constraint coop_ledger_entries_business_check;
alter table public.coop_ledger_entries add constraint coop_ledger_entries_business_check
  check (business in ('umum', 'pelaburan', 'pertanian', 'pelancongan', 'lain_lain'));

-- 2. Projects -----------------------------------------------------------------

create table app_private.project_counters (
  year     integer primary key,
  last_no  integer not null default 0
);

create sequence public.project_withdrawal_no_seq start 1;

create table public.projects (
  id                           uuid primary key default gen_random_uuid(),
  code                         text not null unique,
  name                         text not null check (char_length(name) between 3 and 150),
  partner                      text not null check (char_length(partner) between 2 and 150),
  category                     text not null default 'pelaburan'
                                 check (category in ('pelaburan', 'pertanian', 'penternakan', 'perdagangan', 'lain_lain')),
  description                  text check (description is null or char_length(description) <= 4000),
  risk_disclosure              text check (risk_disclosure is null or char_length(risk_disclosure) <= 4000),
  terms                        text check (terms is null or char_length(terms) <= 8000),
  terms_version                integer not null default 1 check (terms_version >= 1),
  document_path                text,
  target_sen                   bigint not null check (target_sen > 0),
  min_sen                      bigint not null check (min_sen > 0),
  step_sen                     bigint not null check (step_sen > 0),
  max_per_member_sen           bigint check (max_per_member_sen is null or max_per_member_sen > 0),
  open_date                    date,
  close_date                   date,
  duration_months              integer check (duration_months is null or duration_months between 1 and 600),
  maturity_date                date,
  coop_threshold_bp            integer not null default 600 check (coop_threshold_bp between 0 and 100000),
  coop_cap_bp                  integer not null default 100 check (coop_cap_bp between 0 and 100000),
  status                       text not null default 'draft'
                                 check (status in ('draft', 'open', 'full', 'active', 'matured', 'completed', 'cancelled')),
  published_at                 timestamptz,
  invested_on                  date,
  invested_sen                 bigint check (invested_sen is null or invested_sen > 0),
  investment_ref               text check (investment_ref is null or char_length(investment_ref) <= 100),
  investment_proof_path        text,
  matured_on                   date,
  capital_received_sen         bigint check (capital_received_sen is null or capital_received_sen >= 0),
  capital_received_ref         text check (capital_received_ref is null or char_length(capital_received_ref) <= 100),
  capital_received_proof_path  text,
  completed_at                 timestamptz,
  cancelled_at                 timestamptz,
  cancel_reason                text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  created_by                   uuid not null references public.profiles (id),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  check (min_sen <= target_sen),
  check (max_per_member_sen is null or max_per_member_sen >= min_sen),
  check (open_date is null or close_date is null or close_date >= open_date),
  check (status not in ('active', 'matured', 'completed') or (invested_on is not null and invested_sen is not null)),
  check (status not in ('matured', 'completed') or matured_on is not null),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index projects_status_idx on public.projects (status, created_at desc);

create trigger trg_projects_updated_at
before update on public.projects
for each row execute function app_private.set_updated_at();

-- Projects may be deleted only while still a draft.
create or replace function app_private.guard_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'IMMUTABLE_RECORD: project % is published and cannot be deleted', old.code using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and (
       new.target_sen <> old.target_sen or new.min_sen <> old.min_sen or new.step_sen <> old.step_sen
       or new.max_per_member_sen is distinct from old.max_per_member_sen
       or new.coop_threshold_bp <> old.coop_threshold_bp or new.coop_cap_bp <> old.coop_cap_bp) then
    raise exception 'IMMUTABLE_RECORD: funding rules of project % are fixed once published', old.code using errcode = 'P0001';
  end if;
  if old.invested_on is not null and (new.invested_on is distinct from old.invested_on
       or new.invested_sen is distinct from old.invested_sen) then
    raise exception 'IMMUTABLE_RECORD: the investment of project % is already recorded', old.code using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_projects_guard
before update or delete on public.projects
for each row execute function app_private.guard_project();

-- Contributions (one row per payment). Reviewed exactly once.
create table public.project_participations (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete restrict,
  member_id          uuid not null references public.profiles (id) on delete restrict,
  amount_sen         bigint not null check (amount_sen > 0),
  payment_date       date not null,
  transaction_ref    text not null check (char_length(transaction_ref) between 3 and 100),
  receipt_path       text not null,
  terms_version      integer not null,
  terms_accepted_at  timestamptz not null,
  duplicate_flag     boolean not null default false,
  duplicate_reason   text,
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by        uuid references public.profiles (id),
  reviewed_at        timestamptz,
  review_notes       text check (review_notes is null or char_length(review_notes) <= 1000),
  idempotency_key    text not null unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((status = 'pending') = (reviewed_at is null))
);
create index project_participations_project_idx on public.project_participations (project_id, status);
create index project_participations_member_idx on public.project_participations (member_id, created_at desc);
create index project_participations_ref_idx on public.project_participations (lower(transaction_ref));

create trigger trg_project_participations_updated_at
before update on public.project_participations
for each row execute function app_private.set_updated_at();

create trigger trg_project_participations_guard
before update or delete on public.project_participations
for each row execute function app_private.guard_reviewable();

-- Profit declarations per period.
create table public.project_profit_declarations (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete restrict,
  period_label     text not null check (char_length(period_label) between 2 and 60),
  period_start     date,
  period_end       date,
  announced_on     date not null,
  rate_bp          integer not null check (rate_bp between 0 and 100000),
  gross_sen        bigint not null check (gross_sen >= 0),
  fee_sen          bigint not null default 0 check (fee_sen >= 0),
  fee_description  text check (fee_description is null or char_length(fee_description) <= 200),
  coop_rate_bp     integer not null check (coop_rate_bp >= 0),
  capital_sen      bigint,
  member_total_sen bigint,
  coop_total_sen   bigint,
  document_path    text,
  notes            text check (notes is null or char_length(notes) <= 1000),
  status           text not null default 'draft' check (status in ('draft', 'declared', 'received', 'voided')),
  declared_at      timestamptz,
  declared_by      uuid references public.profiles (id),
  received_on      date,
  received_at      timestamptz,
  received_by      uuid references public.profiles (id),
  voided_at        timestamptz,
  voided_by        uuid references public.profiles (id),
  void_reason      text check (void_reason is null or char_length(void_reason) <= 500),
  created_by       uuid not null references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (fee_sen <= gross_sen),
  check (coop_rate_bp <= rate_bp),
  check (period_start is null or period_end is null or period_end >= period_start),
  check (status = 'draft' or (declared_at is not null and capital_sen is not null
                              and member_total_sen is not null and coop_total_sen is not null)),
  check ((received_at is null) = (received_on is null)),
  check (status <> 'received' or received_at is not null),
  check ((status = 'voided') = (voided_at is not null))
);
create unique index project_profit_declarations_period_key
  on public.project_profit_declarations (project_id, lower(btrim(period_label))) where status <> 'voided';
create index project_profit_declarations_project_idx on public.project_profit_declarations (project_id, announced_on desc);

create trigger trg_project_profit_declarations_updated_at
before update on public.project_profit_declarations
for each row execute function app_private.set_updated_at();

create or replace function app_private.guard_profit_declaration()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'IMMUTABLE_RECORD: confirmed profit declarations cannot be deleted' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  if old.status = 'voided'
     or (old.status = 'received' and new.status <> 'voided')
     or (old.status = 'declared' and new.status not in ('declared', 'received', 'voided')) then
    raise exception 'IMMUTABLE_RECORD: profit declaration % is final (%)', old.id, old.status using errcode = 'P0001';
  end if;
  if new.rate_bp <> old.rate_bp or new.gross_sen <> old.gross_sen or new.fee_sen <> old.fee_sen
     or new.coop_rate_bp <> old.coop_rate_bp or new.capital_sen is distinct from old.capital_sen
     or new.member_total_sen is distinct from old.member_total_sen
     or new.coop_total_sen is distinct from old.coop_total_sen
     or new.project_id <> old.project_id or new.period_label <> old.period_label then
    raise exception 'IMMUTABLE_RECORD: confirmed profit declarations cannot be edited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_project_profit_declarations_guard
before update or delete on public.project_profit_declarations
for each row execute function app_private.guard_profit_declaration();

-- Each member's share of a confirmed declaration. Append-only.
create table public.project_profit_allocations (
  id              uuid primary key default gen_random_uuid(),
  declaration_id  uuid not null references public.project_profit_declarations (id) on delete restrict,
  project_id      uuid not null references public.projects (id) on delete restrict,
  member_id       uuid not null references public.profiles (id) on delete restrict,
  capital_sen     bigint not null check (capital_sen > 0),
  amount_sen      bigint not null check (amount_sen >= 0),
  coop_sen        bigint not null check (coop_sen >= 0),
  created_at      timestamptz not null default now(),
  unique (declaration_id, member_id)
);
create index project_profit_allocations_member_idx on public.project_profit_allocations (member_id, project_id);

create trigger trg_project_profit_allocations_immutable
before update or delete on public.project_profit_allocations
for each row execute function app_private.forbid_change();

-- Dividend withdrawal requests.
create table public.project_withdrawals (
  id                   uuid primary key default gen_random_uuid(),
  withdrawal_no        text not null unique,
  project_id           uuid not null references public.projects (id) on delete restrict,
  member_id            uuid not null references public.profiles (id) on delete restrict,
  amount_sen           bigint not null check (amount_sen > 0),
  bank_name            text not null,
  bank_account_no      text not null check (bank_account_no ~ '^[0-9]{6,20}$'),
  bank_account_holder  text not null,
  notes                text check (notes is null or char_length(notes) <= 500),
  status               text not null default 'pending'
                         check (status in ('pending', 'approved', 'paid', 'rejected', 'cancelled')),
  reviewed_by          uuid references public.profiles (id),
  reviewed_at          timestamptz,
  review_notes         text check (review_notes is null or char_length(review_notes) <= 1000),
  paid_on              date,
  transaction_ref      text check (transaction_ref is null or char_length(transaction_ref) <= 100),
  proof_path           text,
  paid_by              uuid references public.profiles (id),
  paid_at              timestamptz,
  idempotency_key      text not null unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((status = 'paid') = (paid_at is not null)),
  check (status <> 'paid' or (paid_on is not null and transaction_ref is not null and proof_path is not null))
);
create index project_withdrawals_member_idx on public.project_withdrawals (member_id, created_at desc);
create index project_withdrawals_status_idx on public.project_withdrawals (status, created_at);
create index project_withdrawals_project_idx on public.project_withdrawals (project_id);

create trigger trg_project_withdrawals_updated_at
before update on public.project_withdrawals
for each row execute function app_private.set_updated_at();

create or replace function app_private.guard_withdrawal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'IMMUTABLE_RECORD: withdrawals cannot be deleted' using errcode = 'P0001';
  end if;
  if old.status in ('paid', 'rejected', 'cancelled')
     or (old.status = 'approved' and new.status not in ('approved', 'paid', 'rejected')) then
    raise exception 'IMMUTABLE_RECORD: withdrawal % is final (%)', old.withdrawal_no, old.status using errcode = 'P0001';
  end if;
  if new.amount_sen <> old.amount_sen or new.member_id <> old.member_id or new.project_id <> old.project_id
     or new.bank_account_no <> old.bank_account_no then
    raise exception 'IMMUTABLE_RECORD: withdrawal % cannot be edited', old.withdrawal_no using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_project_withdrawals_guard
before update or delete on public.project_withdrawals
for each row execute function app_private.guard_withdrawal();

-- Capital returned to members (at maturity) and refunds (cancelled projects).
create table public.project_capital_returns (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete restrict,
  member_id        uuid not null references public.profiles (id) on delete restrict,
  kind             text not null check (kind in ('return', 'refund')),
  amount_sen       bigint not null check (amount_sen > 0),
  paid_on          date not null,
  transaction_ref  text not null check (char_length(transaction_ref) between 2 and 100),
  proof_path       text,
  notes            text check (notes is null or char_length(notes) <= 500),
  reverses_id      uuid unique references public.project_capital_returns (id),
  recorded_by      uuid not null references public.profiles (id),
  created_at       timestamptz not null default now()
);
create index project_capital_returns_project_idx on public.project_capital_returns (project_id, member_id);
create index project_capital_returns_member_idx on public.project_capital_returns (member_id);

create trigger trg_project_capital_returns_immutable
before update or delete on public.project_capital_returns
for each row execute function app_private.forbid_change();

do $$
declare
  t text;
begin
  foreach t in array array['projects', 'project_participations', 'project_profit_declarations',
                           'project_profit_allocations', 'project_withdrawals', 'project_capital_returns']
  loop
    execute format('create trigger trg_%s_no_truncate before truncate on public.%I '
                   'for each statement execute function app_private.forbid_truncate()', t, t);
  end loop;
end $$;

-- 3. Helpers --------------------------------------------------------------------

-- Default cooperative share (percentage points, in basis points): the part of
-- the rate above the threshold, at most the cap.
create or replace function app_private.default_coop_rate(p_rate_bp integer, p_threshold_bp integer, p_cap_bp integer)
returns integer
language sql
immutable
set search_path = ''
as $$ select least(greatest(p_rate_bp - p_threshold_bp, 0), p_cap_bp) $$;

-- Approved capital per member (contributions approved; capital returns are not
-- subtracted: profit periods are earned on the capital that was invested).
create or replace function app_private.project_capital(p_project_id uuid)
returns table (member_id uuid, capital_sen bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.member_id, sum(pp.amount_sen)::bigint
    from public.project_participations pp
   where pp.project_id = p_project_id and pp.status = 'approved'
   group by pp.member_id
$$;

-- Dividend available for withdrawal: allocations of received declarations
-- minus withdrawals that are pending, approved or paid.
create or replace function app_private.available_dividend(p_member_id uuid, p_project_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (select coalesce(sum(a.amount_sen), 0)
            from public.project_profit_allocations a
            join public.project_profit_declarations d on d.id = a.declaration_id
           where a.member_id = p_member_id and a.project_id = p_project_id and d.status = 'received')
       - (select coalesce(sum(w.amount_sen), 0)
            from public.project_withdrawals w
           where w.member_id = p_member_id and w.project_id = p_project_id
             and w.status in ('pending', 'approved', 'paid'))
$$;

-- 4. Project management (Super Admin) -------------------------------------------

create or replace function public.save_project(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_project public.projects%rowtype;
  v_year integer := extract(year from app_private.today_kl())::integer;
  v_no integer;
  v_id uuid;
  v_name text := btrim(coalesce(p_data ->> 'name', ''));
  v_partner text := btrim(coalesce(p_data ->> 'partner', ''));
  v_terms text := nullif(btrim(coalesce(p_data ->> 'terms', '')), '');
  v_doc text := nullif(p_data ->> 'document_path', '');
begin
  if char_length(v_name) < 3 then
    perform app_private.err('VALIDATION', 'Nama projek diperlukan.');
  end if;
  if char_length(v_partner) < 2 then
    perform app_private.err('VALIDATION', 'Nama organisasi pelaburan diperlukan.');
  end if;
  if v_doc is not null and v_doc !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,200}$' then
    perform app_private.err('VALIDATION', 'Fail dokumen tidak sah.');
  end if;

  if p_id is null then
    perform app_private.rate_limit('project_create:' || v_admin, 30, 3600);
    insert into app_private.project_counters (year, last_no) values (v_year, 1)
      on conflict (year) do update set last_no = app_private.project_counters.last_no + 1
      returning last_no into v_no;
    begin
      insert into public.projects (
        code, name, partner, category, description, risk_disclosure, terms, document_path,
        target_sen, min_sen, step_sen, max_per_member_sen, open_date, close_date, duration_months, maturity_date,
        coop_threshold_bp, coop_cap_bp, created_by)
      values (
        'PRJ-' || v_year || '-' || lpad(v_no::text, 3, '0'), v_name, v_partner,
        coalesce(nullif(p_data ->> 'category', ''), 'pelaburan'),
        nullif(btrim(coalesce(p_data ->> 'description', '')), ''),
        nullif(btrim(coalesce(p_data ->> 'risk_disclosure', '')), ''), v_terms, v_doc,
        (p_data ->> 'target_sen')::bigint, (p_data ->> 'min_sen')::bigint, (p_data ->> 'step_sen')::bigint,
        nullif(p_data ->> 'max_per_member_sen', '')::bigint,
        nullif(p_data ->> 'open_date', '')::date, nullif(p_data ->> 'close_date', '')::date,
        nullif(p_data ->> 'duration_months', '')::integer, nullif(p_data ->> 'maturity_date', '')::date,
        coalesce(nullif(p_data ->> 'coop_threshold_bp', '')::integer, 600),
        coalesce(nullif(p_data ->> 'coop_cap_bp', '')::integer, 100), v_admin)
      returning id into v_id;
    exception
      when check_violation or not_null_violation then
        perform app_private.err('VALIDATION', 'Sila semak sasaran, minimum, gandaan, had dan tarikh projek.');
      when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format then
        perform app_private.err('VALIDATION', 'Nilai projek tidak sah.');
    end;
    perform app_private.audit('project.created', 'project', v_id::text,
      jsonb_build_object('name', v_name, 'target_sen', p_data ->> 'target_sen', 'min_sen', p_data ->> 'min_sen',
                         'step_sen', p_data ->> 'step_sen', 'max_per_member_sen', p_data ->> 'max_per_member_sen'));
    return v_id;
  end if;

  select * into v_project from public.projects where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Projek tidak dijumpai.');
  end if;
  if v_project.status in ('completed', 'cancelled') then
    perform app_private.err('CONFLICT', 'Projek ini telah ditutup dan tidak boleh diubah.');
  end if;

  begin
    if v_project.status = 'draft' then
      update public.projects
         set name = v_name, partner = v_partner,
             category = coalesce(nullif(p_data ->> 'category', ''), 'pelaburan'),
             description = nullif(btrim(coalesce(p_data ->> 'description', '')), ''),
             risk_disclosure = nullif(btrim(coalesce(p_data ->> 'risk_disclosure', '')), ''),
             terms = v_terms, document_path = v_doc,
             target_sen = (p_data ->> 'target_sen')::bigint, min_sen = (p_data ->> 'min_sen')::bigint,
             step_sen = (p_data ->> 'step_sen')::bigint,
             max_per_member_sen = nullif(p_data ->> 'max_per_member_sen', '')::bigint,
             open_date = nullif(p_data ->> 'open_date', '')::date, close_date = nullif(p_data ->> 'close_date', '')::date,
             duration_months = nullif(p_data ->> 'duration_months', '')::integer,
             maturity_date = nullif(p_data ->> 'maturity_date', '')::date,
             coop_threshold_bp = coalesce(nullif(p_data ->> 'coop_threshold_bp', '')::integer, 600),
             coop_cap_bp = coalesce(nullif(p_data ->> 'coop_cap_bp', '')::integer, 100)
       where id = p_id;
    else
      -- Published: only the descriptive fields and dates. A change of terms
      -- creates a new terms version; earlier acceptances keep their version.
      update public.projects
         set name = v_name, partner = v_partner,
             category = coalesce(nullif(p_data ->> 'category', ''), category),
             description = nullif(btrim(coalesce(p_data ->> 'description', '')), ''),
             risk_disclosure = nullif(btrim(coalesce(p_data ->> 'risk_disclosure', '')), ''),
             terms = v_terms,
             terms_version = terms_version + case when v_terms is distinct from v_project.terms then 1 else 0 end,
             document_path = v_doc,
             open_date = nullif(p_data ->> 'open_date', '')::date, close_date = nullif(p_data ->> 'close_date', '')::date,
             duration_months = nullif(p_data ->> 'duration_months', '')::integer,
             maturity_date = nullif(p_data ->> 'maturity_date', '')::date
       where id = p_id;
    end if;
  exception
    when check_violation or not_null_violation then
      perform app_private.err('VALIDATION', 'Sila semak sasaran, minimum, gandaan, had dan tarikh projek.');
    when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format then
      perform app_private.err('VALIDATION', 'Nilai projek tidak sah.');
  end;

  perform app_private.audit('project.updated', 'project', p_id::text,
    jsonb_build_object('status', v_project.status,
                       'changed', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_data) k
                                    where (to_jsonb(v_project) -> k) is distinct from (p_data -> k))));
  return p_id;
end;
$$;

create or replace function public.delete_project_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_code text;
begin
  delete from public.projects where id = p_id and status = 'draft' returning code into v_code;
  if not found then
    perform app_private.err('NOT_FOUND', 'Hanya projek draf boleh dipadam.');
  end if;
  perform app_private.audit('project.draft_deleted', 'project', p_id::text, jsonb_build_object('code', v_code));
end;
$$;

create or replace function public.publish_project(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_p public.projects%rowtype;
begin
  select * into v_p from public.projects where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Projek tidak dijumpai.');
  end if;
  if v_p.status <> 'draft' then
    perform app_private.err('CONFLICT', 'Projek ini telah diterbitkan.');
  end if;
  -- Every contribution is a multiple of the step, so the minimum, the target and
  -- the maximum must be multiples too; otherwise the target could never be met.
  if v_p.min_sen % v_p.step_sen <> 0 then
    perform app_private.err('VALIDATION', 'Minimum penyertaan mesti gandaan ' || app_private.format_rm(v_p.step_sen) || '.');
  end if;
  if v_p.target_sen % v_p.step_sen <> 0 then
    perform app_private.err('VALIDATION', 'Sasaran tidak boleh dicapai: sasaran mesti gandaan ' || app_private.format_rm(v_p.step_sen) || '.');
  end if;
  if v_p.max_per_member_sen is not null and v_p.max_per_member_sen % v_p.step_sen <> 0 then
    perform app_private.err('VALIDATION', 'Had seorang ahli mesti gandaan ' || app_private.format_rm(v_p.step_sen) || '.');
  end if;
  if v_p.close_date is not null and v_p.close_date < app_private.today_kl() then
    perform app_private.err('VALIDATION', 'Tarikh tutup telah berlalu.');
  end if;
  if coalesce(char_length(v_p.terms), 0) < 10 then
    perform app_private.err('VALIDATION', 'Sila isi terma dan syarat projek sebelum diterbitkan.');
  end if;
  if coalesce(char_length(v_p.risk_disclosure), 0) < 10 then
    perform app_private.err('VALIDATION', 'Sila isi pendedahan risiko sebelum diterbitkan.');
  end if;

  update public.projects set status = 'open', published_at = now() where id = p_id;
  perform app_private.audit('project.published', 'project', p_id::text,
    jsonb_build_object('target_sen', v_p.target_sen, 'min_sen', v_p.min_sen, 'step_sen', v_p.step_sen,
                       'max_per_member_sen', v_p.max_per_member_sen));
end;
$$;

-- Manual status changes: close participation (open -> full), reopen
-- (full -> open), complete (matured -> completed) and cancel.
create or replace function public.set_project_status(p_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_p public.projects%rowtype;
  v_approved bigint;
  v_pending integer;
  r record;
begin
  select * into v_p from public.projects where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Projek tidak dijumpai.');
  end if;
  if v_p.status = p_status then
    return;
  end if;
  select coalesce(sum(amount_sen) filter (where status = 'approved'), 0),
         count(*) filter (where status = 'pending')
    into v_approved, v_pending
    from public.project_participations where project_id = p_id;

  if p_status = 'full' and v_p.status = 'open' then
    if v_approved = 0 then
      perform app_private.err('VALIDATION', 'Belum ada modal yang diluluskan.');
    end if;
    if v_pending > 0 then
      perform app_private.err('CONFLICT', 'Sila semak semua bayaran yang menunggu sebelum menutup penyertaan.');
    end if;
    update public.projects set status = 'full' where id = p_id;
  elsif p_status = 'open' and v_p.status = 'full' then
    if v_approved >= v_p.target_sen then
      perform app_private.err('CONFLICT', 'Sasaran telah dicapai; projek tidak boleh dibuka semula.');
    end if;
    update public.projects set status = 'open' where id = p_id;
  elsif p_status = 'completed' and v_p.status = 'matured' then
    update public.projects set status = 'completed', completed_at = now() where id = p_id;
  elsif p_status = 'cancelled' and v_p.status in ('draft', 'open', 'full') then
    if coalesce(char_length(btrim(p_reason)), 0) < 5 then
      perform app_private.err('VALIDATION', 'Sila nyatakan sebab pembatalan.');
    end if;
    for r in select id, member_id, amount_sen from public.project_participations
              where project_id = p_id and status = 'pending' for update loop
      update public.project_participations
         set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(), review_notes = 'Projek dibatalkan'
       where id = r.id;
    end loop;
    update public.projects set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason) where id = p_id;
    for r in select distinct member_id from public.project_participations where project_id = p_id loop
      perform app_private.notify(r.member_id, 'project_cancelled', 'Projek dibatalkan',
        v_p.name || ' telah dibatalkan. Sebab: ' || btrim(p_reason)
          || '. Modal yang telah diluluskan akan dipulangkan.', '/ahli/projek/' || p_id);
    end loop;
  else
    perform app_private.err('CONFLICT', 'Perubahan status ini tidak dibenarkan.');
  end if;

  perform app_private.audit('project.status_changed', 'project', p_id::text,
    jsonb_build_object('from', v_p.status, 'to', p_status, 'reason', p_reason, 'approved_sen', v_approved));
end;
$$;

create or replace function public.record_project_investment(
  p_id uuid, p_invested_on date, p_amount_sen bigint, p_reference text, p_proof_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_p public.projects%rowtype;
  v_approved bigint;
  r record;
begin
  select * into v_p from public.projects where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Projek tidak dijumpai.');
  end if;
  if v_p.status <> 'full' then
    perform app_private.err('CONFLICT', 'Pelaburan hanya boleh direkodkan selepas penyertaan ditutup (status Penuh).');
  end if;
  select coalesce(sum(amount_sen), 0) into v_approved
    from public.project_participations where project_id = p_id and status = 'approved';
  if p_amount_sen is null or p_amount_sen <= 0 or p_amount_sen > v_approved then
    perform app_private.err('VALIDATION', 'Jumlah dilaburkan mesti antara RM0.01 dan modal terkumpul ' || app_private.format_rm(v_approved) || '.');
  end if;
  if p_invested_on is null or p_invested_on > app_private.today_kl() then
    perform app_private.err('VALIDATION', 'Tarikh pelaburan tidak sah.');
  end if;
  if coalesce(char_length(btrim(p_reference)), 0) < 2 then
    perform app_private.err('VALIDATION', 'Rujukan pelaburan diperlukan.');
  end if;
  if p_proof_path is not null then
    perform app_private.check_own_path(p_proof_path);
  end if;

  update public.projects
     set status = 'active', invested_on = p_invested_on, invested_sen = p_amount_sen,
         investment_ref = btrim(p_reference), investment_proof_path = p_proof_path
   where id = p_id;
  perform app_private.audit('project.invested', 'project', p_id::text,
    jsonb_build_object('amount_sen', p_amount_sen, 'invested_on', p_invested_on, 'reference', btrim(p_reference)));
  for r in select distinct member_id from public.project_participations where project_id = p_id and status = 'approved' loop
    perform app_private.notify(r.member_id, 'project_invested', 'Projek telah dilaburkan',
      v_p.name || ': modal ' || app_private.format_rm(p_amount_sen) || ' telah dilaburkan dengan ' || v_p.partner || '.',
      '/ahli/projek/' || p_id);
  end loop;
end;
$$;

create or replace function public.record_project_maturity(
  p_id uuid, p_matured_on date, p_capital_received_sen bigint, p_reference text, p_proof_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_p public.projects%rowtype;
begin
  select * into v_p from public.projects where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Projek tidak dijumpai.');
  end if;
  if v_p.status <> 'active' then
    perform app_private.err('CONFLICT', 'Hanya projek aktif boleh ditandakan matang.');
  end if;
  if p_matured_on is null or p_matured_on > app_private.today_kl() or p_matured_on < v_p.invested_on then
    perform app_private.err('VALIDATION', 'Tarikh matang tidak sah.');
  end if;
  if p_capital_received_sen is null or p_capital_received_sen < 0 then
    perform app_private.err('VALIDATION', 'Jumlah modal diterima semula tidak sah.');
  end if;
  if p_proof_path is not null then
    perform app_private.check_own_path(p_proof_path);
  end if;

  update public.projects
     set status = 'matured', matured_on = p_matured_on, capital_received_sen = p_capital_received_sen,
         capital_received_ref = nullif(btrim(coalesce(p_reference, '')), ''), capital_received_proof_path = p_proof_path
   where id = p_id;
  perform app_private.audit('project.matured', 'project', p_id::text,
    jsonb_build_object('matured_on', p_matured_on, 'capital_received_sen', p_capital_received_sen,
                       'invested_sen', v_p.invested_sen, 'reference', p_reference));
end;
$$;

-- 5. Participation ---------------------------------------------------------------

create or replace function public.join_project(
  p_project_id uuid,
  p_amount_sen bigint,
  p_payment_date date,
  p_transaction_ref text,
  p_receipt_path text,
  p_terms_version integer,
  p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_existing public.project_participations%rowtype;
  v_p public.projects%rowtype;
  v_committed bigint;
  v_mine bigint;
  v_dup text;
  v_id uuid;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' then
    perform app_private.err('VALIDATION', 'Kunci idempotensi diperlukan.');
  end if;
  select * into v_existing from public.project_participations where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.member_id <> v_uid then
      perform app_private.err('CONFLICT', 'Kunci idempotensi tidak sah.');
    end if;
    return v_existing.id;
  end if;

  perform app_private.rate_limit('project_join:' || v_uid, 20, 3600);

  if p_payment_date is null or p_payment_date > app_private.today_kl()
     or p_payment_date < app_private.today_kl() - 365 then
    perform app_private.err('VALIDATION', 'Tarikh bayaran tidak sah.');
  end if;
  if coalesce(char_length(btrim(p_transaction_ref)), 0) < 3 then
    perform app_private.err('VALIDATION', 'Rujukan transaksi bank diperlukan.');
  end if;
  perform app_private.check_own_path(p_receipt_path);

  -- Lock the project: serialises every capacity check for this project.
  select * into v_p from public.projects where id = p_project_id for update;
  if not found or v_p.status = 'draft' then
    perform app_private.err('NOT_FOUND', 'Projek tidak dijumpai.');
  end if;
  if v_p.status <> 'open'
     or (v_p.open_date is not null and app_private.today_kl() < v_p.open_date)
     or (v_p.close_date is not null and app_private.today_kl() > v_p.close_date) then
    perform app_private.err('CONFLICT', 'Projek ini tidak dibuka untuk penyertaan.');
  end if;
  if p_terms_version is distinct from v_p.terms_version then
    perform app_private.err('CONFLICT', 'Terma projek telah dikemas kini. Sila baca dan setuju semula.');
  end if;
  if p_amount_sen is null or p_amount_sen <= 0 or p_amount_sen % v_p.step_sen <> 0 then
    perform app_private.err('VALIDATION', 'Jumlah mesti gandaan ' || app_private.format_rm(v_p.step_sen) || '.');
  end if;

  select coalesce(sum(amount_sen) filter (where status in ('approved', 'pending')), 0),
         coalesce(sum(amount_sen) filter (where status in ('approved', 'pending') and member_id = v_uid), 0)
    into v_committed, v_mine
    from public.project_participations where project_id = p_project_id;

  if v_mine + p_amount_sen < v_p.min_sen then
    perform app_private.err('VALIDATION', 'Minimum penyertaan ialah ' || app_private.format_rm(v_p.min_sen) || '.');
  end if;
  if v_p.max_per_member_sen is not null and v_mine + p_amount_sen > v_p.max_per_member_sen then
    perform app_private.err('VALIDATION', 'Melebihi had seorang ahli ' || app_private.format_rm(v_p.max_per_member_sen)
      || '. Baki had anda ' || app_private.format_rm(greatest(v_p.max_per_member_sen - v_mine, 0)) || '.');
  end if;
  if v_committed + p_amount_sen > v_p.target_sen then
    perform app_private.err('VALIDATION', 'Melebihi baki projek. Baki yang masih tersedia '
      || app_private.format_rm(greatest(v_p.target_sen - v_committed, 0)) || '.');
  end if;

  v_dup := app_private.find_duplicate_payment(p_transaction_ref, p_amount_sen, p_payment_date, v_uid);

  insert into public.project_participations (
    project_id, member_id, amount_sen, payment_date, transaction_ref, receipt_path,
    terms_version, terms_accepted_at, duplicate_flag, duplicate_reason, idempotency_key)
  values (
    p_project_id, v_uid, p_amount_sen, p_payment_date, btrim(p_transaction_ref), p_receipt_path,
    v_p.terms_version, now(), v_dup is not null, v_dup, p_idempotency_key)
  returning id into v_id;

  perform app_private.audit('project.participation_submitted', 'project_participation', v_id::text,
    jsonb_build_object('project_id', p_project_id, 'amount_sen', p_amount_sen, 'terms_version', v_p.terms_version,
                       'duplicate_flag', v_dup is not null));
  perform app_private.notify_admins('project_payment_submitted', 'Bayaran projek baharu',
    v_p.name || ': bayaran ' || app_private.format_rm(p_amount_sen) || ' menunggu semakan.'
      || case when v_dup is not null then ' ⚠ Disyaki pendua.' else '' end,
    '/admin/projek/' || p_project_id);
  return v_id;
end;
$$;

create or replace function public.review_project_participation(p_id uuid, p_approve boolean, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_pp public.project_participations%rowtype;
  v_p public.projects%rowtype;
  v_target text := case when p_approve then 'approved' else 'rejected' end;
  v_approved bigint;
begin
  select * into v_pp from public.project_participations where id = p_id;
  if not found then
    perform app_private.err('NOT_FOUND', 'Bayaran tidak dijumpai.');
  end if;
  -- Lock the project first, then the row (same order as join_project).
  select * into v_p from public.projects where id = v_pp.project_id for update;
  select * into v_pp from public.project_participations where id = p_id for update;
  if v_pp.status = v_target then
    return; -- idempotent repeat
  end if;
  if v_pp.status <> 'pending' then
    perform app_private.err('CONFLICT', 'Bayaran ini telah dimuktamadkan.');
  end if;
  if v_pp.member_id = v_admin then
    perform app_private.err('FORBIDDEN', 'Anda tidak boleh menyemak bayaran anda sendiri.');
  end if;
  if not p_approve and coalesce(btrim(p_notes), '') = '' then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab penolakan.');
  end if;
  if p_approve then
    if v_p.status not in ('open', 'full') then
      perform app_private.err('CONFLICT', 'Projek ini tidak lagi menerima modal.');
    end if;
    select coalesce(sum(amount_sen), 0) into v_approved
      from public.project_participations where project_id = v_p.id and status = 'approved';
    if v_approved + v_pp.amount_sen > v_p.target_sen then
      perform app_private.err('CONFLICT', 'Kelulusan ini akan melebihi sasaran projek.');
    end if;
  end if;

  update public.project_participations
     set status = v_target, reviewed_by = v_admin, reviewed_at = now(), review_notes = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_id;

  perform app_private.audit('project.participation_' || v_target, 'project_participation', p_id::text,
    jsonb_build_object('project_id', v_p.id, 'member_id', v_pp.member_id, 'amount_sen', v_pp.amount_sen, 'notes', p_notes));
  perform app_private.notify(v_pp.member_id,
    case when p_approve then 'project_payment_approved' else 'project_payment_rejected' end,
    case when p_approve then 'Bayaran projek diluluskan' else 'Bayaran projek ditolak' end,
    v_p.name || ': bayaran ' || app_private.format_rm(v_pp.amount_sen) || ' (rujukan ' || v_pp.transaction_ref || ') '
      || case when p_approve then 'telah diluluskan sebagai modal.' else 'ditolak. Sebab: ' || btrim(p_notes) end,
    '/ahli/projek/' || v_p.id);

  if p_approve and v_approved + v_pp.amount_sen = v_p.target_sen and v_p.status = 'open' then
    update public.projects set status = 'full' where id = v_p.id;
    perform app_private.audit('project.funded', 'project', v_p.id::text, jsonb_build_object('target_sen', v_p.target_sen));
    perform app_private.notify_admins('project_funded', 'Sasaran projek dicapai',
      v_p.name || ' telah mencapai sasaran ' || app_private.format_rm(v_p.target_sen) || '.', '/admin/projek/' || v_p.id);
    perform app_private.notify(m.member_id, 'project_funded', 'Projek penuh',
        v_p.name || ' telah mencapai sasaran dan ditutup untuk penyertaan.', '/ahli/projek/' || v_p.id)
       from (select distinct member_id from public.project_participations
              where project_id = v_p.id and status = 'approved') m;
  end if;
end;
$$;

-- 6. Profit declarations ----------------------------------------------------------

create or replace function public.save_profit_declaration(p_id uuid, p_project_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_p public.projects%rowtype;
  v_d public.project_profit_declarations%rowtype;
  v_rate integer := (p_data ->> 'rate_bp')::integer;
  v_coop integer;
  v_id uuid;
  v_doc text := nullif(p_data ->> 'document_path', '');
begin
  select * into v_p from public.projects where id = p_project_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Projek tidak dijumpai.');
  end if;
  if v_p.status not in ('active', 'matured') then
    perform app_private.err('CONFLICT', 'Keuntungan hanya boleh diumumkan untuk projek yang aktif atau matang.');
  end if;
  if v_rate is null or v_rate < 0 then
    perform app_private.err('VALIDATION', 'Kadar keuntungan tidak sah.');
  end if;
  v_coop := coalesce(nullif(p_data ->> 'coop_rate_bp', '')::integer,
                     app_private.default_coop_rate(v_rate, v_p.coop_threshold_bp, v_p.coop_cap_bp));
  if v_coop < 0 or v_coop > v_rate then
    perform app_private.err('VALIDATION', 'Bahagian koperasi mesti antara 0 dan kadar keuntungan.');
  end if;
  if coalesce((p_data ->> 'gross_sen')::bigint, -1) < 0 then
    perform app_private.err('VALIDATION', 'Jumlah keuntungan tidak sah.');
  end if;
  if (p_data ->> 'gross_sen')::bigint > 0 and v_rate = 0 then
    perform app_private.err('VALIDATION', 'Kadar keuntungan diperlukan.');
  end if;
  if coalesce(nullif(p_data ->> 'fee_sen', '')::bigint, 0) > (p_data ->> 'gross_sen')::bigint then
    perform app_private.err('VALIDATION', 'Potongan tidak boleh melebihi jumlah keuntungan.');
  end if;
  if coalesce(nullif(p_data ->> 'fee_sen', '')::bigint, 0) > 0
     and coalesce(char_length(btrim(p_data ->> 'fee_description')), 0) < 3 then
    perform app_private.err('VALIDATION', 'Sila nyatakan jenis potongan (cth. yuran pentadbiran).');
  end if;
  if v_doc is not null and v_doc !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,200}$' then
    perform app_private.err('VALIDATION', 'Fail dokumen tidak sah.');
  end if;

  begin
    if p_id is null then
      insert into public.project_profit_declarations (
        project_id, period_label, period_start, period_end, announced_on, rate_bp, gross_sen, fee_sen, fee_description,
        coop_rate_bp, document_path, notes, created_by)
      values (
        p_project_id, btrim(p_data ->> 'period_label'), nullif(p_data ->> 'period_start', '')::date,
        nullif(p_data ->> 'period_end', '')::date, (p_data ->> 'announced_on')::date, v_rate,
        (p_data ->> 'gross_sen')::bigint, coalesce(nullif(p_data ->> 'fee_sen', '')::bigint, 0),
        nullif(btrim(coalesce(p_data ->> 'fee_description', '')), ''), v_coop, v_doc,
        nullif(btrim(coalesce(p_data ->> 'notes', '')), ''), v_admin)
      returning id into v_id;
    else
      select * into v_d from public.project_profit_declarations where id = p_id and project_id = p_project_id for update;
      if not found then
        perform app_private.err('NOT_FOUND', 'Pengumuman tidak dijumpai.');
      end if;
      if v_d.status <> 'draft' then
        perform app_private.err('CONFLICT', 'Pengumuman yang telah disahkan tidak boleh diubah.');
      end if;
      update public.project_profit_declarations
         set period_label = btrim(p_data ->> 'period_label'), period_start = nullif(p_data ->> 'period_start', '')::date,
             period_end = nullif(p_data ->> 'period_end', '')::date, announced_on = (p_data ->> 'announced_on')::date,
             rate_bp = v_rate, gross_sen = (p_data ->> 'gross_sen')::bigint,
             fee_sen = coalesce(nullif(p_data ->> 'fee_sen', '')::bigint, 0),
             fee_description = nullif(btrim(coalesce(p_data ->> 'fee_description', '')), ''),
             coop_rate_bp = v_coop, document_path = v_doc, notes = nullif(btrim(coalesce(p_data ->> 'notes', '')), '')
       where id = p_id;
      v_id := p_id;
    end if;
  exception
    when unique_violation then
      perform app_private.err('CONFLICT', 'Tempoh ini sudah mempunyai pengumuman keuntungan.');
    when check_violation or not_null_violation then
      perform app_private.err('VALIDATION', 'Sila semak tempoh, tarikh dan jumlah keuntungan.');
    when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format then
      perform app_private.err('VALIDATION', 'Nilai pengumuman tidak sah.');
  end;

  perform app_private.audit(case when p_id is null then 'profit.draft_created' else 'profit.draft_updated' end,
    'project_profit_declaration', v_id::text,
    jsonb_build_object('project_id', p_project_id, 'rate_bp', v_rate, 'coop_rate_bp', v_coop,
                       'gross_sen', p_data ->> 'gross_sen', 'fee_sen', p_data ->> 'fee_sen'));
  return v_id;
end;
$$;

create or replace function public.delete_profit_declaration_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
begin
  delete from public.project_profit_declarations where id = p_id and status = 'draft';
  if not found then
    perform app_private.err('NOT_FOUND', 'Hanya draf boleh dipadam.');
  end if;
  perform app_private.audit('profit.draft_deleted', 'project_profit_declaration', p_id::text, '{}'::jsonb);
end;
$$;

-- Preview of the split for a draft (or the stored split once confirmed).
-- Members' share of the distributable profit (gross - charges) is
--   distributable * member_rate / rate, rounded to the nearest sen;
-- each member gets a share proportional to capital, largest remainder first.
create or replace function app_private.compute_allocations(p_declaration_id uuid)
returns table (member_id uuid, capital_sen bigint, amount_sen bigint, coop_sen bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_d public.project_profit_declarations%rowtype;
  v_total numeric;
  v_dist numeric;
  v_member_pool numeric;
  v_coop_pool numeric;
begin
  select * into v_d from public.project_profit_declarations where id = p_declaration_id;
  select coalesce(sum(c.capital_sen), 0) into v_total from app_private.project_capital(v_d.project_id) c;
  if v_total = 0 then
    return;
  end if;
  v_dist := v_d.gross_sen - v_d.fee_sen;
  v_member_pool := case when v_d.rate_bp = 0 then v_dist
                        else floor((v_dist * (v_d.rate_bp - v_d.coop_rate_bp) * 2 + v_d.rate_bp) / (2 * v_d.rate_bp)) end;
  v_coop_pool := v_dist - v_member_pool;
  return query
    with caps as (
      select c.member_id, c.capital_sen::numeric as cap from app_private.project_capital(v_d.project_id) c
    ), base as (
      select caps.member_id, caps.cap,
             floor(v_member_pool * caps.cap / v_total) as m_fl, mod(v_member_pool * caps.cap, v_total) as m_rem,
             floor(v_coop_pool * caps.cap / v_total) as c_fl, mod(v_coop_pool * caps.cap, v_total) as c_rem
        from caps
    ), ranked as (
      select base.*,
             row_number() over (order by m_rem desc, base.member_id) as m_rn,
             row_number() over (order by c_rem desc, base.member_id) as c_rn,
             v_member_pool - sum(m_fl) over () as m_left,
             v_coop_pool - sum(c_fl) over () as c_left
        from base
    )
    select ranked.member_id, ranked.cap::bigint,
           (m_fl + case when m_rn <= m_left then 1 else 0 end)::bigint,
           (c_fl + case when c_rn <= c_left then 1 else 0 end)::bigint
      from ranked;
end;
$$;

create or replace function public.preview_profit_declaration(p_id uuid)
returns table (member_id uuid, full_name text, membership_id text, capital_sen bigint, amount_sen bigint, coop_sen bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_status text;
begin
  select status into v_status from public.project_profit_declarations where id = p_id;
  if not found then
    perform app_private.err('NOT_FOUND', 'Pengumuman tidak dijumpai.');
  end if;
  if v_status = 'draft' then
    return query
      select a.member_id, p.full_name, p.membership_id, a.capital_sen, a.amount_sen, a.coop_sen
        from app_private.compute_allocations(p_id) a join public.profiles p on p.id = a.member_id
       order by a.capital_sen desc, p.full_name;
  else
    return query
      select a.member_id, p.full_name, p.membership_id, a.capital_sen, a.amount_sen, a.coop_sen
        from public.project_profit_allocations a join public.profiles p on p.id = a.member_id
       where a.declaration_id = p_id
       order by a.capital_sen desc, p.full_name;
  end if;
end;
$$;

create or replace function public.confirm_profit_declaration(p_id uuid, p_received_on date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_d public.project_profit_declarations%rowtype;
  v_p public.projects%rowtype;
  v_capital bigint;
  v_member bigint;
  v_coop bigint;
  r record;
begin
  select * into v_d from public.project_profit_declarations where id = p_id;
  if not found then
    perform app_private.err('NOT_FOUND', 'Pengumuman tidak dijumpai.');
  end if;
  select * into v_p from public.projects where id = v_d.project_id for update;
  select * into v_d from public.project_profit_declarations where id = p_id for update;
  if v_d.status <> 'draft' then
    return; -- already confirmed
  end if;
  if v_p.status not in ('active', 'matured') then
    perform app_private.err('CONFLICT', 'Projek ini tidak aktif.');
  end if;
  if p_received_on is not null and (p_received_on > app_private.today_kl() or p_received_on < v_d.announced_on - 366) then
    perform app_private.err('VALIDATION', 'Tarikh wang diterima tidak sah.');
  end if;

  insert into public.project_profit_allocations (declaration_id, project_id, member_id, capital_sen, amount_sen, coop_sen)
  select p_id, v_d.project_id, a.member_id, a.capital_sen, a.amount_sen, a.coop_sen
    from app_private.compute_allocations(p_id) a;
  select coalesce(sum(capital_sen), 0), coalesce(sum(amount_sen), 0), coalesce(sum(coop_sen), 0)
    into v_capital, v_member, v_coop
    from public.project_profit_allocations where declaration_id = p_id;
  if v_capital = 0 then
    perform app_private.err('CONFLICT', 'Projek ini belum mempunyai modal yang diluluskan.');
  end if;
  if v_member + v_coop <> v_d.gross_sen - v_d.fee_sen then
    perform app_private.err('CONFLICT', 'Jumlah agihan tidak sepadan dengan keuntungan.');
  end if;

  update public.project_profit_declarations
     set status = case when p_received_on is null then 'declared' else 'received' end,
         capital_sen = v_capital, member_total_sen = v_member, coop_total_sen = v_coop,
         declared_at = now(), declared_by = v_admin,
         received_on = p_received_on, received_at = case when p_received_on is null then null else now() end,
         received_by = case when p_received_on is null then null else v_admin end
   where id = p_id;

  perform app_private.audit('profit.declared', 'project_profit_declaration', p_id::text,
    jsonb_build_object('project_id', v_d.project_id, 'period', v_d.period_label, 'rate_bp', v_d.rate_bp,
                       'coop_rate_bp', v_d.coop_rate_bp, 'gross_sen', v_d.gross_sen, 'fee_sen', v_d.fee_sen,
                       'capital_sen', v_capital, 'member_total_sen', v_member, 'coop_total_sen', v_coop,
                       'received_on', p_received_on));
  for r in select a.member_id, a.amount_sen from public.project_profit_allocations a where a.declaration_id = p_id loop
    perform app_private.notify(r.member_id, 'profit_declared', 'Keuntungan projek diumumkan',
      v_p.name || ' (' || v_d.period_label || '): dividen anda ' || app_private.format_rm(r.amount_sen)
        || case when p_received_on is null then '. Boleh dipohon selepas wang diterima koperasi.'
                else ' kini tersedia untuk pengeluaran.' end,
      '/ahli/projek/' || v_d.project_id);
  end loop;
end;
$$;

create or replace function public.mark_profit_received(p_id uuid, p_received_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_d public.project_profit_declarations%rowtype;
  v_name text;
  r record;
begin
  select * into v_d from public.project_profit_declarations where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Pengumuman tidak dijumpai.');
  end if;
  if v_d.status = 'received' then
    return;
  end if;
  if v_d.status <> 'declared' then
    perform app_private.err('CONFLICT', 'Hanya pengumuman yang telah disahkan boleh ditanda diterima.');
  end if;
  if p_received_on is null or p_received_on > app_private.today_kl() or p_received_on < v_d.announced_on - 366 then
    perform app_private.err('VALIDATION', 'Tarikh wang diterima tidak sah.');
  end if;
  update public.project_profit_declarations
     set status = 'received', received_on = p_received_on, received_at = now(), received_by = v_admin
   where id = p_id;
  select name into v_name from public.projects where id = v_d.project_id;
  perform app_private.audit('profit.received', 'project_profit_declaration', p_id::text,
    jsonb_build_object('received_on', p_received_on, 'net_sen', v_d.gross_sen - v_d.fee_sen));
  for r in select a.member_id, a.amount_sen from public.project_profit_allocations a where a.declaration_id = p_id loop
    perform app_private.notify(r.member_id, 'profit_available', 'Dividen tersedia',
      v_name || ' (' || v_d.period_label || '): dividen ' || app_private.format_rm(r.amount_sen)
        || ' kini tersedia untuk pengeluaran.', '/ahli/wallet');
  end loop;
end;
$$;

-- Correction: void a confirmed declaration while none of it has been withdrawn.
create or replace function public.void_profit_declaration(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_d public.project_profit_declarations%rowtype;
  r record;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab pembatalan.');
  end if;
  select * into v_d from public.project_profit_declarations where id = p_id for update;
  if not found or v_d.status not in ('declared', 'received') then
    perform app_private.err('NOT_FOUND', 'Pengumuman tidak dijumpai atau tidak boleh dibatalkan.');
  end if;
  if v_d.status = 'received' then
    for r in select a.member_id, a.amount_sen from public.project_profit_allocations a where a.declaration_id = p_id loop
      perform 1 from public.profiles where id = r.member_id for update;
      if app_private.available_dividend(r.member_id, v_d.project_id) < r.amount_sen then
        perform app_private.err('CONFLICT', 'Sebahagian dividen ini telah dipohon atau dibayar. Tolak atau selesaikan permohonan pengeluaran dahulu.');
      end if;
    end loop;
  end if;
  update public.project_profit_declarations
     set status = 'voided', voided_at = now(), voided_by = v_admin, void_reason = btrim(p_reason)
   where id = p_id;
  perform app_private.audit('profit.voided', 'project_profit_declaration', p_id::text,
    jsonb_build_object('reason', btrim(p_reason), 'previous_status', v_d.status,
                       'member_total_sen', v_d.member_total_sen, 'coop_total_sen', v_d.coop_total_sen));
  for r in select a.member_id from public.project_profit_allocations a where a.declaration_id = p_id loop
    perform app_private.notify(r.member_id, 'profit_voided', 'Pengumuman keuntungan dibatalkan',
      'Pengumuman ' || v_d.period_label || ' telah dibatalkan untuk pembetulan. Sebab: ' || btrim(p_reason),
      '/ahli/projek/' || v_d.project_id);
  end loop;
end;
$$;

-- 7. Withdrawals --------------------------------------------------------------------

create or replace function public.request_dividend_withdrawal(
  p_project_id uuid, p_amount_sen bigint, p_notes text, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_profile public.profiles%rowtype;
  v_existing public.project_withdrawals%rowtype;
  v_available bigint;
  v_name text;
  v_id uuid;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' then
    perform app_private.err('VALIDATION', 'Kunci idempotensi diperlukan.');
  end if;
  select * into v_existing from public.project_withdrawals where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.member_id <> v_uid then
      perform app_private.err('CONFLICT', 'Kunci idempotensi tidak sah.');
    end if;
    return v_existing.id;
  end if;
  perform app_private.rate_limit('withdrawal_request:' || v_uid, 10, 3600);

  -- Serialise this member's withdrawals so the same balance cannot be used twice.
  select * into v_profile from public.profiles where id = v_uid for update;
  if not app_private.valid_bank_details(v_profile.bank_name, v_profile.bank_account_no, v_profile.bank_account_holder) then
    perform app_private.err('VALIDATION', 'Sila lengkapkan maklumat akaun bank yang sah dalam profil anda (nama bank, nombor akaun dan nama pemegang akaun).');
  end if;
  select name into v_name from public.projects where id = p_project_id;
  if not found then
    perform app_private.err('NOT_FOUND', 'Projek tidak dijumpai.');
  end if;
  v_available := app_private.available_dividend(v_uid, p_project_id);
  if p_amount_sen is null or p_amount_sen <= 0 then
    perform app_private.err('VALIDATION', 'Jumlah pengeluaran tidak sah.');
  end if;
  if p_amount_sen > v_available then
    perform app_private.err('VALIDATION', 'Melebihi dividen tersedia ' || app_private.format_rm(greatest(v_available, 0)) || '.');
  end if;

  insert into public.project_withdrawals (
    withdrawal_no, project_id, member_id, amount_sen, bank_name, bank_account_no, bank_account_holder, notes, idempotency_key)
  values (
    'PGL-' || extract(year from app_private.today_kl())::integer || '-' || lpad(nextval('public.project_withdrawal_no_seq')::text, 5, '0'),
    p_project_id, v_uid, p_amount_sen, btrim(v_profile.bank_name), v_profile.bank_account_no,
    btrim(v_profile.bank_account_holder), nullif(btrim(coalesce(p_notes, '')), ''), p_idempotency_key)
  returning id into v_id;

  perform app_private.audit('withdrawal.requested', 'project_withdrawal', v_id::text,
    jsonb_build_object('project_id', p_project_id, 'amount_sen', p_amount_sen));
  perform app_private.notify_admins('withdrawal_requested', 'Permohonan pengeluaran dividen',
    coalesce(v_profile.membership_id, '') || ' ' || v_profile.full_name || ' memohon pengeluaran '
      || app_private.format_rm(p_amount_sen) || ' (' || v_name || ').', '/admin/projek/pengeluaran');
  return v_id;
end;
$$;

create or replace function public.cancel_dividend_withdrawal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
begin
  update public.project_withdrawals
     set status = 'cancelled', reviewed_by = v_uid, reviewed_at = now(), review_notes = 'Dibatalkan oleh ahli'
   where id = p_id and member_id = v_uid and status = 'pending';
  if not found then
    perform app_private.err('NOT_FOUND', 'Permohonan tidak dijumpai atau telah diproses.');
  end if;
  perform app_private.audit('withdrawal.cancelled', 'project_withdrawal', p_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.review_dividend_withdrawal(p_id uuid, p_approve boolean, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_w public.project_withdrawals%rowtype;
  v_target text := case when p_approve then 'approved' else 'rejected' end;
begin
  select * into v_w from public.project_withdrawals where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Permohonan tidak dijumpai.');
  end if;
  if v_w.status = v_target then
    return;
  end if;
  if p_approve and v_w.status <> 'pending' then
    perform app_private.err('CONFLICT', 'Permohonan ini telah diproses.');
  end if;
  if not p_approve and v_w.status not in ('pending', 'approved') then
    perform app_private.err('CONFLICT', 'Permohonan ini telah dimuktamadkan.');
  end if;
  if v_w.member_id = v_admin then
    perform app_private.err('FORBIDDEN', 'Anda tidak boleh menyemak permohonan anda sendiri.');
  end if;
  if not p_approve and coalesce(char_length(btrim(p_notes)), 0) < 3 then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab penolakan.');
  end if;
  update public.project_withdrawals
     set status = v_target, reviewed_by = v_admin, reviewed_at = now(), review_notes = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_id;
  perform app_private.audit('withdrawal.' || v_target, 'project_withdrawal', p_id::text,
    jsonb_build_object('amount_sen', v_w.amount_sen, 'member_id', v_w.member_id, 'notes', p_notes));
  perform app_private.notify(v_w.member_id,
    case when p_approve then 'withdrawal_approved' else 'withdrawal_rejected' end,
    case when p_approve then 'Pengeluaran diluluskan' else 'Pengeluaran ditolak' end,
    v_w.withdrawal_no || ' (' || app_private.format_rm(v_w.amount_sen) || ') '
      || case when p_approve then 'diluluskan dan sedang diproses untuk pindahan bank.'
              else 'ditolak. Jumlah dikembalikan ke baki tersedia. Sebab: ' || btrim(p_notes) end,
    '/ahli/wallet');
end;
$$;

create or replace function public.record_withdrawal_payment(
  p_id uuid, p_paid_on date, p_transaction_ref text, p_proof_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_w public.project_withdrawals%rowtype;
begin
  select * into v_w from public.project_withdrawals where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Permohonan tidak dijumpai.');
  end if;
  if v_w.status = 'paid' then
    return; -- already recorded
  end if;
  if v_w.status not in ('pending', 'approved') then
    perform app_private.err('CONFLICT', 'Permohonan ini telah dimuktamadkan.');
  end if;
  if v_w.member_id = v_admin then
    perform app_private.err('FORBIDDEN', 'Anda tidak boleh merekod bayaran kepada diri sendiri.');
  end if;
  if p_paid_on is null or p_paid_on > app_private.today_kl() or p_paid_on < (v_w.created_at at time zone 'Asia/Kuala_Lumpur')::date then
    perform app_private.err('VALIDATION', 'Tarikh pindahan tidak sah.');
  end if;
  if coalesce(char_length(btrim(p_transaction_ref)), 0) < 3 then
    perform app_private.err('VALIDATION', 'Rujukan transaksi bank diperlukan.');
  end if;
  if p_proof_path is null then
    perform app_private.err('VALIDATION', 'Sila muat naik resit pindahan daripada Bendahari.');
  end if;
  perform app_private.check_own_path(p_proof_path);

  update public.project_withdrawals
     set status = 'paid', paid_on = p_paid_on, transaction_ref = btrim(p_transaction_ref), proof_path = p_proof_path,
         paid_by = v_admin, paid_at = now(),
         reviewed_by = coalesce(reviewed_by, v_admin), reviewed_at = coalesce(reviewed_at, now())
   where id = p_id;
  perform app_private.audit('withdrawal.paid', 'project_withdrawal', p_id::text,
    jsonb_build_object('amount_sen', v_w.amount_sen, 'member_id', v_w.member_id, 'paid_on', p_paid_on,
                       'reference', btrim(p_transaction_ref)));
  perform app_private.notify(v_w.member_id, 'withdrawal_paid', 'Dividen telah dibayar',
    v_w.withdrawal_no || ': ' || app_private.format_rm(v_w.amount_sen) || ' telah dipindahkan ke akaun '
      || v_w.bank_name || ' anda.', '/ahli/wallet');
end;
$$;

-- 8. Capital returns and refunds ------------------------------------------------------

-- p_items: [{member_id, amount_sen}, ...]. Kind 'return' for matured projects,
-- 'refund' for cancelled ones. Totals per member never exceed approved capital.
create or replace function public.record_capital_returns(
  p_project_id uuid, p_kind text, p_paid_on date, p_transaction_ref text, p_proof_path text,
  p_notes text, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_p public.projects%rowtype;
  v_item jsonb;
  v_member uuid;
  v_amount bigint;
  v_capital bigint;
  v_returned bigint;
  v_count integer := 0;
begin
  select * into v_p from public.projects where id = p_project_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Projek tidak dijumpai.');
  end if;
  if p_kind = 'return' and v_p.status not in ('matured', 'completed') then
    perform app_private.err('CONFLICT', 'Pemulangan modal hanya selepas projek matang.');
  end if;
  if p_kind = 'refund' and v_p.status <> 'cancelled' then
    perform app_private.err('CONFLICT', 'Bayaran balik hanya untuk projek yang dibatalkan.');
  end if;
  if p_kind not in ('return', 'refund') then
    perform app_private.err('VALIDATION', 'Jenis rekod tidak sah.');
  end if;
  if p_paid_on is null or p_paid_on > app_private.today_kl() then
    perform app_private.err('VALIDATION', 'Tarikh pindahan tidak sah.');
  end if;
  if coalesce(char_length(btrim(p_transaction_ref)), 0) < 2 then
    perform app_private.err('VALIDATION', 'Rujukan transaksi bank diperlukan.');
  end if;
  if p_proof_path is not null then
    perform app_private.check_own_path(p_proof_path);
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    perform app_private.err('VALIDATION', 'Sila masukkan sekurang-kurangnya seorang ahli.');
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_member := (v_item ->> 'member_id')::uuid;
    v_amount := (v_item ->> 'amount_sen')::bigint;
    if v_amount is null or v_amount <= 0 then
      continue;
    end if;
    select coalesce(sum(amount_sen), 0) into v_capital
      from public.project_participations where project_id = p_project_id and member_id = v_member and status = 'approved';
    select coalesce(sum(case when reverses_id is null then amount_sen else -amount_sen end), 0) into v_returned
      from public.project_capital_returns where project_id = p_project_id and member_id = v_member;
    if v_returned + v_amount > v_capital then
      perform app_private.err('VALIDATION', 'Jumlah dipulangkan melebihi modal ahli (' || app_private.format_rm(v_capital) || ').');
    end if;
    insert into public.project_capital_returns (project_id, member_id, kind, amount_sen, paid_on, transaction_ref,
                                                proof_path, notes, recorded_by)
    values (p_project_id, v_member, p_kind, v_amount, p_paid_on, btrim(p_transaction_ref), p_proof_path,
            nullif(btrim(coalesce(p_notes, '')), ''), v_admin);
    perform app_private.notify(v_member, 'capital_returned',
      case when p_kind = 'refund' then 'Bayaran balik modal' else 'Modal dipulangkan' end,
      v_p.name || ': ' || app_private.format_rm(v_amount) || ' telah dipindahkan ke akaun bank anda.',
      '/ahli/projek/' || p_project_id);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    perform app_private.err('VALIDATION', 'Tiada jumlah untuk direkodkan.');
  end if;
  perform app_private.audit('project.capital_' || p_kind, 'project', p_project_id::text,
    jsonb_build_object('count', v_count, 'paid_on', p_paid_on, 'reference', btrim(p_transaction_ref), 'items', p_items));
  return v_count;
end;
$$;

create or replace function public.reverse_capital_return(p_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_r public.project_capital_returns%rowtype;
  v_id uuid;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab pembalikan.');
  end if;
  select * into v_r from public.project_capital_returns where id = p_id for update;
  if not found or v_r.reverses_id is not null then
    perform app_private.err('NOT_FOUND', 'Rekod tidak dijumpai atau tidak boleh dibalikkan.');
  end if;
  select id into v_id from public.project_capital_returns where reverses_id = p_id;
  if found then
    return v_id;
  end if;
  insert into public.project_capital_returns (project_id, member_id, kind, amount_sen, paid_on, transaction_ref,
                                              notes, reverses_id, recorded_by)
  values (v_r.project_id, v_r.member_id, v_r.kind, v_r.amount_sen, app_private.today_kl(), v_r.transaction_ref,
          left('Pembalikan: ' || btrim(p_reason), 500), p_id, v_admin)
  returning id into v_id;
  perform app_private.audit('project.capital_return_reversed', 'project_capital_return', p_id::text,
    jsonb_build_object('reversal_id', v_id, 'reason', btrim(p_reason), 'amount_sen', v_r.amount_sen));
  return v_id;
end;
$$;

-- 9. Read models -------------------------------------------------------------------

-- Funding progress of published projects (no member details). Admins also see drafts.
create or replace function public.project_progress()
returns table (project_id uuid, approved_sen bigint, pending_sen bigint, available_sen bigint,
               participants bigint, pending_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_admin boolean := app_private.is_admin();
begin
  return query
    select p.id,
           coalesce(sum(pp.amount_sen) filter (where pp.status = 'approved'), 0)::bigint,
           coalesce(sum(pp.amount_sen) filter (where pp.status = 'pending'), 0)::bigint,
           greatest(p.target_sen - coalesce(sum(pp.amount_sen) filter (where pp.status in ('approved', 'pending')), 0), 0)::bigint,
           count(distinct pp.member_id) filter (where pp.status = 'approved'),
           count(*) filter (where pp.status = 'pending')
      from public.projects p
      left join public.project_participations pp on pp.project_id = p.id
     where p.status <> 'draft' or v_admin
     group by p.id;
end;
$$;

-- One member's position per project (the caller's own, or any member for admins).
create or replace function public.member_project_wallet(p_member_id uuid default null)
returns table (project_id uuid, code text, name text, partner text, status text,
               capital_sen bigint, pending_capital_sen bigint, capital_returned_sen bigint,
               dividend_declared_sen bigint, dividend_received_sen bigint,
               withdrawal_pending_sen bigint, withdrawn_sen bigint, available_sen bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_member uuid := coalesce(p_member_id, v_uid);
begin
  if v_member <> v_uid and not app_private.is_admin() then
    perform app_private.err('FORBIDDEN', 'Anda tidak mempunyai kebenaran.');
  end if;
  return query
    with mine as (
      select distinct pp.project_id from public.project_participations pp where pp.member_id = v_member
    )
    select p.id, p.code, p.name, p.partner, p.status,
           (select coalesce(sum(x.amount_sen), 0) from public.project_participations x
             where x.project_id = p.id and x.member_id = v_member and x.status = 'approved')::bigint,
           (select coalesce(sum(x.amount_sen), 0) from public.project_participations x
             where x.project_id = p.id and x.member_id = v_member and x.status = 'pending')::bigint,
           (select coalesce(sum(case when c.reverses_id is null then c.amount_sen else -c.amount_sen end), 0)
              from public.project_capital_returns c where c.project_id = p.id and c.member_id = v_member)::bigint,
           (select coalesce(sum(a.amount_sen), 0) from public.project_profit_allocations a
              join public.project_profit_declarations d on d.id = a.declaration_id
             where a.project_id = p.id and a.member_id = v_member and d.status in ('declared', 'received'))::bigint,
           (select coalesce(sum(a.amount_sen), 0) from public.project_profit_allocations a
              join public.project_profit_declarations d on d.id = a.declaration_id
             where a.project_id = p.id and a.member_id = v_member and d.status = 'received')::bigint,
           (select coalesce(sum(w.amount_sen), 0) from public.project_withdrawals w
             where w.project_id = p.id and w.member_id = v_member and w.status in ('pending', 'approved'))::bigint,
           (select coalesce(sum(w.amount_sen), 0) from public.project_withdrawals w
             where w.project_id = p.id and w.member_id = v_member and w.status = 'paid')::bigint,
           app_private.available_dividend(v_member, p.id)
      from public.projects p join mine on mine.project_id = p.id
     order by p.created_at desc;
end;
$$;

-- Business performance for the member's own Wallet (Bisnes Saya is the
-- member's own money and never part of cooperative finances).
create or replace function public.my_business_performance()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_today date := app_private.today_kl();
  v_business uuid;
begin
  select id into v_business from public.business_profiles where owner_id = v_uid;
  if not found then
    return jsonb_build_object('has_business', false);
  end if;
  return jsonb_build_object(
    'has_business', true,
    'sales_month_sen', (select coalesce(sum(total_sen), 0) from public.business_invoices
                         where business_id = v_business and status not in ('draft', 'cancelled')
                           and issue_date >= date_trunc('month', v_today)::date),
    'sales_year_sen', (select coalesce(sum(total_sen), 0) from public.business_invoices
                        where business_id = v_business and status not in ('draft', 'cancelled')
                          and issue_date >= date_trunc('year', v_today)::date),
    'received_month_sen', (select coalesce(sum(amount_sen), 0) from public.business_payments
                            where business_id = v_business and reversed_at is null
                              and paid_on >= date_trunc('month', v_today)::date),
    'received_year_sen', (select coalesce(sum(amount_sen), 0) from public.business_payments
                           where business_id = v_business and reversed_at is null
                             and paid_on >= date_trunc('year', v_today)::date),
    'outstanding_sen', (select coalesce(sum(total_sen - paid_sen), 0) from public.business_invoices
                         where business_id = v_business and status in ('issued', 'partially_paid')),
    'open_invoices', (select count(*) from public.business_invoices
                       where business_id = v_business and status in ('issued', 'partially_paid')),
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
               'sales_sen', (select coalesce(sum(total_sen), 0) from public.business_invoices
                              where business_id = v_business and status not in ('draft', 'cancelled')
                                and issue_date >= m and issue_date < (m + interval '1 month')::date),
               'received_sen', (select coalesce(sum(amount_sen), 0) from public.business_payments
                                 where business_id = v_business and reversed_at is null
                                   and paid_on >= m and paid_on < (m + interval '1 month')::date))
             order by m)
        from generate_series(date_trunc('month', v_today)::date - interval '5 months',
                             date_trunc('month', v_today)::date, interval '1 month') g(m)), '[]'::jsonb));
end;
$$;

-- 10. Kewangan ------------------------------------------------------------------------

create or replace function app_private.cashbook_rows()
returns table (
  source text, ref_id uuid, entry_no text, entry_date date, business text, category text,
  description text, reference text, amount_sen bigint, reversed boolean, is_reversal boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select 'modal_syer', t.id, null::text, coalesce(t.payment_date, (t.reviewed_at at time zone 'Asia/Kuala_Lumpur')::date),
         'umum', case when t.txn_type = 'payment' then 'modal_syer' else 'pelarasan_modal_syer' end,
         case when t.txn_type = 'payment' then 'Modal syer: ' else 'Pelarasan modal syer: ' end
           || coalesce(p.full_name, '') || coalesce(' (' || p.membership_id || ')', '')
           || coalesce(' — ' || t.reason, ''),
         t.transaction_ref, t.amount_sen, false, false, t.reviewed_at
    from public.share_transactions t join public.profiles p on p.id = t.member_id
   where t.status = 'approved'
  union all
  select 'projek_modal', pp.id, pj.code, pp.payment_date, 'pelaburan', 'modal_projek',
         'Modal projek ' || pj.name || ': ' || coalesce(p.full_name, '') || coalesce(' (' || p.membership_id || ')', ''),
         pp.transaction_ref, pp.amount_sen, false, false, pp.reviewed_at
    from public.project_participations pp
    join public.projects pj on pj.id = pp.project_id
    join public.profiles p on p.id = pp.member_id
   where pp.status = 'approved'
  union all
  select 'projek_pelaburan', pj.id, pj.code, pj.invested_on, 'pelaburan', 'pelaburan_dihantar',
         'Pelaburan ' || pj.name || ' kepada ' || pj.partner, pj.investment_ref, -pj.invested_sen, false, false, pj.updated_at
    from public.projects pj
   where pj.invested_on is not null
  union all
  select 'projek_keuntungan', d.id, pj.code, d.received_on, 'pelaburan', 'keuntungan_projek',
         'Keuntungan ' || pj.name || ' (' || d.period_label || ')'
           || case when d.fee_sen > 0 then ' selepas potongan ' || coalesce(d.fee_description, 'caj') else '' end,
         null, d.gross_sen - d.fee_sen, false, false, d.received_at
    from public.project_profit_declarations d join public.projects pj on pj.id = d.project_id
   where d.status = 'received' and d.gross_sen - d.fee_sen > 0
  union all
  select 'projek_modal_diterima', pj.id, pj.code, pj.matured_on, 'pelaburan', 'modal_diterima_semula',
         'Modal diterima semula daripada ' || pj.partner || ' (' || pj.name || ')',
         pj.capital_received_ref, pj.capital_received_sen, false, false, pj.updated_at
    from public.projects pj
   where pj.matured_on is not null and coalesce(pj.capital_received_sen, 0) > 0
  union all
  select 'projek_dividen', w.id, w.withdrawal_no, w.paid_on, 'pelaburan', 'bayaran_dividen',
         'Dividen ' || pj.name || ' kepada ' || coalesce(p.full_name, '') || coalesce(' (' || p.membership_id || ')', ''),
         w.transaction_ref, -w.amount_sen, false, false, w.paid_at
    from public.project_withdrawals w
    join public.projects pj on pj.id = w.project_id
    join public.profiles p on p.id = w.member_id
   where w.status = 'paid'
  union all
  select 'projek_pemulangan', c.id, pj.code, c.paid_on, 'pelaburan',
         case when c.kind = 'refund' then 'bayaran_balik_modal' else 'pemulangan_modal' end,
         case when c.reverses_id is not null then 'Pembalikan: ' else '' end
           || case when c.kind = 'refund' then 'Bayaran balik modal ' else 'Pemulangan modal ' end
           || pj.name || ' kepada ' || coalesce(p.full_name, '') || coalesce(' (' || p.membership_id || ')', ''),
         c.transaction_ref,
         case when c.reverses_id is null then -c.amount_sen else c.amount_sen end,
         exists (select 1 from public.project_capital_returns r where r.reverses_id = c.id),
         c.reverses_id is not null, c.created_at
    from public.project_capital_returns c
    join public.projects pj on pj.id = c.project_id
    join public.profiles p on p.id = c.member_id
  union all
  select 'manual', e.id, e.entry_no, e.entry_date, e.business, e.category, e.description, e.reference,
         case when e.direction = 'in' then e.amount_sen else -e.amount_sen end,
         exists (select 1 from public.coop_ledger_entries r where r.reverses_id = e.id),
         e.reverses_id is not null, e.created_at
    from public.coop_ledger_entries e
$$;

create or replace function public.admin_finance_summary(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_to date := coalesce(p_to, app_private.today_kl());
begin
  return (
    with all_rows as (select * from app_private.cashbook_rows() where entry_date <= v_to),
    period as (select * from all_rows where p_from is null or entry_date >= p_from)
    select jsonb_build_object(
      'as_of', v_to,
      'share_capital_sen',       (select coalesce(sum(amount_sen), 0) from all_rows where source = 'modal_syer'),
      'project_capital_sen',     (select coalesce(sum(amount_sen), 0) from all_rows where source = 'projek_modal'),
      'project_invested_sen',    (select coalesce(-sum(amount_sen), 0) from all_rows where source = 'projek_pelaburan'),
      'project_profit_sen',      (select coalesce(sum(amount_sen), 0) from all_rows where source = 'projek_keuntungan'),
      'capital_received_sen',    (select coalesce(sum(amount_sen), 0) from all_rows where source = 'projek_modal_diterima'),
      'dividend_paid_sen',       (select coalesce(-sum(amount_sen), 0) from all_rows where source = 'projek_dividen'),
      'capital_returned_sen',    (select coalesce(-sum(amount_sen), 0) from all_rows where source = 'projek_pemulangan'),
      'manual_in_sen',           (select coalesce(sum(amount_sen), 0) from all_rows where source = 'manual' and amount_sen > 0),
      'manual_out_sen',          (select coalesce(-sum(amount_sen), 0) from all_rows where source = 'manual' and amount_sen < 0),
      'total_funds_sen',         (select coalesce(sum(amount_sen), 0) from all_rows),
      'funds_excl_share_sen',    (select coalesce(sum(amount_sen), 0) from all_rows where source <> 'modal_syer'),
      'period_in_sen',           (select coalesce(sum(amount_sen), 0) from period where amount_sen > 0),
      'period_out_sen',          (select coalesce(-sum(amount_sen), 0) from period where amount_sen < 0),
      -- Not cash movements: what the received profit is made of, and what is still owed to members.
      'coop_profit_share_sen',   (select coalesce(sum(d.coop_total_sen), 0) from public.project_profit_declarations d
                                   where d.status = 'received' and d.received_on <= v_to),
      'member_dividend_sen',     (select coalesce(sum(d.member_total_sen), 0) from public.project_profit_declarations d
                                   where d.status = 'received' and d.received_on <= v_to),
      'dividend_liability_sen',  (select coalesce(sum(d.member_total_sen), 0) from public.project_profit_declarations d
                                   where d.status = 'received' and d.received_on <= v_to)
                               - (select coalesce(sum(w.amount_sen), 0) from public.project_withdrawals w
                                   where w.status = 'paid' and w.paid_on <= v_to),
      'by_business', coalesce((
        select jsonb_agg(x order by x.business)
          from (select business,
                       sum(amount_sen) filter (where amount_sen > 0) as in_sen,
                       -sum(amount_sen) filter (where amount_sen < 0) as out_sen,
                       sum(amount_sen) as net_sen
                  from period where source <> 'modal_syer' group by business) x), '[]'::jsonb),
      'by_category', coalesce((
        select jsonb_agg(x order by abs(x.net_sen) desc)
          from (select category, sum(amount_sen) as net_sen, count(*) as entries
                  from period group by category) x), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
begin
  return jsonb_build_object(
    'total_members',          (select count(*) from public.profiles where status in ('active', 'suspended')),
    'active_members',         (select count(*) from public.profiles where status = 'active'),
    'pending_approvals',      (select count(*) from public.profiles where status in ('pending_approval', 'pending_verification')),
    'approved_share_sen',     (select coalesce(sum(amount_sen), 0) from public.share_transactions where status = 'approved'),
    'pending_share_count',    (select count(*) from public.share_transactions where status = 'pending'),
    'pending_share_sen',      (select coalesce(sum(amount_sen), 0) from public.share_transactions where status = 'pending'),
    'projects_total',         (select count(*) from public.projects where status <> 'draft'),
    'projects_open',          (select count(*) from public.projects where status = 'open'),
    'projects_active',        (select count(*) from public.projects where status in ('full', 'active', 'matured')),
    'project_target_sen',     (select coalesce(sum(target_sen), 0) from public.projects where status not in ('draft', 'cancelled')),
    'project_capital_sen',    (select coalesce(sum(pp.amount_sen), 0) from public.project_participations pp
                                join public.projects p on p.id = pp.project_id
                               where pp.status = 'approved' and p.status <> 'cancelled'),
    'active_capital_sen',     (select coalesce(sum(invested_sen), 0) from public.projects where status = 'active'),
    'pending_participations', (select count(*) from public.project_participations where status = 'pending'),
    'profit_declared_sen',    (select coalesce(sum(gross_sen), 0) from public.project_profit_declarations
                                where status in ('declared', 'received')),
    'profit_received_sen',    (select coalesce(sum(gross_sen - fee_sen), 0) from public.project_profit_declarations
                                where status = 'received'),
    'coop_profit_sen',        (select coalesce(sum(coop_total_sen), 0) from public.project_profit_declarations
                                where status = 'received'),
    'member_dividend_sen',    (select coalesce(sum(member_total_sen), 0) from public.project_profit_declarations
                                where status in ('declared', 'received')),
    'dividend_paid_sen',      (select coalesce(sum(amount_sen), 0) from public.project_withdrawals where status = 'paid'),
    'dividend_unpaid_sen',    (select coalesce(sum(member_total_sen), 0) from public.project_profit_declarations
                                where status in ('declared', 'received'))
                            - (select coalesce(sum(amount_sen), 0) from public.project_withdrawals where status = 'paid'),
    'pending_withdrawals',    (select count(*) from public.project_withdrawals where status in ('pending', 'approved')),
    'share_capital_by_month', coalesce((
      select jsonb_agg(x order by x.month)
        from (select to_char(date_trunc('month', reviewed_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM') as month,
                     sum(amount_sen) as amount_sen
                from public.share_transactions where status = 'approved'
               group by 1 order by 1 desc limit 12) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.member_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
begin
  return jsonb_build_object(
    'approved_share_sen',   (select coalesce(sum(amount_sen), 0) from public.share_transactions
                              where member_id = v_uid and status = 'approved'),
    'pending_share_sen',    (select coalesce(sum(amount_sen), 0) from public.share_transactions
                              where member_id = v_uid and status = 'pending'),
    'project_capital_sen',  (select coalesce(sum(amount_sen), 0) from public.project_participations
                              where member_id = v_uid and status = 'approved'),
    'project_pending_sen',  (select coalesce(sum(amount_sen), 0) from public.project_participations
                              where member_id = v_uid and status = 'pending'),
    'projects_joined',      (select count(distinct project_id) from public.project_participations
                              where member_id = v_uid and status in ('approved', 'pending')),
    'dividend_total_sen',   (select coalesce(sum(a.amount_sen), 0) from public.project_profit_allocations a
                              join public.project_profit_declarations d on d.id = a.declaration_id
                             where a.member_id = v_uid and d.status in ('declared', 'received')),
    'dividend_paid_sen',    (select coalesce(sum(amount_sen), 0) from public.project_withdrawals
                              where member_id = v_uid and status = 'paid'),
    'dividend_available_sen', (select coalesce(sum(app_private.available_dividend(v_uid, x.project_id)), 0)
                                 from (select distinct project_id from public.project_participations
                                        where member_id = v_uid) x),
    'open_projects',        (select count(*) from public.projects where status = 'open')
  );
end;
$$;

-- 11. Row Level Security, storage and grants --------------------------------------------

alter table public.projects                     enable row level security;
alter table public.project_participations       enable row level security;
alter table public.project_profit_declarations  enable row level security;
alter table public.project_profit_allocations   enable row level security;
alter table public.project_withdrawals          enable row level security;
alter table public.project_capital_returns      enable row level security;
alter table app_private.project_counters        enable row level security;

grant select on public.projects, public.project_participations, public.project_profit_declarations,
  public.project_profit_allocations, public.project_withdrawals, public.project_capital_returns to authenticated;

create policy projects_select on public.projects for select to authenticated
  using ((status <> 'draft' and (select app_private.is_active_member())) or (select app_private.is_admin()));
create policy project_participations_select on public.project_participations for select to authenticated
  using ((member_id = (select auth.uid()) and (select app_private.is_active_member())) or (select app_private.is_admin()));
create policy project_profit_declarations_select on public.project_profit_declarations for select to authenticated
  using ((status <> 'draft' and (select app_private.is_active_member())
          and exists (select 1 from public.projects p where p.id = project_id and p.status <> 'draft'))
         or (select app_private.is_admin()));
create policy project_profit_allocations_select on public.project_profit_allocations for select to authenticated
  using ((member_id = (select auth.uid()) and (select app_private.is_active_member())) or (select app_private.is_admin()));
create policy project_withdrawals_select on public.project_withdrawals for select to authenticated
  using ((member_id = (select auth.uid()) and (select app_private.is_active_member())) or (select app_private.is_admin()));
create policy project_capital_returns_select on public.project_capital_returns for select to authenticated
  using ((member_id = (select auth.uid()) and (select app_private.is_active_member())) or (select app_private.is_admin()));

-- Admin-uploaded files (payout-proofs): admins read all; a member reads the proof
-- of their own withdrawal or capital return, and the documents of published
-- projects and confirmed profit declarations. Investment proofs stay admin-only.
create policy "payout-proofs: admin or payee can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payout-proofs'
    and (
      (select app_private.is_admin())
      or exists (select 1 from public.project_withdrawals w
                  where w.proof_path = name and w.member_id = (select auth.uid()))
      or exists (select 1 from public.project_capital_returns c
                  where c.proof_path = name and c.member_id = (select auth.uid()))
      or ((select app_private.is_active_member()) and (
            exists (select 1 from public.projects p where p.document_path = name and p.status <> 'draft')
            or exists (select 1 from public.project_profit_declarations d
                        where d.document_path = name and d.status in ('declared', 'received'))))
    )
  );

revoke execute on all functions in schema app_private from public;
grant execute on function app_private.is_admin() to authenticated, service_role;
grant execute on function app_private.is_active_member() to authenticated, service_role;
grant execute on function app_private.owns_business(uuid) to authenticated, service_role;

revoke execute on function
  public.save_project(uuid, jsonb), public.delete_project_draft(uuid), public.publish_project(uuid),
  public.set_project_status(uuid, text, text), public.record_project_investment(uuid, date, bigint, text, text),
  public.record_project_maturity(uuid, date, bigint, text, text),
  public.join_project(uuid, bigint, date, text, text, integer, text),
  public.review_project_participation(uuid, boolean, text),
  public.save_profit_declaration(uuid, uuid, jsonb), public.delete_profit_declaration_draft(uuid),
  public.preview_profit_declaration(uuid), public.confirm_profit_declaration(uuid, date),
  public.mark_profit_received(uuid, date), public.void_profit_declaration(uuid, text),
  public.request_dividend_withdrawal(uuid, bigint, text, text), public.cancel_dividend_withdrawal(uuid),
  public.review_dividend_withdrawal(uuid, boolean, text), public.record_withdrawal_payment(uuid, date, text, text),
  public.record_capital_returns(uuid, text, date, text, text, text, jsonb), public.reverse_capital_return(uuid, text),
  public.project_progress(), public.member_project_wallet(uuid), public.my_business_performance()
from public, anon;
grant execute on function
  public.save_project(uuid, jsonb), public.delete_project_draft(uuid), public.publish_project(uuid),
  public.set_project_status(uuid, text, text), public.record_project_investment(uuid, date, bigint, text, text),
  public.record_project_maturity(uuid, date, bigint, text, text),
  public.join_project(uuid, bigint, date, text, text, integer, text),
  public.review_project_participation(uuid, boolean, text),
  public.save_profit_declaration(uuid, uuid, jsonb), public.delete_profit_declaration_draft(uuid),
  public.preview_profit_declaration(uuid), public.confirm_profit_declaration(uuid, date),
  public.mark_profit_received(uuid, date), public.void_profit_declaration(uuid, text),
  public.request_dividend_withdrawal(uuid, bigint, text, text), public.cancel_dividend_withdrawal(uuid),
  public.review_dividend_withdrawal(uuid, boolean, text), public.record_withdrawal_payment(uuid, date, text, text),
  public.record_capital_returns(uuid, text, date, text, text, text, jsonb), public.reverse_capital_return(uuid, text),
  public.project_progress(), public.member_project_wallet(uuid), public.my_business_performance()
to authenticated;
