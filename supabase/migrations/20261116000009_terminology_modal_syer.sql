-- =============================================================================
-- KoopKITA V1.0 — Terminology: "modal saham" -> "modal syer"
-- Updates user-facing messages and setting descriptions. URLs and identifiers
-- (e.g. /ahli/saham, share_transactions) are unchanged.
-- =============================================================================

update public.system_settings set description = 'Bayaran syer minimum bagi setiap transaksi (sen)' where key = 'share_min_payment_sen';
update public.system_settings set description = 'Jumlah modal syer minimum seorang ahli (sen) — rujukan undang-undang kecil' where key = 'share_min_total_sen';
update public.system_settings set description = 'Jumlah modal syer maksimum seorang ahli (sen)' where key = 'share_max_total_sen';

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
    perform app_private.err('VALIDATION', 'Jumlah minimum bayaran syer ialah ' || app_private.format_rm(v_min) || '.');
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
    perform app_private.err('VALIDATION', 'Jumlah melebihi had maksimum modal syer ' || app_private.format_rm(v_max) || '.');
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
  perform app_private.notify_admins('share_payment_submitted', 'Bayaran syer baharu',
    'Bayaran syer ' || app_private.format_rm(p_amount_sen) || ' menunggu semakan.'
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
    perform app_private.err('FORBIDDEN', 'Anda tidak boleh menyemak bayaran syer sendiri.');
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
    case when p_approve then 'Bayaran syer diluluskan' else 'Bayaran syer ditolak' end,
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
    perform app_private.err('VALIDATION', 'Pelarasan akan menjadikan baki modal syer negatif.');
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
  perform app_private.notify(p_member_id, 'share_adjusted', 'Pelarasan modal syer',
    'Pelarasan ' || app_private.format_rm(p_amount_sen) || ' telah direkodkan. Sebab: ' || p_reason, '/ahli/saham');
  return v_id;
end;
$$;

