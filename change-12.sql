-- Change 12 (4 Nov 2026): leads that Declan arranges himself, and daily availability.
-- 1) A meetup can now start as a LEAD (no time yet): Ethan passes on the seller's contact, Declan contacts them and sets the time + place.
alter table partner_meetups alter column starts_at drop not null;
alter table partner_meetups add column if not exists seller_contact text;
alter table partner_meetups add column if not exists arranged_by_partner boolean not null default false;
alter table partner_meetups add column if not exists notified_arranged_at timestamptz;
alter table partner_meetups drop constraint if exists partner_meetups_status_check;
alter table partner_meetups add constraint partner_meetups_status_check check (status in ('lead','booked','bought','no_sale','no_show','cancelled'));
alter table partner_meetups drop constraint if exists partner_meetups_time_check;
alter table partner_meetups add constraint partner_meetups_time_check check (status in ('lead','no_sale','cancelled') or starts_at is not null);

create or replace function guard_meetup_updates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then
    -- A partner can answer a meetup, or arrange the time and place of a lead. Everything else is Ethan's.
    if new.partner_id is distinct from old.partner_id or new.seller_name is distinct from old.seller_name or new.model is distinct from old.model
       or new.issues is distinct from old.issues or new.quoted_min_cents <> old.quoted_min_cents or new.quoted_max_cents <> old.quoted_max_cents
       or new.notes is distinct from old.notes or new.seller_contact is distinct from old.seller_contact then
      raise exception 'Only Ethan can change meetup details';
    end if;
    if new.starts_at is distinct from old.starts_at or new.location is distinct from old.location then
      if not (old.status = 'lead' and new.status = 'booked' and new.starts_at is not null and nullif(trim(coalesce(new.location, '')), '') is not null) then
        raise exception 'Only Ethan can change meetup details';
      end if;
      new.arranged_by_partner := true;
      new.notified_new_at := now(); -- Declan arranged it himself, so no "new meetup" alert for him
    end if;
    if new.status = 'cancelled' or old.status = 'cancelled' then
      raise exception 'Only Ethan can do that';
    end if;
    if old.status = 'lead' and new.status not in ('lead', 'booked', 'no_sale') then
      raise exception 'Arrange a time first';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 2) Availability: Declan says when he's free each day (or the same time every day).
alter table partners add column if not exists default_avail_enabled boolean not null default false;
alter table partners add column if not exists default_avail_start_min int;
alter table partners add column if not exists default_avail_end_min int;
alter table partners add column if not exists default_avail_changed_at timestamptz;
alter table partners add column if not exists default_avail_notified_at timestamptz;
alter table partners add column if not exists avail_asked_on date;

create table if not exists partner_availability (
  partner_id uuid not null default auth.uid() references partners(id) on delete cascade,
  day date not null,
  available boolean not null default true,
  start_min int check (start_min between 0 and 1439),
  end_min int check (end_min between 1 and 1440),
  set_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (partner_id, day),
  check (not available or (start_min is not null and end_min is not null and end_min > start_min))
);
alter table partner_availability enable row level security;
drop policy if exists avail_read on partner_availability;
create policy avail_read on partner_availability for select using (partner_id = auth.uid() or is_owner());
drop policy if exists avail_insert on partner_availability;
create policy avail_insert on partner_availability for insert with check (partner_id = auth.uid());
drop policy if exists avail_update on partner_availability;
create policy avail_update on partner_availability for update using (partner_id = auth.uid()) with check (partner_id = auth.uid());
drop policy if exists avail_delete on partner_availability;
create policy avail_delete on partner_availability for delete using (partner_id = auth.uid());

create or replace function avail_touch() returns trigger language plpgsql as $$
begin new.set_at := now(); new.notified_at := null; return new; end $$;
drop trigger if exists avail_touch on partner_availability;
create trigger avail_touch before insert or update on partner_availability for each row execute function avail_touch();

-- a partner can't edit their own partners row, so "same time every day" goes through this function
create or replace function set_default_availability(p_enabled boolean, p_start int, p_end int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from partners where id = auth.uid() and role = 'partner') then raise exception 'Not a partner'; end if;
  if p_enabled and (p_start is null or p_end is null or p_start < 0 or p_end > 1440 or p_end <= p_start) then raise exception 'Check the times'; end if;
  update partners set default_avail_enabled = p_enabled, default_avail_start_min = case when p_enabled then p_start end,
    default_avail_end_min = case when p_enabled then p_end end, default_avail_changed_at = now() where id = auth.uid();
end $$;
revoke execute on function set_default_availability(boolean, int, int) from public, anon;
grant execute on function set_default_availability(boolean, int, int) to authenticated;
