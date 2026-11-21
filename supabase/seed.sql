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
  v_open uuid;
  v_active uuid;
  v_pp uuid;
  v_decl uuid;
  v_pay uuid;
  v_biz uuid;
  v_cust uuid;
  v_inv uuid;
  v_quote uuid;
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
  -- eight more members (CONTOH) so a 10-person board meeting can be tested
  for i in 4..11 loop
    perform pg_temp.dev_user('ahli' || i || '@koopkita.test', 'DevAhli#2026',
      jsonb_build_object('full_name', 'Ahli Contoh ' || i || ' (DEV)', 'phone', '01200000' || lpad(i::text, 2, '0'),
                         'ic_number', '9405050' || lpad(i::text, 5, '0'), 'address', 'Alamat Contoh', 'state', 'Kedah', 'postcode', '05000'));
  end loop;
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
  perform public.approve_member(p.id, 'Data contoh pembangunan')
     from public.profiles p where p.email like 'ahli%@koopkita.test' and p.status <> 'active';

  -- two sample projects: one open for participation, one active with a received profit declaration
  v_open := public.save_project(null, '{"name":"Pelaburan KOPSYA 2027 (CONTOH DEV)","partner":"KOPSYA (CONTOH)","category":"pelaburan","target_sen":2000000,"min_sen":50000,"step_sen":50000,"max_per_member_sen":500000,"duration_months":12,"description":"Projek contoh untuk pembangunan sahaja.","terms":"Terma contoh: modal dilaburkan bersama rakan kongsi selama 12 bulan.","risk_disclosure":"Contoh: pulangan lepas bukan jaminan. Modal boleh berkurang."}');
  perform public.publish_project(v_open);
  v_active := public.save_project(null, '{"name":"Ladang Cili Fertigasi (CONTOH DEV)","partner":"Ladang Contoh Sdn Bhd","category":"pertanian","target_sen":300000,"min_sen":50000,"step_sen":50000,"duration_months":6,"description":"Projek contoh yang sudah dilaburkan.","terms":"Terma contoh projek pertanian.","risk_disclosure":"Contoh: hasil tanaman tidak dijamin."}');
  perform public.publish_project(v_active);

  -- member 1: approved share payment and project contributions
  perform set_config('request.jwt.claims', json_build_object('sub', v_m1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', v_m1::text, true);
  v_pay := public.submit_share_payment(50000, current_date - 3, 'DEV-SHARE-0001', v_m1 || '/contoh.pdf', 'dev-share-1');
  v_pp := public.join_project(v_active, 200000, current_date - 20, 'DEV-PRJ-0001', v_m1 || '/contoh-projek.pdf', 1, 'dev-prj-1');
  perform public.join_project(v_open, 100000, current_date - 1, 'DEV-PRJ-0002', v_m1 || '/contoh-projek2.pdf', 1, 'dev-prj-2');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.review_share_payment(v_pay, true, 'Data contoh');
  perform public.review_project_participation(v_pp, true, null);

  -- member 2 completes the active project's target
  perform set_config('request.jwt.claims', json_build_object('sub', v_m2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', v_m2::text, true);
  v_pp := public.join_project(v_active, 100000, current_date - 19, 'DEV-PRJ-0003', v_m2 || '/contoh-projek.pdf', 1, 'dev-prj-3');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.review_project_participation(v_pp, true, null);
  perform public.record_project_investment(v_active, current_date - 15, 300000, 'DEV-INV-0001', null);
  v_decl := public.save_profit_declaration(null, v_active, jsonb_build_object(
    'period_label', 'Suku Pertama (CONTOH)', 'announced_on', current_date - 2, 'rate_bp', 1000, 'gross_sen', 30000));
  perform public.confirm_profit_declaration(v_decl, current_date - 1);

  -- member 1: a sample business with an issued, partly paid invoice (Bisnes Saya)
  perform set_config('request.jwt.claims', json_build_object('sub', v_m1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', v_m1::text, true);
  v_biz := public.save_my_business('{"name":"Kedai Contoh Agro Enterprise (DEV)","ssm_no":"202403123456","phone":"0123456789","email":"kedai@contoh.test","address":"No 1, Jalan Contoh, Alor Setar","bank_name":"Maybank","bank_account_no":"512345678901","bank_account_holder":"Kedai Contoh Agro Enterprise","default_terms":"Deposit 30% sebelum kerja dimulakan. Baki dibayar selepas kerja siap."}');
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
  -- a sent quotation (sebut harga) for a service job
  v_quote := public.save_quote_draft(null, v_cust, current_date, current_date + 30,
    'Pasang sistem pengairan titis untuk 2 ekar kebun cili (CONTOH)', 'Deposit 30% sebelum kerja dimulakan. Baki dibayar selepas kerja siap.',
    '[{"description":"Paip dan penitis (set seekar)","quantity":2,"unit_price_sen":180000,"discount_sen":0},{"description":"Upah pemasangan (hari)","quantity":3,"unit_price_sen":35000,"discount_sen":0}]');
  perform public.send_quote(v_quote);

end $$;
