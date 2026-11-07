-- 8 Nov 2026: electronic agreements. A partner reads the agreement in the app, fills in their details and signs by typing their name.
-- The signed text is stored as a permanent copy with the time it was signed. Ethan can countersign. Partners can't edit or delete it.
alter table partners add column if not exists agreement_version text;

create table if not exists agreements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  version text not null,
  body_html text not null,
  details jsonb not null default '{}'::jsonb,
  signed_name text not null,
  signed_at timestamptz not null default now(),
  user_agent text,
  owner_signed_name text,
  owner_signed_at timestamptz,
  unique (partner_id, version)
);
alter table agreements enable row level security;
drop policy if exists agreements_read_own on agreements;
drop policy if exists agreements_read_owner on agreements;
create policy agreements_read_own on agreements for select using (partner_id = auth.uid());
create policy agreements_read_owner on agreements for select using (is_owner());

create or replace function sign_agreement(p_version text, p_body text, p_details jsonb, p_name text, p_ua text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from partners where id = auth.uid() and role = 'partner' and agreement_version = p_version) then raise exception 'No agreement to sign'; end if;
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Type your full name'; end if;
  insert into agreements (partner_id, version, body_html, details, signed_name, user_agent)
  values (auth.uid(), p_version, p_body, coalesce(p_details, '{}'::jsonb), trim(p_name), left(coalesce(p_ua, ''), 300));
exception when unique_violation then raise exception 'Already signed';
end $$;

create or replace function countersign_agreement(p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'Owner only'; end if;
  update agreements set owner_signed_name = trim(p_name), owner_signed_at = now() where id = p_id and owner_signed_at is null;
end $$;

revoke execute on function sign_agreement(text, text, jsonb, text, text) from public, anon;
grant execute on function sign_agreement(text, text, jsonb, text, text) to authenticated;
revoke execute on function countersign_agreement(uuid, text) from public, anon;
grant execute on function countersign_agreement(uuid, text) to authenticated;

update partners set agreement_version = 'quinn-trial-2026-11' where name = 'Quinn' and role = 'partner';
