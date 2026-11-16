-- =============================================================================
-- KoopKITA V1.0 — Private storage buckets
--
--   receipts       : share-payment and Qurban payment receipts uploaded by members
--   payout-proofs  : commission payout transfer proofs uploaded by Super Admin
--
-- Object names must be  <uploader_user_id>/<random-file-name>.
-- Files are served only through short-lived signed URLs created server-side.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('payout-proofs', 'payout-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Who may read a receipt object: its uploader, or an admin.
create policy "receipts: active members upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select app_private.is_active_member())
  );

create policy "receipts: owner or admin can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select app_private.is_admin()))
  );

create policy "payout-proofs: admin upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payout-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select app_private.is_admin())
  );

-- Members can read proofs of their own payouts; admins can read all.
create policy "payout-proofs: admin or payee can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payout-proofs'
    and (
      (select app_private.is_admin())
      or exists (select 1 from public.commission_payouts p
                  where p.proof_path = name and p.member_id = (select auth.uid()))
    )
  );

-- No UPDATE / DELETE policies: uploaded evidence is immutable for clients.
