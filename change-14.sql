-- Change 14 (4 Nov 2026): each partner's usual meeting spot and the details Ethan needs to send their shipping label,
-- plus a one-time "alerts tested" flag.
alter table partners add column if not exists meet_location text;
alter table partners add column if not exists ship_name text;
alter table partners add column if not exists ship_phone text;
alter table partners add column if not exists ship_street text;
alter table partners add column if not exists ship_suburb text;
alter table partners add column if not exists ship_state text;
alter table partners add column if not exists ship_postcode text;
alter table partners add column if not exists alerts_tested_at timestamptz;

-- partners can't edit their own row directly, so these two go through functions that only ever touch the caller's row
create or replace function set_my_details(p_meet text, p_name text, p_phone text, p_street text, p_suburb text, p_state text, p_postcode text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from partners where id = auth.uid() and role = 'partner') then raise exception 'Not a partner'; end if;
  update partners set meet_location = nullif(left(trim(coalesce(p_meet, '')), 200), ''), ship_name = nullif(left(trim(coalesce(p_name, '')), 100), ''),
    ship_phone = nullif(left(trim(coalesce(p_phone, '')), 30), ''), ship_street = nullif(left(trim(coalesce(p_street, '')), 150), ''),
    ship_suburb = nullif(left(trim(coalesce(p_suburb, '')), 80), ''), ship_state = nullif(left(trim(coalesce(p_state, '')), 10), ''),
    ship_postcode = nullif(left(trim(coalesce(p_postcode, '')), 10), '') where id = auth.uid();
end $$;
create or replace function confirm_alerts_tested() returns void
language plpgsql security definer set search_path = public as $$
begin update partners set alerts_tested_at = now() where id = auth.uid() and role = 'partner'; end $$;
revoke execute on function set_my_details(text, text, text, text, text, text, text) from public, anon;
grant execute on function set_my_details(text, text, text, text, text, text, text) to authenticated;
revoke execute on function confirm_alerts_tested() from public, anon;
grant execute on function confirm_alerts_tested() to authenticated;

-- a checklist step for it
insert into onboarding_items (id, label, detail, link, sort_order) values
 ('details', 'Add your details', 'Where you usually meet people, and the address Ethan needs for your shipping label.', null, 15)
on conflict (id) do update set label = excluded.label, detail = excluded.detail, link = excluded.link, sort_order = excluded.sort_order;
