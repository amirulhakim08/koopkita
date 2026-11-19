-- =============================================================================
-- KoopKITA — "Bisnes Saya": direct-sale receipts (Resit Jualan Langsung).
--
-- A member can issue a receipt for a sale paid on the spot, without an invoice.
-- Internally the sale is stored as a "direct" business_invoices row that is paid
-- in full at creation (status 'paid', no invoice number, never shared or shown
-- as an invoice) plus one business_payments row (the receipt, RCP-YYYY-NNNN).
-- This keeps the existing guarantees: atomic numbering, frozen items, receipts
-- that are never edited or deleted, and reversal instead of deletion. Reversing
-- a direct-sale receipt cancels the sale.
-- The customer is optional ("Pelanggan Tunai").
-- =============================================================================

alter table public.business_invoices add column is_direct boolean not null default false;
alter table public.business_invoices alter column customer_id drop not null;

alter table public.business_invoices drop constraint business_invoices_check2;
alter table public.business_invoices add constraint business_invoices_issued_complete check (
  status = 'draft' or ((invoice_no is not null or is_direct) and customer_snapshot is not null
                       and business_snapshot is not null and issued_at is not null and share_token is not null));
alter table public.business_invoices add constraint business_invoices_direct_shape check (
  not is_direct or (invoice_no is null and status in ('draft', 'paid', 'cancelled')));
alter table public.business_invoices add constraint business_invoices_customer_required check (
  customer_id is not null or is_direct);

create index business_invoices_direct_idx on public.business_invoices (business_id, is_direct);

-- Issued documents stay frozen; is_direct can never change after issue.
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
    or new.is_direct <> old.is_direct or new.status = 'draft') then
    raise exception 'IMMUTABLE_RECORD: issued invoice % cannot be edited', old.invoice_no using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- A direct sale whose receipt is reversed becomes cancelled (never "unpaid").
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
         status = case when v_paid = 0 and is_direct then 'cancelled'
                       when v_paid = 0 then 'issued'
                       when v_paid >= total_sen then 'paid'
                       else 'partially_paid' end,
         cancelled_at = case when v_paid = 0 and is_direct then now() else cancelled_at end,
         cancel_reason = case when v_paid = 0 and is_direct then coalesce(cancel_reason, 'Resit jualan langsung dibalikkan')
                              else cancel_reason end
   where id = p_invoice_id and status <> 'cancelled';
end;
$$;

-- Same document JSON as before, plus is_direct.
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
      'is_direct', i.is_direct,
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

-- Direct sales have no invoice link of their own; only the receipt is shared.
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
  else
    perform app_private.err('VALIDATION', 'Jenis dokumen tidak sah.');
  end if;
  if v_token is null then
    perform app_private.err('NOT_FOUND', 'Dokumen tidak dijumpai.');
  end if;
  return v_token;
end;
$$;

-- Receipt for a sale paid on the spot. Returns the receipt (payment) id.
create or replace function public.create_direct_receipt(
  p_customer_id uuid, p_paid_on date, p_method text, p_reference text, p_proof_path text,
  p_notes text, p_items jsonb, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.business_profiles := app_private.require_business();
  v_uid uuid := auth.uid();
  v_inv uuid;
  v_id uuid;
  v_no text;
  v_total bigint;
  v_item jsonb;
  v_pos integer := 0;
  v_qty numeric;
  v_price bigint;
  v_disc bigint;
  v_customer jsonb;
begin
  if p_idempotency_key is not null then
    select id into v_id from public.business_payments where idempotency_key = p_idempotency_key and business_id = v_b.id;
    if found then return v_id; end if;
  end if;
  perform app_private.rate_limit('business_payment:' || v_uid, 120, 3600);

  if p_customer_id is not null then
    select jsonb_build_object('name', c.name, 'phone', c.phone, 'email', c.email, 'address', c.address) into v_customer
      from public.business_customers c where c.id = p_customer_id and c.business_id = v_b.id;
    if v_customer is null then
      perform app_private.err('VALIDATION', 'Pelanggan tidak dijumpai.');
    end if;
  else
    v_customer := jsonb_build_object('name', 'Pelanggan Tunai', 'phone', null, 'email', null, 'address', null);
  end if;
  if p_paid_on is null or p_paid_on > app_private.today_kl() or p_paid_on < app_private.today_kl() - 365 then
    perform app_private.err('VALIDATION', 'Tarikh jualan tidak sah.');
  end if;
  if p_method is null or p_method not in ('bank_transfer', 'duitnow', 'cash', 'card', 'cheque', 'other') then
    perform app_private.err('VALIDATION', 'Kaedah bayaran tidak sah.');
  end if;
  if p_proof_path is not null then
    perform app_private.check_own_path(p_proof_path);
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    perform app_private.err('VALIDATION', 'Tambah sekurang-kurangnya satu item (maksimum 100).');
  end if;

  insert into public.business_invoices (business_id, customer_id, issue_date, due_date, notes, is_direct, share_enabled, created_by)
  values (v_b.id, p_customer_id, p_paid_on, p_paid_on, nullif(btrim(coalesce(p_notes, '')), ''), true, false, v_uid)
  returning id into v_inv;

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
    values (v_inv, v_pos, btrim(v_item ->> 'description'), v_qty, v_price, v_disc, round(v_qty * v_price)::bigint - v_disc);
  end loop;

  perform app_private.recalc_invoice(v_inv);
  select total_sen into v_total from public.business_invoices where id = v_inv;
  if v_total <= 0 then
    perform app_private.err('VALIDATION', 'Jumlah jualan mesti lebih daripada sifar.');
  end if;

  update public.business_invoices
     set status = 'paid', paid_sen = v_total, issued_at = now(), share_token = app_private.new_share_token(),
         customer_snapshot = v_customer,
         business_snapshot = jsonb_build_object(
           'name', v_b.name, 'ssm_no', v_b.ssm_no, 'ssm_verified', v_b.ssm_verified_at is not null, 'phone', v_b.phone,
           'email', v_b.email, 'address', v_b.address, 'bank_name', v_b.bank_name, 'bank_account_no', v_b.bank_account_no,
           'bank_account_holder', v_b.bank_account_holder, 'logo_path', v_b.logo_path, 'sst_reg_no', v_b.sst_reg_no)
   where id = v_inv;

  v_no := app_private.next_document_no(v_b.id, 'RCP', p_paid_on);
  insert into public.business_payments (
    invoice_id, business_id, receipt_no, amount_sen, paid_on, method, reference, proof_path, share_token,
    idempotency_key, created_by)
  values (
    v_inv, v_b.id, v_no, v_total, p_paid_on, p_method, nullif(btrim(coalesce(p_reference, '')), ''),
    p_proof_path, app_private.new_share_token(), p_idempotency_key, v_uid)
  returning id into v_id;

  perform app_private.audit('business.direct_receipt_created', 'business_payment', v_id::text,
    jsonb_build_object('receipt_no', v_no, 'amount_sen', v_total));
  return v_id;
end;
$$;

-- Invoice counts and totals exclude direct sales; money received includes them.
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
           (select count(*) from public.business_invoices i
             where i.business_id = b.id and not i.is_direct and i.status not in ('draft', 'cancelled')),
           (select coalesce(sum(i.total_sen), 0) from public.business_invoices i
             where i.business_id = b.id and not i.is_direct and i.status not in ('draft', 'cancelled'))::bigint,
           (select coalesce(sum(x.amount_sen), 0) from public.business_payments x
             where x.business_id = b.id and x.reversed_at is null)::bigint,
           (select coalesce(sum(i.total_sen - i.paid_sen), 0) from public.business_invoices i
             where i.business_id = b.id and i.status in ('issued', 'partially_paid'))::bigint,
           b.created_at
      from public.business_profiles b join public.profiles p on p.id = b.owner_id
     order by b.created_at desc;
end;
$$;

revoke execute on function public.create_direct_receipt(uuid, date, text, text, text, text, jsonb, text) from public, anon;
grant execute on function public.create_direct_receipt(uuid, date, text, text, text, text, jsonb, text) to authenticated;
revoke execute on function app_private.guard_business_invoice(), app_private.refresh_invoice_payment_status(uuid),
  app_private.document_json(uuid, uuid) from public;
