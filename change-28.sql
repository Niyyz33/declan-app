-- 22 Nov 2026: tell the partner when a booked meetup is moved, its spot changes, or it is cancelled by Ethan or the VA.
alter table partner_meetups add column if not exists moved_from_at timestamptz;
alter table partner_meetups add column if not exists moved_from_location text;
alter table partner_meetups add column if not exists change_kind text;
alter table partner_meetups add column if not exists change_at timestamptz;
alter table partner_meetups add column if not exists change_alerted_at timestamptz;

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
  if old.status = 'booked' and new.status = 'booked' and new.starts_at is distinct from old.starts_at then
    -- a new time means the one-hour reminder and the "no outcome" nudges must run again for the new time
    new.reminded_at := null; new.outcome_reminded_at := null; new.outcome_alerted_at := null;
  end if;
  -- remember what the partner was last told, so one alert can say "your 12:35 meetup has moved to Thursday"
  -- (nothing if the partner has not even been told about the booking yet)
  if old.notified_new_at is not null and old.status = 'booked'
     and ((new.status = 'booked' and (new.starts_at is distinct from old.starts_at or new.location is distinct from old.location)) or new.status = 'cancelled') then
    if old.change_at is null or old.change_alerted_at is not null then
      new.moved_from_at := old.starts_at; new.moved_from_location := old.location;
    end if;
    new.change_kind := case when new.status = 'cancelled' then 'cancelled' else 'moved' end;
    new.change_at := now(); new.change_alerted_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
