-- Change 8 (4 Nov 2026): recommended Facebook list prices per model + storage + city.
-- Partners can READ their city's prices (Declan sees them on the Facebook description screen). Only the owner can change them.
-- The price DATA is not kept in this public repo: it is loaded straight into the database.
alter table partners add column if not exists price_city text not null default 'townsville';

create table if not exists list_prices (
  model text not null,
  storage_gb int not null,
  city text not null,
  list_cents int not null check (list_cents > 0),
  lowest_cents int not null check (lowest_cents > 0),
  estimate boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (model, storage_gb, city)
);
alter table list_prices enable row level security;
create policy list_prices_read on list_prices for select using (exists (select 1 from partners where id = auth.uid()));
create policy list_prices_owner_write on list_prices for all using (is_owner()) with check (is_owner());
