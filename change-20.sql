-- 19 Nov 2026: 60 minutes after a meetup starts with no outcome logged, Ethan (and later the VA) gets an alert (once per meetup).
alter table partner_meetups add column if not exists outcome_alerted_at timestamptz;
update partner_meetups set outcome_alerted_at = now() where status = 'booked' and starts_at < now() - interval '60 minutes' and outcome_alerted_at is null;
