-- =============================================================================
-- KoopKITA V1.0 — Row Level Security and privileges
--
-- Model:
--   * anon:          no table access at all.
--   * authenticated: SELECT only, filtered by RLS; the only direct writes are a
--                    member editing a few columns of their own profile.
--   * All other writes go through SECURITY DEFINER functions (migration 000002).
-- =============================================================================

-- Helpers used by policies
grant usage on schema app_private to authenticated, service_role;
revoke execute on all functions in schema app_private from public;
grant execute on function app_private.is_admin() to authenticated, service_role;
grant execute on function app_private.is_active_member() to authenticated, service_role;

-- Start from zero privileges for client roles
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Enable RLS everywhere
alter table public.system_settings          enable row level security;
alter table public.profiles                 enable row level security;
alter table public.membership_applications  enable row level security;
alter table public.share_transactions       enable row level security;
alter table public.campaigns                enable row level security;
alter table public.cattle                   enable row level security;
alter table public.cattle_slots             enable row level security;
alter table public.buyers                   enable row level security;
alter table public.qurban_sales             enable row level security;
alter table public.qurban_participants      enable row level security;
alter table public.payment_submissions      enable row level security;
alter table public.commission_ledger        enable row level security;
alter table public.commission_payouts       enable row level security;
alter table public.commission_payout_items  enable row level security;
alter table public.notifications            enable row level security;
alter table public.audit_logs               enable row level security;
alter table app_private.rate_limits         enable row level security;

-- SELECT grants (rows still filtered by the policies below)
grant select on
  public.system_settings, public.profiles, public.membership_applications, public.share_transactions,
  public.campaigns, public.cattle, public.cattle_slots, public.buyers, public.qurban_sales,
  public.qurban_participants, public.payment_submissions, public.commission_ledger,
  public.commission_payouts, public.commission_payout_items, public.notifications, public.audit_logs,
  public.v_share_balances, public.v_commission_summary, public.v_campaign_progress
to authenticated;

-- Members may edit only these columns of their own profile (role, status,
-- membership number, IC number and approval metadata are not updatable).
grant update (full_name, phone, address, state, postcode, bank_name, bank_account_no, bank_account_holder)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
create policy settings_select on public.system_settings for select to authenticated
  using ((is_public and (select app_private.is_active_member())) or (select app_private.is_admin()));

-- Own profile is always readable (needed to show "pending approval" etc.)
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select app_private.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select app_private.is_active_member()))
  with check (id = (select auth.uid()));

create policy applications_select on public.membership_applications for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.is_admin()));

create policy share_txn_select on public.share_transactions for select to authenticated
  using ((member_id = (select auth.uid()) and (select app_private.is_active_member()))
         or (select app_private.is_admin()));

create policy campaigns_select on public.campaigns for select to authenticated
  using ((status <> 'draft' and (select app_private.is_active_member())) or (select app_private.is_admin()));

create policy cattle_select on public.cattle for select to authenticated
  using ((select app_private.is_admin())
         or ((select app_private.is_active_member())
             and exists (select 1 from public.campaigns c where c.id = campaign_id and c.status <> 'draft')));

create policy slots_select on public.cattle_slots for select to authenticated
  using ((select app_private.is_admin())
         or ((select app_private.is_active_member())
             and exists (select 1 from public.cattle k join public.campaigns c on c.id = k.campaign_id
                          where k.id = cattle_id and c.status <> 'draft')));

create policy buyers_select on public.buyers for select to authenticated
  using ((created_by = (select auth.uid()) and (select app_private.is_active_member()))
         or (select app_private.is_admin()));

create policy sales_select on public.qurban_sales for select to authenticated
  using ((member_id = (select auth.uid()) and (select app_private.is_active_member()))
         or (select app_private.is_admin()));

create policy participants_select on public.qurban_participants for select to authenticated
  using ((select app_private.is_admin())
         or exists (select 1 from public.qurban_sales s
                     where s.id = sale_id and s.member_id = (select auth.uid()))
            and (select app_private.is_active_member()));

create policy payment_submissions_select on public.payment_submissions for select to authenticated
  using ((select app_private.is_admin())
         or exists (select 1 from public.qurban_sales s
                     where s.id = sale_id and s.member_id = (select auth.uid()))
            and (select app_private.is_active_member()));

create policy commission_ledger_select on public.commission_ledger for select to authenticated
  using ((member_id = (select auth.uid()) and (select app_private.is_active_member()))
         or (select app_private.is_admin()));

create policy commission_payouts_select on public.commission_payouts for select to authenticated
  using ((member_id = (select auth.uid()) and (select app_private.is_active_member()))
         or (select app_private.is_admin()));

create policy commission_payout_items_select on public.commission_payout_items for select to authenticated
  using ((select app_private.is_admin())
         or exists (select 1 from public.commission_payouts p
                     where p.id = payout_id and p.member_id = (select auth.uid()))
            and (select app_private.is_active_member()));

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select app_private.is_admin()));

-- ---------------------------------------------------------------------------
-- Function execution grants (API surface)
-- ---------------------------------------------------------------------------
grant execute on function
  public.submit_share_payment(bigint, date, text, text, text),
  public.create_qurban_sale(uuid, integer, jsonb, jsonb, text, text),
  public.submit_sale_payment(uuid, bigint, date, text, text, text),
  public.cancel_qurban_sale(uuid, text),
  public.mark_notifications_read(uuid[]),
  public.member_dashboard_stats(),
  -- admin functions: authorization is enforced inside each function
  public.approve_member(uuid, text),
  public.reject_member(uuid, text),
  public.set_member_suspension(uuid, boolean, text),
  public.admin_update_member(uuid, jsonb),
  public.review_share_payment(uuid, boolean, text),
  public.create_share_adjustment(uuid, bigint, text, uuid, text),
  public.save_campaign(uuid, text, integer, date, date, bigint, bigint, bigint, integer, text),
  public.set_campaign_status(uuid, text),
  public.add_cattle(uuid, integer, text),
  public.update_cattle_notes(uuid, text),
  public.set_slot_cancelled(uuid, boolean),
  public.review_sale_payment(uuid, boolean, text),
  public.approve_qurban_sale(uuid, text),
  public.reject_qurban_sale(uuid, text),
  public.admin_reassign_slot(uuid, uuid),
  public.record_commission_payout(uuid, bigint, date, text, text, text, boolean, uuid[], text),
  public.reverse_commission_payout(uuid, text),
  public.send_announcement(text, text, text),
  public.update_system_setting(text, jsonb),
  public.admin_dashboard_stats(),
  public.expire_stale_reservations()
to authenticated;

grant execute on function public.expire_stale_reservations() to service_role;
grant execute on function public.provision_super_admin(text) to service_role;
