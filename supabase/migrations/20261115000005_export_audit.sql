-- =============================================================================
-- KoopKITA V1.0 — Audit logging of personal-data exports (PDPA accountability)
-- =============================================================================
create or replace function public.log_export(p_report text, p_row_count integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
begin
  if p_report !~ '^[a-z-]{2,40}$' then
    perform app_private.err('VALIDATION', 'Laporan tidak sah.');
  end if;
  perform app_private.rate_limit('export:' || v_admin, 60, 3600);
  perform app_private.audit('report.exported', 'report', p_report, jsonb_build_object('rows', p_row_count));
end;
$$;

revoke execute on function public.log_export(text, integer) from public, anon;
grant execute on function public.log_export(text, integer) to authenticated;
