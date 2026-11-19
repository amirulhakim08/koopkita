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
  v_biz uuid;
  v_cust uuid;
  v_inv uuid;
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
  perform public.update_system_setting('coop_reg_no', '"K-CONTOH-0001 (DEV)"');
  perform public.update_system_setting('coop_address', '"Alamat Contoh Koperasi, Alor Setar, Kedah (DEV)"');
  perform public.update_system_setting('coop_phone', '"04-000 0000"');

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

  -- member 1: a sample business with an issued, partly paid invoice (Bisnes Saya)
  perform set_config('request.jwt.claims', json_build_object('sub', v_m1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', v_m1::text, true);
  v_biz := public.save_my_business('{"name":"Kedai Contoh Agro Enterprise (DEV)","ssm_no":"202403123456","phone":"0123456789","email":"kedai@contoh.test","address":"No 1, Jalan Contoh, Alor Setar","bank_name":"Maybank","bank_account_no":"512345678901","bank_account_holder":"Kedai Contoh Agro Enterprise"}');
  insert into public.business_customers (business_id, name, phone, address) values (v_biz, 'Encik Ali Contoh', '0112233445', 'Jitra, Kedah') returning id into v_cust;
  insert into public.business_customers (business_id, name, phone) values (v_biz, 'Kafe Contoh Sdn Bhd', '0198887777');
  insert into public.business_catalog_items (business_id, name, price_sen) values
    (v_biz, 'Baja organik 25kg', 4500), (v_biz, 'Benih cili (pek)', 350), (v_biz, 'Penghantaran', 1500), (v_biz, 'Ikan kembung 1kg', 1800);
  v_inv := public.save_invoice_draft(null, v_cust, current_date - 3, current_date + 11, 'Terima kasih atas sokongan anda.',
    '[{"description":"Baja organik 25kg","quantity":4,"unit_price_sen":4500,"discount_sen":0},{"description":"Benih cili (pek)","quantity":10,"unit_price_sen":350,"discount_sen":0},{"description":"Penghantaran","quantity":1,"unit_price_sen":1500,"discount_sen":0}]');
  perform public.issue_invoice(v_inv);
  perform public.record_invoice_payment(v_inv, 10000, current_date - 1, 'duitnow', 'DEV-DN-0001', null, 'dev-biz-pay-1');
  -- a direct-sale receipt (no invoice) for a walk-in customer
  perform public.create_direct_receipt(null, current_date, 'cash', null, null, null,
    '[{"description":"Cili padi segar (kg)","quantity":2,"unit_price_sen":1200,"discount_sen":0}]', 'dev-biz-direct-1');

  -- member 2: a sale awaiting payment proof (reserved slots)
  perform set_config('request.jwt.claims', json_build_object('sub', v_m2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', v_m2::text, true);
  perform public.create_qurban_sale(v_campaign, 2, '{"full_name":"Pembeli Contoh Dua","phone":"0136666666"}',
    '[{"participant_name":"Peserta Contoh A"},{"participant_name":"Peserta Contoh B","qurban_type":"aqiqah"}]', null, 'dev-sale-2');
end $$;
