-- Declan app, update 2. Run ONCE in the SQL editor of the DECLAN Supabase project (the separate one).
-- Adds: edit/delete of a phone until it ships, a hard price limit (quote minus deductions), and a
-- small settings table (Ethan's contact number lives there, behind login, not in public code).

alter table partner_phones add column if not exists edited_at timestamptz;

-- Partner may now correct price/quote while a phone is still 'bought'. After that, only Ethan.
create or replace function guard_partner_updates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then
    if tg_table_name = 'partner_phones' then
      if new.status = 'received' or old.status = 'received' then
        raise exception 'Only Ethan can do that';
      end if;
      if new.price_paid_cents <> old.price_paid_cents or new.quoted_min_cents <> old.quoted_min_cents or new.quoted_max_cents <> old.quoted_max_cents then
        if old.status <> 'bought' or new.status <> 'bought' then
          raise exception 'Only Ethan can change the price after a phone is shipped';
        end if;
        new.edited_at := now();
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

-- A partner may delete their own phone only while it is still 'bought' (not shipped).
drop policy if exists phones_delete on partner_phones;
create policy phones_delete on partner_phones for delete
  using ((partner_id = auth.uid() and status = 'bought') or is_owner());

-- Never pay more than the top of the quote minus the deductions.
alter table partner_phones drop constraint if exists price_within_offer;
alter table partner_phones add constraint price_within_offer
  check (price_paid_cents <= greatest(0, quoted_max_cents - total_deductions_cents)) not valid;

-- Small settings table (read by logged-in partners, written by Ethan only).
create table if not exists app_settings (key text primary key, value text not null);
alter table app_settings enable row level security;
drop policy if exists settings_read on app_settings;
create policy settings_read on app_settings for select using (auth.uid() is not null);
drop policy if exists settings_owner_write on app_settings;
create policy settings_owner_write on app_settings for all using (is_owner()) with check (is_owner());
-- Then add Ethan's number with:  insert into app_settings (key, value) values ('ethan_phone', '<number>')
--   on conflict (key) do update set value = excluded.value;
