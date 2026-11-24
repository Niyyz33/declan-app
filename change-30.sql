-- 24 Nov 2026: (1) "seller asked to reschedule" flag on a meetup, (2) "did you ask for a review?" on finished meetups, (3) a photo on each logged phone.
alter table partner_meetups add column if not exists reschedule_requested_at timestamptz;
alter table partner_meetups add column if not exists reschedule_note text;
alter table partner_meetups add column if not exists reschedule_alerted_at timestamptz;
alter table partner_meetups add column if not exists review_sent_at timestamptz;
alter table partner_meetups add column if not exists review_how text;
alter table partner_phones add column if not exists photo_path text;

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
    new.reminded_at := null; new.outcome_reminded_at := null; new.outcome_alerted_at := null;
    -- a new time answers the seller's request to reschedule
    new.reschedule_requested_at := null; new.reschedule_alerted_at := null;
  end if;
  if new.status <> 'booked' then new.reschedule_requested_at := null; end if;
  -- a fresh request (or a changed note) must alert Ethan and Aston again
  if new.reschedule_requested_at is not null and (old.reschedule_requested_at is distinct from new.reschedule_requested_at or old.reschedule_note is distinct from new.reschedule_note) then
    new.reschedule_alerted_at := null;
  end if;
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

-- private bucket for the phone photos; a partner can only touch the folder named after their own id, Ethan can see all
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('phone-photos', 'phone-photos', false, 2000000, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set file_size_limit = 2000000, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists phone_photos_read on storage.objects;
create policy phone_photos_read on storage.objects for select to authenticated using (bucket_id = 'phone-photos' and ((storage.foldername(name))[1] = auth.uid()::text or is_owner()));
drop policy if exists phone_photos_insert on storage.objects;
create policy phone_photos_insert on storage.objects for insert to authenticated with check (bucket_id = 'phone-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists phone_photos_update on storage.objects;
create policy phone_photos_update on storage.objects for update to authenticated using (bucket_id = 'phone-photos' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'phone-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists phone_photos_delete on storage.objects;
create policy phone_photos_delete on storage.objects for delete to authenticated using (bucket_id = 'phone-photos' and ((storage.foldername(name))[1] = auth.uid()::text or is_owner()));
