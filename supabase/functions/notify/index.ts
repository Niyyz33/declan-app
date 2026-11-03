// Sends the meetup push notifications to Declan's phone: one straight away when Ethan books, and one an hour
// before. Called every minute by a database schedule (pg_cron). Protected by a secret in the URL because the
// caller isn't a logged-in user. Deploy with: supabase functions deploy notify --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const when = (iso: string) => new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (!url.searchParams.get('token') || url.searchParams.get('token') !== Deno.env.get('NOTIFY_TOKEN')) return new Response('Not found', { status: 404 });
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  async function send(userId: string | null, payload: Record<string, string>) {
    const q = db.from('push_subscriptions').select('*');
    const { data: subs } = await (userId ? q.eq('user_id', userId) : q);
    let sent = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint); // phone unsubscribed
      }
    }
    return sent;
  }

  async function ownerIds() { const { data } = await db.from('partners').select('id').eq('role', 'owner'); return (data ?? []).map((o: { id: string }) => o.id); }
  async function sendOwners(payload: Record<string, string>) { let n = 0; for (const id of await ownerIds()) n += await send(id, payload); return n; }

  // Manual test: ?test=1 sends a test notification to every subscribed phone.
  if (url.searchParams.get('test')) {
    const n = await send(null, { title: 'Cash for Phones', body: 'Test notification — alerts are working ✓', url: './?go=meetups', tag: 'test' });
    return Response.json({ test: true, sent: n });
  }

  const now = Date.now();
  let sentNew = 0, sentSoon = 0;
  // 1. brand-new bookings
  const { data: fresh } = await db.from('partner_meetups').select('*').eq('status', 'booked').is('notified_new_at', null).gt('created_at', new Date(now - 86400000).toISOString());
  for (const m of fresh ?? []) {
    sentNew += await send(m.partner_id, { title: 'New meetup booked', body: `${when(m.starts_at)} — ${m.model} (${m.seller_name})${m.location ? ' at ' + m.location : ''}`, url: './?go=meetups', tag: 'new-' + m.id });
    await db.from('partner_meetups').update({ notified_new_at: new Date().toISOString() }).eq('id', m.id);
  }
  // 2. one hour to go (or less, if it was booked at short notice)
  const { data: soon } = await db.from('partner_meetups').select('*').eq('status', 'booked').is('reminded_at', null).gt('starts_at', new Date(now).toISOString()).lte('starts_at', new Date(now + 3600000).toISOString());
  for (const m of soon ?? []) {
    const mins = Math.max(1, Math.round((new Date(m.starts_at).getTime() - now) / 60000));
    const title = mins >= 55 ? 'Meetup in 1 hour' : `Meetup in ${mins} minutes`, body = `${m.model} with ${m.seller_name}${m.location ? ' — ' + m.location : ''}`;
    sentSoon += await send(m.partner_id, { title, body, url: './?go=meetups', tag: 'soon-' + m.id });
    await sendOwners({ title: 'Declan: ' + title.toLowerCase(), body, url: './?go=meetups', tag: 'osoon-' + m.id });
    await db.from('partner_meetups').update({ reminded_at: new Date().toISOString() }).eq('id', m.id);
  }
  // 3. shipping: Ethan sent the label -> tell Declan; Declan posted it -> tell Ethan
  let ship = 0;
  const count = async (batchId: string) => (await db.from('partner_phones').select('id', { count: 'exact', head: true }).eq('batch_id', batchId)).count ?? 0;
  // (Label requests no longer send Ethan an app alert: Declan texts him from the app instead.)
  const { data: labelled } = await db.from('partner_batches').select('*').not('label_sent_at', 'is', null).is('notified_label_at', null);
  for (const b of labelled ?? []) {
    ship += await send(b.partner_id, { title: 'Your label is ready', body: 'Print it, pack the box and post it, then tap “I’ve posted it”.', url: './?go=ship', tag: 'label-' + b.id });
    await db.from('partner_batches').update({ notified_label_at: new Date().toISOString() }).eq('id', b.id);
  }
  const { data: posted } = await db.from('partner_batches').select('*').not('posted_at', 'is', null).is('notified_posted_at', null);
  for (const b of posted ?? []) {
    ship += await sendOwners({ title: 'Declan posted a batch', body: `${await count(b.id)} phones · tracking ${b.tracking_number ?? ''}`, url: './?go=ship', tag: 'posted-' + b.id });
    await db.from('partner_batches').update({ notified_posted_at: new Date().toISOString() }).eq('id', b.id);
  }
  return Response.json({ newBookings: sentNew, oneHour: sentSoon, shipping: ship });
});
