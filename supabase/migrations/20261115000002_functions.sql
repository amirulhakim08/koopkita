-- =============================================================================
-- KoopKITA V1.0 — Business functions
--
-- Error convention: every business error is raised as  'CODE|Mesej Bahasa Melayu'
-- CODE ∈ AUTH_REQUIRED, FORBIDDEN, MFA_REQUIRED, VALIDATION, NOT_FOUND, CONFLICT,
--        RATE_LIMITED, CONFIG_REQUIRED.  The web app maps CODE to UI behaviour and
-- shows the Malay message.
-- =============================================================================

alter table public.qurban_participants add column slot_code_snapshot text;

create sequence public.sale_no_seq start 1;

-- -----------------------------------------------------------------------------
-- Internal helpers (schema app_private, not exposed via the API)
-- -----------------------------------------------------------------------------
create or replace function app_private.err(p_code text, p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%|%', p_code, p_message using errcode = 'P0001';
end;
$$;

create or replace function app_private.today_kl()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Kuala_Lumpur')::date $$;

create or replace function app_private.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select value from public.system_settings where key = p_key $$;

create or replace function app_private.setting_bigint(p_key text, p_default bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::bigint end
       from public.system_settings where key = p_key),
    p_default)
$$;

create or replace function app_private.setting_bool(p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when jsonb_typeof(value) = 'boolean' then (value #>> '{}')::boolean end
       from public.system_settings where key = p_key),
    p_default)
$$;

-- Is the caller an active Super Admin (with MFA when required)?
create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.role = 'super_admin'
       and p.status = 'active'
  )
  and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not app_private.setting_bool('admin_mfa_required', true)
  )
$$;

-- Is the caller an approved (active) member? Super Admins count as members too.
create or replace function app_private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
$$;

create or replace function app_private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    perform app_private.err('AUTH_REQUIRED', 'Sila log masuk.');
  end if;
  select * into v_profile from public.profiles where id = auth.uid();
  if not found or v_profile.role <> 'super_admin' or v_profile.status <> 'active' then
    perform app_private.err('FORBIDDEN', 'Tindakan ini hanya untuk Super Admin.');
  end if;
  if not app_private.is_admin() then
    perform app_private.err('MFA_REQUIRED', 'Sila sahkan MFA sebelum meneruskan.');
  end if;
  return v_profile.id;
end;
$$;

create or replace function app_private.require_active_member()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    perform app_private.err('AUTH_REQUIRED', 'Sila log masuk.');
  end if;
  if not app_private.is_active_member() then
    perform app_private.err('FORBIDDEN', 'Akaun anda belum diluluskan atau tidak aktif.');
  end if;
  return auth.uid();
end;
$$;

create or replace function app_private.audit(
  p_action text, p_entity_type text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

-- Notification failures must never roll back the surrounding financial operation,
-- so the insert runs in its own sub-transaction and errors are swallowed.
create or replace function app_private.notify(
  p_user_id uuid, p_type text, p_title text, p_body text, p_link text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.notifications (user_id, type, title, body, link)
    values (p_user_id, p_type, p_title, p_body, p_link);
  exception when others then
    raise warning 'notification to % failed: %', p_user_id, sqlerrm;
  end;
end;
$$;

create or replace function app_private.notify_admins(
  p_type text, p_title text, p_body text, p_link text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select id from public.profiles where role = 'super_admin' and status = 'active' loop
    perform app_private.notify(r.id, p_type, p_title, p_body, p_link);
  end loop;
end;
$$;

create or replace function app_private.rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into app_private.rate_limits (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = app_private.rate_limits.hits + 1
  returning hits into v_hits;

  delete from app_private.rate_limits where bucket = p_bucket and window_start < v_window;

  if v_hits > p_max then
    perform app_private.err('RATE_LIMITED', 'Terlalu banyak cubaan. Sila cuba sebentar lagi.');
  end if;
end;
$$;

create or replace function app_private.format_rm(p_sen bigint)
returns text
language sql
immutable
set search_path = ''
as $$ select 'RM' || to_char(p_sen / 100.0, 'FM999G999G990D00') $$;

-- Files must live in the caller's own folder:  <user_id>/<file>
create or replace function app_private.check_own_path(p_path text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_path is null or p_path !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]{1,200}$') then
    perform app_private.err('VALIDATION', 'Fail resit tidak sah.');
  end if;
end;
$$;

-- Duplicate detection across share payments and Qurban payment submissions.
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
     or exists (select 1 from public.payment_submissions
              where lower(btrim(transaction_ref)) = v_ref and status <> 'rejected') then
    return 'Rujukan transaksi bank yang sama telah dihantar sebelum ini.';
  end if;
  if exists (select 1 from public.share_transactions
              where member_id = p_member_id and txn_type = 'payment' and status <> 'rejected'
                and amount_sen = p_amount_sen and payment_date = p_payment_date) then
    return 'Bayaran dengan jumlah dan tarikh yang sama telah dihantar oleh ahli ini.';
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Auth hooks: profile creation and email verification
-- -----------------------------------------------------------------------------
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_verified boolean := new.email_confirmed_at is not null;
begin
  insert into public.profiles (
    id, full_name, email, phone, ic_number, address, state, postcode,
    bank_name, bank_account_no, bank_account_holder, status, email_verified_at)
  values (
    new.id,
    coalesce(nullif(btrim(m ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(btrim(m ->> 'phone'), ''),
    nullif(regexp_replace(coalesce(m ->> 'ic_number', ''), '[^0-9]', '', 'g'), ''),
    nullif(btrim(m ->> 'address'), ''),
    nullif(btrim(m ->> 'state'), ''),
    nullif(btrim(m ->> 'postcode'), ''),
    nullif(btrim(m ->> 'bank_name'), ''),
    nullif(regexp_replace(coalesce(m ->> 'bank_account_no', ''), '[^0-9]', '', 'g'), ''),
    nullif(btrim(m ->> 'bank_account_holder'), ''),
    case when v_verified then 'pending_approval' else 'pending_verification' end,
    new.email_confirmed_at
  );

  insert into public.membership_applications (user_id) values (new.id);

  -- Data minimisation: personal identifiers live only in public.profiles (RLS
  -- protected); strip them from auth metadata, which is embedded in JWTs.
  begin
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           - array['ic_number', 'phone', 'address', 'state', 'postcode',
                   'bank_name', 'bank_account_no', 'bank_account_holder']
     where id = new.id;
  exception when others then
    -- never block sign-up; the profile row is the source of truth
    raise warning 'could not minimise auth metadata for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_user();

create or replace function app_private.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.profiles
       set status = case when status = 'pending_verification' then 'pending_approval' else status end,
           email_verified_at = new.email_confirmed_at
     where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_confirmed
after update of email_confirmed_at on auth.users
for each row execute function app_private.handle_user_email_confirmed();

-- -----------------------------------------------------------------------------
-- Super Admin provisioning (service_role only — used by scripts/provision-super-admin.mjs)
-- -----------------------------------------------------------------------------
create or replace function public.provision_super_admin(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where lower(email) = lower(p_email) for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Pengguna tidak dijumpai.');
  end if;
  update public.profiles
     set role = 'super_admin',
         status = 'active',
         member_no = coalesce(member_no, nextval('public.member_no_seq')),
         approved_at = coalesce(approved_at, now()),
         email_verified_at = coalesce(email_verified_at, now())
   where id = v_profile.id
  returning * into v_profile;
  update public.membership_applications
     set status = 'approved', reviewed_at = now(), review_notes = 'Provisioned as Super Admin'
   where user_id = v_profile.id and status = 'pending';
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (null, 'super_admin.provisioned', 'profile', v_profile.id::text, jsonb_build_object('email', v_profile.email));
  return v_profile.membership_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Membership management (Super Admin)
-- -----------------------------------------------------------------------------
create or replace function public.approve_member(p_user_id uuid, p_notes text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Ahli tidak dijumpai.');
  end if;
  if v_profile.id = v_admin then
    perform app_private.err('FORBIDDEN', 'Anda tidak boleh meluluskan permohonan sendiri.');
  end if;
  if v_profile.status = 'active' then
    return v_profile.membership_id; -- idempotent
  end if;
  if v_profile.status <> 'pending_approval' then
    perform app_private.err('CONFLICT', 'Permohonan ini tidak menunggu kelulusan (status: ' || v_profile.status || ').');
  end if;

  update public.profiles
     set status = 'active',
         member_no = coalesce(member_no, nextval('public.member_no_seq')),
         approved_at = now(), approved_by = v_admin,
         status_reason = null, status_changed_at = now(), status_changed_by = v_admin
   where id = p_user_id
  returning * into v_profile;

  update public.membership_applications
     set status = 'approved', reviewed_by = v_admin, reviewed_at = now(), review_notes = p_notes
   where user_id = p_user_id and status = 'pending';

  perform app_private.audit('member.approved', 'profile', p_user_id::text,
    jsonb_build_object('membership_id', v_profile.membership_id, 'notes', p_notes));
  perform app_private.notify(p_user_id, 'membership_approved', 'Keahlian diluluskan',
    'Tahniah! Keahlian anda telah diluluskan. No. Ahli: ' || v_profile.membership_id, '/ahli');
  return v_profile.membership_id;
end;
$$;

create or replace function public.reject_member(p_user_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_profile public.profiles%rowtype;
begin
  if coalesce(btrim(p_notes), '') = '' then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab penolakan.');
  end if;
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Ahli tidak dijumpai.');
  end if;
  if v_profile.id = v_admin then
    perform app_private.err('FORBIDDEN', 'Anda tidak boleh menolak permohonan sendiri.');
  end if;
  if v_profile.status not in ('pending_approval', 'pending_verification') then
    perform app_private.err('CONFLICT', 'Permohonan ini tidak boleh ditolak (status: ' || v_profile.status || ').');
  end if;

  update public.profiles
     set status = 'rejected', status_reason = p_notes, status_changed_at = now(), status_changed_by = v_admin
   where id = p_user_id;
  update public.membership_applications
     set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(), review_notes = p_notes
   where user_id = p_user_id and status = 'pending';

  perform app_private.audit('member.rejected', 'profile', p_user_id::text, jsonb_build_object('notes', p_notes));
  perform app_private.notify(p_user_id, 'membership_rejected', 'Permohonan keahlian ditolak',
    'Permohonan keahlian anda tidak diluluskan. Sebab: ' || p_notes, null);
end;
$$;

create or replace function public.set_member_suspension(p_user_id uuid, p_suspend boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_profile public.profiles%rowtype;
begin
  if coalesce(btrim(p_reason), '') = '' then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab.');
  end if;
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Ahli tidak dijumpai.');
  end if;
  if v_profile.id = v_admin then
    perform app_private.err('FORBIDDEN', 'Anda tidak boleh menggantung akaun sendiri.');
  end if;
  if p_suspend and v_profile.status <> 'active' then
    perform app_private.err('CONFLICT', 'Hanya ahli aktif boleh digantung.');
  end if;
  if not p_suspend and v_profile.status <> 'suspended' then
    perform app_private.err('CONFLICT', 'Hanya ahli yang digantung boleh diaktifkan semula.');
  end if;

  update public.profiles
     set status = case when p_suspend then 'suspended' else 'active' end,
         status_reason = p_reason, status_changed_at = now(), status_changed_by = v_admin
   where id = p_user_id;

  perform app_private.audit(case when p_suspend then 'member.suspended' else 'member.reactivated' end,
    'profile', p_user_id::text, jsonb_build_object('reason', p_reason));
  perform app_private.notify(p_user_id,
    case when p_suspend then 'membership_suspended' else 'membership_reactivated' end,
    case when p_suspend then 'Akaun digantung' else 'Akaun diaktifkan semula' end,
    p_reason, null);
end;
$$;

create or replace function public.admin_update_member(p_user_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_allowed text[] := array['full_name', 'phone', 'ic_number', 'address', 'state', 'postcode',
                            'bank_name', 'bank_account_no', 'bank_account_holder'];
  v_key text;
begin
  for v_key in select jsonb_object_keys(p_data) loop
    if not v_key = any (v_allowed) then
      perform app_private.err('VALIDATION', 'Medan tidak dibenarkan: ' || v_key);
    end if;
  end loop;

  update public.profiles p set
    full_name           = case when p_data ? 'full_name' then btrim(p_data ->> 'full_name') else p.full_name end,
    phone               = case when p_data ? 'phone' then nullif(btrim(p_data ->> 'phone'), '') else p.phone end,
    ic_number           = case when p_data ? 'ic_number' then nullif(btrim(p_data ->> 'ic_number'), '') else p.ic_number end,
    address             = case when p_data ? 'address' then nullif(btrim(p_data ->> 'address'), '') else p.address end,
    state               = case when p_data ? 'state' then nullif(btrim(p_data ->> 'state'), '') else p.state end,
    postcode            = case when p_data ? 'postcode' then nullif(btrim(p_data ->> 'postcode'), '') else p.postcode end,
    bank_name           = case when p_data ? 'bank_name' then nullif(btrim(p_data ->> 'bank_name'), '') else p.bank_name end,
    bank_account_no     = case when p_data ? 'bank_account_no' then nullif(btrim(p_data ->> 'bank_account_no'), '') else p.bank_account_no end,
    bank_account_holder = case when p_data ? 'bank_account_holder' then nullif(btrim(p_data ->> 'bank_account_holder'), '') else p.bank_account_holder end
  where p.id = p_user_id;

  if not found then
    perform app_private.err('NOT_FOUND', 'Ahli tidak dijumpai.');
  end if;

  -- Log which fields changed, not their (personal) values.
  perform app_private.audit('member.updated', 'profile', p_user_id::text,
    jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_data) k)));
end;
$$;

-- -----------------------------------------------------------------------------
-- Share capital
-- -----------------------------------------------------------------------------
create or replace function public.submit_share_payment(
  p_amount_sen bigint,
  p_payment_date date,
  p_transaction_ref text,
  p_receipt_path text,
  p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_existing public.share_transactions%rowtype;
  v_min bigint := app_private.setting_bigint('share_min_payment_sen', 1000);
  v_max bigint := app_private.setting_bigint('share_max_total_sen', 10000000);
  v_current bigint;
  v_dup text;
  v_id uuid;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' then
    perform app_private.err('VALIDATION', 'Kunci idempotensi diperlukan.');
  end if;
  select * into v_existing from public.share_transactions where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.member_id <> v_uid then
      perform app_private.err('CONFLICT', 'Kunci idempotensi tidak sah.');
    end if;
    return v_existing.id; -- the same submission was already recorded
  end if;

  perform app_private.rate_limit('share_submit:' || v_uid, 10, 3600);

  if p_amount_sen is null or p_amount_sen < v_min then
    perform app_private.err('VALIDATION', 'Jumlah minimum bayaran saham ialah ' || app_private.format_rm(v_min) || '.');
  end if;
  if p_payment_date is null or p_payment_date > app_private.today_kl()
     or p_payment_date < app_private.today_kl() - 365 then
    perform app_private.err('VALIDATION', 'Tarikh bayaran tidak sah.');
  end if;
  if coalesce(char_length(btrim(p_transaction_ref)), 0) < 3 then
    perform app_private.err('VALIDATION', 'Rujukan transaksi bank diperlukan.');
  end if;
  perform app_private.check_own_path(p_receipt_path);

  -- Serialise share submissions per member to make the limit check race-free.
  perform 1 from public.profiles where id = v_uid for update;

  select coalesce(sum(amount_sen), 0) into v_current
    from public.share_transactions where member_id = v_uid and status in ('approved', 'pending');
  if v_current + p_amount_sen > v_max then
    perform app_private.err('VALIDATION', 'Jumlah melebihi had maksimum modal saham ' || app_private.format_rm(v_max) || '.');
  end if;

  v_dup := app_private.find_duplicate_payment(p_transaction_ref, p_amount_sen, p_payment_date, v_uid);

  insert into public.share_transactions (
    member_id, txn_type, amount_sen, payment_date, transaction_ref, receipt_path,
    duplicate_flag, duplicate_reason, idempotency_key, submitted_by)
  values (
    v_uid, 'payment', p_amount_sen, p_payment_date, btrim(p_transaction_ref), p_receipt_path,
    v_dup is not null, v_dup, p_idempotency_key, v_uid)
  returning id into v_id;

  perform app_private.audit('share_payment.submitted', 'share_transaction', v_id::text,
    jsonb_build_object('amount_sen', p_amount_sen, 'duplicate_flag', v_dup is not null));
  perform app_private.notify_admins('share_payment_submitted', 'Bayaran saham baharu',
    'Bayaran saham ' || app_private.format_rm(p_amount_sen) || ' menunggu semakan.'
      || case when v_dup is not null then ' ⚠ Disyaki pendua.' else '' end,
    '/admin/saham');
  return v_id;
end;
$$;

create or replace function public.review_share_payment(p_id uuid, p_approve boolean, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_txn public.share_transactions%rowtype;
  v_target text := case when p_approve then 'approved' else 'rejected' end;
begin
  select * into v_txn from public.share_transactions where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Transaksi tidak dijumpai.');
  end if;
  if v_txn.status = v_target then
    return; -- idempotent repeat
  end if;
  if v_txn.status <> 'pending' then
    perform app_private.err('CONFLICT', 'Transaksi ini telah dimuktamadkan (' || v_txn.status || ').');
  end if;
  if v_txn.member_id = v_admin then
    perform app_private.err('FORBIDDEN', 'Anda tidak boleh menyemak bayaran saham sendiri.');
  end if;
  if not p_approve and coalesce(btrim(p_notes), '') = '' then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab penolakan.');
  end if;

  update public.share_transactions
     set status = v_target, reviewed_by = v_admin, reviewed_at = now(), review_notes = p_notes
   where id = p_id;

  perform app_private.audit('share_payment.' || v_target, 'share_transaction', p_id::text,
    jsonb_build_object('amount_sen', v_txn.amount_sen, 'member_id', v_txn.member_id, 'notes', p_notes));
  perform app_private.notify(v_txn.member_id,
    case when p_approve then 'share_payment_approved' else 'share_payment_rejected' end,
    case when p_approve then 'Bayaran saham diluluskan' else 'Bayaran saham ditolak' end,
    'Bayaran ' || app_private.format_rm(v_txn.amount_sen) || ' (rujukan ' || v_txn.transaction_ref || ') '
      || case when p_approve then 'telah diluluskan.' else 'ditolak. Sebab: ' || p_notes end,
    '/ahli/saham');
end;
$$;

create or replace function public.create_share_adjustment(
  p_member_id uuid, p_amount_sen bigint, p_reason text, p_adjusts_id uuid default null,
  p_idempotency_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_balance bigint;
  v_id uuid;
begin
  if p_amount_sen is null or p_amount_sen = 0 then
    perform app_private.err('VALIDATION', 'Jumlah pelarasan tidak boleh sifar.');
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab pelarasan.');
  end if;
  if p_idempotency_key is not null then
    select id into v_id from public.share_transactions where idempotency_key = p_idempotency_key;
    if found then return v_id; end if;
  end if;
  perform 1 from public.profiles where id = p_member_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Ahli tidak dijumpai.');
  end if;
  if p_adjusts_id is not null and not exists (
      select 1 from public.share_transactions where id = p_adjusts_id and member_id = p_member_id) then
    perform app_private.err('VALIDATION', 'Transaksi asal tidak sepadan dengan ahli.');
  end if;
  select coalesce(sum(amount_sen), 0) into v_balance
    from public.share_transactions where member_id = p_member_id and status = 'approved';
  if v_balance + p_amount_sen < 0 then
    perform app_private.err('VALIDATION', 'Pelarasan akan menjadikan baki modal saham negatif.');
  end if;

  insert into public.share_transactions (
    member_id, txn_type, amount_sen, reason, adjusts_id, status, idempotency_key,
    submitted_by, reviewed_by, reviewed_at, review_notes)
  values (
    p_member_id, 'adjustment', p_amount_sen, btrim(p_reason), p_adjusts_id, 'approved', p_idempotency_key,
    v_admin, v_admin, now(), 'Pelarasan oleh Super Admin')
  returning id into v_id;

  perform app_private.audit('share.adjusted', 'share_transaction', v_id::text,
    jsonb_build_object('member_id', p_member_id, 'amount_sen', p_amount_sen, 'reason', p_reason, 'adjusts_id', p_adjusts_id));
  perform app_private.notify(p_member_id, 'share_adjusted', 'Pelarasan modal saham',
    'Pelarasan ' || app_private.format_rm(p_amount_sen) || ' telah direkodkan. Sebab: ' || p_reason, '/ahli/saham');
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Campaigns & cattle (Super Admin)
-- -----------------------------------------------------------------------------
create or replace function public.save_campaign(
  p_id uuid,
  p_name text,
  p_year integer,
  p_start_date date,
  p_closing_date date,
  p_price_per_share_sen bigint,
  p_commission_per_share_sen bigint,
  p_full_cattle_commission_sen bigint,
  p_reservation_expiry_hours integer,
  p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_campaign public.campaigns%rowtype;
  v_has_sales boolean;
  v_id uuid;
begin
  if p_full_cattle_commission_sen < p_commission_per_share_sen * 7 then
    perform app_private.err('VALIDATION', 'Komisen seekor penuh tidak boleh kurang daripada 7 × komisen sebahagian.');
  end if;

  if p_id is null then
    insert into public.campaigns (
      name, year, start_date, closing_date, price_per_share_sen, commission_per_share_sen,
      full_cattle_commission_sen, reservation_expiry_hours, description, created_by)
    values (
      btrim(p_name), p_year, p_start_date, p_closing_date, p_price_per_share_sen, p_commission_per_share_sen,
      p_full_cattle_commission_sen, coalesce(p_reservation_expiry_hours,
        app_private.setting_bigint('reservation_expiry_hours', 48)::integer), p_description, v_admin)
    returning id into v_id;
    perform app_private.audit('campaign.created', 'campaign', v_id::text, jsonb_build_object('name', p_name, 'year', p_year));
    return v_id;
  end if;

  select * into v_campaign from public.campaigns where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Kempen tidak dijumpai.');
  end if;
  select exists (select 1 from public.qurban_sales where campaign_id = p_id) into v_has_sales;
  if v_has_sales and (
       p_price_per_share_sen <> v_campaign.price_per_share_sen
    or p_commission_per_share_sen <> v_campaign.commission_per_share_sen
    or p_full_cattle_commission_sen <> v_campaign.full_cattle_commission_sen
    or p_year <> v_campaign.year) then
    perform app_private.err('CONFLICT', 'Harga, kadar komisen dan tahun tidak boleh diubah selepas jualan direkodkan.');
  end if;
  if p_year <> v_campaign.year and exists (select 1 from public.cattle where campaign_id = p_id) then
    perform app_private.err('CONFLICT', 'Tahun tidak boleh diubah selepas lembu didaftarkan.');
  end if;

  update public.campaigns
     set name = btrim(p_name), year = p_year, start_date = p_start_date, closing_date = p_closing_date,
         price_per_share_sen = p_price_per_share_sen, commission_per_share_sen = p_commission_per_share_sen,
         full_cattle_commission_sen = p_full_cattle_commission_sen,
         reservation_expiry_hours = coalesce(p_reservation_expiry_hours, reservation_expiry_hours),
         description = p_description
   where id = p_id;
  perform app_private.audit('campaign.updated', 'campaign', p_id::text, jsonb_build_object('name', p_name));
  return p_id;
end;
$$;

create or replace function public.set_campaign_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_campaign public.campaigns%rowtype;
  r record;
begin
  if p_status not in ('draft', 'open', 'closed', 'completed') then
    perform app_private.err('VALIDATION', 'Status kempen tidak sah.');
  end if;
  select * into v_campaign from public.campaigns where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Kempen tidak dijumpai.');
  end if;
  if v_campaign.status = p_status then
    return;
  end if;
  if p_status = 'draft' and exists (select 1 from public.qurban_sales where campaign_id = p_id) then
    perform app_private.err('CONFLICT', 'Kempen yang mempunyai jualan tidak boleh dikembalikan ke draf.');
  end if;
  if p_status = 'open' and not exists (select 1 from public.cattle where campaign_id = p_id) then
    perform app_private.err('VALIDATION', 'Tambah sekurang-kurangnya seekor lembu sebelum membuka kempen.');
  end if;

  update public.campaigns set status = p_status where id = p_id;
  perform app_private.audit('campaign.status_changed', 'campaign', p_id::text,
    jsonb_build_object('from', v_campaign.status, 'to', p_status));

  if p_status = 'open' then
    for r in select id from public.profiles where status = 'active' loop
      perform app_private.notify(r.id, 'campaign_announcement', 'Kempen dibuka: ' || v_campaign.name,
        'Kempen korban kini dibuka. Harga sebahagian ' || app_private.format_rm(v_campaign.price_per_share_sen) || '.',
        '/ahli/korban');
    end loop;
  end if;
end;
$$;

create or replace function public.add_cattle(p_campaign_id uuid, p_count integer, p_notes text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_campaign public.campaigns%rowtype;
  v_next integer;
  v_cattle_id uuid;
  i integer;
begin
  if p_count is null or p_count < 1 or p_count > 200 then
    perform app_private.err('VALIDATION', 'Bilangan lembu mesti antara 1 hingga 200.');
  end if;
  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Kempen tidak dijumpai.');
  end if;
  if v_campaign.status in ('closed', 'completed') then
    perform app_private.err('CONFLICT', 'Kempen telah ditutup.');
  end if;

  -- Cattle codes are numbered per year (KITA-2027-001) across all campaigns of that year.
  perform pg_advisory_xact_lock(hashtext('cattle_code_' || v_campaign.year));
  select coalesce(max(c.seq), 0) + 1 into v_next
    from public.cattle c join public.campaigns k on k.id = c.campaign_id
   where k.year = v_campaign.year;

  for i in 0 .. p_count - 1 loop
    insert into public.cattle (campaign_id, seq, code, notes)
    values (p_campaign_id, v_next + i,
            'KITA-' || v_campaign.year || '-' || lpad((v_next + i)::text, 3, '0'), p_notes)
    returning id into v_cattle_id;
    insert into public.cattle_slots (cattle_id, slot_no)
    select v_cattle_id, s from generate_series(1, 7) s;
  end loop;

  perform app_private.audit('cattle.added', 'campaign', p_campaign_id::text,
    jsonb_build_object('count', p_count, 'first_seq', v_next));
  return p_count;
end;
$$;

create or replace function public.update_cattle_notes(p_cattle_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
begin
  update public.cattle set notes = nullif(btrim(p_notes), '') where id = p_cattle_id;
  if not found then
    perform app_private.err('NOT_FOUND', 'Lembu tidak dijumpai.');
  end if;
  perform app_private.audit('cattle.updated', 'cattle', p_cattle_id::text, '{}'::jsonb);
end;
$$;

-- Take an available slot out of sale (e.g. cattle unavailable) or restore it.
create or replace function public.set_slot_cancelled(p_slot_id uuid, p_cancelled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_slot public.cattle_slots%rowtype;
begin
  select * into v_slot from public.cattle_slots where id = p_slot_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Slot tidak dijumpai.');
  end if;
  if p_cancelled and v_slot.status <> 'available' then
    perform app_private.err('CONFLICT', 'Hanya slot yang tersedia boleh dibatalkan.');
  end if;
  if not p_cancelled and v_slot.status <> 'cancelled' then
    perform app_private.err('CONFLICT', 'Slot ini tidak dibatalkan.');
  end if;
  update public.cattle_slots set status = case when p_cancelled then 'cancelled' else 'available' end
   where id = p_slot_id;
  perform app_private.audit(case when p_cancelled then 'slot.cancelled' else 'slot.restored' end,
    'cattle_slot', p_slot_id::text, '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Slot allocation
--
-- Caller MUST hold the campaign row lock (SELECT ... FOR UPDATE), which
-- serialises allocation per campaign and makes overselling impossible.
-- Strategy:
--   1. If one cattle can hold the whole order, use the fullest such cattle
--      (keeps a buyer group together and preserves empty cattle for full sales).
--   2. Otherwise fill slots cattle-by-cattle, fullest cattle first.
-- -----------------------------------------------------------------------------
create or replace function app_private.allocate_slots(p_campaign_id uuid, p_sale_id uuid, p_count integer)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cattle uuid;
  v_slots uuid[];
begin
  select c.id into v_cattle
    from public.cattle c
    join public.cattle_slots s on s.cattle_id = c.id
   where c.campaign_id = p_campaign_id
   group by c.id, c.seq
  having count(*) filter (where s.status = 'available') >= p_count
   order by count(*) filter (where s.status in ('reserved', 'confirmed')) desc, c.seq
   limit 1;

  if v_cattle is not null then
    select array_agg(id order by slot_no) into v_slots
      from (select id, slot_no from public.cattle_slots
             where cattle_id = v_cattle and status = 'available'
             order by slot_no limit p_count
             for update) x;
  else
    select array_agg(id) into v_slots
      from (select s.id
              from public.cattle_slots s
              join public.cattle c on c.id = s.cattle_id
              join lateral (
                select count(*) filter (where s2.status in ('reserved', 'confirmed')) as used
                  from public.cattle_slots s2 where s2.cattle_id = c.id) u on true
             where c.campaign_id = p_campaign_id and s.status = 'available'
             order by u.used desc, c.seq, s.slot_no
             limit p_count
             for update of s) x;
  end if;

  if v_slots is null or cardinality(v_slots) < p_count then
    perform app_private.err('CONFLICT', 'Slot korban tidak mencukupi untuk kempen ini.');
  end if;

  update public.cattle_slots
     set status = 'reserved', sale_id = p_sale_id, reserved_at = now(), confirmed_at = null
   where id = any (v_slots) and status = 'available';
  if not found or (select count(*) from public.cattle_slots where id = any (v_slots) and sale_id = p_sale_id) <> p_count then
    perform app_private.err('CONFLICT', 'Slot telah diambil. Sila cuba lagi.');
  end if;
  return v_slots;
end;
$$;

create or replace function app_private.release_sale_slots(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.qurban_participants set slot_id = null where sale_id = p_sale_id;
  update public.cattle_slots
     set status = 'available', sale_id = null, reserved_at = null, confirmed_at = null
   where sale_id = p_sale_id;
end;
$$;

-- Cancel reservations whose payment proof never arrived. Sales that already have
-- a (non-rejected) payment submission are never expired automatically.
create or replace function app_private.expire_reservations(p_campaign_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select s.id, s.member_id, s.sale_no
      from public.qurban_sales s
     where s.status = 'pending_payment'
       and s.reservation_expires_at is not null
       and s.reservation_expires_at < now()
       and (p_campaign_id is null or s.campaign_id = p_campaign_id)
       and not exists (select 1 from public.payment_submissions p
                        where p.sale_id = s.id and p.status <> 'rejected')
     for update of s skip locked
  loop
    perform app_private.release_sale_slots(r.id);
    update public.qurban_sales
       set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Tempahan tamat tempoh tanpa bukti bayaran'
     where id = r.id;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (null, 'sale.expired', 'qurban_sale', r.id::text, jsonb_build_object('sale_no', r.sale_no));
    perform app_private.notify(r.member_id, 'sale_expired', 'Tempahan tamat tempoh',
      'Tempahan ' || r.sale_no || ' dibatalkan kerana tiada bukti bayaran dalam tempoh yang ditetapkan.',
      '/ahli/korban/jualan/' || r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.expire_stale_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- callable by Super Admin or by the service role (scheduled job)
  if coalesce(auth.role(), '') <> 'service_role' then
    perform app_private.require_admin();
  end if;
  return app_private.expire_reservations(null);
end;
$$;

-- -----------------------------------------------------------------------------
-- Qurban sales
-- -----------------------------------------------------------------------------
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
  if app_private.setting('coop_bank_account_no') is null
     or jsonb_typeof(app_private.setting('coop_bank_account_no')) <> 'string' then
    perform app_private.err('CONFIG_REQUIRED', 'Akaun bank rasmi koperasi belum dikonfigurasi oleh Super Admin.');
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

create or replace function public.submit_sale_payment(
  p_sale_id uuid,
  p_amount_sen bigint,
  p_payment_date date,
  p_transaction_ref text,
  p_receipt_path text,
  p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_sale public.qurban_sales%rowtype;
  v_existing public.payment_submissions%rowtype;
  v_paid bigint;
  v_dup text;
  v_id uuid;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' then
    perform app_private.err('VALIDATION', 'Kunci idempotensi diperlukan.');
  end if;
  select * into v_existing from public.payment_submissions where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.submitted_by <> v_uid then
      perform app_private.err('CONFLICT', 'Kunci idempotensi tidak sah.');
    end if;
    return v_existing.id;
  end if;

  perform app_private.rate_limit('sale_payment:' || v_uid, 20, 3600);

  select * into v_sale from public.qurban_sales where id = p_sale_id for update;
  if not found or v_sale.member_id <> v_uid then
    perform app_private.err('NOT_FOUND', 'Jualan tidak dijumpai.');
  end if;
  if v_sale.status = 'pending_payment' and v_sale.reservation_expires_at is not null
     and v_sale.reservation_expires_at < now()
     and not exists (select 1 from public.payment_submissions where sale_id = p_sale_id and status <> 'rejected') then
    perform app_private.err('CONFLICT', 'Tempahan ini telah tamat tempoh. Sila buat jualan baharu.');
  end if;
  if v_sale.status not in ('pending_payment', 'pending_review') then
    perform app_private.err('CONFLICT', 'Bayaran tidak boleh dihantar untuk jualan berstatus ini.');
  end if;
  if p_amount_sen is null or p_amount_sen <= 0 then
    perform app_private.err('VALIDATION', 'Jumlah bayaran tidak sah.');
  end if;
  if p_payment_date is null or p_payment_date > app_private.today_kl()
     or p_payment_date < app_private.today_kl() - 365 then
    perform app_private.err('VALIDATION', 'Tarikh bayaran tidak sah.');
  end if;
  if coalesce(char_length(btrim(p_transaction_ref)), 0) < 3 then
    perform app_private.err('VALIDATION', 'Rujukan transaksi bank diperlukan.');
  end if;
  perform app_private.check_own_path(p_receipt_path);

  select coalesce(sum(amount_sen), 0) into v_paid
    from public.payment_submissions where sale_id = p_sale_id and status <> 'rejected';
  if v_paid + p_amount_sen > v_sale.total_sen then
    perform app_private.err('VALIDATION', 'Jumlah melebihi baki jualan (' || app_private.format_rm(v_sale.total_sen - v_paid) || ').');
  end if;

  v_dup := app_private.find_duplicate_payment(p_transaction_ref, p_amount_sen, p_payment_date, v_uid);

  insert into public.payment_submissions (
    sale_id, amount_sen, payment_date, transaction_ref, receipt_path,
    duplicate_flag, duplicate_reason, idempotency_key, submitted_by)
  values (
    p_sale_id, p_amount_sen, p_payment_date, btrim(p_transaction_ref), p_receipt_path,
    v_dup is not null, v_dup, p_idempotency_key, v_uid)
  returning id into v_id;

  update public.qurban_sales
     set status = 'pending_review', submitted_at = coalesce(submitted_at, now()), reservation_expires_at = null
   where id = p_sale_id;

  perform app_private.audit('sale.payment_submitted', 'payment_submission', v_id::text,
    jsonb_build_object('sale_id', p_sale_id, 'amount_sen', p_amount_sen, 'duplicate_flag', v_dup is not null));
  perform app_private.notify(v_uid, 'sale_submitted', 'Jualan korban dihantar',
    'Bukti bayaran untuk ' || v_sale.sale_no || ' telah dihantar untuk semakan.', '/ahli/korban/jualan/' || p_sale_id);
  perform app_private.notify_admins('sale_submitted', 'Jualan korban menunggu semakan',
    v_sale.sale_no || ': bayaran ' || app_private.format_rm(p_amount_sen) || ' dihantar.'
      || case when v_dup is not null then ' ⚠ Disyaki pendua.' else '' end,
    '/admin/jualan/' || p_sale_id);
  return v_id;
end;
$$;

create or replace function public.review_sale_payment(p_payment_id uuid, p_verify boolean, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_payment public.payment_submissions%rowtype;
  v_sale public.qurban_sales%rowtype;
  v_target text := case when p_verify then 'verified' else 'rejected' end;
  v_verified bigint;
  v_pending integer;
  v_hours integer;
begin
  select * into v_payment from public.payment_submissions where id = p_payment_id;
  if not found then
    perform app_private.err('NOT_FOUND', 'Bayaran tidak dijumpai.');
  end if;
  -- lock order: sale, then payment
  select * into v_sale from public.qurban_sales where id = v_payment.sale_id for update;
  select * into v_payment from public.payment_submissions where id = p_payment_id for update;

  if v_payment.status = v_target then
    return;
  end if;
  if v_payment.status <> 'pending' then
    perform app_private.err('CONFLICT', 'Bayaran ini telah dimuktamadkan.');
  end if;
  if v_sale.member_id = v_admin then
    perform app_private.err('FORBIDDEN', 'Anda tidak boleh menyemak jualan sendiri.');
  end if;
  if not p_verify and coalesce(btrim(p_notes), '') = '' then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab penolakan.');
  end if;

  update public.payment_submissions
     set status = v_target, reviewed_by = v_admin, reviewed_at = now(), review_notes = p_notes
   where id = p_payment_id;

  if v_sale.status in ('pending_payment', 'pending_review') then
    select coalesce(sum(amount_sen) filter (where status = 'verified'), 0),
           count(*) filter (where status = 'pending')
      into v_verified, v_pending
      from public.payment_submissions where sale_id = v_sale.id;
    if v_pending = 0 and v_verified < v_sale.total_sen then
      -- awaiting (more) payment; a fresh reservation window applies only when nothing was received
      select reservation_expiry_hours into v_hours from public.campaigns where id = v_sale.campaign_id;
      update public.qurban_sales
         set status = 'pending_payment',
             reservation_expires_at = case when v_verified = 0 then now() + make_interval(hours => v_hours) else null end
       where id = v_sale.id;
    end if;
  end if;

  perform app_private.audit('sale.payment_' || v_target, 'payment_submission', p_payment_id::text,
    jsonb_build_object('sale_id', v_sale.id, 'amount_sen', v_payment.amount_sen, 'notes', p_notes));
  if not p_verify then
    perform app_private.notify(v_sale.member_id, 'sale_payment_rejected', 'Bukti bayaran ditolak',
      v_sale.sale_no || ': bayaran ' || app_private.format_rm(v_payment.amount_sen) || ' ditolak. Sebab: ' || p_notes,
      '/ahli/korban/jualan/' || v_sale.id);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Commission engine
--
--  * standard              : share_count × commission_per_share_sen, once per sale
--  * full_cattle_incentive : when ALL 7 slots of one cattle are confirmed under
--                            approved sales of the SAME member, add
--                            (full_cattle_commission_sen − 7 × rate), e.g. RM20,
--                            so that cattle earns exactly RM300 instead of RM280.
--  Idempotency is guaranteed by commission_ledger.source_key (unique).
-- -----------------------------------------------------------------------------
create or replace function app_private.generate_commission(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.qurban_sales%rowtype;
  v_campaign public.campaigns%rowtype;
  v_incentive bigint;
  r record;
  v_generation integer;
begin
  select * into v_sale from public.qurban_sales where id = p_sale_id;
  if v_sale.status <> 'approved' then
    perform app_private.err('CONFLICT', 'Komisen hanya dijana untuk jualan yang diluluskan.');
  end if;
  select * into v_campaign from public.campaigns where id = v_sale.campaign_id;

  if v_campaign.commission_per_share_sen > 0 then
    insert into public.commission_ledger (
      member_id, sale_id, campaign_id, entry_type, amount_sen, share_count, description, source_key, created_by)
    values (
      v_sale.member_id, v_sale.id, v_sale.campaign_id, 'standard',
      v_sale.share_count * v_campaign.commission_per_share_sen, v_sale.share_count,
      'Komisen ' || v_sale.share_count || ' bahagian × ' || app_private.format_rm(v_campaign.commission_per_share_sen)
        || ' (' || v_sale.sale_no || ')',
      'std:' || v_sale.id, auth.uid())
    on conflict (source_key) do nothing;
  end if;

  v_incentive := v_campaign.full_cattle_commission_sen - 7 * v_campaign.commission_per_share_sen;
  if v_incentive <= 0 then
    return;
  end if;

  for r in
    select c.id as cattle_id, c.code
      from public.cattle c
     where c.id in (select s.cattle_id from public.cattle_slots s where s.sale_id = v_sale.id)
       and (select count(*)
              from public.cattle_slots s
              join public.qurban_sales q on q.id = s.sale_id
             where s.cattle_id = c.id
               and s.status = 'confirmed'
               and q.status = 'approved'
               and q.member_id = v_sale.member_id) = 7
  loop
    -- generation counter allows re-qualification after a prior incentive was reversed
    select count(*) into v_generation
      from public.commission_ledger l
     where l.entry_type = 'full_cattle_incentive' and l.member_id = v_sale.member_id and l.cattle_id = r.cattle_id
       and exists (select 1 from public.commission_ledger rv where rv.reverses_id = l.id);

    insert into public.commission_ledger (
      member_id, sale_id, cattle_id, campaign_id, entry_type, amount_sen, share_count, description, source_key, created_by)
    values (
      v_sale.member_id, v_sale.id, r.cattle_id, v_sale.campaign_id, 'full_cattle_incentive', v_incentive, 7,
      'Insentif seekor penuh ' || r.code || ' (jumlah ' || app_private.format_rm(v_campaign.full_cattle_commission_sen)
        || ' menggantikan ' || app_private.format_rm(7 * v_campaign.commission_per_share_sen) || ')',
      'fci:' || r.cattle_id || ':' || v_sale.member_id || ':' || v_generation, auth.uid())
    on conflict (source_key) do nothing;
  end loop;
end;
$$;

create or replace function app_private.reverse_ledger_entry(p_entry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.commission_ledger%rowtype;
begin
  select * into v_entry from public.commission_ledger where id = p_entry_id;
  if v_entry.entry_type = 'reversal' then
    return;
  end if;
  insert into public.commission_ledger (
    member_id, sale_id, cattle_id, campaign_id, entry_type, amount_sen, share_count, description, source_key, reverses_id, created_by)
  values (
    v_entry.member_id, v_entry.sale_id, v_entry.cattle_id, v_entry.campaign_id, 'reversal', -v_entry.amount_sen,
    v_entry.share_count, 'Pembalikan: ' || v_entry.description || ' — ' || p_reason,
    'rev:' || v_entry.id, v_entry.id, auth.uid())
  on conflict (source_key) do nothing;
end;
$$;

create or replace function public.approve_qurban_sale(p_sale_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_sale public.qurban_sales%rowtype;
  v_verified bigint;
  v_pending integer;
  v_commission bigint;
begin
  select * into v_sale from public.qurban_sales where id = p_sale_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Jualan tidak dijumpai.');
  end if;
  if v_sale.status = 'approved' then
    return; -- idempotent: never generates commission twice
  end if;
  if v_sale.status <> 'pending_review' and v_sale.status <> 'pending_payment' then
    perform app_private.err('CONFLICT', 'Jualan ini tidak boleh diluluskan (status: ' || v_sale.status || ').');
  end if;
  if v_sale.member_id = v_admin then
    perform app_private.err('FORBIDDEN', 'Anda tidak boleh meluluskan jualan sendiri.');
  end if;

  select coalesce(sum(amount_sen) filter (where status = 'verified'), 0),
         count(*) filter (where status = 'pending')
    into v_verified, v_pending
    from public.payment_submissions where sale_id = p_sale_id;
  if v_pending > 0 then
    perform app_private.err('CONFLICT', 'Sahkan atau tolak semua bukti bayaran yang belum disemak dahulu.');
  end if;
  if v_verified < v_sale.total_sen then
    perform app_private.err('CONFLICT', 'Bayaran belum penuh: disahkan ' || app_private.format_rm(v_verified)
      || ' daripada ' || app_private.format_rm(v_sale.total_sen) || '.');
  end if;
  if (select count(*) from public.cattle_slots where sale_id = p_sale_id and status = 'reserved') <> v_sale.share_count then
    perform app_private.err('CONFLICT', 'Peruntukan slot jualan ini tidak lengkap.');
  end if;

  update public.cattle_slots set status = 'confirmed', confirmed_at = now()
   where sale_id = p_sale_id and status = 'reserved';
  update public.qurban_sales
     set status = 'approved', reviewed_by = v_admin, reviewed_at = now(), review_notes = p_notes,
         reservation_expires_at = null
   where id = p_sale_id;

  perform app_private.generate_commission(p_sale_id);

  select coalesce(sum(amount_sen), 0) into v_commission
    from public.commission_ledger where sale_id = p_sale_id and entry_type in ('standard', 'full_cattle_incentive')
     and not exists (select 1 from public.commission_ledger r where r.reverses_id = commission_ledger.id);

  perform app_private.audit('sale.approved', 'qurban_sale', p_sale_id::text,
    jsonb_build_object('sale_no', v_sale.sale_no, 'total_sen', v_sale.total_sen, 'commission_sen', v_commission));
  perform app_private.notify(v_sale.member_id, 'sale_approved', 'Jualan korban diluluskan',
    v_sale.sale_no || ' (' || v_sale.share_count || ' bahagian) telah diluluskan.', '/ahli/korban/jualan/' || p_sale_id);
  if v_commission > 0 then
    perform app_private.notify(v_sale.member_id, 'commission_earned', 'Komisen diperoleh',
      'Anda memperoleh komisen ' || app_private.format_rm(v_commission) || ' daripada ' || v_sale.sale_no || '.', '/ahli/komisen');
  end if;
end;
$$;

create or replace function public.reject_qurban_sale(p_sale_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_sale public.qurban_sales%rowtype;
begin
  if coalesce(btrim(p_notes), '') = '' then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab penolakan.');
  end if;
  select * into v_sale from public.qurban_sales where id = p_sale_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Jualan tidak dijumpai.');
  end if;
  if v_sale.status = 'rejected' then
    return;
  end if;
  if v_sale.status not in ('draft', 'pending_payment', 'pending_review') then
    perform app_private.err('CONFLICT', 'Jualan ini tidak boleh ditolak (status: ' || v_sale.status || '). Gunakan pembatalan.');
  end if;
  if v_sale.member_id = v_admin then
    perform app_private.err('FORBIDDEN', 'Anda tidak boleh menolak jualan sendiri.');
  end if;

  update public.payment_submissions
     set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(), review_notes = 'Jualan ditolak: ' || p_notes
   where sale_id = p_sale_id and status = 'pending';
  perform app_private.release_sale_slots(p_sale_id);
  update public.qurban_sales
     set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(), review_notes = p_notes,
         reservation_expires_at = null
   where id = p_sale_id;

  perform app_private.audit('sale.rejected', 'qurban_sale', p_sale_id::text,
    jsonb_build_object('sale_no', v_sale.sale_no, 'notes', p_notes,
      'verified_sen', (select coalesce(sum(amount_sen), 0) from public.payment_submissions
                        where sale_id = p_sale_id and status = 'verified')));
  perform app_private.notify(v_sale.member_id, 'sale_rejected', 'Jualan korban ditolak',
    v_sale.sale_no || ' ditolak. Sebab: ' || p_notes, '/ahli/korban/jualan/' || p_sale_id);
end;
$$;

-- Members may cancel their own sale before any payment is verified.
-- Super Admin may cancel any non-final sale, including approved ones; for approved
-- sales every commission entry tied to the sale (and any full-cattle incentive that
-- depended on it) is reversed with an auditable reversal entry.
create or replace function public.cancel_qurban_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_is_admin boolean := app_private.is_admin();
  v_sale public.qurban_sales%rowtype;
  v_verified bigint;
  r record;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab pembatalan.');
  end if;
  select * into v_sale from public.qurban_sales where id = p_sale_id for update;
  if not found or (v_sale.member_id <> v_uid and not v_is_admin) then
    perform app_private.err('NOT_FOUND', 'Jualan tidak dijumpai.');
  end if;
  if v_sale.status = 'cancelled' then
    return;
  end if;
  if v_sale.status = 'rejected' then
    perform app_private.err('CONFLICT', 'Jualan yang ditolak tidak boleh dibatalkan.');
  end if;

  select coalesce(sum(amount_sen), 0) into v_verified
    from public.payment_submissions where sale_id = p_sale_id and status = 'verified';

  if not v_is_admin then
    if v_sale.status not in ('draft', 'pending_payment', 'pending_review') or v_verified > 0 then
      perform app_private.err('FORBIDDEN', 'Jualan ini hanya boleh dibatalkan oleh Super Admin.');
    end if;
  end if;

  if v_sale.status = 'approved' then
    -- reverse standard commission of this sale
    for r in
      select l.id from public.commission_ledger l
       where l.sale_id = p_sale_id and l.entry_type in ('standard', 'full_cattle_incentive')
         and not exists (select 1 from public.commission_ledger x where x.reverses_id = l.id)
    loop
      perform app_private.reverse_ledger_entry(r.id, 'Jualan ' || v_sale.sale_no || ' dibatalkan');
    end loop;
    -- reverse full-cattle incentives (possibly booked on a sibling sale) that depended on these slots
    for r in
      select l.id from public.commission_ledger l
       where l.entry_type = 'full_cattle_incentive'
         and l.member_id = v_sale.member_id
         and l.cattle_id in (select cattle_id from public.cattle_slots where sale_id = p_sale_id)
         and not exists (select 1 from public.commission_ledger x where x.reverses_id = l.id)
    loop
      perform app_private.reverse_ledger_entry(r.id, 'Jualan ' || v_sale.sale_no || ' dibatalkan');
    end loop;
  end if;

  update public.payment_submissions
     set status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), review_notes = 'Jualan dibatalkan: ' || p_reason
   where sale_id = p_sale_id and status = 'pending';
  perform app_private.release_sale_slots(p_sale_id);
  update public.qurban_sales
     set status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(), cancel_reason = p_reason,
         reservation_expires_at = null
   where id = p_sale_id;

  perform app_private.audit('sale.cancelled', 'qurban_sale', p_sale_id::text,
    jsonb_build_object('sale_no', v_sale.sale_no, 'previous_status', v_sale.status, 'reason', p_reason,
                       'verified_sen', v_verified));
  if v_sale.member_id <> v_uid then
    perform app_private.notify(v_sale.member_id, 'sale_cancelled', 'Jualan korban dibatalkan',
      v_sale.sale_no || ' telah dibatalkan oleh Super Admin. Sebab: ' || p_reason, '/ahli/korban/jualan/' || p_sale_id);
  end if;
end;
$$;

-- Administrator override of an automatic slot assignment (before approval).
create or replace function public.admin_reassign_slot(p_participant_id uuid, p_target_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_participant public.qurban_participants%rowtype;
  v_sale public.qurban_sales%rowtype;
  v_old public.cattle_slots%rowtype;
  v_target public.cattle_slots%rowtype;
  v_target_campaign uuid;
begin
  select * into v_participant from public.qurban_participants where id = p_participant_id;
  if not found then
    perform app_private.err('NOT_FOUND', 'Peserta tidak dijumpai.');
  end if;
  perform 1 from public.campaigns c join public.qurban_sales s on s.campaign_id = c.id
   where s.id = v_participant.sale_id for update of c;
  select * into v_sale from public.qurban_sales where id = v_participant.sale_id for update;
  if v_sale.status not in ('pending_payment', 'pending_review') then
    perform app_private.err('CONFLICT', 'Slot hanya boleh dipindahkan sebelum jualan diluluskan.');
  end if;
  select * into v_target from public.cattle_slots where id = p_target_slot_id for update;
  if not found or v_target.status <> 'available' then
    perform app_private.err('CONFLICT', 'Slot sasaran tidak tersedia.');
  end if;
  select campaign_id into v_target_campaign from public.cattle where id = v_target.cattle_id;
  if v_target_campaign <> v_sale.campaign_id then
    perform app_private.err('VALIDATION', 'Slot sasaran bukan daripada kempen yang sama.');
  end if;
  select * into v_old from public.cattle_slots where id = v_participant.slot_id for update;

  update public.qurban_participants set slot_id = null where id = p_participant_id;
  update public.cattle_slots set status = 'available', sale_id = null, reserved_at = null where id = v_old.id;
  update public.cattle_slots set status = 'reserved', sale_id = v_sale.id, reserved_at = now() where id = v_target.id;
  update public.qurban_participants
     set slot_id = v_target.id,
         slot_code_snapshot = (select code from public.cattle where id = v_target.cattle_id) || '/' || v_target.slot_no
   where id = p_participant_id;

  perform app_private.audit('slot.reassigned', 'qurban_participant', p_participant_id::text,
    jsonb_build_object('sale_id', v_sale.id, 'from_slot', v_old.id, 'to_slot', v_target.id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Commission payouts (Super Admin; bank transfer happens outside the system)
-- -----------------------------------------------------------------------------
create or replace function public.record_commission_payout(
  p_member_id uuid,
  p_amount_sen bigint,
  p_payment_date date,
  p_transaction_ref text,
  p_proof_path text,
  p_notes text,
  p_bank_transfer_confirmed boolean,
  p_entry_ids uuid[] default null,
  p_idempotency_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_existing uuid;
  v_outstanding bigint;
  v_remaining bigint := p_amount_sen;
  v_payout_id uuid;
  v_take bigint;
  r record;
begin
  if p_bank_transfer_confirmed is not true then
    perform app_private.err('VALIDATION', 'Sahkan bahawa pemindahan bank telah dibuat sebelum merekod bayaran.');
  end if;
  if p_idempotency_key is not null then
    select id into v_existing from public.commission_payouts where idempotency_key = p_idempotency_key;
    if found then return v_existing; end if;
  end if;
  if p_amount_sen is null or p_amount_sen <= 0 then
    perform app_private.err('VALIDATION', 'Jumlah bayaran tidak sah.');
  end if;
  if p_payment_date is null or p_payment_date > app_private.today_kl() then
    perform app_private.err('VALIDATION', 'Tarikh bayaran tidak sah.');
  end if;
  if coalesce(char_length(btrim(p_transaction_ref)), 0) < 3 then
    perform app_private.err('VALIDATION', 'Rujukan transaksi bank diperlukan.');
  end if;
  if p_proof_path is not null then
    perform app_private.check_own_path(p_proof_path);
  end if;
  if p_member_id = v_admin then
    perform app_private.err('FORBIDDEN', 'Anda tidak boleh merekod bayaran komisen kepada diri sendiri.');
  end if;

  -- serialise payouts per member
  perform 1 from public.profiles where id = p_member_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Ahli tidak dijumpai.');
  end if;

  select (select coalesce(sum(amount_sen), 0) from public.commission_ledger where member_id = p_member_id)
       - (select coalesce(sum(amount_sen), 0) from public.commission_payouts where member_id = p_member_id)
    into v_outstanding;
  if p_amount_sen > v_outstanding then
    perform app_private.err('VALIDATION', 'Jumlah melebihi baki komisen tertunggak (' || app_private.format_rm(v_outstanding) || ').');
  end if;

  insert into public.commission_payouts (
    payout_no, member_id, amount_sen, payment_date, transaction_ref, proof_path, notes,
    bank_transfer_confirmed, idempotency_key, recorded_by)
  values (
    'PO-' || to_char(app_private.today_kl(), 'YYYY') || '-' || lpad(nextval('public.payout_no_seq')::text, 5, '0'),
    p_member_id, p_amount_sen, p_payment_date, btrim(p_transaction_ref), p_proof_path, p_notes,
    true, p_idempotency_key, v_admin)
  returning id into v_payout_id;

  -- allocate FIFO against unpaid, unreversed earning entries
  for r in
    select l.id,
           l.amount_sen - coalesce((select sum(i.amount_sen) from public.commission_payout_items i
                                     where i.ledger_entry_id = l.id), 0) as unpaid
      from public.commission_ledger l
     where l.member_id = p_member_id
       and l.amount_sen > 0
       and not exists (select 1 from public.commission_ledger x where x.reverses_id = l.id)
       and (p_entry_ids is null or l.id = any (p_entry_ids))
     order by l.created_at, l.id
  loop
    exit when v_remaining <= 0;
    continue when r.unpaid <= 0;
    v_take := least(r.unpaid, v_remaining);
    insert into public.commission_payout_items (payout_id, ledger_entry_id, amount_sen)
    values (v_payout_id, r.id, v_take);
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    perform app_private.err('VALIDATION', 'Jumlah melebihi baki entri komisen yang dipilih.');
  end if;

  perform app_private.audit('commission.payout_recorded', 'commission_payout', v_payout_id::text,
    jsonb_build_object('member_id', p_member_id, 'amount_sen', p_amount_sen, 'transaction_ref', p_transaction_ref));
  perform app_private.notify(p_member_id, 'commission_payout', 'Bayaran komisen direkodkan',
    'Bayaran komisen ' || app_private.format_rm(p_amount_sen) || ' telah dipindahkan (rujukan ' || btrim(p_transaction_ref) || ').',
    '/ahli/komisen');
  return v_payout_id;
end;
$$;

create or replace function public.reverse_commission_payout(p_payout_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_payout public.commission_payouts%rowtype;
  v_id uuid;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab pembalikan.');
  end if;
  select * into v_payout from public.commission_payouts where id = p_payout_id;
  if not found or v_payout.reverses_id is not null then
    perform app_private.err('NOT_FOUND', 'Bayaran tidak dijumpai.');
  end if;
  perform 1 from public.profiles where id = v_payout.member_id for update;
  select id into v_id from public.commission_payouts where reverses_id = p_payout_id;
  if found then
    return v_id;
  end if;

  insert into public.commission_payouts (
    payout_no, member_id, amount_sen, payment_date, transaction_ref, notes,
    bank_transfer_confirmed, reverses_id, recorded_by)
  values (
    v_payout.payout_no || '-R', v_payout.member_id, -v_payout.amount_sen, app_private.today_kl(),
    v_payout.transaction_ref, 'Pembalikan: ' || btrim(p_reason), true, p_payout_id, v_admin)
  returning id into v_id;

  insert into public.commission_payout_items (payout_id, ledger_entry_id, amount_sen)
  select v_id, ledger_entry_id, -amount_sen from public.commission_payout_items where payout_id = p_payout_id;

  perform app_private.audit('commission.payout_reversed', 'commission_payout', p_payout_id::text,
    jsonb_build_object('reversal_id', v_id, 'reason', p_reason));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Notifications & announcements
-- -----------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    perform app_private.err('AUTH_REQUIRED', 'Sila log masuk.');
  end if;
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.send_announcement(p_title text, p_body text, p_link text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_count integer := 0;
  r record;
begin
  if coalesce(char_length(btrim(p_title)), 0) < 3 then
    perform app_private.err('VALIDATION', 'Tajuk diperlukan.');
  end if;
  if p_link is not null and p_link !~ '^/' then
    perform app_private.err('VALIDATION', 'Pautan mesti bermula dengan /.');
  end if;
  perform app_private.rate_limit('announce:' || v_admin, 10, 3600);
  for r in select id from public.profiles where status = 'active' loop
    perform app_private.notify(r.id, 'campaign_announcement', btrim(p_title), p_body, p_link);
    v_count := v_count + 1;
  end loop;
  perform app_private.audit('announcement.sent', 'notification', null,
    jsonb_build_object('title', p_title, 'recipients', v_count));
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- System settings (Super Admin)
-- -----------------------------------------------------------------------------
create or replace function public.update_system_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_old jsonb;
begin
  select value into v_old from public.system_settings where key = p_key for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Tetapan tidak dikenali.');
  end if;
  if p_key in ('share_min_payment_sen', 'share_min_total_sen', 'share_max_total_sen',
               'reservation_expiry_hours', 'upload_max_bytes') then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric < 0
       or (p_value #>> '{}')::numeric <> floor((p_value #>> '{}')::numeric) then
      perform app_private.err('VALIDATION', 'Nilai mesti nombor bulat positif.');
    end if;
  elsif p_key = 'admin_mfa_required' then
    if jsonb_typeof(p_value) <> 'boolean' then
      perform app_private.err('VALIDATION', 'Nilai mesti benar/palsu.');
    end if;
  elsif jsonb_typeof(p_value) not in ('string', 'null') then
    perform app_private.err('VALIDATION', 'Nilai mesti teks.');
  end if;
  if p_key = 'share_max_total_sen'
     and (p_value #>> '{}')::bigint < app_private.setting_bigint('share_min_total_sen', 0) then
    perform app_private.err('VALIDATION', 'Had maksimum tidak boleh kurang daripada had minimum.');
  end if;

  update public.system_settings set value = p_value, updated_by = v_admin where key = p_key;
  perform app_private.audit('setting.updated', 'system_setting', p_key,
    jsonb_build_object('old', v_old, 'new', p_value));
end;
$$;

-- -----------------------------------------------------------------------------
-- Read models
-- -----------------------------------------------------------------------------
create view public.v_share_balances with (security_invoker = true) as
select p.id as member_id,
       p.membership_id,
       p.full_name,
       coalesce(sum(t.amount_sen) filter (where t.status = 'approved'), 0)::bigint as approved_sen,
       coalesce(sum(t.amount_sen) filter (where t.status = 'pending'), 0)::bigint as pending_sen,
       count(t.id) filter (where t.status = 'pending') as pending_count
  from public.profiles p
  left join public.share_transactions t on t.member_id = p.id
 group by p.id, p.membership_id, p.full_name;

create view public.v_commission_summary with (security_invoker = true) as
select p.id as member_id,
       p.membership_id,
       p.full_name,
       coalesce(l.earned_sen, 0)::bigint as earned_sen,
       coalesce(l.gross_sen, 0)::bigint as gross_sen,
       coalesce(l.reversed_sen, 0)::bigint as reversed_sen,
       coalesce(po.paid_sen, 0)::bigint as paid_sen,
       (coalesce(l.earned_sen, 0) - coalesce(po.paid_sen, 0))::bigint as outstanding_sen
  from public.profiles p
  left join (select member_id,
                    sum(amount_sen) as earned_sen,
                    sum(amount_sen) filter (where amount_sen > 0) as gross_sen,
                    -sum(amount_sen) filter (where amount_sen < 0) as reversed_sen
               from public.commission_ledger group by member_id) l on l.member_id = p.id
  left join (select member_id, sum(amount_sen) as paid_sen
               from public.commission_payouts group by member_id) po on po.member_id = p.id;

create view public.v_campaign_progress with (security_invoker = true) as
select c.id as campaign_id,
       c.name, c.year, c.status, c.price_per_share_sen,
       count(distinct k.id) as cattle_count,
       count(s.id) as total_slots,
       count(s.id) filter (where s.status = 'available') as available_slots,
       count(s.id) filter (where s.status = 'reserved') as reserved_slots,
       count(s.id) filter (where s.status = 'confirmed') as confirmed_slots,
       count(s.id) filter (where s.status = 'cancelled') as cancelled_slots
  from public.campaigns c
  left join public.cattle k on k.campaign_id = c.id
  left join public.cattle_slots s on s.cattle_id = k.id
 group by c.id;

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
begin
  return jsonb_build_object(
    'total_members',          (select count(*) from public.profiles where status in ('active', 'suspended')),
    'active_members',         (select count(*) from public.profiles where status = 'active'),
    'pending_approvals',      (select count(*) from public.profiles where status = 'pending_approval'),
    'approved_share_sen',     (select coalesce(sum(amount_sen), 0) from public.share_transactions where status = 'approved'),
    'pending_share_count',    (select count(*) from public.share_transactions where status = 'pending'),
    'pending_share_sen',      (select coalesce(sum(amount_sen), 0) from public.share_transactions where status = 'pending'),
    'active_campaigns',       (select count(*) from public.campaigns where status = 'open'),
    'total_cattle',           (select count(*) from public.cattle k join public.campaigns c on c.id = k.campaign_id
                                where c.status in ('open', 'closed')),
    'available_slots',        (select count(*) from public.cattle_slots s join public.cattle k on k.id = s.cattle_id
                                join public.campaigns c on c.id = k.campaign_id
                                where c.status = 'open' and s.status = 'available'),
    'confirmed_sales',        (select count(*) from public.qurban_sales where status = 'approved'),
    'confirmed_shares',       (select coalesce(sum(share_count), 0) from public.qurban_sales where status = 'approved'),
    'sales_revenue_sen',      (select coalesce(sum(total_sen), 0) from public.qurban_sales where status = 'approved'),
    'pending_sales',          (select count(*) from public.qurban_sales where status = 'pending_review'),
    'commission_earned_sen',  (select coalesce(sum(amount_sen), 0) from public.commission_ledger),
    'commission_paid_sen',    (select coalesce(sum(amount_sen), 0) from public.commission_payouts),
    'commission_outstanding_sen',
                              (select coalesce(sum(amount_sen), 0) from public.commission_ledger)
                            - (select coalesce(sum(amount_sen), 0) from public.commission_payouts),
    'leaderboard', coalesce((
      select jsonb_agg(x order by x.shares desc, x.revenue_sen desc)
        from (select p.full_name, p.membership_id,
                     sum(q.share_count) as shares, sum(q.total_sen) as revenue_sen
                from public.qurban_sales q join public.profiles p on p.id = q.member_id
               where q.status = 'approved'
               group by p.id
               order by shares desc, revenue_sen desc
               limit 10) x), '[]'::jsonb),
    'sales_by_month', coalesce((
      select jsonb_agg(x order by x.month)
        from (select to_char(date_trunc('month', reviewed_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM') as month,
                     sum(share_count) as shares, sum(total_sen) as revenue_sen
                from public.qurban_sales where status = 'approved'
               group by 1 order by 1 desc limit 12) x), '[]'::jsonb),
    'share_capital_by_month', coalesce((
      select jsonb_agg(x order by x.month)
        from (select to_char(date_trunc('month', reviewed_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM') as month,
                     sum(amount_sen) as amount_sen
                from public.share_transactions where status = 'approved'
               group by 1 order by 1 desc limit 12) x), '[]'::jsonb),
    'commission_by_type', coalesce((
      select jsonb_agg(x)
        from (select entry_type, sum(amount_sen) as amount_sen
                from public.commission_ledger group by entry_type) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.member_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
begin
  return jsonb_build_object(
    'approved_share_sen',  (select coalesce(sum(amount_sen), 0) from public.share_transactions
                             where member_id = v_uid and status = 'approved'),
    'pending_share_sen',   (select coalesce(sum(amount_sen), 0) from public.share_transactions
                             where member_id = v_uid and status = 'pending'),
    'confirmed_sales',     (select count(*) from public.qurban_sales where member_id = v_uid and status = 'approved'),
    'shares_sold',         (select coalesce(sum(share_count), 0) from public.qurban_sales
                             where member_id = v_uid and status = 'approved'),
    'sales_value_sen',     (select coalesce(sum(total_sen), 0) from public.qurban_sales
                             where member_id = v_uid and status = 'approved'),
    'pending_sales',       (select count(*) from public.qurban_sales
                             where member_id = v_uid and status in ('pending_payment', 'pending_review')),
    'commission_earned_sen', (select coalesce(sum(amount_sen), 0) from public.commission_ledger where member_id = v_uid),
    'commission_paid_sen',   (select coalesce(sum(amount_sen), 0) from public.commission_payouts where member_id = v_uid)
  );
end;
$$;
