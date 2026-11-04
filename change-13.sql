-- Change 13 (4 Nov 2026): Ethan books every meetup (Declan never arranges them). Undo the "lead" idea from change 12,
-- keep the seller's phone number on the meetup so Ethan can pass it to Declan, and keep availability.
alter table partner_meetups drop constraint if exists partner_meetups_time_check;
alter table partner_meetups drop constraint if exists partner_meetups_status_check;
alter table partner_meetups add constraint partner_meetups_status_check check (status in ('booked','bought','no_sale','no_show','cancelled'));
alter table partner_meetups alter column starts_at set not null;
alter table partner_meetups drop column if exists arranged_by_partner;
alter table partner_meetups drop column if exists notified_arranged_at;

create or replace function guard_meetup_updates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then
    -- Declan may only answer a meetup (bought / no sale / no show) and link the phone. Details are Ethan's.
    if new.partner_id is distinct from old.partner_id or new.seller_name is distinct from old.seller_name or new.model is distinct from old.model
       or new.issues is distinct from old.issues or new.quoted_min_cents <> old.quoted_min_cents or new.quoted_max_cents <> old.quoted_max_cents
       or new.starts_at is distinct from old.starts_at or new.location is distinct from old.location or new.notes is distinct from old.notes
       or new.seller_contact is distinct from old.seller_contact then
      raise exception 'Only Ethan can change meetup details';
    end if;
    if new.status = 'cancelled' or old.status = 'cancelled' then
      raise exception 'Only Ethan can do that';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
