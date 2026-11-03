-- Declan app, update 4: push notifications (alert on booking + one hour before). Run ONCE on the DECLAN project.
create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists push_own on push_subscriptions;
create policy push_own on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table partner_meetups add column if not exists notified_new_at timestamptz;
alter table partner_meetups add column if not exists reminded_at timestamptz;
-- (The every-minute schedule that calls the notify function is added separately, because its URL holds a secret.)
