// "Ask" tab: the AI helper. A signed-in partner sends a question; this answers it using ONLY the approved text in the
// ai_knowledge table (owner-only, never in this repo). It reads no other data: no prices, no other partners, no phones.
// Needs a login (JWT verified), so it is deployed WITHOUT --no-verify-jwt.
// Secrets: ANTHROPIC_API_KEY (set with `supabase secrets set`). Deploy: supabase functions deploy ask --use-api --yes
// Switches live in app_settings: ai_enabled (0 = only Ethan can use it), ai_daily_limit, ai_monthly_cap_micro_usd, ai_model.
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@1.13.0';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const MAX_QUESTION = 600;
// Haiku 5.5 list price in millionths of a dollar per token: $0.10 / 1M in, $0.50 / 1M out (counted at full price, so the cap errs on the safe side).
const IN_MICRO = 0.1, OUT_MICRO = 0.5;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) return json({ error: 'Not signed in' }, 401);

  const { data: me } = await db.from('partners').select('id,name,role,city_name').eq('id', auth.user.id).maybeSingle();
  if (!me || !['partner', 'owner'].includes(me.role)) return json({ error: 'Not allowed' }, 403);
  const isOwner = me.role === 'owner';

  let question = '';
  try { question = String((await req.json()).question ?? '').trim(); } catch { /* falls through to the empty check */ }
  if (!question) return json({ error: 'Type a question first.' }, 400);
  if (question.length > MAX_QUESTION) return json({ error: 'That one is too long. Keep it under ' + MAX_QUESTION + ' characters.' }, 400);

  const { data: rows } = await db.from('app_settings').select('key,value').like('key', 'ai_%');
  const S: Record<string, string> = {}; for (const r of rows ?? []) S[r.key] = r.value;
  const text = (status: string, answer: string) => json({ status, answer });

  if (S.ai_enabled !== '1' && !isOwner) return text('off', 'The AI helper isn’t switched on yet. Use the Text Ethan button for now.');
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return text('off', 'The AI helper isn’t set up yet. Use the Text Ethan button for now.');

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const log = async (fields: Record<string, unknown>) => {
    const { data } = await db.from('ai_questions').insert({ partner_id: me.id, question, ...fields }).select('id').single();
    return data?.id as string | undefined;
  };

  if (!isOwner) {
    const { count } = await db.from('ai_questions').select('id', { count: 'exact', head: true }).eq('partner_id', me.id).eq('status', 'ok').gte('created_at', dayAgo);
    if ((count ?? 0) >= parseInt(S.ai_daily_limit || '25', 10)) {
      const id = await log({ status: 'limited', answer: 'daily limit' });
      return json({ status: 'limited', id, answer: 'You’ve hit today’s question limit. Use the Text Ethan button and he’ll help.' });
    }
  }
  const { data: spent } = await db.from('ai_questions').select('cost_micro_usd').gte('created_at', monthStart);
  const monthMicro = (spent ?? []).reduce((a: number, r: { cost_micro_usd: number }) => a + (r.cost_micro_usd || 0), 0);
  if (monthMicro >= parseInt(S.ai_monthly_cap_micro_usd || '10000000', 10)) {
    const id = await log({ status: 'limited', answer: 'monthly cap' });
    return json({ status: 'limited', id, answer: 'The AI helper is taking a break. Use the Text Ethan button and he’ll help.' });
  }

  const { data: kb } = await db.from('ai_knowledge').select('body').eq('id', 1).maybeSingle();
  if (!kb?.body) return text('off', 'The AI helper isn’t set up yet. Use the Text Ethan button for now.');

  // Short memory so follow-ups work: this partner's last 3 answers from the past 30 minutes, read from our own log (never from the phone).
  const { data: past } = await db.from('ai_questions').select('question,answer').eq('partner_id', me.id).eq('status', 'ok')
    .gte('created_at', new Date(now - 30 * 60 * 1000).toISOString()).order('created_at', { ascending: false }).limit(3);
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const p of (past ?? []).reverse()) { messages.push({ role: 'user', content: p.question }); messages.push({ role: 'assistant', content: p.answer ?? '' }); }
  messages.push({ role: 'user', content: question });

  const first = String(me.name || '').split(' ')[0];
  const model = S.ai_model || 'claude-haiku-5-5';
  try {
    const client = new Anthropic({ apiKey });
    // deno-lint-ignore no-explicit-any
    const res: any = await client.messages.create({
      model,
      max_tokens: 800,
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: kb.body, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'The partner asking is ' + first + ' (' + (me.city_name || 'unknown city') + '). Answer in plain text with short paragraphs or numbered steps. No tables, no headings, no markdown symbols.' },
      ],
      messages,
    });
    const usage = res.usage ?? {};
    const tokIn = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0), tokOut = usage.output_tokens ?? 0;
    const cost = Math.ceil(tokIn * IN_MICRO + tokOut * OUT_MICRO);
    if (res.stop_reason === 'refusal') {
      const id = await log({ status: 'refused', answer: '(declined)', model, tokens_in: tokIn, tokens_out: tokOut, cost_micro_usd: cost });
      return json({ status: 'refused', id, answer: 'I can’t help with that one. Use the Text Ethan button.' });
    }
    const answer = (res.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n').trim();
    if (!answer) {
      const id = await log({ status: 'error', answer: '(empty answer)', model, tokens_in: tokIn, tokens_out: tokOut, cost_micro_usd: cost });
      return json({ status: 'error', id, answer: 'Something went wrong on my end. Try again, or use the Text Ethan button.' });
    }
    const id = await log({ status: 'ok', answer, model, tokens_in: tokIn, tokens_out: tokOut, cost_micro_usd: cost });
    return json({ status: 'ok', id, answer });
  } catch (e) {
    console.error('ask failed', (e as Error).message);
    const id = await log({ status: 'error', answer: String((e as Error).message).slice(0, 300), model });
    return json({ status: 'error', id, answer: 'Something went wrong on my end. Try again, or use the Text Ethan button.' });
  }
});
