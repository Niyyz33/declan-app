-- 19 Nov 2026: a phone that was used to log in as someone else kept belonging to that login, so the new login's alerts never arrived.
-- This lets a login take over the phone it is using right now (the phone proves it by sending its own secret alert address).
create or replace function claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language sql security definer set search_path = public as $$
  insert into push_subscriptions (endpoint, p256dh, auth, user_id) values (p_endpoint, p_p256dh, p_auth, auth.uid())
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, created_at = now()
$$;
revoke execute on function claim_push_subscription(text, text, text) from public, anon;
grant execute on function claim_push_subscription(text, text, text) to authenticated;
