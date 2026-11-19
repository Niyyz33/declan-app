-- 19 Nov 2026: more than one time slot per day. The first slot stays in start_min / end_min (so older code keeps working);
-- any extra slots are kept as [[start,end], ...] in minutes from midnight.
alter table partner_availability add column if not exists extra jsonb not null default '[]'::jsonb;
