-- 19 Nov 2026: a locked-down "VA" role (Aston). He can quote, book and follow up for the partners marked va_can_book,
-- and nothing else: no phones bought, payments, statements, profit or commission.
alter table partners drop constraint if exists partners_role_check;
alter table partners add constraint partners_role_check check (role in ('partner','owner','va'));
alter table partners add column if not exists va_can_book boolean not null default false;
update partners set va_can_book = true where name = 'Quinn';
alter table partner_meetups add column if not exists created_by uuid default auth.uid();
alter table partner_meetups add column if not exists outcome_alerted_va_at timestamptz;

create or replace function is_va() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from partners where id = auth.uid() and role = 'va')
$$;
create or replace function va_scope(pid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select is_va() and exists (select 1 from partners where id = pid and va_can_book)
$$;

-- meetups: the VA can read, book, edit and cancel meetups for the partners in scope
drop policy if exists meetups_read on partner_meetups;
create policy meetups_read on partner_meetups for select using (partner_id = auth.uid() or is_owner() or va_scope(partner_id));
drop policy if exists meetups_owner_insert on partner_meetups;
create policy meetups_owner_insert on partner_meetups for insert with check (is_owner() or va_scope(partner_id));
drop policy if exists meetups_update on partner_meetups;
create policy meetups_update on partner_meetups for update using (partner_id = auth.uid() or is_owner() or va_scope(partner_id)) with check (partner_id = auth.uid() or is_owner() or va_scope(partner_id));

create or replace function guard_meetup_updates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() and not va_scope(new.partner_id) then
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

-- when the partner says they are free
drop policy if exists avail_read on partner_availability;
create policy avail_read on partner_availability for select using (partner_id = auth.uid() or is_owner() or va_scope(partner_id));

-- the only partner details the VA can see (no address, no payments)
create or replace function va_partners()
returns table (id uuid, name text, role text, city_name text, price_city text, timezone text, meet_location text, ship_phone text,
               default_avail_enabled boolean, default_avail_start_min int, default_avail_end_min int)
language sql security definer set search_path = public stable as $$
  select p.id, p.name, p.role, p.city_name, p.price_city, p.timezone, p.meet_location, p.ship_phone,
         p.default_avail_enabled, p.default_avail_start_min, p.default_avail_end_min
  from partners p where is_va() and p.va_can_book
$$;

-- settings the VA may read: only Ethan's number (to text him) and the review link
drop policy if exists settings_read on app_settings;
create policy settings_read on app_settings for select using (auth.uid() is not null and (not is_va() or key in ('ethan_phone','review_url')));
-- list (sale) prices are for partners and Ethan only
drop policy if exists list_prices_read on list_prices;
create policy list_prices_read on list_prices for select using (exists (select 1 from partners where partners.id = auth.uid() and partners.role in ('partner','owner')));

-- the approved price table (opening range and the most you can say). Filled by Ethan's side only; holds no buying costs.
create table if not exists va_models (
  code text primary key, name text not null, sort_order int not null default 0,
  storage_gb int[] not null default '{}', max_cents int, step_cents int not null default 2000
);
create table if not exists va_deductions (
  model_code text not null references va_models(code) on delete cascade, issue_key text not null, issue_name text not null,
  sort_order int not null default 0, cents int not null, primary key (model_code, issue_key)
);
alter table va_models enable row level security;
alter table va_deductions enable row level security;
drop policy if exists va_models_read on va_models; create policy va_models_read on va_models for select using (is_va() or is_owner());
drop policy if exists va_models_write on va_models; create policy va_models_write on va_models for all using (is_owner()) with check (is_owner());
drop policy if exists va_deductions_read on va_deductions; create policy va_deductions_read on va_deductions for select using (is_va() or is_owner());
drop policy if exists va_deductions_write on va_deductions; create policy va_deductions_write on va_deductions for all using (is_owner()) with check (is_owner());

-- quotes waiting for a one-day follow-up
create table if not exists va_leads (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid(),
  label text not null, model text, issues text, quote_text text,
  status text not null default 'quoted' check (status in ('quoted','followed_up','replied','booked','dead')),
  quoted_at timestamptz not null default now(),
  follow_up_due_at timestamptz not null default now() + interval '1 day',
  followed_up_at timestamptz, alerted_at timestamptz, updated_at timestamptz not null default now()
);
alter table va_leads enable row level security;
drop policy if exists va_leads_all on va_leads;
create policy va_leads_all on va_leads for all using (is_va() or is_owner()) with check (is_va() or is_owner());
