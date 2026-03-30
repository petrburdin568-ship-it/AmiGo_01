insert into public.alpha_invite_codes (code, label, max_uses)
values
  ('ALPHA-ROME-7K2M', 'tiktok-01', 1),
  ('ALPHA-FORGE-9Q4T', 'tiktok-02', 1),
  ('ALPHA-EAGLE-3N8P', 'tiktok-03', 1),
  ('ALPHA-CROWN-5V1L', 'tiktok-04', 1),
  ('ALPHA-LEGION-8R6D', 'tiktok-05', 1),
  ('ALPHA-AURELIA-2X7F', 'tiktok-06', 1),
  ('ALPHA-TITAN-4H9S', 'tiktok-07', 1),
  ('ALPHA-NOVA-6J3W', 'tiktok-08', 1),
  ('ALPHA-ORBIT-1Z5K', 'tiktok-09', 1)
on conflict (code) do update
set label = excluded.label,
    max_uses = excluded.max_uses,
    is_active = true;
