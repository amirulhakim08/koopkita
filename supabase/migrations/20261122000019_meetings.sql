-- =============================================================================
-- KoopKITA V2.0 — Meetings (Mesyuarat) and attendance (Kehadiran)
--
--  * The Super Admin creates a meeting (physical, online or hybrid), invites
--    all active members or selected members, and publishes it. The invitation
--    list is kept as the meeting's history; only invitees see the meeting,
--    get notifications and count in the statistics.
--  * Status: draft -> scheduled -> ongoing -> completed (or cancelled).
--    "Buka sesi kehadiran" moves a scheduled meeting to ongoing; "Tamatkan
--    mesyuarat" completes it. After that, members may still confirm with the
--    same code until 00:01 (Malaysia time) the night after the meeting ends;
--    then the session closes and invitees who never confirmed become absent
--    (pg_cron every 5 minutes, plus lazily whenever meetings are read).
--  * Attendance code: 5 digits, kept in app_private (never readable by
--    members). Regenerating it invalidates the old one. Codes are checked in
--    the database; 5 wrong attempts lock the member out for 10 minutes. Wrong
--    attempts are returned (not raised) so the counter survives.
--  * The Super Admin may correct a status manually with a reason; every
--    change is audited.
-- =============================================================================

create table app_private.meeting_counters (
  year     integer primary key,
  last_no  integer not null default 0
);

create table public.meetings (
  id                    uuid primary key default gen_random_uuid(),
  meeting_no            text not null unique,
  title                 text not null check (char_length(title) between 3 and 200),
  agenda                text check (agenda is null or char_length(agenda) <= 8000),
  meeting_date          date not null,
  start_time            time not null,
  end_time              time,
  mode                  text not null check (mode in ('physical', 'online', 'hybrid')),
  location              text check (location is null or char_length(location) <= 300),
  online_url            text check (online_url is null or (char_length(online_url) <= 500 and online_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]<>"]*)?$')),
  audience              text not null default 'all' check (audience in ('all', 'selected')),
  status                text not null default 'draft' check (status in ('draft', 'scheduled', 'ongoing', 'completed', 'cancelled')),
  attendance_open       boolean not null default false,
  attendance_opened_at  timestamptz,
  ended_at              timestamptz,
  attendance_closes_at  timestamptz,
  finalized_at          timestamptz,
  published_at          timestamptz,
  cancelled_at          timestamptz,
  cancel_reason         text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  created_by            uuid not null references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (end_time is null or end_time > start_time),
  check (mode = 'physical' or online_url is not null),
  check (mode = 'online' or location is not null),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check (status not in ('completed') or (ended_at is not null and attendance_closes_at is not null))
);
create index meetings_date_idx on public.meetings (meeting_date desc, start_time);
create index meetings_status_idx on public.meetings (status);

create trigger trg_meetings_updated_at
before update on public.meetings
for each row execute function app_private.set_updated_at();

create trigger trg_meetings_no_delete
before delete on public.meetings
for each row execute function app_private.forbid_delete();

-- The attendance code never leaves app_private except to the Super Admin.
create table app_private.meeting_codes (
  meeting_id  uuid primary key references public.meetings (id) on delete restrict,
  code        text not null check (code ~ '^[0-9]{5}$'),
  version     integer not null default 1,
  updated_at  timestamptz not null default now()
);

create table app_private.meeting_code_attempts (
  meeting_id    uuid not null references public.meetings (id) on delete restrict,
  member_id     uuid not null references public.profiles (id) on delete restrict,
  failed        integer not null default 0,
  locked_until  timestamptz,
  primary key (meeting_id, member_id)
);

create table public.meeting_invitees (
  meeting_id    uuid not null references public.meetings (id) on delete restrict,
  member_id     uuid not null references public.profiles (id) on delete restrict,
  status        text not null default 'pending' check (status in ('pending', 'present', 'absent', 'excused')),
  confirmed_at  timestamptz,
  method        text check (method is null or method in ('code', 'manual')),
  note          text check (note is null or char_length(note) <= 500),
  updated_by    uuid references public.profiles (id),
  invited_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (meeting_id, member_id),
  check (status <> 'present' or (confirmed_at is not null and method is not null))
);
create index meeting_invitees_member_idx on public.meeting_invitees (member_id);

create trigger trg_meeting_invitees_updated_at
before update on public.meeting_invitees
for each row execute function app_private.set_updated_at();

-- Invitees may be removed only before the meeting starts (still "pending").
create or replace function app_private.guard_meeting_invitee()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'pending'
     or exists (select 1 from public.meetings m where m.id = old.meeting_id and m.status not in ('draft', 'scheduled')) then
    raise exception 'IMMUTABLE_RECORD: invitation history cannot be deleted' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger trg_meeting_invitees_guard
before delete on public.meeting_invitees
for each row execute function app_private.guard_meeting_invitee();

do $$
declare
  t text;
begin
  foreach t in array array['meetings', 'meeting_invitees']
  loop
    execute format('create trigger trg_%s_no_truncate before truncate on public.%I '
                   'for each statement execute function app_private.forbid_truncate()', t, t);
  end loop;
end $$;

-- Helpers -----------------------------------------------------------------------

create or replace function app_private.new_meeting_code()
returns text
language sql
volatile
set search_path = ''
as $$ select lpad(floor(random() * 100000)::integer::text, 5, '0') $$;

-- 00:01 Malaysia time on the night after today.
create or replace function app_private.meeting_buffer_end()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select ((app_private.today_kl() + 1)::timestamp + interval '1 minute') at time zone 'Asia/Kuala_Lumpur' $$;

create or replace function app_private.notify_invitees(p_meeting_id uuid, p_type text, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select i.member_id from public.meeting_invitees i where i.meeting_id = p_meeting_id loop
    perform app_private.notify(r.member_id, p_type, p_title, p_body, '/ahli/mesyuarat/' || p_meeting_id);
  end loop;
end;
$$;

-- Close sessions whose grace period has passed; unconfirmed invitees become absent.
create or replace function app_private.finalize_due_meetings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in select id from public.meetings
            where status = 'completed' and finalized_at is null and attendance_closes_at <= now()
            for update skip locked loop
    update public.meeting_invitees
       set status = 'absent', updated_at = now()
     where meeting_id = r.id and status = 'pending';
    update public.meetings set attendance_open = false, finalized_at = now() where id = r.id;
    perform app_private.audit('meeting.finalized', 'meeting', r.id::text, '{}'::jsonb);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Anyone signed in may trigger the (idempotent) finalisation before reading.
create or replace function public.refresh_meetings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    perform app_private.err('AUTH_REQUIRED', 'Sila log masuk.');
  end if;
  return app_private.finalize_due_meetings();
end;
$$;

-- Admin: create or edit ----------------------------------------------------------

create or replace function public.save_meeting(p_id uuid, p_data jsonb, p_member_ids uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_m public.meetings%rowtype;
  v_year integer := extract(year from app_private.today_kl())::integer;
  v_no integer;
  v_id uuid;
  v_audience text := coalesce(nullif(p_data ->> 'audience', ''), 'all');
  v_mode text := p_data ->> 'mode';
  v_url text := nullif(btrim(coalesce(p_data ->> 'online_url', '')), '');
  v_location text := nullif(btrim(coalesce(p_data ->> 'location', '')), '');
  v_changed boolean := false;
  v_added integer := 0;
begin
  if coalesce(char_length(btrim(p_data ->> 'title')), 0) < 3 then
    perform app_private.err('VALIDATION', 'Tajuk mesyuarat diperlukan.');
  end if;
  if v_mode not in ('physical', 'online', 'hybrid') then
    perform app_private.err('VALIDATION', 'Sila pilih jenis mesyuarat.');
  end if;
  if v_mode in ('online', 'hybrid') and (v_url is null or v_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]<>"]*)?$') then
    perform app_private.err('VALIDATION', 'Pautan mesyuarat mesti URL https:// yang sah (Google Meet, Zoom atau Teams).');
  end if;
  if v_mode in ('physical', 'hybrid') and v_location is null then
    perform app_private.err('VALIDATION', 'Lokasi mesyuarat diperlukan.');
  end if;
  if v_mode = 'physical' then v_url := null; end if;
  if v_mode = 'online' then v_location := null; end if;
  if v_audience = 'selected' and coalesce(cardinality(p_member_ids), 0) = 0 then
    perform app_private.err('VALIDATION', 'Sila pilih sekurang-kurangnya seorang peserta.');
  end if;

  begin
    if p_id is null then
      perform app_private.rate_limit('meeting_create:' || v_admin, 30, 3600);
      insert into app_private.meeting_counters (year, last_no) values (v_year, 1)
        on conflict (year) do update set last_no = app_private.meeting_counters.last_no + 1
        returning last_no into v_no;
      insert into public.meetings (meeting_no, title, agenda, meeting_date, start_time, end_time, mode, location, online_url,
                                   audience, created_by)
      values ('MSY-' || v_year || '-' || lpad(v_no::text, 3, '0'), btrim(p_data ->> 'title'),
              nullif(btrim(coalesce(p_data ->> 'agenda', '')), ''), (p_data ->> 'meeting_date')::date,
              (p_data ->> 'start_time')::time, nullif(p_data ->> 'end_time', '')::time, v_mode, v_location, v_url,
              v_audience, v_admin)
      returning * into v_m;
      v_id := v_m.id;
    else
      select * into v_m from public.meetings where id = p_id for update;
      if not found then
        perform app_private.err('NOT_FOUND', 'Mesyuarat tidak dijumpai.');
      end if;
      if v_m.status in ('completed', 'cancelled') then
        perform app_private.err('CONFLICT', 'Mesyuarat ini telah selesai atau dibatalkan.');
      end if;
      if v_m.status = 'ongoing' and v_audience <> v_m.audience then
        perform app_private.err('CONFLICT', 'Peserta tidak boleh diubah semasa mesyuarat berlangsung.');
      end if;
      update public.meetings
         set title = btrim(p_data ->> 'title'), agenda = nullif(btrim(coalesce(p_data ->> 'agenda', '')), ''),
             meeting_date = (p_data ->> 'meeting_date')::date, start_time = (p_data ->> 'start_time')::time,
             end_time = nullif(p_data ->> 'end_time', '')::time, mode = v_mode, location = v_location, online_url = v_url,
             audience = v_audience
       where id = p_id;
      v_changed := (v_m.title, v_m.agenda, v_m.meeting_date, v_m.start_time, v_m.end_time, v_m.mode, v_m.location, v_m.online_url)
               is distinct from (btrim(p_data ->> 'title'), nullif(btrim(coalesce(p_data ->> 'agenda', '')), ''),
                                 (p_data ->> 'meeting_date')::date, (p_data ->> 'start_time')::time,
                                 nullif(p_data ->> 'end_time', '')::time, v_mode, v_location, v_url);
      v_id := p_id;
    end if;
  exception
    when check_violation or not_null_violation then
      perform app_private.err('VALIDATION', 'Sila semak tarikh, masa, jenis, lokasi dan pautan mesyuarat.');
    when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      perform app_private.err('VALIDATION', 'Tarikh atau masa tidak sah.');
  end;

  -- Invitation list (editable until the meeting starts).
  if v_m.status in ('draft', 'scheduled') then
    if v_audience = 'selected' then
      delete from public.meeting_invitees i
       where i.meeting_id = v_id and i.status = 'pending' and not (i.member_id = any (p_member_ids));
      with ins as (
        insert into public.meeting_invitees (meeting_id, member_id)
        select v_id, p.id from public.profiles p
         where p.id = any (p_member_ids) and p.status = 'active'
        on conflict do nothing
        returning member_id)
      select count(*) into v_added from ins;
      if not exists (select 1 from public.meeting_invitees where meeting_id = v_id) then
        perform app_private.err('VALIDATION', 'Tiada ahli aktif dalam pilihan anda.');
      end if;
    elsif v_m.status = 'scheduled' then
      with ins as (
        insert into public.meeting_invitees (meeting_id, member_id)
        select v_id, p.id from public.profiles p where p.status = 'active'
        on conflict do nothing
        returning member_id)
      select count(*) into v_added from ins;
    else
      -- draft with "all active members": the list is taken when publishing
      delete from public.meeting_invitees where meeting_id = v_id and status = 'pending';
    end if;
  end if;

  perform app_private.audit(case when p_id is null then 'meeting.created' else 'meeting.updated' end, 'meeting', v_id::text,
    jsonb_build_object('title', btrim(p_data ->> 'title'), 'meeting_date', p_data ->> 'meeting_date', 'mode', v_mode,
                       'audience', v_audience, 'selected', coalesce(cardinality(p_member_ids), 0)));

  if p_id is not null and v_m.status in ('scheduled', 'ongoing') then
    if v_changed then
      perform app_private.notify_invitees(v_id, 'meeting_updated', 'Maklumat mesyuarat dikemas kini',
        btrim(p_data ->> 'title') || ' · ' || to_char((p_data ->> 'meeting_date')::date, 'DD/MM/YYYY') || ' ' ||
        to_char((p_data ->> 'start_time')::time, 'HH24:MI') || '. Sila semak butiran terkini.');
    elsif v_added > 0 then
      perform app_private.notify(i.member_id, 'meeting_invited', 'Jemputan mesyuarat',
          btrim(p_data ->> 'title') || ' · ' || to_char((p_data ->> 'meeting_date')::date, 'DD/MM/YYYY') || ' ' ||
          to_char((p_data ->> 'start_time')::time, 'HH24:MI'), '/ahli/mesyuarat/' || v_id)
         from public.meeting_invitees i
        where i.meeting_id = v_id and i.invited_at = now();
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.publish_meeting(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_m public.meetings%rowtype;
  v_count integer;
begin
  select * into v_m from public.meetings where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Mesyuarat tidak dijumpai.');
  end if;
  if v_m.status <> 'draft' then
    perform app_private.err('CONFLICT', 'Mesyuarat ini telah diterbitkan.');
  end if;
  if v_m.audience = 'all' then
    insert into public.meeting_invitees (meeting_id, member_id)
    select p_id, p.id from public.profiles p where p.status = 'active'
    on conflict do nothing;
  end if;
  select count(*) into v_count from public.meeting_invitees where meeting_id = p_id;
  if v_count = 0 then
    perform app_private.err('VALIDATION', 'Tiada peserta untuk dijemput.');
  end if;
  insert into app_private.meeting_codes (meeting_id, code) values (p_id, app_private.new_meeting_code())
    on conflict (meeting_id) do nothing;
  update public.meetings set status = 'scheduled', published_at = now() where id = p_id;
  perform app_private.audit('meeting.published', 'meeting', p_id::text, jsonb_build_object('invitees', v_count, 'audience', v_m.audience));
  perform app_private.notify_invitees(p_id, 'meeting_invited', 'Jemputan mesyuarat',
    v_m.title || ' · ' || to_char(v_m.meeting_date, 'DD/MM/YYYY') || ' ' || to_char(v_m.start_time, 'HH24:MI')
      || case v_m.mode when 'online' then ' · Online' when 'hybrid' then ' · Hybrid' else ' · ' || coalesce(v_m.location, '') end);
  return v_count;
end;
$$;

create or replace function public.cancel_meeting(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_m public.meetings%rowtype;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab pembatalan.');
  end if;
  select * into v_m from public.meetings where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Mesyuarat tidak dijumpai.');
  end if;
  if v_m.status in ('completed', 'cancelled') then
    perform app_private.err('CONFLICT', 'Mesyuarat ini telah selesai atau dibatalkan.');
  end if;
  update public.meetings
     set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason), attendance_open = false
   where id = p_id;
  perform app_private.audit('meeting.cancelled', 'meeting', p_id::text, jsonb_build_object('reason', btrim(p_reason), 'from', v_m.status));
  if v_m.status <> 'draft' then
    perform app_private.notify_invitees(p_id, 'meeting_cancelled', 'Mesyuarat dibatalkan',
      v_m.title || ' (' || to_char(v_m.meeting_date, 'DD/MM/YYYY') || ') dibatalkan. Sebab: ' || btrim(p_reason));
  end if;
end;
$$;

-- Admin: attendance session -------------------------------------------------------

create or replace function public.open_attendance(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_m public.meetings%rowtype;
begin
  perform app_private.finalize_due_meetings();
  select * into v_m from public.meetings where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Mesyuarat tidak dijumpai.');
  end if;
  if v_m.status not in ('scheduled', 'ongoing') and not (v_m.status = 'completed' and v_m.finalized_at is null) then
    perform app_private.err('CONFLICT', 'Sesi kehadiran tidak boleh dibuka untuk mesyuarat ini.');
  end if;
  insert into app_private.meeting_codes (meeting_id, code) values (p_id, app_private.new_meeting_code())
    on conflict (meeting_id) do nothing;
  update public.meetings
     set status = case when status = 'scheduled' then 'ongoing' else status end,
         attendance_open = true, attendance_opened_at = coalesce(attendance_opened_at, now())
   where id = p_id;
  perform app_private.audit('meeting.attendance_opened', 'meeting', p_id::text, jsonb_build_object('status', v_m.status));
end;
$$;

-- Pause the session (ongoing), or close it for good after the meeting ended.
create or replace function public.close_attendance(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_m public.meetings%rowtype;
begin
  select * into v_m from public.meetings where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Mesyuarat tidak dijumpai.');
  end if;
  if v_m.status = 'completed' then
    if v_m.finalized_at is null then
      update public.meetings set attendance_closes_at = now() where id = p_id;
      perform app_private.finalize_due_meetings();
    end if;
  elsif v_m.status = 'ongoing' then
    update public.meetings set attendance_open = false where id = p_id;
  else
    perform app_private.err('CONFLICT', 'Tiada sesi kehadiran yang dibuka.');
  end if;
  perform app_private.audit('meeting.attendance_closed', 'meeting', p_id::text, jsonb_build_object('status', v_m.status));
end;
$$;

-- End the meeting. Members may still confirm until 00:01 tonight (Malaysia time).
create or replace function public.end_meeting(p_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_m public.meetings%rowtype;
  v_close timestamptz := app_private.meeting_buffer_end();
begin
  select * into v_m from public.meetings where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Mesyuarat tidak dijumpai.');
  end if;
  if v_m.status not in ('scheduled', 'ongoing') then
    perform app_private.err('CONFLICT', 'Hanya mesyuarat yang dijadualkan atau sedang berlangsung boleh ditamatkan.');
  end if;
  insert into app_private.meeting_codes (meeting_id, code) values (p_id, app_private.new_meeting_code())
    on conflict (meeting_id) do nothing;
  update public.meetings
     set status = 'completed', ended_at = now(), attendance_closes_at = v_close, attendance_open = true,
         attendance_opened_at = coalesce(attendance_opened_at, now())
   where id = p_id;
  perform app_private.audit('meeting.ended', 'meeting', p_id::text, jsonb_build_object('attendance_closes_at', v_close));
  return v_close;
end;
$$;

-- Generate a new random code, or set the admin's own 5 digits. The old code stops working.
create or replace function public.set_meeting_code(p_id uuid, p_code text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_m public.meetings%rowtype;
  v_code text := coalesce(nullif(btrim(p_code), ''), app_private.new_meeting_code());
  v_version integer;
begin
  if v_code !~ '^[0-9]{5}$' then
    perform app_private.err('VALIDATION', 'Kod mesti 5 digit nombor.');
  end if;
  select * into v_m from public.meetings where id = p_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Mesyuarat tidak dijumpai.');
  end if;
  if v_m.status = 'cancelled' or v_m.finalized_at is not null then
    perform app_private.err('CONFLICT', 'Sesi kehadiran mesyuarat ini telah ditutup.');
  end if;
  insert into app_private.meeting_codes (meeting_id, code) values (p_id, v_code)
    on conflict (meeting_id) do update set code = excluded.code, version = app_private.meeting_codes.version + 1, updated_at = now()
    returning version into v_version;
  delete from app_private.meeting_code_attempts where meeting_id = p_id;
  -- the code itself is not written to the audit log
  perform app_private.audit('meeting.code_changed', 'meeting', p_id::text,
    jsonb_build_object('version', v_version, 'custom', nullif(btrim(p_code), '') is not null));
  return v_code;
end;
$$;

create or replace function public.admin_meeting_code(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
begin
  return (select code from app_private.meeting_codes where meeting_id = p_id);
end;
$$;

-- Member: confirm attendance with the code -----------------------------------------

create or replace function public.confirm_attendance(p_meeting_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_active_member();
  v_m public.meetings%rowtype;
  v_inv public.meeting_invitees%rowtype;
  v_att app_private.meeting_code_attempts%rowtype;
  v_code text;
  v_now timestamptz := now();
begin
  perform app_private.finalize_due_meetings();
  select * into v_inv from public.meeting_invitees where meeting_id = p_meeting_id and member_id = v_uid for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Anda tidak dijemput ke mesyuarat ini.');
  end if;
  select * into v_m from public.meetings where id = p_meeting_id;
  if v_inv.status = 'present' then
    return jsonb_build_object('ok', true, 'already', true, 'confirmed_at', v_inv.confirmed_at,
                              'message', 'Kehadiran anda telah disahkan.');
  end if;
  if not v_m.attendance_open or v_m.status not in ('ongoing', 'completed') or v_m.finalized_at is not null
     or (v_m.status = 'completed' and v_m.attendance_closes_at <= v_now) then
    perform app_private.err('CONFLICT', case when v_m.finalized_at is not null or v_m.status = 'completed'
      then 'Sesi pengesahan kehadiran telah ditutup.' else 'Sesi pengesahan kehadiran belum dibuka.' end);
  end if;
  if v_inv.status <> 'pending' then
    perform app_private.err('CONFLICT', 'Status kehadiran anda telah ditetapkan oleh pentadbir.');
  end if;

  insert into app_private.meeting_code_attempts (meeting_id, member_id) values (p_meeting_id, v_uid)
    on conflict do nothing;
  select * into v_att from app_private.meeting_code_attempts where meeting_id = p_meeting_id and member_id = v_uid for update;
  if v_att.locked_until is not null and v_att.locked_until > v_now then
    return jsonb_build_object('ok', false, 'locked_until', v_att.locked_until,
      'message', 'Terlalu banyak percubaan salah. Cuba semula selepas ' || to_char(v_att.locked_until at time zone 'Asia/Kuala_Lumpur', 'HH24:MI') || '.');
  end if;

  select code into v_code from app_private.meeting_codes where meeting_id = p_meeting_id;
  if v_code is null or coalesce(btrim(p_code), '') <> v_code then
    if v_att.failed + 1 >= 5 then
      update app_private.meeting_code_attempts set failed = 0, locked_until = v_now + interval '10 minutes'
       where meeting_id = p_meeting_id and member_id = v_uid;
      perform app_private.audit('meeting.code_locked', 'meeting', p_meeting_id::text, jsonb_build_object('member_id', v_uid));
      return jsonb_build_object('ok', false, 'locked_until', v_now + interval '10 minutes',
        'message', 'Kod salah 5 kali. Cuba semula selepas 10 minit.');
    end if;
    update app_private.meeting_code_attempts set failed = v_att.failed + 1, locked_until = null
     where meeting_id = p_meeting_id and member_id = v_uid;
    return jsonb_build_object('ok', false, 'remaining', 5 - (v_att.failed + 1),
      'message', 'Kod tidak sah. Baki percubaan: ' || (5 - (v_att.failed + 1)) || '.');
  end if;

  update public.meeting_invitees
     set status = 'present', confirmed_at = v_now, method = 'code', updated_by = v_uid
   where meeting_id = p_meeting_id and member_id = v_uid;
  delete from app_private.meeting_code_attempts where meeting_id = p_meeting_id and member_id = v_uid;
  perform app_private.audit('meeting.attendance_confirmed', 'meeting', p_meeting_id::text, jsonb_build_object('member_id', v_uid));
  return jsonb_build_object('ok', true, 'confirmed_at', v_now, 'message', 'Kehadiran disahkan. Terima kasih.');
end;
$$;

-- Admin: manual correction with a reason ----------------------------------------------

create or replace function public.set_attendance_status(p_meeting_id uuid, p_member_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_m public.meetings%rowtype;
  v_inv public.meeting_invitees%rowtype;
begin
  if p_status not in ('pending', 'present', 'absent', 'excused') then
    perform app_private.err('VALIDATION', 'Status tidak sah.');
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    perform app_private.err('VALIDATION', 'Sila nyatakan sebab pembetulan (sekurang-kurangnya 5 aksara).');
  end if;
  select * into v_m from public.meetings where id = p_meeting_id;
  if not found or v_m.status in ('draft', 'cancelled') then
    perform app_private.err('CONFLICT', 'Kehadiran hanya boleh dibetulkan untuk mesyuarat yang diterbitkan.');
  end if;
  if p_status = 'pending' and v_m.finalized_at is not null then
    perform app_private.err('VALIDATION', 'Sesi telah ditutup; pilih Hadir, Tidak Hadir atau Dikecualikan.');
  end if;
  select * into v_inv from public.meeting_invitees where meeting_id = p_meeting_id and member_id = p_member_id for update;
  if not found then
    perform app_private.err('NOT_FOUND', 'Ahli ini tidak dijemput ke mesyuarat ini.');
  end if;
  if v_inv.status = p_status then
    return;
  end if;
  update public.meeting_invitees
     set status = p_status,
         confirmed_at = case when p_status = 'present' then now() else null end,
         method = case when p_status = 'present' then 'manual' else null end,
         note = btrim(p_reason), updated_by = v_admin
   where meeting_id = p_meeting_id and member_id = p_member_id;
  perform app_private.audit('meeting.attendance_corrected', 'meeting', p_meeting_id::text,
    jsonb_build_object('member_id', p_member_id, 'from', v_inv.status, 'to', p_status, 'reason', btrim(p_reason)));
end;
$$;

-- Row Level Security and grants ------------------------------------------------------

alter table public.meetings                 enable row level security;
alter table public.meeting_invitees         enable row level security;
alter table app_private.meeting_counters    enable row level security;
alter table app_private.meeting_codes       enable row level security;
alter table app_private.meeting_code_attempts enable row level security;

grant select on public.meetings, public.meeting_invitees to authenticated;

-- Members see only meetings they are invited to (published ones); never other invitees.
create policy meetings_select on public.meetings for select to authenticated
  using ((select app_private.is_admin())
         or (status <> 'draft' and (select app_private.is_active_member())
             and exists (select 1 from public.meeting_invitees i where i.meeting_id = meetings.id and i.member_id = (select auth.uid()))));
create policy meeting_invitees_select on public.meeting_invitees for select to authenticated
  using ((member_id = (select auth.uid()) and (select app_private.is_active_member())) or (select app_private.is_admin()));

revoke execute on all functions in schema app_private from public;
grant execute on function app_private.is_admin() to authenticated, service_role;
grant execute on function app_private.is_active_member() to authenticated, service_role;
grant execute on function app_private.owns_business(uuid) to authenticated, service_role;

revoke execute on function
  public.refresh_meetings(), public.save_meeting(uuid, jsonb, uuid[]), public.publish_meeting(uuid), public.cancel_meeting(uuid, text),
  public.open_attendance(uuid), public.close_attendance(uuid), public.end_meeting(uuid), public.set_meeting_code(uuid, text),
  public.admin_meeting_code(uuid), public.confirm_attendance(uuid, text), public.set_attendance_status(uuid, uuid, text, text)
from public, anon;
grant execute on function
  public.refresh_meetings(), public.save_meeting(uuid, jsonb, uuid[]), public.publish_meeting(uuid), public.cancel_meeting(uuid, text),
  public.open_attendance(uuid), public.close_attendance(uuid), public.end_meeting(uuid), public.set_meeting_code(uuid, text),
  public.admin_meeting_code(uuid), public.confirm_attendance(uuid, text), public.set_attendance_status(uuid, uuid, text, text)
to authenticated;

-- Scheduled job: close grace periods every 5 minutes (also done lazily on read).
do $outer$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('koopkita-finalize-meetings', '*/5 * * * *', $$select app_private.finalize_due_meetings()$$);
  else
    raise notice 'pg_cron not available; relying on lazy finalisation only';
  end if;
end
$outer$;
