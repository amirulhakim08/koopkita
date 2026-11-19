-- =============================================================================
-- KoopKITA V1.0 — "Bisnes Saya": member business profiles, customers, invoices,
-- payments and receipts; official cooperative receipt data for Qurban buyers.
--
-- Privacy: a member sees only their own business, customers and documents.
-- Super Admin sees business profiles and aggregate totals only (no customers,
-- items or payment proofs). Customers of a member open a single document via an
-- unguessable share token (public_document), without signing in.
-- Integrity: issued invoices and receipts are immutable; corrections are made by
-- cancelling an invoice or reversing a payment. Numbers are allocated atomically.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.business_profiles (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.profiles (id) on delete restrict,
  name                 text not null check (char_length(name) between 2 and 150),
  ssm_no               text check (ssm_no is null or ssm_no ~ '^([0-9]{12}|[A-Z]{0,3}[0-9]{4,10}-?[A-Z])$'),
  phone                text not null check (phone ~ '^\+?[0-9]{9,15}$'),
  email                text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address              text check (address is null or char_length(address) <= 500),
  bank_name            text check (bank_name is null or char_length(bank_name) <= 100),
  bank_account_no      text check (bank_account_no is null or bank_account_no ~ '^[0-9]{6,20}$'),
  bank_account_holder  text check (bank_account_holder is null or char_length(bank_account_holder) <= 150),
  logo_path            text,
  sst_enabled          boolean not null default false,
  sst_rate_bp          integer not null default 0 check (sst_rate_bp between 0 and 2500),
  sst_reg_no           text check (sst_reg_no is null or char_length(sst_reg_no) <= 50),
  default_notes        text check (default_notes is null or char_length(default_notes) <= 1000),
  ssm_verified_at      timestamptz,
  ssm_verified_by      uuid references public.profiles (id),
  suspended_at         timestamptz,
  suspended_by         uuid references public.profiles (id),
  suspend_reason       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (not sst_enabled or sst_rate_bp > 0)
);
-- one business per member for now (the schema itself allows more later)
create unique index business_profiles_owner_key on public.business_profiles (owner_id);

create table public.business_customers (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.business_profiles (id) on delete restrict,
  name         text not null check (char_length(name) between 2 and 150),
  phone        text check (phone is null or phone ~ '^\+?[0-9]{9,15}$'),
  email        text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address      text check (address is null or char_length(address) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index business_customers_business_idx on public.business_customers (business_id, name);

create table public.business_invoices (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.business_profiles (id) on delete restrict,
  customer_id        uuid not null references public.business_customers (id) on delete restrict,
  invoice_no         text,
  status             text not null default 'draft'
                       check (status in ('draft', 'issued', 'partially_paid', 'paid', 'cancelled')),
  issue_date         date not null,
  due_date           date not null,
  subtotal_sen       bigint not null default 0 check (subtotal_sen >= 0),
  discount_sen       bigint not null default 0 check (discount_sen >= 0),
  tax_rate_bp        integer not null default 0 check (tax_rate_bp between 0 and 2500),
  tax_sen            bigint not null default 0 check (tax_sen >= 0),
  total_sen          bigint not null default 0 check (total_sen >= 0),
  paid_sen           bigint not null default 0 check (paid_sen >= 0),
  notes              text check (notes is null or char_length(notes) <= 1000),
  customer_snapshot  jsonb,
  business_snapshot  jsonb,
  share_token        text unique,
  share_enabled      boolean not null default true,
  issued_at          timestamptz,
  cancelled_at       timestamptz,
  cancel_reason      text,
  created_by         uuid not null references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (business_id, invoice_no),
  check (due_date >= issue_date),
  check (paid_sen <= total_sen),
  check (status = 'draft' or (invoice_no is not null and customer_snapshot is not null
                              and business_snapshot is not null and issued_at is not null and share_token is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index business_invoices_business_idx on public.business_invoices (business_id, created_at desc);

create table public.business_invoice_items (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.business_invoices (id) on delete cascade,
  position        integer not null check (position between 1 and 100),
  description     text not null check (char_length(description) between 1 and 300),
  quantity        numeric(12, 3) not null check (quantity > 0),
  unit_price_sen  bigint not null check (unit_price_sen >= 0),
  discount_sen    bigint not null default 0 check (discount_sen >= 0),
  line_total_sen  bigint not null check (line_total_sen >= 0),
  unique (invoice_id, position)
);

create table public.business_payments (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.business_invoices (id) on delete restrict,
  business_id      uuid not null references public.business_profiles (id) on delete restrict,
  receipt_no       text not null,
  amount_sen       bigint not null check (amount_sen > 0),
  paid_on          date not null,
  method           text not null check (method in ('bank_transfer', 'duitnow', 'cash', 'card', 'cheque', 'other')),
  reference        text check (reference is null or char_length(reference) <= 100),
  proof_path       text,
  share_token      text not null unique,
  share_enabled    boolean not null default true,
  reversed_at      timestamptz,
  reversed_by      uuid references public.profiles (id),
  reverse_reason   text,
  idempotency_key  text unique,
  created_by       uuid not null references public.profiles (id),
  created_at       timestamptz not null default now(),
  unique (business_id, receipt_no),
  check ((reversed_at is null) = (reverse_reason is null))
);
create index business_payments_invoice_idx on public.business_payments (invoice_id);
create index business_payments_business_idx on public.business_payments (business_id, created_at desc);

create table app_private.business_counters (
  business_id  uuid not null references public.business_profiles (id) on delete restrict,
  kind         text not null check (kind in ('INV', 'RCP')),
  year         integer not null,
  last_no      integer not null default 0,
  primary key (business_id, kind, year)
);

create trigger trg_business_profiles_updated_at before update on public.business_profiles
for each row execute function app_private.set_updated_at();
create trigger trg_business_customers_updated_at before update on public.business_customers
for each row execute function app_private.set_updated_at();
create trigger trg_business_invoices_updated_at before update on public.business_invoices
for each row execute function app_private.set_updated_at();
create trigger trg_business_profiles_no_delete before delete on public.business_profiles
for each row execute function app_private.forbid_delete();

-- -----------------------------------------------------------------------------
-- Integrity guards
-- -----------------------------------------------------------------------------
-- An issued invoice is frozen: only its payment status, share settings and
-- cancellation may change. Only drafts can be deleted.
create or replace function app_private.guard_business_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'IMMUTABLE_RECORD: issued invoice % cannot be deleted; cancel it instead', old.invoice_no
        using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'cancelled' and (new.status <> 'cancelled' or new.paid_sen <> old.paid_sen) then
    raise exception 'IMMUTABLE_RECORD: invoice % is cancelled', old.invoice_no using errcode = 'P0001';
  end if;
  if old.status <> 'draft' and (
       new.invoice_no is distinct from old.invoice_no or new.business_id <> old.business_id
    or new.customer_id <> old.customer_id or new.issue_date <> old.issue_date or new.due_date <> old.due_date
    or new.subtotal_sen <> old.subtotal_sen or new.discount_sen <> old.discount_sen
    or new.tax_rate_bp <> old.tax_rate_bp or new.tax_sen <> old.tax_sen or new.total_sen <> old.total_sen
    or new.notes is distinct from old.notes or new.customer_snapshot is distinct from old.customer_snapshot
    or new.business_snapshot is distinct from old.business_snapshot or new.issued_at is distinct from old.issued_at
    or new.status = 'draft') then
    raise exception 'IMMUTABLE_RECORD: issued invoice % cannot be edited', old.invoice_no using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_business_invoices_guard before update or delete on public.business_invoices
for each row execute function app_private.guard_business_invoice();

create or replace function app_private.guard_business_invoice_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.business_invoices
   where id = case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  -- parent already deleted (draft deletion cascades) or still a draft
  if v_status is null or v_status = 'draft' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'IMMUTABLE_RECORD: items of an issued invoice cannot be changed' using errcode = 'P0001';
end;
$$;

create trigger trg_business_invoice_items_guard before insert or update or delete on public.business_invoice_items
for each row execute function app_private.guard_business_invoice_item();

-- Receipts: never deleted; only a one-time reversal and share settings may change.
create or replace function app_private.guard_business_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'IMMUTABLE_RECORD: receipts cannot be deleted; reverse the payment instead' using errcode = 'P0001';
  end if;
  if new.invoice_id <> old.invoice_id or new.business_id <> old.business_id or new.receipt_no <> old.receipt_no
     or new.amount_sen <> old.amount_sen or new.paid_on <> old.paid_on or new.method <> old.method
     or new.reference is distinct from old.reference or new.proof_path is distinct from old.proof_path
     or new.created_by <> old.created_by or new.created_at <> old.created_at
     or (old.reversed_at is not null and (new.reversed_at is distinct from old.reversed_at
                                          or new.reverse_reason is distinct from old.reverse_reason)) then
    raise exception 'IMMUTABLE_RECORD: receipt % cannot be edited', old.receipt_no using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_business_payments_guard before update or delete on public.business_payments
for each row execute function app_private.guard_business_payment();

do $$
declare t text;
begin
  foreach t in array array['business_invoices', 'business_invoice_items', 'business_payments', 'business_profiles'] loop
    execute format('create trigger trg_%s_no_truncate before truncate on public.%I '
                   'for each statement execute function app_private.forbid_truncate()', t, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function app_private.owns_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.business_profiles b
                  where b.id = p_business_id and b.owner_id = auth.uid())
     and app_private.is_active_member()
$$;

-- The caller's business, which must exist and not be suspended.
create or replace function app_private.require_business()
returns public.business_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_b public.business_profiles%rowtype;
begin
  select * into v_b from public.business_profiles where owner_id = v_uid;
  if not found then
    perform app_private.err('CONFLICT', 'Sila lengkapkan Profil Bisnes dahulu.');
  end if;
  if v_b.suspended_at is not null then
    perform app_private.err('FORBIDDEN', 'Modul Bisnes anda telah digantung oleh Super Admin.');
  end if;
  return v_b;
end;
$$;

create or replace function app_private.new_share_token()
returns text
language sql
volatile
set search_path = ''
as $$ select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_') $$;

-- Atomic per-business, per-year document numbering: INV-2026-0001 / RCP-2026-0001
create or replace function app_private.next_document_no(p_business_id uuid, p_kind text, p_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from p_date)::integer;
  v_no integer;
begin
  insert into app_private.business_counters (business_id, kind, year, last_no)
  values (p_business_id, p_kind, v_year, 1)
  on conflict (business_id, kind, year) do update set last_no = app_private.business_counters.last_no + 1
  returning last_no into v_no;
  return p_kind || '-' || v_year || '-' || lpad(v_no::text, 4, '0');
end;
$$;

-- Recompute totals of a draft from its items and the business tax setting.
create or replace function app_private.recalc_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.business_invoices%rowtype;
  v_b public.business_profiles%rowtype;
  v_sub bigint;
  v_disc bigint;
  v_rate integer;
  v_tax bigint;
begin
  select * into v_inv from public.business_invoices where id = p_invoice_id;
  select * into v_b from public.business_profiles where id = v_inv.business_id;
  select coalesce(sum(round(quantity * unit_price_sen)), 0)::bigint, coalesce(sum(discount_sen), 0)::bigint
    into v_sub, v_disc
    from public.business_invoice_items where invoice_id = p_invoice_id;
  v_rate := case when v_b.sst_enabled then v_b.sst_rate_bp else 0 end;
  v_tax := round((v_sub - v_disc) * v_rate / 10000.0)::bigint;
  update public.business_invoices
     set subtotal_sen = v_sub, discount_sen = v_disc, tax_rate_bp = v_rate, tax_sen = v_tax,
         total_sen = v_sub - v_disc + v_tax
   where id = p_invoice_id;
end;
$$;

-- Recompute paid amount and status after a payment or reversal.
create or replace function app_private.refresh_invoice_payment_status(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid bigint;
begin
  select coalesce(sum(amount_sen), 0) into v_paid
    from public.business_payments where invoice_id = p_invoice_id and reversed_at is null;
  update public.business_invoices
     set paid_sen = v_paid,
         status = case when v_paid = 0 then 'issued'
                       when v_paid >= total_sen then 'paid'
                       else 'partially_paid' end
   where id = p_invoice_id and status <> 'cancelled';
end;
$$;

-- JSON used for PDFs and the public document page.
create or replace function app_private.document_json(p_invoice_id uuid, p_payment_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', case when p_payment_id is null then 'invoice' else 'receipt' end,
    'invoice', jsonb_build_object(
      'id', i.id, 'invoice_no', i.invoice_no, 'status', i.status, 'issue_date', i.issue_date, 'due_date', i.due_date,
      'subtotal_sen', i.subtotal_sen, 'discount_sen', i.discount_sen, 'tax_rate_bp', i.tax_rate_bp,
      'tax_sen', i.tax_sen, 'total_sen', i.total_sen, 'paid_sen', i.paid_sen, 'notes', i.notes,
      'cancel_reason', i.cancel_reason, 'cancelled_at', i.cancelled_at, 'share_token', i.share_token,
      'overdue', i.status in ('issued', 'partially_paid') and i.due_date < app_private.today_kl(),
      'customer', coalesce(i.customer_snapshot,
                   (select jsonb_build_object('name', c.name, 'phone', c.phone, 'email', c.email, 'address', c.address)
                      from public.business_customers c where c.id = i.customer_id)),
      'business', coalesce(i.business_snapshot,
                   (select jsonb_build_object('name', b.name, 'ssm_no', b.ssm_no, 'ssm_verified', b.ssm_verified_at is not null,
                                              'phone', b.phone, 'email', b.email, 'address', b.address,
                                              'bank_name', b.bank_name, 'bank_account_no', b.bank_account_no,
                                              'bank_account_holder', b.bank_account_holder, 'logo_path', b.logo_path,
                                              'sst_reg_no', b.sst_reg_no)
                      from public.business_profiles b where b.id = i.business_id)),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
                           'description', it.description, 'quantity', it.quantity, 'unit_price_sen', it.unit_price_sen,
                           'discount_sen', it.discount_sen, 'line_total_sen', it.line_total_sen) order by it.position)
                           from public.business_invoice_items it where it.invoice_id = i.id), '[]'::jsonb)),
    'payment', (select jsonb_build_object(
                  'id', p.id, 'receipt_no', p.receipt_no, 'amount_sen', p.amount_sen, 'paid_on', p.paid_on,
                  'method', p.method, 'reference', p.reference, 'reversed', p.reversed_at is not null,
                  'reverse_reason', p.reverse_reason, 'share_token', p.share_token,
                  'balance_after_sen', i.total_sen - (select coalesce(sum(x.amount_sen), 0) from public.business_payments x
                                                       where x.invoice_id = i.id and x.reversed_at is null
                                                         and (x.created_at, x.id) <= (p.created_at, p.id)))
                  from public.business_payments p where p.id = p_payment_id)
  )
  from public.business_invoices i where i.id = p_invoice_id
$$;

-- -----------------------------------------------------------------------------
-- Business profile (member) and administration (Super Admin)
-- -----------------------------------------------------------------------------
create or replace function public.save_my_business(p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_old public.business_profiles%rowtype;
  v_id uuid;
  v_ssm text := nullif(upper(regexp_replace(coalesce(p_data ->> 'ssm_no', ''), '\s', '', 'g')), '');
  v_logo text := nullif(btrim(coalesce(p_data ->> 'logo_path', '')), '');
  v_sst boolean := coalesce((p_data ->> 'sst_enabled')::boolean, false);
begin
  perform app_private.rate_limit('business_save:' || v_uid, 30, 3600);
  if v_logo is not null and v_logo !~ ('^' || v_uid::text || '/[A-Za-z0-9._-]{1,200}\.(png|jpe?g)$') then
    perform app_private.err('VALIDATION', 'Logo tidak sah. Gunakan fail PNG atau JPG.');
  end if;
  select * into v_old from public.business_profiles where owner_id = v_uid for update;
  if found and v_old.suspended_at is not null then
    perform app_private.err('FORBIDDEN', 'Modul Bisnes anda telah digantung oleh Super Admin.');
  end if;

  begin
    if not found then
      insert into public.business_profiles (
        owner_id, name, ssm_no, phone, email, address, bank_name, bank_account_no, bank_account_holder,
        logo_path, sst_enabled, sst_rate_bp, sst_reg_no, default_notes)
      values (
        v_uid, btrim(p_data ->> 'name'), v_ssm, regexp_replace(coalesce(p_data ->> 'phone', ''), '[\s-]', '', 'g'),
        nullif(btrim(coalesce(p_data ->> 'email', '')), ''), nullif(btrim(coalesce(p_data ->> 'address', '')), ''),
        nullif(btrim(coalesce(p_data ->> 'bank_name', '')), ''),
        nullif(regexp_replace(coalesce(p_data ->> 'bank_account_no', ''), '[\s-]', '', 'g'), ''),
        nullif(btrim(coalesce(p_data ->> 'bank_account_holder', '')), ''), v_logo, v_sst,
        case when v_sst then coalesce((p_data ->> 'sst_rate_bp')::integer, 0) else 0 end,
        nullif(btrim(coalesce(p_data ->> 'sst_reg_no', '')), ''), nullif(btrim(coalesce(p_data ->> 'default_notes', '')), ''))
      returning id into v_id;
      perform app_private.audit('business.created', 'business_profile', v_id::text, '{}'::jsonb);
    else
      update public.business_profiles set
        name = btrim(p_data ->> 'name'),
        ssm_no = v_ssm,
        phone = regexp_replace(coalesce(p_data ->> 'phone', ''), '[\s-]', '', 'g'),
        email = nullif(btrim(coalesce(p_data ->> 'email', '')), ''),
        address = nullif(btrim(coalesce(p_data ->> 'address', '')), ''),
        bank_name = nullif(btrim(coalesce(p_data ->> 'bank_name', '')), ''),
        bank_account_no = nullif(regexp_replace(coalesce(p_data ->> 'bank_account_no', ''), '[\s-]', '', 'g'), ''),
        bank_account_holder = nullif(btrim(coalesce(p_data ->> 'bank_account_holder', '')), ''),
        logo_path = coalesce(v_logo, logo_path),
        sst_enabled = v_sst,
        sst_rate_bp = case when v_sst then coalesce((p_data ->> 'sst_rate_bp')::integer, 0) else 0 end,
        sst_reg_no = nullif(btrim(coalesce(p_data ->> 'sst_reg_no', '')), ''),
        default_notes = nullif(btrim(coalesce(p_data ->> 'default_notes', '')), ''),
        -- a changed SSM number needs to be verified again
        ssm_verified_at = case when v_ssm is distinct from v_old.ssm_no then null else ssm_verified_at end,
        ssm_verified_by = case when v_ssm is distinct from v_old.ssm_no then null else ssm_verified_by end
      where id = v_old.id
      returning id into v_id;
      perform app_private.audit('business.updated', 'business_profile', v_id::text,
        jsonb_build_object('ssm_changed', v_ssm is distinct from v_old.ssm_no));
    end if;
  exception when check_violation or not_null_violation then
    perform app_private.err('VALIDATION', 'Sila semak maklumat bisnes (nama, telefon, SSM, e-mel, akaun bank, kadar SST).');
  end;
  return v_id;
end;
$$;

create or replace function public.admin_set_business_verified(p_business_id uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_b public.business_profiles%rowtype;
begin
  select * into v_b from public.business_profiles where id = p_business_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Bisnes tidak dijumpai.');
  end if;
  if p_verified and v_b.ssm_no is null then
    perform app_private.err('VALIDATION', 'Bisnes ini tiada nombor SSM untuk disahkan.');
  end if;
  update public.business_profiles
     set ssm_verified_at = case when p_verified then now() end,
         ssm_verified_by = case when p_verified then v_admin end
   where id = p_business_id;
  perform app_private.audit(case when p_verified then 'business.ssm_verified' else 'business.ssm_unverified' end,
    'business_profile', p_business_id::text, jsonb_build_object('ssm_no', v_b.ssm_no));
  perform app_private.notify(v_b.owner_id, 'business_ssm',
    case when p_verified then 'SSM bisnes disahkan' else 'Pengesahan SSM ditarik balik' end,
    v_b.name || case when p_verified then ' kini memaparkan lencana SSM disahkan pada invois.' else '.' end,
    '/ahli/bisnes?tab=profil');
end;
$$;

create or replace function public.admin_set_business_suspended(p_business_id uuid, p_suspend boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_b public.business_profiles%rowtype;
begin
  if p_suspend and coalesce(char_length(btrim(p_reason)), 0) < 3 then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab penggantungan.');
  end if;
  select * into v_b from public.business_profiles where id = p_business_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Bisnes tidak dijumpai.');
  end if;
  update public.business_profiles
     set suspended_at = case when p_suspend then now() end,
         suspended_by = case when p_suspend then v_admin end,
         suspend_reason = case when p_suspend then btrim(p_reason) end
   where id = p_business_id;
  perform app_private.audit(case when p_suspend then 'business.suspended' else 'business.reactivated' end,
    'business_profile', p_business_id::text, jsonb_build_object('reason', p_reason));
  perform app_private.notify(v_b.owner_id, 'business_suspension',
    case when p_suspend then 'Modul Bisnes digantung' else 'Modul Bisnes diaktifkan semula' end,
    coalesce(p_reason, ''), '/ahli/bisnes');
end;
$$;

-- Aggregates only: no customers, items or proofs.
create or replace function public.admin_business_overview()
returns table (
  business_id uuid, name text, ssm_no text, ssm_verified boolean, suspended boolean, suspend_reason text,
  phone text, logo_path text, owner_name text, membership_id text, invoice_count bigint,
  invoiced_sen bigint, received_sen bigint, outstanding_sen bigint, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
begin
  return query
    select b.id, b.name, b.ssm_no, b.ssm_verified_at is not null, b.suspended_at is not null, b.suspend_reason,
           b.phone, b.logo_path, p.full_name, p.membership_id,
           (select count(*) from public.business_invoices i where i.business_id = b.id and i.status not in ('draft', 'cancelled')),
           (select coalesce(sum(i.total_sen), 0) from public.business_invoices i
             where i.business_id = b.id and i.status not in ('draft', 'cancelled'))::bigint,
           (select coalesce(sum(x.amount_sen), 0) from public.business_payments x
             where x.business_id = b.id and x.reversed_at is null)::bigint,
           (select coalesce(sum(i.total_sen - i.paid_sen), 0) from public.business_invoices i
             where i.business_id = b.id and i.status in ('issued', 'partially_paid'))::bigint,
           b.created_at
      from public.business_profiles b join public.profiles p on p.id = b.owner_id
     order by b.created_at desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Invoices
-- -----------------------------------------------------------------------------
create or replace function public.save_invoice_draft(
  p_id uuid, p_customer_id uuid, p_issue_date date, p_due_date date, p_notes text, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
  v_uid uuid := auth.uid();
  v_id uuid := p_id;
  v_item jsonb;
  v_pos integer := 0;
  v_qty numeric;
  v_price bigint;
  v_disc bigint;
begin
  perform app_private.rate_limit('invoice_save:' || v_uid, 120, 3600);
  if not exists (select 1 from public.business_customers where id = p_customer_id and business_id = v_b.id) then
    perform app_private.err('VALIDATION', 'Sila pilih pelanggan.');
  end if;
  if p_issue_date is null or p_due_date is null or p_due_date < p_issue_date then
    perform app_private.err('VALIDATION', 'Tarikh akhir mesti pada atau selepas tarikh invois.');
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    perform app_private.err('VALIDATION', 'Tambah sekurang-kurangnya satu item (maksimum 100).');
  end if;

  if v_id is null then
    insert into public.business_invoices (business_id, customer_id, issue_date, due_date, notes, created_by)
    values (v_b.id, p_customer_id, p_issue_date, p_due_date, nullif(btrim(coalesce(p_notes, '')), ''), v_uid)
    returning id into v_id;
  else
    perform 1 from public.business_invoices where id = v_id and business_id = v_b.id and status = 'draft' for update;
    if not found then
      perform app_private.err('CONFLICT', 'Hanya draf invois boleh diubah.');
    end if;
    update public.business_invoices
       set customer_id = p_customer_id, issue_date = p_issue_date, due_date = p_due_date,
           notes = nullif(btrim(coalesce(p_notes, '')), '')
     where id = v_id;
    delete from public.business_invoice_items where invoice_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    v_qty := (v_item ->> 'quantity')::numeric;
    v_price := (v_item ->> 'unit_price_sen')::bigint;
    v_disc := coalesce((v_item ->> 'discount_sen')::bigint, 0);
    if coalesce(char_length(btrim(v_item ->> 'description')), 0) = 0 or v_qty is null or v_qty <= 0
       or v_price is null or v_price < 0 or v_disc < 0 or v_disc > round(v_qty * v_price) then
      perform app_private.err('VALIDATION', 'Item ' || v_pos || ' tidak sah (perkara, kuantiti, harga atau diskaun).');
    end if;
    insert into public.business_invoice_items (invoice_id, position, description, quantity, unit_price_sen, discount_sen, line_total_sen)
    values (v_id, v_pos, btrim(v_item ->> 'description'), v_qty, v_price, v_disc, round(v_qty * v_price)::bigint - v_disc);
  end loop;

  perform app_private.recalc_invoice(v_id);
  return v_id;
end;
$$;

create or replace function public.delete_invoice_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
begin
  delete from public.business_invoices where id = p_id and business_id = v_b.id and status = 'draft';
  if not found then
    perform app_private.err('CONFLICT', 'Hanya draf invois boleh dipadam.');
  end if;
end;
$$;

create or replace function public.issue_invoice(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
  v_inv public.business_invoices%rowtype;
  v_no text;
begin
  select * into v_inv from public.business_invoices where id = p_id and business_id = v_b.id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Invois tidak dijumpai.');
  end if;
  if v_inv.status <> 'draft' then
    return v_inv.invoice_no; -- idempotent
  end if;
  perform app_private.recalc_invoice(p_id);
  select * into v_inv from public.business_invoices where id = p_id;
  if v_inv.total_sen <= 0 then
    perform app_private.err('VALIDATION', 'Jumlah invois mesti lebih daripada sifar.');
  end if;
  v_no := app_private.next_document_no(v_b.id, 'INV', v_inv.issue_date);
  update public.business_invoices i
     set invoice_no = v_no, status = 'issued', issued_at = now(), share_token = app_private.new_share_token(),
         customer_snapshot = (select jsonb_build_object('name', c.name, 'phone', c.phone, 'email', c.email, 'address', c.address)
                                from public.business_customers c where c.id = i.customer_id),
         business_snapshot = jsonb_build_object(
           'name', v_b.name, 'ssm_no', v_b.ssm_no, 'ssm_verified', v_b.ssm_verified_at is not null, 'phone', v_b.phone,
           'email', v_b.email, 'address', v_b.address, 'bank_name', v_b.bank_name, 'bank_account_no', v_b.bank_account_no,
           'bank_account_holder', v_b.bank_account_holder, 'logo_path', v_b.logo_path, 'sst_reg_no', v_b.sst_reg_no)
   where i.id = p_id;
  perform app_private.audit('business.invoice_issued', 'business_invoice', p_id::text,
    jsonb_build_object('invoice_no', v_no, 'total_sen', v_inv.total_sen));
  return v_no;
end;
$$;

create or replace function public.cancel_invoice(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
  v_inv public.business_invoices%rowtype;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab pembatalan.');
  end if;
  select * into v_inv from public.business_invoices where id = p_id and business_id = v_b.id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Invois tidak dijumpai.');
  end if;
  if v_inv.status = 'cancelled' then
    return;
  end if;
  if v_inv.status = 'draft' then
    perform app_private.err('CONFLICT', 'Draf tidak perlu dibatalkan — padam sahaja.');
  end if;
  if v_inv.paid_sen > 0 then
    perform app_private.err('CONFLICT', 'Balikkan semua bayaran (resit) invois ini dahulu sebelum membatalkan.');
  end if;
  update public.business_invoices set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason)
   where id = p_id;
  perform app_private.audit('business.invoice_cancelled', 'business_invoice', p_id::text,
    jsonb_build_object('invoice_no', v_inv.invoice_no, 'reason', p_reason));
end;
$$;

-- -----------------------------------------------------------------------------
-- Payments and receipts
-- -----------------------------------------------------------------------------
create or replace function public.record_invoice_payment(
  p_invoice_id uuid, p_amount_sen bigint, p_paid_on date, p_method text, p_reference text,
  p_proof_path text, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
  v_inv public.business_invoices%rowtype;
  v_id uuid;
  v_no text;
begin
  if p_idempotency_key is not null then
    select id into v_id from public.business_payments where idempotency_key = p_idempotency_key and business_id = v_b.id;
    if found then return v_id; end if;
  end if;
  perform app_private.rate_limit('business_payment:' || auth.uid(), 120, 3600);
  select * into v_inv from public.business_invoices where id = p_invoice_id and business_id = v_b.id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Invois tidak dijumpai.');
  end if;
  if v_inv.status not in ('issued', 'partially_paid') then
    perform app_private.err('CONFLICT', 'Bayaran hanya boleh direkodkan untuk invois yang belum dibayar penuh.');
  end if;
  if p_amount_sen is null or p_amount_sen <= 0 or p_amount_sen > v_inv.total_sen - v_inv.paid_sen then
    perform app_private.err('VALIDATION', 'Jumlah mesti antara RM0.01 dan baki ' || app_private.format_rm(v_inv.total_sen - v_inv.paid_sen) || '.');
  end if;
  if p_paid_on is null or p_paid_on > app_private.today_kl() or p_paid_on < v_inv.issue_date - 365 then
    perform app_private.err('VALIDATION', 'Tarikh bayaran tidak sah.');
  end if;
  if p_method not in ('bank_transfer', 'duitnow', 'cash', 'card', 'cheque', 'other') then
    perform app_private.err('VALIDATION', 'Kaedah bayaran tidak sah.');
  end if;
  if p_proof_path is not null then
    perform app_private.check_own_path(p_proof_path);
  end if;

  v_no := app_private.next_document_no(v_b.id, 'RCP', p_paid_on);
  insert into public.business_payments (
    invoice_id, business_id, receipt_no, amount_sen, paid_on, method, reference, proof_path, share_token,
    idempotency_key, created_by)
  values (
    p_invoice_id, v_b.id, v_no, p_amount_sen, p_paid_on, p_method, nullif(btrim(coalesce(p_reference, '')), ''),
    p_proof_path, app_private.new_share_token(), p_idempotency_key, auth.uid())
  returning id into v_id;
  perform app_private.refresh_invoice_payment_status(p_invoice_id);
  perform app_private.audit('business.payment_recorded', 'business_payment', v_id::text,
    jsonb_build_object('receipt_no', v_no, 'invoice_no', v_inv.invoice_no, 'amount_sen', p_amount_sen));
  return v_id;
end;
$$;

create or replace function public.reverse_invoice_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
  v_p public.business_payments%rowtype;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab pembalikan.');
  end if;
  select * into v_p from public.business_payments where id = p_payment_id and business_id = v_b.id;
  if not found then
    perform app_private.err('NOT_FOUND', 'Resit tidak dijumpai.');
  end if;
  perform 1 from public.business_invoices where id = v_p.invoice_id for update;
  if v_p.reversed_at is not null then
    return;
  end if;
  update public.business_payments
     set reversed_at = now(), reversed_by = auth.uid(), reverse_reason = btrim(p_reason)
   where id = p_payment_id;
  perform app_private.refresh_invoice_payment_status(v_p.invoice_id);
  perform app_private.audit('business.payment_reversed', 'business_payment', p_payment_id::text,
    jsonb_build_object('receipt_no', v_p.receipt_no, 'reason', p_reason));
end;
$$;

-- Turn a share link on/off, or replace it (old link stops working).
create or replace function public.set_document_share(p_kind text, p_id uuid, p_enabled boolean, p_regenerate boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
  v_token text;
begin
  if p_kind = 'invoice' then
    update public.business_invoices
       set share_enabled = p_enabled,
           share_token = case when p_regenerate then app_private.new_share_token() else share_token end
     where id = p_id and business_id = v_b.id and status <> 'draft'
    returning share_token into v_token;
  elsif p_kind = 'receipt' then
    update public.business_payments
       set share_enabled = p_enabled,
           share_token = case when p_regenerate then app_private.new_share_token() else share_token end
     where id = p_id and business_id = v_b.id
    returning share_token into v_token;
  else
    perform app_private.err('VALIDATION', 'Jenis dokumen tidak sah.');
  end if;
  if v_token is null then
    perform app_private.err('NOT_FOUND', 'Dokumen tidak dijumpai.');
  end if;
  return v_token;
end;
$$;

-- -----------------------------------------------------------------------------
-- Document access
-- -----------------------------------------------------------------------------
-- Owner access (authenticated PDF download / share).
create or replace function public.my_business_document(p_kind text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_invoice uuid;
begin
  if p_kind = 'invoice' then
    select i.id into v_invoice from public.business_invoices i
      join public.business_profiles b on b.id = i.business_id
     where i.id = p_id and b.owner_id = v_uid;
    if v_invoice is null then perform app_private.err('NOT_FOUND', 'Dokumen tidak dijumpai.'); end if;
    return app_private.document_json(v_invoice, null);
  elsif p_kind = 'receipt' then
    select p.invoice_id into v_invoice from public.business_payments p
      join public.business_profiles b on b.id = p.business_id
     where p.id = p_id and b.owner_id = v_uid;
    if v_invoice is null then perform app_private.err('NOT_FOUND', 'Dokumen tidak dijumpai.'); end if;
    return app_private.document_json(v_invoice, p_id);
  end if;
  perform app_private.err('VALIDATION', 'Jenis dokumen tidak sah.');
  return null;
end;
$$;

-- Public access by share token (anon). Returns exactly one document or null.
create or replace function public.public_document(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invoice uuid;
  v_payment uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' then
    return null;
  end if;
  select id into v_invoice from public.business_invoices
   where share_token = p_token and share_enabled and status <> 'draft';
  if v_invoice is not null then
    return app_private.document_json(v_invoice, null);
  end if;
  select id, invoice_id into v_payment, v_invoice from public.business_payments
   where share_token = p_token and share_enabled;
  if v_payment is not null then
    return app_private.document_json(v_invoice, v_payment);
  end if;
  return null;
end;
$$;

-- Official cooperative receipt for an approved Qurban sale (seller or admin).
create or replace function public.coop_sale_receipt(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_sale public.qurban_sales%rowtype;
begin
  select * into v_sale from public.qurban_sales where id = p_sale_id;
  if not found or (v_sale.member_id <> v_uid and not app_private.is_admin()) then
    perform app_private.err('NOT_FOUND', 'Jualan tidak dijumpai.');
  end if;
  if v_sale.status <> 'approved' then
    perform app_private.err('CONFLICT', 'Resit rasmi hanya untuk jualan yang telah diluluskan.');
  end if;
  return jsonb_build_object(
    'sale_no', v_sale.sale_no, 'approved_at', v_sale.reviewed_at, 'share_count', v_sale.share_count,
    'price_per_share_sen', v_sale.price_per_share_sen, 'total_sen', v_sale.total_sen,
    'campaign', (select name from public.campaigns where id = v_sale.campaign_id),
    'buyer', (select jsonb_build_object('name', b.full_name, 'phone', b.phone, 'email', b.email, 'address', b.address)
                from public.buyers b where b.id = v_sale.buyer_id),
    'seller', (select jsonb_build_object('name', p.full_name, 'membership_id', p.membership_id)
                 from public.profiles p where p.id = v_sale.member_id),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
                       'name', q.participant_name, 'qurban_type', q.qurban_type, 'on_behalf_of', q.on_behalf_of,
                       'slot', coalesce((select c.code || ' / slot ' || s.slot_no from public.cattle_slots s
                                          join public.cattle c on c.id = s.cattle_id where s.id = q.slot_id), q.slot_code_snapshot))
                       order by q.position) from public.qurban_participants q where q.sale_id = v_sale.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('amount_sen', ps.amount_sen, 'payment_date', ps.payment_date,
                                                              'reference', ps.transaction_ref) order by ps.payment_date)
                            from public.payment_submissions ps where ps.sale_id = v_sale.id and ps.status = 'verified'), '[]'::jsonb),
    'coop', jsonb_build_object(
      'name', coalesce(app_private.setting('coop_name') #>> '{}', 'Koperasi Industri Tani Agro Pelancongan Kedah Berhad'),
      'reg_no', app_private.setting('coop_reg_no') #>> '{}',
      'address', app_private.setting('coop_address') #>> '{}',
      'phone', app_private.setting('coop_phone') #>> '{}',
      'email', app_private.setting('coop_email') #>> '{}',
      'logo_path', app_private.setting('coop_logo_path') #>> '{}'));
end;
$$;

insert into public.system_settings (key, value, description, is_public) values
  ('coop_name',      '"Koperasi Industri Tani Agro Pelancongan Kedah Berhad"'::jsonb, 'Nama rasmi koperasi (resit rasmi)', true),
  ('coop_reg_no',    'null'::jsonb, 'Nombor pendaftaran koperasi (resit rasmi)', true),
  ('coop_address',   'null'::jsonb, 'Alamat koperasi (resit rasmi)', true),
  ('coop_phone',     'null'::jsonb, 'Telefon koperasi (resit rasmi)', true),
  ('coop_email',     'null'::jsonb, 'E-mel koperasi (resit rasmi)', true),
  ('coop_logo_path', 'null'::jsonb, 'Logo koperasi dalam storan business-logos (resit rasmi)', true)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.business_profiles      enable row level security;
alter table public.business_customers     enable row level security;
alter table public.business_invoices      enable row level security;
alter table public.business_invoice_items enable row level security;
alter table public.business_payments      enable row level security;
alter table app_private.business_counters enable row level security;

grant select on public.business_profiles, public.business_invoices, public.business_invoice_items,
  public.business_payments to authenticated;
grant select, insert, update, delete on public.business_customers to authenticated;

create policy business_profiles_select on public.business_profiles for select to authenticated
  using ((owner_id = (select auth.uid()) and (select app_private.is_active_member())) or (select app_private.is_admin()));

-- customers, invoices, items and receipts: owner only (not admin — privacy of the member's customers)
create policy business_customers_select on public.business_customers for select to authenticated
  using ((select app_private.owns_business(business_id)));
create policy business_customers_insert on public.business_customers for insert to authenticated
  with check ((select app_private.owns_business(business_id))
              and exists (select 1 from public.business_profiles b where b.id = business_id and b.suspended_at is null));
create policy business_customers_update on public.business_customers for update to authenticated
  using ((select app_private.owns_business(business_id)))
  with check ((select app_private.owns_business(business_id))
              and exists (select 1 from public.business_profiles b where b.id = business_id and b.suspended_at is null));
create policy business_customers_delete on public.business_customers for delete to authenticated
  using ((select app_private.owns_business(business_id)));

create policy business_invoices_select on public.business_invoices for select to authenticated
  using ((select app_private.owns_business(business_id)));
create policy business_invoice_items_select on public.business_invoice_items for select to authenticated
  using (exists (select 1 from public.business_invoices i where i.id = invoice_id
                  and (select app_private.owns_business(i.business_id))));
create policy business_payments_select on public.business_payments for select to authenticated
  using ((select app_private.owns_business(business_id)));

-- -----------------------------------------------------------------------------
-- Storage: public business logos (shown on documents) and private payment proofs
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('business-logos', 'business-logos', true, 1048576, array['image/png', 'image/jpeg']),
  ('business-proofs', 'business-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "business-logos: members upload to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'business-logos'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select app_private.is_active_member()));

create policy "business-proofs: members upload to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'business-proofs'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select app_private.is_active_member()));

create policy "business-proofs: owner can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'business-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema app_private from public;
grant execute on function app_private.is_admin() to authenticated, service_role;
grant execute on function app_private.is_active_member() to authenticated, service_role;
grant execute on function app_private.owns_business(uuid) to authenticated, service_role;

revoke execute on function
  public.save_my_business(jsonb), public.admin_set_business_verified(uuid, boolean),
  public.admin_set_business_suspended(uuid, boolean, text), public.admin_business_overview(),
  public.save_invoice_draft(uuid, uuid, date, date, text, jsonb), public.delete_invoice_draft(uuid),
  public.issue_invoice(uuid), public.cancel_invoice(uuid, text),
  public.record_invoice_payment(uuid, bigint, date, text, text, text, text), public.reverse_invoice_payment(uuid, text),
  public.set_document_share(text, uuid, boolean, boolean), public.my_business_document(text, uuid),
  public.public_document(text), public.coop_sale_receipt(uuid)
from public, anon;

grant execute on function
  public.save_my_business(jsonb), public.admin_set_business_verified(uuid, boolean),
  public.admin_set_business_suspended(uuid, boolean, text), public.admin_business_overview(),
  public.save_invoice_draft(uuid, uuid, date, date, text, jsonb), public.delete_invoice_draft(uuid),
  public.issue_invoice(uuid), public.cancel_invoice(uuid, text),
  public.record_invoice_payment(uuid, bigint, date, text, text, text, text), public.reverse_invoice_payment(uuid, text),
  public.set_document_share(text, uuid, boolean, boolean), public.my_business_document(text, uuid),
  public.public_document(text), public.coop_sale_receipt(uuid)
to authenticated;

-- customers of a member open a shared document without signing in
grant execute on function public.public_document(text) to anon;
