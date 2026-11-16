-- =============================================================================
-- KoopKITA V1.0 — Sales without configured bank account; commission payout requests
--
-- 1. Members may record Qurban sales even before the cooperative's official bank
--    account is configured (payment instructions are then given outside the app).
-- 2. Members request commission transfers to their own bank account. A request
--    (and any payout) requires complete, valid bank details on the member profile.
--    The Super Admin transfers manually, then records the payout, which settles
--    the request automatically once nothing is outstanding.
-- =============================================================================

-- 1. ---------------------------------------------------------------------------

create or replace function public.create_qurban_sale(
  p_campaign_id uuid,
  p_share_count integer,
  p_buyer jsonb,           -- {full_name, phone, email?, address?}
  p_participants jsonb,    -- [{participant_name, qurban_type?, on_behalf_of?}, ...]
  p_notes text,
  p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_campaign public.campaigns%rowtype;
  v_existing public.qurban_sales%rowtype;
  v_buyer_id uuid;
  v_sale_id uuid;
  v_slots uuid[];
  v_participant jsonb;
  v_pos integer := 0;
  v_type text;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' then
    perform app_private.err('VALIDATION', 'Kunci idempotensi diperlukan.');
  end if;
  select * into v_existing from public.qurban_sales where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.member_id <> v_uid then
      perform app_private.err('CONFLICT', 'Kunci idempotensi tidak sah.');
    end if;
    return v_existing.id;
  end if;

  perform app_private.rate_limit('sale_create:' || v_uid, 20, 3600);

  if p_share_count is null or p_share_count < 1 or p_share_count > 70 then
    perform app_private.err('VALIDATION', 'Bilangan bahagian mesti antara 1 hingga 70.');
  end if;
  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) <> p_share_count then
    perform app_private.err('VALIDATION', 'Nama peserta diperlukan bagi setiap bahagian.');
  end if;
  if coalesce(char_length(btrim(p_buyer ->> 'full_name')), 0) < 3 then
    perform app_private.err('VALIDATION', 'Nama pembeli diperlukan.');
  end if;
  if coalesce(p_buyer ->> 'phone', '') !~ '^\+?[0-9]{9,15}$' then
    perform app_private.err('VALIDATION', 'Nombor telefon pembeli tidak sah.');
  end if;

  -- Lock the campaign: serialises all slot allocation for this campaign.
  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Kempen tidak dijumpai.');
  end if;
  if v_campaign.status <> 'open'
     or app_private.today_kl() < v_campaign.start_date
     or app_private.today_kl() > v_campaign.closing_date then
    perform app_private.err('CONFLICT', 'Kempen ini tidak dibuka untuk jualan.');
  end if;

  perform app_private.expire_reservations(p_campaign_id);

  insert into public.buyers (created_by, full_name, phone, email, address)
  values (v_uid, btrim(p_buyer ->> 'full_name'), p_buyer ->> 'phone',
          nullif(btrim(coalesce(p_buyer ->> 'email', '')), ''),
          nullif(btrim(coalesce(p_buyer ->> 'address', '')), ''))
  returning id into v_buyer_id;

  insert into public.qurban_sales (
    sale_no, campaign_id, member_id, buyer_id, share_count, price_per_share_sen, total_sen,
    status, notes, reservation_expires_at, idempotency_key)
  values (
    'QS-' || v_campaign.year || '-' || lpad(nextval('public.sale_no_seq')::text, 5, '0'),
    p_campaign_id, v_uid, v_buyer_id, p_share_count, v_campaign.price_per_share_sen,
    p_share_count * v_campaign.price_per_share_sen, 'pending_payment', nullif(btrim(p_notes), ''),
    now() + make_interval(hours => v_campaign.reservation_expiry_hours), p_idempotency_key)
  returning id into v_sale_id;

  v_slots := app_private.allocate_slots(p_campaign_id, v_sale_id, p_share_count);

  for v_participant in select * from jsonb_array_elements(p_participants) loop
    v_pos := v_pos + 1;
    v_type := coalesce(nullif(v_participant ->> 'qurban_type', ''), 'korban_sunat');
    insert into public.qurban_participants (sale_id, position, participant_name, qurban_type, on_behalf_of, slot_id, slot_code_snapshot)
    select v_sale_id, v_pos, btrim(v_participant ->> 'participant_name'), v_type,
           nullif(btrim(coalesce(v_participant ->> 'on_behalf_of', '')), ''),
           s.id, c.code || '/' || s.slot_no
      from public.cattle_slots s join public.cattle c on c.id = s.cattle_id
     where s.id = v_slots[v_pos];
  end loop;

  perform app_private.audit('sale.created', 'qurban_sale', v_sale_id::text,
    jsonb_build_object('share_count', p_share_count, 'campaign_id', p_campaign_id));
  return v_sale_id;
end;
$$;

-- 2. ---------------------------------------------------------------------------
create or replace function app_private.valid_bank_details(p_name text, p_account text, p_holder text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(char_length(btrim(p_name)), 0) >= 2
     and coalesce(p_account, '') ~ '^[0-9]{6,20}$'
     and coalesce(char_length(btrim(p_holder)), 0) >= 3
$$;

create table public.commission_payout_requests (
  id                   uuid primary key default gen_random_uuid(),
  member_id            uuid not null references public.profiles (id) on delete restrict,
  amount_sen           bigint not null check (amount_sen > 0),
  bank_name            text not null,
  bank_account_no      text not null check (bank_account_no ~ '^[0-9]{6,20}$'),
  bank_account_holder  text not null,
  notes                text check (notes is null or char_length(notes) <= 500),
  status               text not null default 'pending' check (status in ('pending', 'paid', 'rejected', 'cancelled')),
  payout_id            uuid references public.commission_payouts (id),
  reviewed_by          uuid references public.profiles (id),
  reviewed_at          timestamptz,
  review_notes         text check (review_notes is null or char_length(review_notes) <= 1000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((status = 'pending') = (reviewed_at is null))
);

create unique index commission_payout_requests_one_pending
  on public.commission_payout_requests (member_id) where status = 'pending';
create index commission_payout_requests_status_idx on public.commission_payout_requests (status, created_at);

create trigger trg_commission_payout_requests_updated_at
before update on public.commission_payout_requests
for each row execute function app_private.set_updated_at();

create trigger trg_commission_payout_requests_no_delete
before delete on public.commission_payout_requests
for each row execute function app_private.forbid_delete();

alter table public.commission_payout_requests enable row level security;
grant select on public.commission_payout_requests to authenticated;
create policy payout_requests_select on public.commission_payout_requests for select to authenticated
  using ((member_id = (select auth.uid()) and (select app_private.is_active_member()))
         or (select app_private.is_admin()));

create or replace function public.request_commission_payout(p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_profile public.profiles%rowtype;
  v_outstanding bigint;
  v_id uuid;
begin
  perform app_private.rate_limit('payout_request:' || v_uid, 10, 3600);
  select * into v_profile from public.profiles where id = v_uid for update;
  if not app_private.valid_bank_details(v_profile.bank_name, v_profile.bank_account_no, v_profile.bank_account_holder) then
    perform app_private.err('VALIDATION', 'Sila lengkapkan maklumat akaun bank yang sah dalam profil anda (nama bank, nombor akaun dan nama pemegang akaun).');
  end if;
  if exists (select 1 from public.commission_payout_requests where member_id = v_uid and status = 'pending') then
    perform app_private.err('CONFLICT', 'Anda sudah mempunyai permohonan bayaran yang sedang diproses.');
  end if;
  select (select coalesce(sum(amount_sen), 0) from public.commission_ledger where member_id = v_uid)
       - (select coalesce(sum(amount_sen), 0) from public.commission_payouts where member_id = v_uid)
    into v_outstanding;
  if v_outstanding <= 0 then
    perform app_private.err('VALIDATION', 'Tiada baki komisen tertunggak untuk dipohon.');
  end if;

  insert into public.commission_payout_requests (member_id, amount_sen, bank_name, bank_account_no, bank_account_holder, notes)
  values (v_uid, v_outstanding, btrim(v_profile.bank_name), v_profile.bank_account_no, btrim(v_profile.bank_account_holder),
          nullif(btrim(p_notes), ''))
  returning id into v_id;

  perform app_private.audit('commission.payout_requested', 'commission_payout_request', v_id::text,
    jsonb_build_object('amount_sen', v_outstanding));
  perform app_private.notify_admins('payout_requested', 'Permohonan bayaran komisen',
    coalesce(v_profile.membership_id, '') || ' ' || v_profile.full_name || ' memohon pemindahan komisen '
      || app_private.format_rm(v_outstanding) || '.', '/admin/komisen/' || v_uid);
  return v_id;
end;
$$;

create or replace function public.cancel_payout_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
begin
  update public.commission_payout_requests
     set status = 'cancelled', reviewed_by = v_uid, reviewed_at = now(), review_notes = 'Dibatalkan oleh ahli'
   where id = p_id and member_id = v_uid and status = 'pending';
  if not found then
    perform app_private.err('NOT_FOUND', 'Permohonan tidak dijumpai atau telah diproses.');
  end if;
  perform app_private.audit('commission.payout_request_cancelled', 'commission_payout_request', p_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.reject_payout_request(p_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_req public.commission_payout_requests%rowtype;
begin
  if coalesce(char_length(btrim(p_notes)), 0) < 3 then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab penolakan.');
  end if;
  update public.commission_payout_requests
     set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(), review_notes = btrim(p_notes)
   where id = p_id and status = 'pending'
  returning * into v_req;
  if not found then
    perform app_private.err('NOT_FOUND', 'Permohonan tidak dijumpai atau telah diproses.');
  end if;
  perform app_private.audit('commission.payout_request_rejected', 'commission_payout_request', p_id::text,
    jsonb_build_object('notes', p_notes));
  perform app_private.notify(v_req.member_id, 'payout_request_rejected', 'Permohonan bayaran komisen ditolak',
    'Sebab: ' || btrim(p_notes), '/ahli/komisen');
end;
$$;

-- Payouts can only be recorded to members with complete, valid bank details.
create or replace function app_private.payout_requires_bank()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if new.reverses_id is null then
    select * into v_profile from public.profiles where id = new.member_id;
    if not app_private.valid_bank_details(v_profile.bank_name, v_profile.bank_account_no, v_profile.bank_account_holder) then
      perform app_private.err('VALIDATION', 'Ahli belum menetapkan akaun bank yang sah dalam profil. Bayaran tidak boleh direkodkan.');
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_commission_payouts_require_bank
before insert on public.commission_payouts
for each row execute function app_private.payout_requires_bank();

-- Settle the member's pending request once nothing remains outstanding.
create or replace function app_private.settle_payout_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outstanding bigint;
begin
  if new.reverses_id is not null then
    return null;
  end if;
  select (select coalesce(sum(amount_sen), 0) from public.commission_ledger where member_id = new.member_id)
       - (select coalesce(sum(amount_sen), 0) from public.commission_payouts where member_id = new.member_id)
    into v_outstanding;
  if v_outstanding <= 0 then
    update public.commission_payout_requests
       set status = 'paid', payout_id = new.id, reviewed_by = new.recorded_by, reviewed_at = now(),
           review_notes = 'Dibayar melalui ' || new.payout_no
     where member_id = new.member_id and status = 'pending';
  end if;
  return null;
end;
$$;

create trigger trg_commission_payouts_settle_request
after insert on public.commission_payouts
for each row execute function app_private.settle_payout_request();

revoke execute on all functions in schema app_private from public;
grant execute on function app_private.is_admin() to authenticated, service_role;
grant execute on function app_private.is_active_member() to authenticated, service_role;
revoke execute on function public.request_commission_payout(text), public.cancel_payout_request(uuid),
  public.reject_payout_request(uuid, text) from public, anon;
grant execute on function public.request_commission_payout(text), public.cancel_payout_request(uuid),
  public.reject_payout_request(uuid, text) to authenticated;
