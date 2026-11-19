-- Fix: availability alerts repeated every minute. The notify function marks a row notified_at,
-- but avail_touch fired on that UPDATE too and reset notified_at to null (and bumped set_at),
-- so the row was re-alerted forever. Only reset when the partner's actual times change.
create or replace function avail_touch() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT'
     or new.available is distinct from old.available
     or new.start_min is distinct from old.start_min
     or new.end_min is distinct from old.end_min
     or new.extra is distinct from old.extra then
    new.set_at := now(); new.notified_at := null;
  end if;
  return new;
end $$;

-- stop the current loop: everything already set counts as announced
update partner_availability set notified_at = now() where notified_at is null;
