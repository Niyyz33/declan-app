-- Declan app, update 6: Ethan-only money tables for the fortnightly statement. Run ONCE on the DECLAN project.
-- The DATA (price table, commission rates, fee settings) is loaded separately and is NOT in this public repo.
-- All four tables are readable/writable by the owner (Ethan) only. Declan can never see them.
create table if not exists expected_prices (
  model text not null, storage_gb int not null, ff_price_cents int not null, multiplier numeric not null,
  primary key (model, storage_gb)
);
create table if not exists commission_bands (band_no int primary key, min_spread_cents int, fee_cents int not null);
create table if not exists owner_settings (key text primary key, value text not null);
create table if not exists phone_valuations (
  phone_id uuid primary key references partner_phones(id) on delete cascade,
  expected_sale_cents int, sheet_price_cents int, updated_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['expected_prices','commission_bands','owner_settings','phone_valuations'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_only on %I', t);
    execute format('create policy owner_only on %I for all using (is_owner()) with check (is_owner())', t);
  end loop;
end $$;
