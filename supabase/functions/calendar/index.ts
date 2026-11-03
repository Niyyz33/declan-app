// Serves the "Declan Meetups" calendar feed. Declan subscribes once (webcal link shown in his app) and
// iOS keeps it up to date. Protected by a long secret token stored in app_settings, not by login, because
// Apple Calendar can't log in. Deploy with: supabase functions deploy calendar --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildIcs } from './ics.mjs';

Deno.serve(async (req: Request) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: setting } = await db.from('app_settings').select('value').eq('key', 'calendar_token').maybeSingle();
  if (!setting || !token || token !== setting.value) return new Response('Not found', { status: 404 });
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data } = await db.from('partner_meetups').select('*').neq('status', 'cancelled').gte('starts_at', since).order('starts_at');
  return new Response(buildIcs(data ?? [], Date.now()), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
});
