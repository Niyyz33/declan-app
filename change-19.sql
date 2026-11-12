-- 12 Nov 2026: 30 minutes after a meetup starts with no outcome logged, the partner gets a nudge (once per meetup).
alter table partner_meetups add column if not exists outcome_reminded_at timestamptz;
-- Don't nudge about meetups that are already old at the moment this goes live.
update partner_meetups set outcome_reminded_at = now() where status = 'booked' and starts_at < now() - interval '30 minutes' and outcome_reminded_at is null;
