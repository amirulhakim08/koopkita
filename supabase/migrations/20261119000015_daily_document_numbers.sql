-- =============================================================================
-- KoopKITA — "Bisnes Saya": daily document numbers.
--
-- New invoices and receipts are numbered by date plus a daily sequence:
--   INV-YYMMDDNNN   e.g. INV-260125001 = first invoice dated 25 January 2026
--   RCP-YYMMDDNNN   e.g. RCP-260125001 = first receipt for a payment on that day
-- The sequence restarts every day, separately for each business and each kind.
-- Invoices use the invoice date; receipts use the payment / sale date.
-- From the 1000th document of a day the sequence simply grows to 4 digits.
--
-- Documents already issued keep their old numbers (INV-2026-0001): issued
-- documents are immutable. Old and new formats never collide.
-- =============================================================================

create table app_private.business_daily_counters (
  business_id  uuid not null references public.business_profiles (id) on delete restrict,
  kind         text not null check (kind in ('INV', 'RCP')),
  doc_date     date not null,
  last_no      integer not null default 0 check (last_no >= 0),
  primary key (business_id, kind, doc_date)
);
alter table app_private.business_daily_counters enable row level security;

-- Atomic per-business, per-kind, per-day numbering.
create or replace function app_private.next_document_no(p_business_id uuid, p_kind text, p_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_no integer;
begin
  insert into app_private.business_daily_counters (business_id, kind, doc_date, last_no)
  values (p_business_id, p_kind, p_date, 1)
  on conflict (business_id, kind, doc_date) do update set last_no = app_private.business_daily_counters.last_no + 1
  returning last_no into v_no;
  return p_kind || '-' || to_char(p_date, 'YYMMDD')
         || case when v_no < 1000 then lpad(v_no::text, 3, '0') else v_no::text end;
end;
$$;

revoke execute on function app_private.next_document_no(uuid, text, date) from public;
