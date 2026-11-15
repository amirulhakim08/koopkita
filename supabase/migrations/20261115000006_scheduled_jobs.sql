-- =============================================================================
-- KoopKITA V1.0 — Scheduled jobs
-- Releases slot reservations that never received payment proof (every 15 min).
-- Sales already under payment review are never expired automatically.
-- Reservations are also expired lazily whenever a new sale is created, so the
-- system stays correct even where pg_cron is unavailable.
-- =============================================================================
do $outer$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not available (%); relying on lazy expiry only', sqlerrm;
    return;
  end;
  perform cron.schedule('koopkita-expire-reservations', '*/15 * * * *',
                        $$select app_private.expire_reservations(null)$$);
end
$outer$;
