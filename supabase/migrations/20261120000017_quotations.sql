-- =============================================================================
-- KoopKITA — "Bisnes Saya": quotations (Sebut Harga) for services and contractors.
--
--   draft → sent (QT-YYMMDDNNN, frozen) → accepted / rejected → converted
--   "Tukar ke Invois" copies the items, scope of work and terms into a new
--   invoice draft; deposit and balance are then recorded as partial payments.
--   Deleting that invoice draft puts the quotation back to "accepted".
--   "Tamat tempoh" (expired) is shown when a sent quotation is past its
--   valid-until date; it is not stored.
-- A quotation is not a sale: sales totals only count invoices and receipts.
-- Also: invoices carry the scope of work and terms copied from a quotation, and
-- the business profile keeps default terms for new quotations.
-- =============================================================================

alter table public.business_profiles add column default_terms text
  check (default_terms is null or char_length(default_terms) <= 2000);

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.business_quotes (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.business_profiles (id) on delete restrict,
  customer_id          uuid not null references public.business_customers (id) on delete restrict,
  quote_no             text,
  status               text not null default 'draft'
                         check (status in ('draft', 'sent', 'accepted', 'rejected', 'converted')),
  issue_date           date not null,
  valid_until          date not null,
  scope                text check (scope is null or char_length(scope) <= 2000),
  terms                text check (terms is null or char_length(terms) <= 2000),
  subtotal_sen         bigint not null default 0 check (subtotal_sen >= 0),
  discount_sen         bigint not null default 0 check (discount_sen >= 0),
  tax_rate_bp          integer not null default 0 check (tax_rate_bp between 0 and 2500),
  tax_sen              bigint not null default 0 check (tax_sen >= 0),
  total_sen            bigint not null default 0 check (total_sen >= 0),
  customer_snapshot    jsonb,
  business_snapshot    jsonb,
  share_token          text unique,
  share_enabled        boolean not null default true,
  sent_at              timestamptz,
  decided_at           timestamptz,
  converted_invoice_id uuid,
  created_by           uuid not null references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (business_id, quote_no),
  check (valid_until >= issue_date),
  check (status = 'draft' or (quote_no is not null and customer_snapshot is not null
                              and business_snapshot is not null and sent_at is not null and share_token is not null))
);
create index business_quotes_business_idx on public.business_quotes (business_id, created_at desc);

create table public.business_quote_items (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references public.business_quotes (id) on delete cascade,
  position        integer not null check (position between 1 and 100),
  description     text not null check (char_length(description) between 1 and 300),
  quantity        numeric(12, 3) not null check (quantity > 0),
  unit_price_sen  bigint not null check (unit_price_sen >= 0),
  discount_sen    bigint not null default 0 check (discount_sen >= 0),
  line_total_sen  bigint not null check (line_total_sen >= 0),
  unique (quote_id, position)
);

alter table public.business_invoices
  add column scope text check (scope is null or char_length(scope) <= 2000),
  add column terms text check (terms is null or char_length(terms) <= 2000),
  add column quote_id uuid references public.business_quotes (id) on delete restrict;
alter table public.business_quotes
  add constraint business_quotes_converted_invoice_fkey
  foreign key (converted_invoice_id) references public.business_invoices (id) on delete set null;

alter table app_private.business_daily_counters drop constraint business_daily_counters_kind_check;
alter table app_private.business_daily_counters add constraint business_daily_counters_kind_check check (kind in ('INV', 'RCP', 'QT'));

create trigger trg_business_quotes_updated_at before update on public.business_quotes
for each row execute function app_private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Integrity guards
-- -----------------------------------------------------------------------------
create or replace function app_private.guard_business_quote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'IMMUTABLE_RECORD: quotation % cannot be deleted', old.quote_no using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and (
       new.quote_no is distinct from old.quote_no or new.business_id <> old.business_id
    or new.customer_id <> old.customer_id or new.issue_date <> old.issue_date or new.valid_until <> old.valid_until
    or new.scope is distinct from old.scope or new.terms is distinct from old.terms
    or new.subtotal_sen <> old.subtotal_sen or new.discount_sen <> old.discount_sen
    or new.tax_rate_bp <> old.tax_rate_bp or new.tax_sen <> old.tax_sen or new.total_sen <> old.total_sen
    or new.customer_snapshot is distinct from old.customer_snapshot
    or new.business_snapshot is distinct from old.business_snapshot or new.sent_at is distinct from old.sent_at
    or new.status = 'draft') then
    raise exception 'IMMUTABLE_RECORD: quotation % cannot be edited', old.quote_no using errcode = 'P0001';
  end if;
  if new.status <> old.status and not (
       (old.status = 'draft' and new.status = 'sent')
    or (old.status in ('sent', 'accepted', 'rejected') and new.status in ('accepted', 'rejected', 'converted'))
    or (old.status = 'converted' and new.status = 'accepted' and new.converted_invoice_id is null)) then
    raise exception 'IMMUTABLE_RECORD: quotation % cannot go from % to %', old.quote_no, old.status, new.status using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_business_quotes_guard before update or delete on public.business_quotes
for each row execute function app_private.guard_business_quote();

create or replace function app_private.guard_business_quote_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.business_quotes
   where id = case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
  if v_status is null or v_status = 'draft' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'IMMUTABLE_RECORD: items of a sent quotation cannot be changed' using errcode = 'P0001';
end;
$$;

create trigger trg_business_quote_items_guard before insert or update or delete on public.business_quote_items
for each row execute function app_private.guard_business_quote_item();

do $$
declare t text;
begin
  foreach t in array array['business_quotes', 'business_quote_items'] loop
    execute format('create trigger trg_%s_no_truncate before truncate on public.%I '
                   'for each statement execute function app_private.forbid_truncate()', t, t);
  end loop;
end $$;

-- Invoices: scope and terms are frozen with the rest of an issued invoice.
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
    or new.customer_id is distinct from old.customer_id or new.issue_date <> old.issue_date or new.due_date <> old.due_date
    or new.subtotal_sen <> old.subtotal_sen or new.discount_sen <> old.discount_sen
    or new.tax_rate_bp <> old.tax_rate_bp or new.tax_sen <> old.tax_sen or new.total_sen <> old.total_sen
    or new.notes is distinct from old.notes or new.customer_snapshot is distinct from old.customer_snapshot
    or new.business_snapshot is distinct from old.business_snapshot or new.issued_at is distinct from old.issued_at
    or new.scope is distinct from old.scope or new.terms is distinct from old.terms
    or new.quote_id is distinct from old.quote_id
    or new.is_direct <> old.is_direct or new.status = 'draft') then
    raise exception 'IMMUTABLE_RECORD: issued invoice % cannot be edited', old.invoice_no using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function app_private.recalc_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q public.business_quotes%rowtype;
  v_b public.business_profiles%rowtype;
  v_sub bigint;
  v_disc bigint;
  v_rate integer;
  v_tax bigint;
begin
  select * into v_q from public.business_quotes where id = p_quote_id;
  select * into v_b from public.business_profiles where id = v_q.business_id;
  select coalesce(sum(round(quantity * unit_price_sen)), 0)::bigint, coalesce(sum(discount_sen), 0)::bigint
    into v_sub, v_disc
    from public.business_quote_items where quote_id = p_quote_id;
  v_rate := case when v_b.sst_enabled then v_b.sst_rate_bp else 0 end;
  v_tax := round((v_sub - v_disc) * v_rate / 10000.0)::bigint;
  update public.business_quotes
     set subtotal_sen = v_sub, discount_sen = v_disc, tax_rate_bp = v_rate, tax_sen = v_tax,
         total_sen = v_sub - v_disc + v_tax
   where id = p_quote_id;
end;
$$;

-- Same shape as document_json, kind 'quote': invoice_no = quote number, due_date = valid until.
create or replace function app_private.quote_json(p_quote_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', 'quote',
    'invoice', jsonb_build_object(
      'id', q.id, 'invoice_no', q.quote_no, 'status', q.status, 'issue_date', q.issue_date, 'due_date', q.valid_until,
      'is_direct', false, 'scope', q.scope, 'terms', q.terms,
      'subtotal_sen', q.subtotal_sen, 'discount_sen', q.discount_sen, 'tax_rate_bp', q.tax_rate_bp,
      'tax_sen', q.tax_sen, 'total_sen', q.total_sen, 'paid_sen', 0, 'notes', null,
      'cancel_reason', null, 'cancelled_at', null, 'share_token', q.share_token,
      'overdue', q.status in ('sent', 'accepted') and q.valid_until < app_private.today_kl(),
      'customer', coalesce(q.customer_snapshot,
                   (select jsonb_build_object('name', c.name, 'phone', c.phone, 'email', c.email, 'address', c.address)
                      from public.business_customers c where c.id = q.customer_id)),
      'business', coalesce(q.business_snapshot,
                   (select jsonb_build_object('name', b.name, 'ssm_no', b.ssm_no, 'ssm_verified', b.ssm_verified_at is not null,
                                              'phone', b.phone, 'email', b.email, 'address', b.address,
                                              'bank_name', b.bank_name, 'bank_account_no', b.bank_account_no,
                                              'bank_account_holder', b.bank_account_holder, 'logo_path', b.logo_path,
                                              'sst_reg_no', b.sst_reg_no)
                      from public.business_profiles b where b.id = q.business_id)),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
                           'description', it.description, 'quantity', it.quantity, 'unit_price_sen', it.unit_price_sen,
                           'discount_sen', it.discount_sen, 'line_total_sen', it.line_total_sen) order by it.position)
                           from public.business_quote_items it where it.quote_id = q.id), '[]'::jsonb)),
    'payment', null
  )
  from public.business_quotes q where q.id = p_quote_id
$$;

-- Invoice / receipt JSON, now with the scope of work and terms.
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
      'is_direct', i.is_direct, 'scope', i.scope, 'terms', i.terms,
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
-- Quotation RPCs
-- -----------------------------------------------------------------------------
create or replace function public.save_quote_draft(
  p_id uuid, p_customer_id uuid, p_issue_date date, p_valid_until date, p_scope text, p_terms text, p_items jsonb)
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
  if p_issue_date is null or p_valid_until is null or p_valid_until < p_issue_date then
    perform app_private.err('VALIDATION', 'Tarikh sah sehingga mesti pada atau selepas tarikh sebut harga.');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    perform app_private.err('VALIDATION', 'Tambah sekurang-kurangnya satu item (maksimum 100).');
  end if;

  if v_id is null then
    insert into public.business_quotes (business_id, customer_id, issue_date, valid_until, scope, terms, created_by)
    values (v_b.id, p_customer_id, p_issue_date, p_valid_until, nullif(btrim(coalesce(p_scope, '')), ''),
            nullif(btrim(coalesce(p_terms, '')), ''), v_uid)
    returning id into v_id;
  else
    perform 1 from public.business_quotes where id = v_id and business_id = v_b.id and status = 'draft' for update;
    if not found then
      perform app_private.err('CONFLICT', 'Hanya draf sebut harga boleh diubah.');
    end if;
    update public.business_quotes
       set customer_id = p_customer_id, issue_date = p_issue_date, valid_until = p_valid_until,
           scope = nullif(btrim(coalesce(p_scope, '')), ''), terms = nullif(btrim(coalesce(p_terms, '')), '')
     where id = v_id;
    delete from public.business_quote_items where quote_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    v_qty := (v_item ->> 'quantity')::numeric;
    v_price := (v_item ->> 'unit_price_sen')::bigint;
    v_disc := coalesce((v_item ->> 'discount_sen')::bigint, 0);
    if coalesce(char_length(btrim(v_item ->> 'description')), 0) = 0 or v_qty is null or v_qty <= 0
       or v_price is null or v_price < 0 or v_disc < 0 or v_disc > round(v_qty * v_price) then
      perform app_private.err('VALIDATION', 'Item ' || v_pos || ' tidak sah (perkara, unit, harga atau diskaun).');
    end if;
    insert into public.business_quote_items (quote_id, position, description, quantity, unit_price_sen, discount_sen, line_total_sen)
    values (v_id, v_pos, btrim(v_item ->> 'description'), v_qty, v_price, v_disc, round(v_qty * v_price)::bigint - v_disc);
  end loop;

  perform app_private.recalc_quote(v_id);
  return v_id;
end;
$$;

create or replace function public.delete_quote_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
begin
  delete from public.business_quotes where id = p_id and business_id = v_b.id and status = 'draft';
  if not found then
    perform app_private.err('CONFLICT', 'Hanya draf sebut harga boleh dipadam.');
  end if;
end;
$$;

-- Give the quotation its number and freeze it.
create or replace function public.send_quote(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
  v_q public.business_quotes%rowtype;
  v_no text;
begin
  select * into v_q from public.business_quotes where id = p_id and business_id = v_b.id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Sebut harga tidak dijumpai.');
  end if;
  if v_q.status <> 'draft' then
    return v_q.quote_no; -- idempotent
  end if;
  perform app_private.recalc_quote(p_id);
  select * into v_q from public.business_quotes where id = p_id;
  if v_q.total_sen <= 0 then
    perform app_private.err('VALIDATION', 'Jumlah sebut harga mesti lebih daripada sifar.');
  end if;
  v_no := app_private.next_document_no(v_b.id, 'QT', v_q.issue_date);
  update public.business_quotes q
     set quote_no = v_no, status = 'sent', sent_at = now(), share_token = app_private.new_share_token(),
         customer_snapshot = (select jsonb_build_object('name', c.name, 'phone', c.phone, 'email', c.email, 'address', c.address)
                                from public.business_customers c where c.id = q.customer_id),
         business_snapshot = jsonb_build_object(
           'name', v_b.name, 'ssm_no', v_b.ssm_no, 'ssm_verified', v_b.ssm_verified_at is not null, 'phone', v_b.phone,
           'email', v_b.email, 'address', v_b.address, 'bank_name', v_b.bank_name, 'bank_account_no', v_b.bank_account_no,
           'bank_account_holder', v_b.bank_account_holder, 'logo_path', v_b.logo_path, 'sst_reg_no', v_b.sst_reg_no)
   where q.id = p_id;
  perform app_private.audit('business.quote_sent', 'business_quote', p_id::text,
    jsonb_build_object('quote_no', v_no, 'total_sen', v_q.total_sen));
  return v_no;
end;
$$;

-- Record the customer's answer.
create or replace function public.set_quote_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
  v_q public.business_quotes%rowtype;
begin
  if p_status not in ('accepted', 'rejected') then
    perform app_private.err('VALIDATION', 'Status tidak sah.');
  end if;
  select * into v_q from public.business_quotes where id = p_id and business_id = v_b.id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Sebut harga tidak dijumpai.');
  end if;
  if v_q.status not in ('sent', 'accepted', 'rejected') then
    perform app_private.err('CONFLICT', 'Status sebut harga ini tidak boleh diubah.');
  end if;
  update public.business_quotes set status = p_status, decided_at = now() where id = p_id;
  perform app_private.audit('business.quote_' || p_status, 'business_quote', p_id::text, jsonb_build_object('quote_no', v_q.quote_no));
end;
$$;

-- "Tukar ke Invois": a new invoice draft with the same items, scope and terms. Returns the invoice id.
create or replace function public.convert_quote_to_invoice(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
  v_q public.business_quotes%rowtype;
  v_inv uuid;
begin
  select * into v_q from public.business_quotes where id = p_id and business_id = v_b.id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Sebut harga tidak dijumpai.');
  end if;
  if v_q.status = 'converted' and v_q.converted_invoice_id is not null then
    return v_q.converted_invoice_id; -- idempotent
  end if;
  if v_q.status not in ('sent', 'accepted') then
    perform app_private.err('CONFLICT', 'Hanya sebut harga yang dihantar atau diterima boleh ditukar ke invois.');
  end if;

  insert into public.business_invoices (business_id, customer_id, issue_date, due_date, notes, scope, terms, quote_id, created_by)
  values (v_b.id, v_q.customer_id, app_private.today_kl(), app_private.today_kl() + 14, v_b.default_notes,
          v_q.scope, v_q.terms, v_q.id, auth.uid())
  returning id into v_inv;
  insert into public.business_invoice_items (invoice_id, position, description, quantity, unit_price_sen, discount_sen, line_total_sen)
  select v_inv, position, description, quantity, unit_price_sen, discount_sen, line_total_sen
    from public.business_quote_items where quote_id = v_q.id;
  perform app_private.recalc_invoice(v_inv);

  update public.business_quotes set status = 'converted', converted_invoice_id = v_inv, decided_at = coalesce(decided_at, now())
   where id = p_id;
  perform app_private.audit('business.quote_converted', 'business_quote', p_id::text,
    jsonb_build_object('quote_no', v_q.quote_no, 'invoice_id', v_inv));
  return v_inv;
end;
$$;

-- "Salin & ubah": a new draft copy of any quotation (a sent one cannot be edited).
create or replace function public.duplicate_quote(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
  v_q public.business_quotes%rowtype;
  v_new uuid;
begin
  select * into v_q from public.business_quotes where id = p_id and business_id = v_b.id;
  if not found then
    perform app_private.err('NOT_FOUND', 'Sebut harga tidak dijumpai.');
  end if;
  insert into public.business_quotes (business_id, customer_id, issue_date, valid_until, scope, terms, created_by)
  values (v_b.id, v_q.customer_id, app_private.today_kl(), app_private.today_kl() + (v_q.valid_until - v_q.issue_date),
          v_q.scope, v_q.terms, auth.uid())
  returning id into v_new;
  insert into public.business_quote_items (quote_id, position, description, quantity, unit_price_sen, discount_sen, line_total_sen)
  select v_new, position, description, quantity, unit_price_sen, discount_sen, line_total_sen
    from public.business_quote_items where quote_id = v_q.id;
  perform app_private.recalc_quote(v_new);
  return v_new;
end;
$$;

-- Deleting an invoice draft made from a quotation puts the quotation back to "accepted".
create or replace function public.delete_invoice_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
begin
  update public.business_quotes set status = 'accepted', converted_invoice_id = null
   where converted_invoice_id = p_id and business_id = v_b.id
     and exists (select 1 from public.business_invoices i where i.id = p_id and i.status = 'draft');
  delete from public.business_invoices where id = p_id and business_id = v_b.id and status = 'draft';
  if not found then
    perform app_private.err('CONFLICT', 'Hanya draf invois boleh dipadam.');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sharing and document access, now including quotations
-- -----------------------------------------------------------------------------
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
     where id = p_id and business_id = v_b.id and status <> 'draft' and not is_direct
    returning share_token into v_token;
  elsif p_kind = 'receipt' then
    update public.business_payments
       set share_enabled = p_enabled,
           share_token = case when p_regenerate then app_private.new_share_token() else share_token end
     where id = p_id and business_id = v_b.id
    returning share_token into v_token;
  elsif p_kind = 'quote' then
    update public.business_quotes
       set share_enabled = p_enabled,
           share_token = case when p_regenerate then app_private.new_share_token() else share_token end
     where id = p_id and business_id = v_b.id and status <> 'draft'
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

create or replace function public.my_business_document(p_kind text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_invoice uuid;
  v_quote uuid;
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
  elsif p_kind = 'quote' then
    select q.id into v_quote from public.business_quotes q
      join public.business_profiles b on b.id = q.business_id
     where q.id = p_id and b.owner_id = v_uid;
    if v_quote is null then perform app_private.err('NOT_FOUND', 'Dokumen tidak dijumpai.'); end if;
    return app_private.quote_json(v_quote);
  end if;
  perform app_private.err('VALIDATION', 'Jenis dokumen tidak sah.');
  return null;
end;
$$;

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
  v_quote uuid;
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
  select id into v_quote from public.business_quotes
   where share_token = p_token and share_enabled and status <> 'draft';
  if v_quote is not null then
    return app_private.quote_json(v_quote);
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Business profile: default terms for new quotations
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
        logo_path, sst_enabled, sst_rate_bp, sst_reg_no, default_notes, default_terms)
      values (
        v_uid, btrim(p_data ->> 'name'), v_ssm, regexp_replace(coalesce(p_data ->> 'phone', ''), '[\s-]', '', 'g'),
        nullif(btrim(coalesce(p_data ->> 'email', '')), ''), nullif(btrim(coalesce(p_data ->> 'address', '')), ''),
        nullif(btrim(coalesce(p_data ->> 'bank_name', '')), ''),
        nullif(regexp_replace(coalesce(p_data ->> 'bank_account_no', ''), '[\s-]', '', 'g'), ''),
        nullif(btrim(coalesce(p_data ->> 'bank_account_holder', '')), ''), v_logo, v_sst,
        case when v_sst then coalesce((p_data ->> 'sst_rate_bp')::integer, 0) else 0 end,
        nullif(btrim(coalesce(p_data ->> 'sst_reg_no', '')), ''), nullif(btrim(coalesce(p_data ->> 'default_notes', '')), ''),
        nullif(btrim(coalesce(p_data ->> 'default_terms', '')), ''))
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
        default_terms = nullif(btrim(coalesce(p_data ->> 'default_terms', '')), ''),
        -- a changed SSM number needs to be verified again
        ssm_verified_at = case when v_ssm is distinct from v_old.ssm_no then null else ssm_verified_at end,
        ssm_verified_by = case when v_ssm is distinct from v_old.ssm_no then null else ssm_verified_by end
      where id = v_old.id
      returning id into v_id;
      perform app_private.audit('business.updated', 'business_profile', v_id::text,
        jsonb_build_object('ssm_changed', v_ssm is distinct from v_old.ssm_no));
    end if;
  exception when check_violation or not_null_violation then
    perform app_private.err('VALIDATION', 'Sila semak maklumat bisnes (nama, telefon, SSM, e-mel, akaun bank, kadar SST, terma).');
  end;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security and grants
-- -----------------------------------------------------------------------------
alter table public.business_quotes      enable row level security;
alter table public.business_quote_items enable row level security;
grant select on public.business_quotes, public.business_quote_items to authenticated;

create policy business_quotes_select on public.business_quotes for select to authenticated
  using ((select app_private.owns_business(business_id)));
create policy business_quote_items_select on public.business_quote_items for select to authenticated
  using (exists (select 1 from public.business_quotes q where q.id = quote_id and (select app_private.owns_business(q.business_id))));

revoke execute on all functions in schema app_private from public;
grant execute on function app_private.is_admin() to authenticated, service_role;
grant execute on function app_private.is_active_member() to authenticated, service_role;
grant execute on function app_private.owns_business(uuid) to authenticated, service_role;

revoke execute on function
  public.save_quote_draft(uuid, uuid, date, date, text, text, jsonb), public.delete_quote_draft(uuid),
  public.send_quote(uuid), public.set_quote_status(uuid, text), public.convert_quote_to_invoice(uuid),
  public.duplicate_quote(uuid)
from public, anon;
grant execute on function
  public.save_quote_draft(uuid, uuid, date, date, text, text, jsonb), public.delete_quote_draft(uuid),
  public.send_quote(uuid), public.set_quote_status(uuid, text), public.convert_quote_to_invoice(uuid),
  public.duplicate_quote(uuid)
to authenticated;
