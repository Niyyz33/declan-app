// Sends the meetup push notifications to Declan's phone: one straight away when Ethan books, and one an hour
// before. Called every minute by a database schedule (pg_cron). Protected by a secret in the URL because the
// caller isn't a logged-in user. Deploy with: supabase functions deploy notify --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const when = (iso: string, tz: string) => new Date(iso).toLocaleString('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

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

  // Who each partner is (name + time zone), so alerts use their own clock and name.
  const { data: people } = await db.from('partners').select('id,name,timezone,role,default_avail_enabled,default_avail_start_min,default_avail_end_min,default_avail_changed_at,default_avail_notified_at,avail_asked_on');
  type Person = { id: string; name: string; timezone: string; role: string; default_avail_enabled: boolean; default_avail_start_min: number | null; default_avail_end_min: number | null; default_avail_changed_at: string | null; default_avail_notified_at: string | null; avail_asked_on: string | null };
  const who = (id: string) => (people ?? []).find((p: { id: string }) => p.id === id) as Person | undefined;
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
    sentNew += await send(m.partner_id, { title: 'New meetup booked', body: `${when(m.starts_at, who(m.partner_id)?.timezone ?? 'Australia/Brisbane')} — ${m.model} (${m.seller_name})${m.location ? ' at ' + m.location : ''}`, url: './?go=meetups', tag: 'new-' + m.id });
    await db.from('partner_meetups').update({ notified_new_at: new Date().toISOString() }).eq('id', m.id);
  }
  // 2. one hour to go (or less, if it was booked at short notice)
  const { data: soon } = await db.from('partner_meetups').select('*').eq('status', 'booked').is('reminded_at', null).gt('starts_at', new Date(now).toISOString()).lte('starts_at', new Date(now + 3600000).toISOString());
  for (const m of soon ?? []) {
    const mins = Math.max(1, Math.round((new Date(m.starts_at).getTime() - now) / 60000));
    const title = mins >= 55 ? 'Meetup in 1 hour' : `Meetup in ${mins} minutes`, body = `${m.model} with ${m.seller_name}${m.location ? ' — ' + m.location : ''}`;
    const tz = who(m.partner_id)?.timezone ?? 'Australia/Brisbane', clock = new Date(m.starts_at).toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    // with a seller number on the booking: tell the partner to message them and check they're still good
    const pTitle = m.seller_contact ? `${title}: message ${m.seller_name}` : title, pBody = m.seller_contact ? `Check they’re still good for ${clock}. Tap to open your meetup.` : body;
    sentSoon += await send(m.partner_id, { title: pTitle, body: pBody, url: './?go=meetups', tag: 'soon-' + m.id });
    await sendOwners({ title: (who(m.partner_id)?.name ?? 'Partner') + ': ' + title.toLowerCase(), body, url: './?go=meetups', tag: 'osoon-' + m.id });
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
    ship += await sendOwners({ title: (who(b.partner_id)?.name ?? 'Partner') + ' posted a batch', body: `${await count(b.id)} phones · tracking ${b.tracking_number ?? ''}`, url: './?go=ship', tag: 'posted-' + b.id });
    await db.from('partner_batches').update({ notified_posted_at: new Date().toISOString() }).eq('id', b.id);
  }
  // 4. a partner ticked off every step of the "Start here" checklist -> tell Ethan (once; again only if they un-tick and finish again)
  let checklist = 0;
  const { count: stepCount } = await db.from('onboarding_items').select('id', { count: 'exact', head: true });
  if (stepCount) {
    const { data: ppl } = await db.from('partners').select('id,name,checklist_done_notified_at').eq('role', 'partner');
    for (const p of ppl ?? []) {
      const { count: done } = await db.from('onboarding_progress').select('item_id', { count: 'exact', head: true }).eq('partner_id', p.id);
      if ((done ?? 0) >= stepCount && !p.checklist_done_notified_at) {
        checklist += await sendOwners({ title: p.name + ' finished the checklist', body: 'All ' + stepCount + ' steps are ticked. Open the app to sign them off.', url: './?go=meetups', tag: 'checklist-' + p.id });
        await db.from('partners').update({ checklist_done_notified_at: new Date().toISOString() }).eq('id', p.id);
      } else if ((done ?? 0) < stepCount && p.checklist_done_notified_at) {
        await db.from('partners').update({ checklist_done_notified_at: null }).eq('id', p.id);
      }
    }
  }
  let availPings = 0, asked = 0;
  // 7. availability: the partner said when they're free -> tell Ethan (so he knows when to send leads)
  const hm = (min: number) => { const h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'pm' : 'am', h12 = h % 12 === 0 ? 12 : h % 12; return h12 + ':' + String(m).padStart(2, '0') + ' ' + ap; };
  const dayLabel = (day: string, tz: string) => { const today = new Date().toLocaleDateString('en-CA', { timeZone: tz }); return day === today ? 'today' : new Date(day + 'T12:00:00Z').toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }); };
  const { data: avs } = await db.from('partner_availability').select('*').is('notified_at', null).gte('set_at', new Date(now - 86400000).toISOString());
  for (const a of avs ?? []) {
    const w = who(a.partner_id), tz = w?.timezone ?? 'Australia/Brisbane', day = dayLabel(a.day, tz);
    const title = a.available ? `${w?.name ?? 'Partner'} is free ${day}` : `${w?.name ?? 'Partner'} is not available ${day}`;
    availPings += await sendOwners({ title, body: a.available ? `${hm(a.start_min)} to ${hm(a.end_min)}. Good time to send leads.` : 'No leads for them that day.', url: './?go=meetups', tag: 'avail-' + a.partner_id + a.day });
    await db.from('partner_availability').update({ notified_at: new Date().toISOString() }).eq('partner_id', a.partner_id).eq('day', a.day);
  }
  for (const p of (people ?? []) as Person[]) {
    if (p.role !== 'partner') continue;
    if (p.default_avail_changed_at && (!p.default_avail_notified_at || p.default_avail_changed_at > p.default_avail_notified_at)) {
      availPings += await sendOwners({ title: p.default_avail_enabled ? `${p.name} is free every day` : `${p.name} turned off “same time every day”`, body: p.default_avail_enabled ? `${hm(p.default_avail_start_min ?? 0)} to ${hm(p.default_avail_end_min ?? 0)}. Good time to send leads.` : 'They will set their times day by day.', url: './?go=meetups', tag: 'avail-default-' + p.id });
      await db.from('partners').update({ default_avail_notified_at: new Date().toISOString() }).eq('id', p.id);
    }
    // 8. each morning (from 8am their time) ask the partner for today's times, unless they use "same time every day"
    const tz = p.timezone ?? 'Australia/Brisbane', today = new Date().toLocaleDateString('en-CA', { timeZone: tz }), hour = parseInt(new Date().toLocaleString('en-AU', { timeZone: tz, hour: 'numeric', hour12: false }), 10) % 24;
    if (hour >= 8 && hour < 13 && p.avail_asked_on !== today) {
      if (!p.default_avail_enabled) {
        const { count: has } = await db.from('partner_availability').select('day', { count: 'exact', head: true }).eq('partner_id', p.id).eq('day', today);
        if (!has) asked += await send(p.id, { title: 'What time are you free today?', body: 'Tap to tell Ethan when you can do meetups.', url: './?go=avail', tag: 'ask-avail-' + today });
      }
      await db.from('partners').update({ avail_asked_on: today }).eq('id', p.id);
    }
  }
  return Response.json({ newBookings: sentNew, oneHour: sentSoon, shipping: ship, checklist, availPings, asked });
});
