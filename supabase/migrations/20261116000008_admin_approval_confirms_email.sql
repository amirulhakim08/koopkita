-- =============================================================================
-- KoopKITA V1.0 — Super Admin approval replaces email verification
--
-- A Super Admin may approve an applicant whose email is not yet verified.
-- Approval confirms the email address (auth.users.email_confirmed_at) so the
-- member can sign in straight away. Unverified applicants are counted as
-- pending approvals on the dashboard.
-- =============================================================================

create or replace function public.approve_member(p_user_id uuid, p_notes text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_profile public.profiles%rowtype;
  v_unverified boolean := false;
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
  if v_profile.status not in ('pending_approval', 'pending_verification') then
    perform app_private.err('CONFLICT', 'Permohonan ini tidak menunggu kelulusan (status: ' || v_profile.status || ').');
  end if;

  -- Super Admin approval stands in for email verification: confirm the address
  -- so the member can sign in immediately.
  select (email_confirmed_at is null) into v_unverified from auth.users where id = p_user_id;
  if v_unverified then
    update auth.users set email_confirmed_at = now() where id = p_user_id and email_confirmed_at is null;
  end if;

  update public.profiles
     set status = 'active',
         member_no = coalesce(member_no, nextval('public.member_no_seq')),
         approved_at = now(), approved_by = v_admin,
         email_verified_at = coalesce(email_verified_at, now()),
         status_reason = null, status_changed_at = now(), status_changed_by = v_admin
   where id = p_user_id
  returning * into v_profile;

  update public.membership_applications
     set status = 'approved', reviewed_by = v_admin, reviewed_at = now(), review_notes = p_notes
   where user_id = p_user_id and status = 'pending';

  perform app_private.audit('member.approved', 'profile', p_user_id::text,
    jsonb_build_object('membership_id', v_profile.membership_id, 'notes', p_notes,
                       'email_confirmed_by_admin', coalesce(v_unverified, false)));
  perform app_private.notify(p_user_id, 'membership_approved', 'Keahlian diluluskan',
    'Tahniah! Keahlian anda telah diluluskan. No. Ahli: ' || v_profile.membership_id, '/ahli');
  return v_profile.membership_id;
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
