-- 25 Nov 2026: AI helper ("Ask" tab). Run ONCE on the DECLAN project.
-- ai_knowledge: the approved text the helper may use. Owner-only: partners can never read it (it is NOT in app_settings).
-- ai_questions: every question + answer, so Ethan can see what partners ask. Only the server function writes rows.
create table if not exists ai_knowledge (
  id int primary key default 1 check (id = 1),
  body text not null,
  updated_at timestamptz not null default now()
);
alter table ai_knowledge enable row level security;
drop policy if exists ai_knowledge_owner on ai_knowledge;
create policy ai_knowledge_owner on ai_knowledge for all using (is_owner()) with check (is_owner());

create table if not exists ai_questions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  question text not null,
  answer text,
  status text not null default 'ok' check (status in ('ok', 'limited', 'error', 'refused')),
  model text,
  tokens_in int,
  tokens_out int,
  cost_micro_usd int not null default 0,
  rating smallint check (rating in (-1, 1)),
  texted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_questions_partner_idx on ai_questions (partner_id, created_at desc);
create index if not exists ai_questions_created_idx on ai_questions (created_at desc);
alter table ai_questions enable row level security;
drop policy if exists ai_questions_read on ai_questions;
create policy ai_questions_read on ai_questions for select using (partner_id = auth.uid() or is_owner());

-- A partner can thumbs-up / thumbs-down their own answers, and record that they pressed "Text Ethan".
create or replace function rate_ai_answer(p_id uuid, p_rating int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_rating not in (-1, 0, 1) then raise exception 'Bad rating'; end if;
  update ai_questions set rating = nullif(p_rating, 0) where id = p_id and partner_id = auth.uid();
end $$;
create or replace function ai_mark_texted(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update ai_questions set texted_at = now() where id = p_id and partner_id = auth.uid();
end $$;
revoke execute on function rate_ai_answer(uuid, int) from public, anon;
revoke execute on function ai_mark_texted(uuid) from public, anon;
grant execute on function rate_ai_answer(uuid, int) to authenticated;
grant execute on function ai_mark_texted(uuid) to authenticated;

-- Switches. ai_enabled = 0 means only Ethan can use it (to test). Cap is in millionths of a US dollar (10,000,000 = US$10 a month).
insert into app_settings (key, value) values
  ('ai_enabled', '0'), ('ai_daily_limit', '25'), ('ai_monthly_cap_micro_usd', '10000000'), ('ai_model', 'claude-haiku-5-5')
on conflict (key) do nothing;
