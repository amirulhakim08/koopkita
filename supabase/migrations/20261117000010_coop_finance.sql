-- =============================================================================
-- KoopKITA V1.0 — Cooperative finance (Kewangan Koperasi), Super Admin only
--
--  * coop_ledger_entries: manual money-in / money-out records for every business
--    of the cooperative (withdrawals, operating expenses, other income ...).
--    Every entry needs a reason/description. Append-only: corrections are made
--    with a reversal entry. No member can read or write this table.
--  * admin_finance_summary(): total cooperative funds =
--        approved share capital + verified Qurban customer payments
--      − commission payouts + manual money in − manual money out
--  * admin_cashbook(): one chronological cash book combining the automatic
--    flows above with the manual entries.
-- =============================================================================

create sequence public.coop_entry_no_seq start 1;

create table public.coop_ledger_entries (
  id               uuid primary key default gen_random_uuid(),
  entry_no         text not null unique,
  direction        text not null check (direction in ('in', 'out')),
  category         text not null,
  business         text not null default 'umum'
                     check (business in ('umum', 'korban', 'pertanian', 'pelancongan', 'lain_lain')),
  amount_sen       bigint not null check (amount_sen > 0),
  entry_date       date not null,
  description      text not null check (char_length(description) between 5 and 500),
  reference        text check (reference is null or char_length(reference) <= 100),
  proof_path       text,
  reverses_id      uuid unique references public.coop_ledger_entries (id),
  idempotency_key  text unique,
  recorded_by      uuid not null references public.profiles (id),
  created_at       timestamptz not null default now(),
  check (
    reverses_id is not null
    or (direction = 'in' and category in
          ('baki_permulaan', 'hasil_perniagaan', 'sumbangan', 'yuran', 'pinjaman_diterima', 'lain_lain_masuk'))
    or (direction = 'out' and category in
          ('pengeluaran_tunai', 'perbelanjaan_operasi', 'pembelian_aset', 'pembelian_stok', 'gaji_elaun',
           'sewa_utiliti', 'bayaran_balik_pinjaman', 'pemulangan_bayaran', 'lain_lain_keluar'))
  )
);

create index coop_ledger_entries_date_idx on public.coop_ledger_entries (entry_date desc, created_at desc);
create index coop_ledger_entries_business_idx on public.coop_ledger_entries (business, entry_date);

create trigger trg_coop_ledger_entries_immutable
before update or delete on public.coop_ledger_entries
for each row execute function app_private.forbid_change();

create trigger trg_coop_ledger_entries_no_truncate
before truncate on public.coop_ledger_entries
for each statement execute function app_private.forbid_truncate();

alter table public.coop_ledger_entries enable row level security;
grant select on public.coop_ledger_entries to authenticated;
-- Super Admin only. Members never see cooperative finances.
create policy coop_ledger_admin_select on public.coop_ledger_entries for select to authenticated
  using ((select app_private.is_admin()));

-- -----------------------------------------------------------------------------
create or replace function public.record_coop_entry(
  p_direction text,
  p_category text,
  p_business text,
  p_amount_sen bigint,
  p_entry_date date,
  p_description text,
  p_reference text default null,
  p_proof_path text default null,
  p_idempotency_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_id uuid;
begin
  if p_idempotency_key is not null then
    select id into v_id from public.coop_ledger_entries where idempotency_key = p_idempotency_key;
    if found then return v_id; end if;
  end if;
  perform app_private.rate_limit('coop_entry:' || v_admin, 120, 3600);
  if p_direction not in ('in', 'out') then
    perform app_private.err('VALIDATION', 'Jenis rekod tidak sah.');
  end if;
  if p_amount_sen is null or p_amount_sen <= 0 then
    perform app_private.err('VALIDATION', 'Jumlah mesti lebih daripada sifar.');
  end if;
  if p_entry_date is null or p_entry_date > app_private.today_kl() or p_entry_date < date '2000-01-01' then
    perform app_private.err('VALIDATION', 'Tarikh tidak sah.');
  end if;
  if coalesce(char_length(btrim(p_description)), 0) < 5 then
    perform app_private.err('VALIDATION', case when p_direction = 'out'
      then 'Sila nyatakan sebab pengeluaran (sekurang-kurangnya 5 aksara).'
      else 'Sila nyatakan keterangan (sekurang-kurangnya 5 aksara).' end);
  end if;
  if p_proof_path is not null then
    perform app_private.check_own_path(p_proof_path);
  end if;

  begin
    insert into public.coop_ledger_entries (
      entry_no, direction, category, business, amount_sen, entry_date, description, reference, proof_path,
      idempotency_key, recorded_by)
    values (
      case when p_direction = 'in' then 'KM-' else 'KK-' end
        || to_char(p_entry_date, 'YYYY') || '-' || lpad(nextval('public.coop_entry_no_seq')::text, 5, '0'),
      p_direction, p_category, coalesce(nullif(p_business, ''), 'umum'), p_amount_sen, p_entry_date,
      btrim(p_description), nullif(btrim(coalesce(p_reference, '')), ''), p_proof_path,
      p_idempotency_key, v_admin)
    returning id into v_id;
  exception when check_violation then
    perform app_private.err('VALIDATION', 'Kategori atau perniagaan tidak sah untuk jenis rekod ini.');
  end;

  perform app_private.audit(case when p_direction = 'in' then 'finance.money_in' else 'finance.money_out' end,
    'coop_ledger_entry', v_id::text,
    jsonb_build_object('amount_sen', p_amount_sen, 'category', p_category, 'business', p_business,
                       'description', btrim(p_description)));
  return v_id;
end;
$$;

create or replace function public.reverse_coop_entry(p_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_entry public.coop_ledger_entries%rowtype;
  v_id uuid;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab pembalikan.');
  end if;
  select * into v_entry from public.coop_ledger_entries where id = p_id for update;
  if not found or v_entry.reverses_id is not null then
    perform app_private.err('NOT_FOUND', 'Rekod tidak dijumpai atau tidak boleh dibalikkan.');
  end if;
  select id into v_id from public.coop_ledger_entries where reverses_id = p_id;
  if found then
    return v_id; -- already reversed
  end if;
  insert into public.coop_ledger_entries (
    entry_no, direction, category, business, amount_sen, entry_date, description, reference, reverses_id, recorded_by)
  values (
    v_entry.entry_no || '-R', case when v_entry.direction = 'in' then 'out' else 'in' end,
    v_entry.category, v_entry.business, v_entry.amount_sen, app_private.today_kl(),
    left('Pembalikan ' || v_entry.entry_no || ': ' || btrim(p_reason), 500), v_entry.reference, p_id, v_admin)
  returning id into v_id;
  perform app_private.audit('finance.entry_reversed', 'coop_ledger_entry', p_id::text,
    jsonb_build_object('reversal_id', v_id, 'reason', p_reason));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cash book: automatic flows from the share / Qurban / commission modules plus
-- manual entries. Signed amount: money in > 0, money out < 0.
-- -----------------------------------------------------------------------------
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
  select 'korban', ps.id, null, ps.payment_date, 'korban', 'bayaran_korban',
         'Bayaran korban ' || s.sale_no || ' — ' || coalesce(b.full_name, ''),
         ps.transaction_ref, ps.amount_sen, false, false, ps.reviewed_at
    from public.payment_submissions ps
    join public.qurban_sales s on s.id = ps.sale_id
    left join public.buyers b on b.id = s.buyer_id
   where ps.status = 'verified'
  union all
  select 'komisen', po.id, po.payout_no, po.payment_date, 'korban', 'bayaran_komisen',
         case when po.reverses_id is null then 'Bayaran komisen kepada ' else 'Pembalikan bayaran komisen ' end
           || coalesce(p.full_name, '') || coalesce(' (' || p.membership_id || ')', ''),
         po.transaction_ref, -po.amount_sen, false, po.reverses_id is not null, po.created_at
    from public.commission_payouts po join public.profiles p on p.id = po.member_id
  union all
  select 'manual', e.id, e.entry_no, e.entry_date, e.business, e.category, e.description, e.reference,
         case when e.direction = 'in' then e.amount_sen else -e.amount_sen end,
         exists (select 1 from public.coop_ledger_entries r where r.reverses_id = e.id),
         e.reverses_id is not null, e.created_at
    from public.coop_ledger_entries e
$$;

create or replace function public.admin_cashbook(p_from date default null, p_to date default null, p_limit integer default 500)
returns table (
  source text, ref_id uuid, entry_no text, entry_date date, business text, category text,
  description text, reference text, amount_sen bigint, reversed boolean, is_reversal boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
begin
  return query
    select * from app_private.cashbook_rows() c
     where (p_from is null or c.entry_date >= p_from)
       and (p_to is null or c.entry_date <= p_to)
     order by c.entry_date desc, c.created_at desc nulls last
     limit least(greatest(coalesce(p_limit, 500), 1), 10000);
end;
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
      'share_capital_sen',   (select coalesce(sum(amount_sen), 0) from all_rows where source = 'modal_syer'),
      'qurban_received_sen', (select coalesce(sum(amount_sen), 0) from all_rows where source = 'korban'),
      'commission_paid_sen', (select coalesce(-sum(amount_sen), 0) from all_rows where source = 'komisen'),
      'manual_in_sen',       (select coalesce(sum(amount_sen), 0) from all_rows where source = 'manual' and amount_sen > 0),
      'manual_out_sen',      (select coalesce(-sum(amount_sen), 0) from all_rows where source = 'manual' and amount_sen < 0),
      'total_funds_sen',     (select coalesce(sum(amount_sen), 0) from all_rows),
      'funds_excl_share_sen',(select coalesce(sum(amount_sen), 0) from all_rows where source <> 'modal_syer'),
      'period_in_sen',       (select coalesce(sum(amount_sen), 0) from period where amount_sen > 0),
      'period_out_sen',      (select coalesce(-sum(amount_sen), 0) from period where amount_sen < 0),
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

revoke execute on all functions in schema app_private from public;
grant execute on function app_private.is_admin() to authenticated, service_role;
grant execute on function app_private.is_active_member() to authenticated, service_role;
revoke execute on function public.record_coop_entry(text, text, text, bigint, date, text, text, text, text),
  public.reverse_coop_entry(uuid, text), public.admin_cashbook(date, date, integer),
  public.admin_finance_summary(date, date) from public, anon;
grant execute on function public.record_coop_entry(text, text, text, bigint, date, text, text, text, text),
  public.reverse_coop_entry(uuid, text), public.admin_cashbook(date, date, integer),
  public.admin_finance_summary(date, date) to authenticated;
