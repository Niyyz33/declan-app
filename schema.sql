-- Declan app: database setup for the SEPARATE partner Supabase project.
-- Run this whole file once in the SQL editor of the NEW project (not your Cash4Phones one).

create extension if not exists pgcrypto;

-- Who is who. role 'partner' = Declan, 'owner' = Ethan (and the spreadsheet sync).
create table partners (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'partner' check (role in ('partner','owner'))
);

create function is_owner() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from partners where id = auth.uid() and role = 'owner')
$$;

create table partner_phones (
  id uuid primary key,
  partner_id uuid not null default auth.uid() references partners(id),
  type text not null check (type in ('damaged','mint')),
  model text not null,
  storage_gb int,
  colour text,
  battery_pct int check (battery_pct between 0 and 100),
  battery_unknown_part boolean not null default false,
  checklist jsonb not null default '{}'::jsonb,
  issues text[] not null default '{}',
  quoted_min_cents int not null check (quoted_min_cents >= 0),
  quoted_max_cents int not null check (quoted_max_cents >= quoted_min_cents),
  price_paid_cents int not null check (price_paid_cents >= 0),
  deductions jsonb not null default '[]'::jsonb,
  total_deductions_cents int not null default 0,
  notes text,
  status text not null default 'bought' check (status in ('bought','shipped','received')),
  batch_id uuid,
  bought_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- the hard rule: never pay more than the top of the quote
  constraint price_within_quote check (price_paid_cents <= quoted_max_cents)
);

create table partner_batches (
  id uuid primary key,
  partner_id uuid not null default auth.uid() references partners(id),
  tracking_number text not null,
  shipped_at timestamptz not null default now(),
  label_sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

-- Ethan's payment tracking: Declan can never read this.
create table batch_payments (
  batch_id uuid primary key references partner_batches(id) on delete cascade,
  paid_on_ship_cents int,
  paid_on_ship_at timestamptz,
  paid_on_arrival_cents int,
  paid_on_arrival_at timestamptz
);

create table partner_models (
  name text primary key,
  storage_tiers int[] not null,
  colours text[] not null,
  sort_order int not null default 0
);

create table partner_deductions (
  model text not null references partner_models(name),
  fault text not null,
  deduction_cents int not null,
  primary key (model, fault)
);

-- A partner can't mark their own batch received or edit owner-only fields.
create function guard_partner_updates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then
    if tg_table_name = 'partner_phones' then
      if new.status = 'received' or new.price_paid_cents <> old.price_paid_cents then
        raise exception 'Only Ethan can do that';
      end if;
    elsif tg_table_name = 'partner_batches' then
      if new.received_at is distinct from old.received_at or new.label_sent_at is distinct from old.label_sent_at then
        raise exception 'Only Ethan can do that';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger phones_guard before update on partner_phones for each row execute function guard_partner_updates();
create trigger batches_guard before update on partner_batches for each row execute function guard_partner_updates();

-- Row level security: everything locked down, then only what's needed opened up.
alter table partners enable row level security;
alter table partner_phones enable row level security;
alter table partner_batches enable row level security;
alter table batch_payments enable row level security;
alter table partner_models enable row level security;
alter table partner_deductions enable row level security;

create policy partners_read on partners for select using (id = auth.uid() or is_owner());
create policy phones_read on partner_phones for select using (partner_id = auth.uid() or is_owner());
create policy phones_insert on partner_phones for insert with check (partner_id = auth.uid());
create policy phones_update on partner_phones for update using (partner_id = auth.uid() or is_owner()) with check (partner_id = auth.uid() or is_owner());
create policy batches_read on partner_batches for select using (partner_id = auth.uid() or is_owner());
create policy batches_insert on partner_batches for insert with check (partner_id = auth.uid());
create policy batches_update on partner_batches for update using (partner_id = auth.uid() or is_owner()) with check (partner_id = auth.uid() or is_owner());
create policy payments_owner on batch_payments for all using (is_owner()) with check (is_owner());
create policy models_read on partner_models for select using (auth.uid() is not null);
create policy deductions_read on partner_deductions for select using (auth.uid() is not null);
create policy models_owner_write on partner_models for all using (is_owner()) with check (is_owner());
create policy deductions_owner_write on partner_deductions for all using (is_owner()) with check (is_owner());

-- Catalogue + Ben's deductions (these live in the database, behind login, not in the web page).
insert into partner_models (name, storage_tiers, colours, sort_order) values
('iPhone XS', array[64,256,512]::int[], array['Space Grey','Silver','Gold']::text[], -5),
('iPhone XR', array[64,128,256]::int[], array['Black','White','Blue','Yellow','Coral','(PRODUCT)RED']::text[], -4),
('iPhone 11', array[64,128,256]::int[], array['Black','White','(PRODUCT)RED','Yellow','Green','Purple']::text[], -3),
('iPhone 11 Pro', array[64,256,512]::int[], array['Midnight Green','Space Grey','Silver','Gold']::text[], -2),
('iPhone 11 Pro Max', array[64,256,512]::int[], array['Midnight Green','Space Grey','Silver','Gold']::text[], -1),
('iPhone 12', array[64,128,256]::int[], array['Black','White','(PRODUCT)RED','Green','Blue','Purple']::text[], 0),
('iPhone 12 Pro', array[128,256,512]::int[], array['Silver','Graphite','Gold','Pacific Blue']::text[], 1),
('iPhone 12 Pro Max', array[128,256,512]::int[], array['Silver','Graphite','Gold','Pacific Blue']::text[], 2),
('iPhone 13', array[128,256,512]::int[], array['Midnight','Starlight','Blue','Pink','(PRODUCT)RED','Green']::text[], 3),
('iPhone 13 Pro', array[128,256,512,1024]::int[], array['Graphite','Gold','Silver','Sierra Blue','Alpine Green']::text[], 4),
('iPhone 13 Pro Max', array[128,256,512,1024]::int[], array['Graphite','Gold','Silver','Sierra Blue','Alpine Green']::text[], 5),
('iPhone 14', array[128,256,512]::int[], array['Blue','Purple','Midnight','Starlight','(PRODUCT)RED','Yellow']::text[], 6),
('iPhone 14 Plus', array[128,256,512]::int[], array['Blue','Purple','Midnight','Starlight','(PRODUCT)RED','Yellow']::text[], 7),
('iPhone 14 Pro', array[128,256,512,1024]::int[], array['Space Black','Silver','Gold','Deep Purple']::text[], 8),
('iPhone 14 Pro Max', array[128,256,512,1024]::int[], array['Space Black','Silver','Gold','Deep Purple']::text[], 9),
('iPhone 15', array[128,256,512]::int[], array['Black','Blue','Green','Yellow','Pink']::text[], 10),
('iPhone 15 Plus', array[128,256,512]::int[], array['Black','Blue','Green','Yellow','Pink']::text[], 11),
('iPhone 15 Pro', array[128,256,512,1024]::int[], array['Natural Titanium','Blue Titanium','White Titanium','Black Titanium']::text[], 12),
('iPhone 15 Pro Max', array[256,512,1024]::int[], array['Natural Titanium','Blue Titanium','White Titanium','Black Titanium']::text[], 13),
('iPhone 16', array[128,256,512]::int[], array['Black','White','Pink','Teal','Ultramarine']::text[], 14),
('iPhone 16 Plus', array[128,256,512]::int[], array['Black','White','Pink','Teal','Ultramarine']::text[], 15),
('iPhone 16 Pro', array[128,256,512,1024]::int[], array['Black Titanium','White Titanium','Natural Titanium','Desert Titanium']::text[], 16),
('iPhone 16 Pro Max', array[256,512,1024]::int[], array['Black Titanium','White Titanium','Natural Titanium','Desert Titanium']::text[], 17),
('iPhone 17', array[256,512]::int[], array['Lavender','Sage','Mist Blue','White','Black']::text[], 18),
('iPhone 17 Pro', array[256,512,1024]::int[], array['Cosmic Orange','Deep Blue','Silver']::text[], 19),
('iPhone 17 Pro Max', array[256,512,1024,2048]::int[], array['Cosmic Orange','Deep Blue','Silver']::text[], 20),
('iPhone Air', array[256,512,1024]::int[], array['Space Black','Cloud White','Light Gold','Sky Blue']::text[], 21),
('iPhone 16e', array[128,256,512]::int[], array['Black','White']::text[], 22),
('iPhone 17e', array[256,512]::int[], array['Black','White','Soft Pink']::text[], 23),
('iPad (A16)', array[128,256]::int[], array['Silver','Blue','Pink','Yellow']::text[], 24);

insert into partner_deductions (model, fault, deduction_cents) values
('iPhone 12','Broken Screen',3000),
('iPhone 12','Broken Back',5000),
('iPhone 12','Bad Battery (below 85%)',3000),
('iPhone 12','Bad Housing',5000),
('iPhone 12','Bad Charging Port',3000),
('iPhone 12','No FACE ID',5000),
('iPhone 12','Loud Speaker Issue',2000),
('iPhone 12','Rear Camera Broken',4000),
('iPhone 12','Front Camera Broken',1000),
('iPhone 12','Per Lens Smashed',500),
('iPhone 12','Board Issue',15000),
('iPhone 12','Small Parts',3000),
('iPhone 12 Pro','Broken Screen',3000),
('iPhone 12 Pro','Broken Back',5000),
('iPhone 12 Pro','Bad Battery (below 85%)',3000),
('iPhone 12 Pro','Bad Housing',5000),
('iPhone 12 Pro','Bad Charging Port',3000),
('iPhone 12 Pro','No FACE ID',5000),
('iPhone 12 Pro','Loud Speaker Issue',2000),
('iPhone 12 Pro','Rear Camera Broken',4000),
('iPhone 12 Pro','Front Camera Broken',1000),
('iPhone 12 Pro','Per Lens Smashed',500),
('iPhone 12 Pro','Board Issue',15000),
('iPhone 12 Pro','Small Parts',3000),
('iPhone 12 Pro Max','Broken Screen',4000),
('iPhone 12 Pro Max','Broken Back',5000),
('iPhone 12 Pro Max','Bad Battery (below 85%)',3000),
('iPhone 12 Pro Max','Bad Housing',10000),
('iPhone 12 Pro Max','Bad Charging Port',3500),
('iPhone 12 Pro Max','No FACE ID',5000),
('iPhone 12 Pro Max','Loud Speaker Issue',2000),
('iPhone 12 Pro Max','Rear Camera Broken',12000),
('iPhone 12 Pro Max','Front Camera Broken',1500),
('iPhone 12 Pro Max','Per Lens Smashed',500),
('iPhone 12 Pro Max','Board Issue',15000),
('iPhone 12 Pro Max','Small Parts',3000),
('iPhone 13','Broken Screen',3000),
('iPhone 13','Broken Back',5000),
('iPhone 13','Bad Battery (below 85%)',3000),
('iPhone 13','Bad Housing',8000),
('iPhone 13','Bad Charging Port',3000),
('iPhone 13','No FACE ID',5000),
('iPhone 13','Loud Speaker Issue',2000),
('iPhone 13','Rear Camera Broken',4000),
('iPhone 13','Front Camera Broken',2000),
('iPhone 13','Per Lens Smashed',500),
('iPhone 13','Board Issue',15000),
('iPhone 13','Small Parts',3000),
('iPhone 13 Pro','Broken Screen',5000),
('iPhone 13 Pro','Broken Back',5000),
('iPhone 13 Pro','Bad Battery (below 85%)',3000),
('iPhone 13 Pro','Bad Housing',8000),
('iPhone 13 Pro','Bad Charging Port',3000),
('iPhone 13 Pro','No FACE ID',5000),
('iPhone 13 Pro','Loud Speaker Issue',2000),
('iPhone 13 Pro','Rear Camera Broken',12000),
('iPhone 13 Pro','Front Camera Broken',2000),
('iPhone 13 Pro','Per Lens Smashed',500),
('iPhone 13 Pro','Board Issue',15000),
('iPhone 13 Pro','Small Parts',3000),
('iPhone 13 Pro Max','Broken Screen',6000),
('iPhone 13 Pro Max','Broken Back',5000),
('iPhone 13 Pro Max','Bad Battery (below 85%)',3000),
('iPhone 13 Pro Max','Bad Housing',10000),
('iPhone 13 Pro Max','Bad Charging Port',3500),
('iPhone 13 Pro Max','No FACE ID',5000),
('iPhone 13 Pro Max','Loud Speaker Issue',2000),
('iPhone 13 Pro Max','Rear Camera Broken',12000),
('iPhone 13 Pro Max','Front Camera Broken',2000),
('iPhone 13 Pro Max','Per Lens Smashed',500),
('iPhone 13 Pro Max','Board Issue',15000),
('iPhone 13 Pro Max','Small Parts',3000),
('iPhone 14','Broken Screen',4000),
('iPhone 14','Broken Back',6000),
('iPhone 14','Bad Battery (below 85%)',4000),
('iPhone 14','Bad Mid Frame',10000),
('iPhone 14','Bad Charging Port',4000),
('iPhone 14','No FACE ID',5000),
('iPhone 14','Loud Speaker Issue',2000),
('iPhone 14','Rear Camera Broken',7000),
('iPhone 14','Front Camera Broken',2500),
('iPhone 14','Per Lens Smashed',500),
('iPhone 14','Board Issue',15000),
('iPhone 14','Small Parts',3000),
('iPhone 14 Plus','Broken Screen',5000),
('iPhone 14 Plus','Broken Back',6000),
('iPhone 14 Plus','Bad Battery (below 85%)',4000),
('iPhone 14 Plus','Bad Mid Frame',10000),
('iPhone 14 Plus','Bad Charging Port',4000),
('iPhone 14 Plus','No FACE ID',5000),
('iPhone 14 Plus','Loud Speaker Issue',2000),
('iPhone 14 Plus','Rear Camera Broken',8000),
('iPhone 14 Plus','Front Camera Broken',3000),
('iPhone 14 Plus','Per Lens Smashed',500),
('iPhone 14 Plus','Board Issue',15000),
('iPhone 14 Plus','Small Parts',3000),
('iPhone 14 Pro','Broken Screen',7000),
('iPhone 14 Pro','Broken Back',5000),
('iPhone 14 Pro','Bad Battery (below 85%)',4000),
('iPhone 14 Pro','Bad Housing',15000),
('iPhone 14 Pro','Bad Charging Port',5000),
('iPhone 14 Pro','No FACE ID',5000),
('iPhone 14 Pro','Loud Speaker Issue',2000),
('iPhone 14 Pro','Rear Camera Broken',10000),
('iPhone 14 Pro','Front Camera Broken',3000),
('iPhone 14 Pro','Per Lens Smashed',500),
('iPhone 14 Pro','Board Issue',15000),
('iPhone 14 Pro','Small Parts',3000),
('iPhone 14 Pro Max','Broken Screen',8000),
('iPhone 14 Pro Max','Broken Back',5000),
('iPhone 14 Pro Max','Bad Battery (below 85%)',4000),
('iPhone 14 Pro Max','Bad Housing',15000),
('iPhone 14 Pro Max','Bad Charging Port',5000),
('iPhone 14 Pro Max','No FACE ID',5000),
('iPhone 14 Pro Max','Loud Speaker Issue',2000),
('iPhone 14 Pro Max','Rear Camera Broken',10000),
('iPhone 14 Pro Max','Front Camera Broken',3500),
('iPhone 14 Pro Max','Per Lens Smashed',500),
('iPhone 14 Pro Max','Board Issue',15000),
('iPhone 14 Pro Max','Small Parts',3000),
('iPhone 15','Broken Screen',6000),
('iPhone 15','Broken Back',8000),
('iPhone 15','Bad Battery (below 85%)',5000),
('iPhone 15','Bad Mid Frame',13000),
('iPhone 15','Bad Charging Port',4000),
('iPhone 15','No FACE ID',5000),
('iPhone 15','Loud Speaker Issue',2000),
('iPhone 15','Rear Camera Broken',7000),
('iPhone 15','Front Camera Broken',3500),
('iPhone 15','Per Lens Smashed',500),
('iPhone 15','Board Issue',15000),
('iPhone 15','Small Parts',3000),
('iPhone 15 Plus','Broken Screen',7000),
('iPhone 15 Plus','Broken Back',8000),
('iPhone 15 Plus','Bad Battery (below 85%)',5000),
('iPhone 15 Plus','Bad Mid Frame',13000),
('iPhone 15 Plus','Bad Charging Port',4000),
('iPhone 15 Plus','No FACE ID',5000),
('iPhone 15 Plus','Loud Speaker Issue',2000),
('iPhone 15 Plus','Rear Camera Broken',8000),
('iPhone 15 Plus','Front Camera Broken',3000),
('iPhone 15 Plus','Per Lens Smashed',500),
('iPhone 15 Plus','Board Issue',15000),
('iPhone 15 Plus','Small Parts',3000),
('iPhone 15 Pro','Broken Screen',7000),
('iPhone 15 Pro','Broken Back',8000),
('iPhone 15 Pro','Bad Battery (below 85%)',5000),
('iPhone 15 Pro','Bad Mid Frame',15000),
('iPhone 15 Pro','Bad Charging Port',5000),
('iPhone 15 Pro','No FACE ID',5000),
('iPhone 15 Pro','Loud Speaker Issue',2000),
('iPhone 15 Pro','Rear Camera Broken',10000),
('iPhone 15 Pro','Front Camera Broken',3500),
('iPhone 15 Pro','Per Lens Smashed',500),
('iPhone 15 Pro','Board Issue',15000),
('iPhone 15 Pro','Small Parts',3000),
('iPhone 15 Pro Max','Broken Screen',8000),
('iPhone 15 Pro Max','Broken Back',8000),
('iPhone 15 Pro Max','Bad Battery (below 85%)',5000),
('iPhone 15 Pro Max','Bad Mid Frame',15000),
('iPhone 15 Pro Max','Bad Charging Port',5000),
('iPhone 15 Pro Max','No FACE ID',5000),
('iPhone 15 Pro Max','Loud Speaker Issue',2000),
('iPhone 15 Pro Max','Rear Camera Broken',10000),
('iPhone 15 Pro Max','Front Camera Broken',3500),
('iPhone 15 Pro Max','Per Lens Smashed',500),
('iPhone 15 Pro Max','Board Issue',15000),
('iPhone 15 Pro Max','Small Parts',3000),
('iPhone 16','Broken Screen',9000),
('iPhone 16','Broken Back',10000),
('iPhone 16','Bad Battery (below 85%)',6000),
('iPhone 16','Bad Mid Frame',20000),
('iPhone 16','Bad Charging Port',6000),
('iPhone 16','No FACE ID',5000),
('iPhone 16','Loud Speaker Issue',2000),
('iPhone 16','Rear Camera Broken',9000),
('iPhone 16','Front Camera Broken',3000),
('iPhone 16','Per Lens Smashed',500),
('iPhone 16','Board Issue',15000),
('iPhone 16','Small Parts',3000),
('iPhone 16 Plus','Broken Screen',10000),
('iPhone 16 Plus','Broken Back',10000),
('iPhone 16 Plus','Bad Battery (below 85%)',6000),
('iPhone 16 Plus','Bad Mid Frame',20000),
('iPhone 16 Plus','Bad Charging Port',6000),
('iPhone 16 Plus','No FACE ID',5000),
('iPhone 16 Plus','Loud Speaker Issue',2000),
('iPhone 16 Plus','Rear Camera Broken',10000),
('iPhone 16 Plus','Front Camera Broken',4000),
('iPhone 16 Plus','Per Lens Smashed',500),
('iPhone 16 Plus','Board Issue',15000),
('iPhone 16 Plus','Small Parts',3000),
('iPhone 16 Pro','Broken Screen',13000),
('iPhone 16 Pro','Broken Back',10000),
('iPhone 16 Pro','Bad Battery (below 85%)',6000),
('iPhone 16 Pro','Bad Mid Frame',25000),
('iPhone 16 Pro','Bad Charging Port',6000),
('iPhone 16 Pro','No FACE ID',5000),
('iPhone 16 Pro','Loud Speaker Issue',2000),
('iPhone 16 Pro','Rear Camera Broken',12000),
('iPhone 16 Pro','Front Camera Broken',4000),
('iPhone 16 Pro','Per Lens Smashed',500),
('iPhone 16 Pro','Board Issue',15000),
('iPhone 16 Pro','Small Parts',3000),
('iPhone 16 Pro Max','Broken Screen',15000),
('iPhone 16 Pro Max','Broken Back',10000),
('iPhone 16 Pro Max','Bad Battery (below 85%)',6000),
('iPhone 16 Pro Max','Bad Mid Frame',25000),
('iPhone 16 Pro Max','Bad Charging Port',6000),
('iPhone 16 Pro Max','No FACE ID',5000),
('iPhone 16 Pro Max','Loud Speaker Issue',2000),
('iPhone 16 Pro Max','Rear Camera Broken',12000),
('iPhone 16 Pro Max','Front Camera Broken',4000),
('iPhone 16 Pro Max','Per Lens Smashed',500),
('iPhone 16 Pro Max','Board Issue',15000),
('iPhone 16 Pro Max','Small Parts',3000);
