-- Declan app, update 3: meetups. Run ONCE in the SQL editor of the DECLAN Supabase project (the separate one).
-- Ethan books meetups (owner login); Declan sees them in his app and in his Apple Calendar.
-- Safe to run even if change-2.sql was already run.

create table if not exists partner_meetups (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id),
  seller_name text not null,
  model text not null,
  issues text,
  quoted_min_cents int not null check (quoted_min_cents >= 0),
  quoted_max_cents int not null check (quoted_max_cents >= quoted_min_cents),
  starts_at timestamptz not null,
  location text,
  notes text,
  status text not null default 'booked' check (status in ('booked','bought','no_sale','no_show','cancelled')),
  phone_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table partner_meetups enable row level security;

drop policy if exists meetups_read on partner_meetups;
create policy meetups_read on partner_meetups for select using (partner_id = auth.uid() or is_owner());
drop policy if exists meetups_owner_insert on partner_meetups;
create policy meetups_owner_insert on partner_meetups for insert with check (is_owner());
drop policy if exists meetups_update on partner_meetups;
create policy meetups_update on partner_meetups for update using (partner_id = auth.uid() or is_owner()) with check (partner_id = auth.uid() or is_owner());
drop policy if exists meetups_owner_delete on partner_meetups;
create policy meetups_owner_delete on partner_meetups for delete using (is_owner());

-- Declan may only answer a meetup (bought / no sale / no show) and link the phone. Details are Ethan's.
create or replace function guard_meetup_updates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then
    if new.partner_id is distinct from old.partner_id or new.seller_name is distinct from old.seller_name or new.model is distinct from old.model
       or new.issues is distinct from old.issues or new.quoted_min_cents <> old.quoted_min_cents or new.quoted_max_cents <> old.quoted_max_cents
       or new.starts_at is distinct from old.starts_at or new.location is distinct from old.location or new.notes is distinct from old.notes then
      raise exception 'Only Ethan can change meetup details';
    end if;
    if new.status = 'cancelled' or old.status = 'cancelled' then
      raise exception 'Only Ethan can do that';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists meetups_guard on partner_meetups;
create trigger meetups_guard before update on partner_meetups for each row execute function guard_meetup_updates();

-- Settings table + the secret that protects Declan's calendar link (created here if update 2 wasn't run).
create table if not exists app_settings (key text primary key, value text not null);
alter table app_settings enable row level security;
drop policy if exists settings_read on app_settings;
create policy settings_read on app_settings for select using (auth.uid() is not null);
drop policy if exists settings_owner_write on app_settings;
create policy settings_owner_write on app_settings for all using (is_owner()) with check (is_owner());
insert into app_settings (key, value)
values ('calendar_token', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;
