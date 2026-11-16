-- =============================================================================
-- KoopKITA V1.0 — Notifications to all members or to selected members
-- =============================================================================
create or replace function public.send_member_notification(
  p_title text, p_body text, p_link text default null, p_user_ids uuid[] default null)
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
  if coalesce(char_length(btrim(p_title)), 0) < 3 or char_length(p_title) > 150 then
    perform app_private.err('VALIDATION', 'Tajuk diperlukan (3–150 aksara).');
  end if;
  if coalesce(char_length(btrim(p_body)), 0) < 3 or char_length(p_body) > 2000 then
    perform app_private.err('VALIDATION', 'Mesej diperlukan (3–2000 aksara).');
  end if;
  if p_link is not null and p_link !~ '^/[A-Za-z0-9/_-]*$' then
    perform app_private.err('VALIDATION', 'Pautan mesti pautan dalaman yang bermula dengan /.');
  end if;
  if p_user_ids is not null and cardinality(p_user_ids) = 0 then
    perform app_private.err('VALIDATION', 'Sila pilih sekurang-kurangnya seorang ahli.');
  end if;
  perform app_private.rate_limit('announce:' || v_admin, 30, 3600);

  for r in
    select id from public.profiles
     where status = 'active' and (p_user_ids is null or id = any (p_user_ids))
  loop
    perform app_private.notify(r.id, case when p_user_ids is null then 'campaign_announcement' else 'admin_message' end,
      btrim(p_title), btrim(p_body), p_link);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    perform app_private.err('VALIDATION', 'Tiada ahli aktif dalam pilihan anda.');
  end if;

  perform app_private.audit('announcement.sent', 'notification', null,
    jsonb_build_object('title', btrim(p_title), 'body', btrim(p_body), 'link', p_link,
                       'target', case when p_user_ids is null then 'all' else 'selected' end,
                       'recipients', v_count,
                       'recipient_ids', case when p_user_ids is null then null else to_jsonb(p_user_ids) end));
  return v_count;
end;
$$;

revoke execute on function public.send_member_notification(text, text, text, uuid[]) from public, anon;
grant execute on function public.send_member_notification(text, text, text, uuid[]) to authenticated;
