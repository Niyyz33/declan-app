-- Declan app, update 5: label-request shipping flow, owner receiving/payments, price limit becomes a flag.
-- Run ONCE on the DECLAN Supabase project.

-- Shipping: Declan requests a label -> Ethan sends it (tracking + label_sent_at) -> Declan posts (posted_at) -> Ethan receives.
alter table partner_batches alter column tracking_number drop not null;
alter table partner_batches add column if not exists posted_at timestamptz;
alter table partner_batches add column if not exists notified_requested_at timestamptz;
alter table partner_batches add column if not exists notified_label_at timestamptz;
alter table partner_batches add column if not exists notified_posted_at timestamptz;

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
      if new.received_at is distinct from old.received_at or new.label_sent_at is distinct from old.label_sent_at
         or new.tracking_number is distinct from old.tracking_number then
        raise exception 'Only Ethan can do that';
      end if;
      if new.posted_at is distinct from old.posted_at and old.label_sent_at is null then
        raise exception 'Wait for Ethan to send the label first';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
-- (partner_batches had no updated_at before; add it so the trigger above works for both tables)
alter table partner_batches add column if not exists updated_at timestamptz not null default now();

-- Price limit: no longer blocks saving (he logs AFTER paying). It is flagged instead.
alter table partner_phones drop constraint if exists price_within_quote;
alter table partner_phones drop constraint if exists price_within_offer;
alter table partner_phones drop column if exists over_limit;
alter table partner_phones add column over_limit boolean generated always as
  (price_paid_cents > greatest(0, quoted_max_cents - total_deductions_cents)) stored;
