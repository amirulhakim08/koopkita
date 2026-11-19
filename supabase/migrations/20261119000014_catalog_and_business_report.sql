-- =============================================================================
-- KoopKITA — "Bisnes Saya": product/service catalogue and the Super Admin
-- sales report.
--
-- Catalogue: each member lists their own products or services with a preferred
-- price. Picking an item on an invoice or receipt copies its name and price into
-- the document line (the member confirms the price), so later catalogue changes
-- never alter issued documents. Items are hidden, not deleted. Owner only.
--
-- Report: per-business sales for a date range, aggregates only (no customers,
-- items or catalogue).
-- =============================================================================

create table public.business_catalog_items (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.business_profiles (id) on delete restrict,
  name         text not null check (char_length(btrim(name)) between 1 and 300),
  price_sen    bigint not null check (price_sen between 0 and 100000000000),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index business_catalog_items_name_key on public.business_catalog_items (business_id, lower(btrim(name)));

create trigger trg_business_catalog_items_updated_at before update on public.business_catalog_items
for each row execute function app_private.set_updated_at();
create trigger trg_business_catalog_items_no_delete before delete on public.business_catalog_items
for each row execute function app_private.forbid_delete();

alter table public.business_catalog_items enable row level security;
grant select, insert, update on public.business_catalog_items to authenticated;

create policy business_catalog_select on public.business_catalog_items for select to authenticated
  using ((select app_private.owns_business(business_id)));
create policy business_catalog_insert on public.business_catalog_items for insert to authenticated
  with check ((select app_private.owns_business(business_id))
              and exists (select 1 from public.business_profiles b where b.id = business_id and b.suspended_at is null));
create policy business_catalog_update on public.business_catalog_items for update to authenticated
  using ((select app_private.owns_business(business_id)))
  with check ((select app_private.owns_business(business_id))
              and exists (select 1 from public.business_profiles b where b.id = business_id and b.suspended_at is null));

-- Super Admin: sales per business for a date range (inclusive; null = no limit).
--  invoiced_sen      invoices issued in the range (by invoice date), not cancelled
--  direct_sales_sen  direct-sale receipts in the range (by sale date), not reversed
--  total_sales_sen   the two together
--  received_sen      all money received in the range (by payment date), not reversed
--  outstanding_sen   unpaid balance of open invoices today (not limited by the range)
create or replace function public.admin_business_report(p_from date, p_to date)
returns table (
  business_id uuid, name text, ssm_no text, ssm_verified boolean, suspended boolean, suspend_reason text,
  phone text, logo_path text, owner_name text, membership_id text, created_at timestamptz,
  invoice_count bigint, invoiced_sen bigint, direct_count bigint, direct_sales_sen bigint, total_sales_sen bigint,
  received_sen bigint, outstanding_sen bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
begin
  if p_from is not null and p_to is not null and p_to < p_from then
    perform app_private.err('VALIDATION', 'Tarikh akhir mesti selepas tarikh mula.');
  end if;
  return query
    with inv as (
      select i.business_id,
             count(*) filter (where not i.is_direct) as invoice_count,
             coalesce(sum(i.total_sen) filter (where not i.is_direct), 0)::bigint as invoiced_sen,
             count(*) filter (where i.is_direct) as direct_count,
             coalesce(sum(i.total_sen) filter (where i.is_direct), 0)::bigint as direct_sales_sen
        from public.business_invoices i
       where i.status not in ('draft', 'cancelled')
         and (p_from is null or i.issue_date >= p_from) and (p_to is null or i.issue_date <= p_to)
       group by i.business_id
    ), rec as (
      select x.business_id, coalesce(sum(x.amount_sen), 0)::bigint as received_sen
        from public.business_payments x
       where x.reversed_at is null
         and (p_from is null or x.paid_on >= p_from) and (p_to is null or x.paid_on <= p_to)
       group by x.business_id
    ), open_inv as (
      select i.business_id, coalesce(sum(i.total_sen - i.paid_sen), 0)::bigint as outstanding_sen
        from public.business_invoices i
       where i.status in ('issued', 'partially_paid')
       group by i.business_id
    )
    select b.id, b.name, b.ssm_no, b.ssm_verified_at is not null, b.suspended_at is not null, b.suspend_reason,
           b.phone, b.logo_path, p.full_name, p.membership_id, b.created_at,
           coalesce(inv.invoice_count, 0), coalesce(inv.invoiced_sen, 0), coalesce(inv.direct_count, 0),
           coalesce(inv.direct_sales_sen, 0), coalesce(inv.invoiced_sen, 0) + coalesce(inv.direct_sales_sen, 0),
           coalesce(rec.received_sen, 0), coalesce(open_inv.outstanding_sen, 0)
      from public.business_profiles b
      join public.profiles p on p.id = b.owner_id
      left join inv on inv.business_id = b.id
      left join rec on rec.business_id = b.id
      left join open_inv on open_inv.business_id = b.id
     order by coalesce(inv.invoiced_sen, 0) + coalesce(inv.direct_sales_sen, 0) desc, b.created_at desc;
end;
$$;

revoke execute on function public.admin_business_report(date, date) from public, anon;
grant execute on function public.admin_business_report(date, date) to authenticated;

do $$
begin
  execute 'create trigger trg_business_catalog_items_no_truncate before truncate on public.business_catalog_items '
          'for each statement execute function app_private.forbid_truncate()';
end $$;
