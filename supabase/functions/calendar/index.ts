// Serves each partner's "<Name> Meetups" calendar feed. They subscribe once (webcal link shown in the app) and
// iOS keeps it up to date. Protected by a long secret token stored on their partners row, not by login, because
// Apple Calendar can't log in. Deploy with: supabase functions deploy calendar --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildIcs } from './ics.mjs';

Deno.serve(async (req: Request) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: partner } = token ? await db.from('partners').select('id,name,city_name,timezone').eq('calendar_token', token).maybeSingle() : { data: null };
  if (!partner) return new Response('Not found', { status: 404 });
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data } = await db.from('partner_meetups').select('*').eq('partner_id', partner.id).neq('status', 'cancelled').gte('starts_at', since).order('starts_at');
  return new Response(buildIcs(data ?? [], Date.now(), { name: partner.name, city: partner.city_name, tz: partner.timezone }), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
});
