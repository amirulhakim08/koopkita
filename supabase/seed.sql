-- =============================================================================
-- KoopKITA — DEVELOPMENT SEED DATA ONLY
--
-- Applied automatically by `supabase db reset` / `supabase start` on a LOCAL
-- stack. NEVER run this against production: every record below is fictional
-- sample data, clearly labelled "CONTOH" / "DEV".
--
-- Dev logins (local only):
--   Super Admin : admin@koopkita.test  / DevAdmin#2026
--   Members     : ahli1@koopkita.test, ahli2@koopkita.test, ahli3@koopkita.test / DevAhli#2026
--   Pending     : pemohon@koopkita.test / DevAhli#2026   (awaiting approval)
-- =============================================================================

create or replace function pg_temp.dev_user(p_email text, p_password text, p_meta jsonb)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', p_meta, now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());
  return v_id;
end;
$$;

do $$
declare
  v_admin uuid;
  v_m1 uuid;
  v_m2 uuid;
  v_m3 uuid;
  v_campaign uuid;
  v_sale uuid;
  v_pay uuid;
begin
  v_admin := pg_temp.dev_user('admin@koopkita.test', 'DevAdmin#2026',
    '{"full_name":"Pentadbir Dev (CONTOH)","phone":"0120000000","ic_number":"800101020000","address":"Alamat Contoh, Alor Setar","state":"Kedah","postcode":"05000"}');
  perform public.provision_super_admin('admin@koopkita.test');

  v_m1 := pg_temp.dev_user('ahli1@koopkita.test', 'DevAhli#2026',
    '{"full_name":"Ahmad Contoh bin Dev","phone":"0121111111","ic_number":"900101021111","address":"No 1, Jalan Contoh","state":"Kedah","postcode":"06000","bank_name":"Bank Contoh","bank_account_no":"1111111111","bank_account_holder":"Ahmad Contoh bin Dev"}');
  v_m2 := pg_temp.dev_user('ahli2@koopkita.test', 'DevAhli#2026',
    '{"full_name":"Siti Contoh binti Dev","phone":"0122222222","ic_number":"910202022222","address":"No 2, Jalan Contoh","state":"Perlis","postcode":"01000","bank_name":"Bank Islam","bank_account_no":"2222222222","bank_account_holder":"Siti Contoh binti Dev"}');
  v_m3 := pg_temp.dev_user('ahli3@koopkita.test', 'DevAhli#2026',
    '{"full_name":"Lim Contoh Dev","phone":"0123333333","ic_number":"920303023333","address":"No 3, Jalan Contoh","state":"Pulau Pinang","postcode":"10000"}');
  perform pg_temp.dev_user('pemohon@koopkita.test', 'DevAhli#2026',
    '{"full_name":"Pemohon Contoh","phone":"0124444444","ic_number":"930404024444","address":"No 4, Jalan Contoh","state":"Kedah","postcode":"05100"}');

  -- act as the dev Super Admin for the business functions below
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  update public.system_settings set value = 'false' where key = 'admin_mfa_required'; -- DEV ONLY
  perform public.update_system_setting('coop_bank_name', '"BANK CONTOH (DEV)"');
  perform public.update_system_setting('coop_bank_account_name', '"KOPERASI CONTOH (DEV) — BUKAN AKAUN SEBENAR"');
  perform public.update_system_setting('coop_bank_account_no', '"0000000000"');

  perform public.approve_member(v_m1, 'Data contoh pembangunan');
  perform public.approve_member(v_m2, 'Data contoh pembangunan');
  perform public.approve_member(v_m3, 'Data contoh pembangunan');

  v_campaign := public.save_campaign(null, 'Korban Aidiladha 2027 (CONTOH DEV)', 2027,
    current_date - 7, current_date + 60, 85000, 4000, 30000, 48, 'Kempen contoh untuk pembangunan sahaja.');
  perform public.add_cattle(v_campaign, 5, 'Lembu contoh');
  perform public.set_campaign_status(v_campaign, 'open');

  -- member 1: approved share payment + a fully approved full-cattle sale (RM300 commission)
  perform set_config('request.jwt.claims', json_build_object('sub', v_m1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', v_m1::text, true);
  v_pay := public.submit_share_payment(50000, current_date - 3, 'DEV-SHARE-0001', v_m1 || '/contoh.pdf', 'dev-share-1');
  v_sale := public.create_qurban_sale(v_campaign, 7, '{"full_name":"Pembeli Contoh Satu","phone":"0135555555"}',
    '[{"participant_name":"Peserta Contoh 1"},{"participant_name":"Peserta Contoh 2"},{"participant_name":"Peserta Contoh 3"},{"participant_name":"Peserta Contoh 4"},{"participant_name":"Peserta Contoh 5"},{"participant_name":"Peserta Contoh 6"},{"participant_name":"Peserta Contoh 7"}]',
    'Data contoh', 'dev-sale-1');
  perform public.submit_sale_payment(v_sale, 595000, current_date - 1, 'DEV-SALE-0001', v_m1 || '/contoh-jualan.pdf', 'dev-sale-pay-1');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.review_share_payment(v_pay, true, 'Data contoh');
  perform public.review_sale_payment((select id from public.payment_submissions where sale_id = v_sale), true, 'Data contoh');
  perform public.approve_qurban_sale(v_sale, 'Data contoh');

  -- member 2: a sale awaiting payment proof (reserved slots)
  perform set_config('request.jwt.claims', json_build_object('sub', v_m2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', v_m2::text, true);
  perform public.create_qurban_sale(v_campaign, 2, '{"full_name":"Pembeli Contoh Dua","phone":"0136666666"}',
    '[{"participant_name":"Peserta Contoh A"},{"participant_name":"Peserta Contoh B","qurban_type":"aqiqah"}]', null, 'dev-sale-2');
end $$;
