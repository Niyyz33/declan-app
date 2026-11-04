-- Change 10 (4 Nov 2026): "Start here" checklist for each partner, with Ethan able to see progress and sign them off.
create table if not exists onboarding_items (
  id text primary key,
  label text not null,
  detail text,
  link text,
  sort_order int not null
);
create table if not exists onboarding_progress (
  partner_id uuid not null default auth.uid() references partners(id) on delete cascade,
  item_id text not null references onboarding_items(id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (partner_id, item_id)
);
alter table partners add column if not exists signed_off_at timestamptz;

alter table onboarding_items enable row level security;
alter table onboarding_progress enable row level security;
drop policy if exists onb_items_read on onboarding_items;
create policy onb_items_read on onboarding_items for select using (exists (select 1 from partners where id = auth.uid()));
drop policy if exists onb_items_owner_write on onboarding_items;
create policy onb_items_owner_write on onboarding_items for all using (is_owner()) with check (is_owner());
drop policy if exists onb_progress_read on onboarding_progress;
create policy onb_progress_read on onboarding_progress for select using (partner_id = auth.uid() or is_owner());
drop policy if exists onb_progress_insert on onboarding_progress;
create policy onb_progress_insert on onboarding_progress for insert with check (partner_id = auth.uid() or is_owner());
drop policy if exists onb_progress_delete on onboarding_progress;
create policy onb_progress_delete on onboarding_progress for delete using (partner_id = auth.uid() or is_owner());
-- only Ethan can sign someone off
drop policy if exists partners_owner_update on partners;
create policy partners_owner_update on partners for update using (is_owner()) with check (is_owner());

insert into onboarding_items (id, label, detail, link, sort_order) values
 ('setup', 'Set up the app', 'Add it to your Home Screen, turn on alerts and add the calendar.', 'guide-start.html', 10),
 ('getin', 'Getting into the phone', 'How to get into a wiped phone fast, with no Apple ID.', 'guide-getin.html', 20),
 ('inspect', 'Inspecting a phone', 'What to check, in order, and what each fault costs.', 'guide-inspect.html', 30),
 ('safety', 'Buying safely', 'Quick checks before you hand over the cash.', 'guide-safety.html', 40),
 ('meetup', 'What to say at a meetup', 'The easy flow, and the line for your deductions.', 'guide-meetup.html', 50),
 ('mint', 'Mint phones', 'Buying, selling and recording what they sold for.', 'guide-mint.html', 60),
 ('sell', 'Selling on Marketplace', 'Photos, title, groups, and what to say to buyers.', 'guide-sell.html', 70),
 ('pack', 'Packing and posting', 'How to wrap, box and post damaged phones.', 'ship-guide.html', 80),
 ('help', 'If something goes wrong', 'Quick fixes for meetups and the app.', 'guide-help.html', 90),
 ('deductions', 'Learn the deduction table', 'Know what each fault takes off, so you can price on the spot.', 'guide-inspect.html', 100),
 ('practice-inspect', 'Practise inspecting a phone', 'Use your own old phone, or one Ethan gives you.', null, 110),
 ('practice-log', 'Log a practice phone in the app', 'Go through the Log screen once. Ethan will clear it.', null, 120),
 ('practice-meetup', 'Do a practice meetup', 'Run one with Ethan, or watch him do a real one.', null, 130),
 ('review', 'Practise asking for a Google review', 'Say it out loud once so it feels natural.', 'guide-meetup.html', 140)
on conflict (id) do update set label = excluded.label, detail = excluded.detail, link = excluded.link, sort_order = excluded.sort_order;
