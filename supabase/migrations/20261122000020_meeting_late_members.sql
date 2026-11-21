-- =============================================================================
-- KoopKITA V2.0 — Members who become active after an "all active members"
-- meeting was published are invited too.
--
-- The invitation list of an "all" meeting was taken once, when publishing, so
-- someone who registered at the door and was approved during the meeting could
-- not see it or confirm attendance. Now, whenever a profile becomes active,
-- it is added to every "all" meeting that is still running: scheduled,
-- ongoing, or ended but still inside the grace period (not finalised). The
-- new invitee is notified and can confirm with the code as usual.
-- "Selected members" meetings are unchanged: the admin adds people by hand.
-- =============================================================================

create or replace function app_private.invite_new_active_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return null;
  end if;
  for r in
    insert into public.meeting_invitees (meeting_id, member_id)
    select m.id, new.id
      from public.meetings m
     where m.audience = 'all'
       and (m.status in ('scheduled', 'ongoing') or (m.status = 'completed' and m.finalized_at is null))
    on conflict do nothing
    returning meeting_id
  loop
    perform app_private.notify(new.id, 'meeting_invited', 'Jemputan mesyuarat',
      (select m.title || ' · ' || to_char(m.meeting_date, 'DD/MM/YYYY') || ' ' || to_char(m.start_time, 'HH24:MI')
         from public.meetings m where m.id = r.meeting_id),
      '/ahli/mesyuarat/' || r.meeting_id);
    perform app_private.audit('meeting.invitee_added', 'meeting', r.meeting_id::text,
      jsonb_build_object('member_id', new.id, 'reason', 'member_activated'));
  end loop;
  return null;
end;
$$;

create trigger trg_profiles_invite_to_meetings
after insert or update of status on public.profiles
for each row execute function app_private.invite_new_active_member();

revoke execute on all functions in schema app_private from public;
grant execute on function app_private.is_admin() to authenticated, service_role;
grant execute on function app_private.is_active_member() to authenticated, service_role;
grant execute on function app_private.owns_business(uuid) to authenticated, service_role;
