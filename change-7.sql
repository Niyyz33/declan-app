-- Declan app, update 7: record what a mint phone sold for. Run ONCE on the DECLAN project.
alter table partner_phones add column if not exists sold_price_cents int check (sold_price_cents >= 0);
alter table partner_phones add column if not exists sold_at timestamptz;
