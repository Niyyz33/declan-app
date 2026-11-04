# Strike Surge partner app (Declan)
Free web app (PWA) for Declan to log phones. Data lives in a SEPARATE Supabase project (see schema.sql).
Setup: run schema.sql in the new project, create the two logins, run after-users.sql, put the project URL +
public key in config.js, deploy this folder (GitHub Pages / Netlify / Cloudflare Pages).
Tests: `node deductions.test.js`
Update 2: run change-2.sql once (edit/delete, price limit, settings). Ship an update with `./release.sh "what changed"`
(runs tests, stamps a fresh version so phones never run stale code, then pushes to GitHub Pages).
Branding: Cash for Phones Townsville (logo + colours from the Cash4Phones app).
Update 3: run change-3.sql once (meetups + calendar secret), then deploy the calendar feed:
`supabase functions deploy calendar --project-ref udkbhgzmmnrwmadqakia --no-verify-jwt`. Test the feed: `node supabase/functions/calendar/ics.test.mjs`.
Before EVERY release: run `tests/overflow-audit.js` (in the test page at 320px wide) over every screen of the app (Declan + owner) and every guide, with long names and lots of data. It must report nothing sticking out of any box, button, drawing or screen.

Smoothness rules: `refreshPhones()` runs one at a time and only redraws the screen if the data really changed (and never while someone is typing). The alerts card is painted from its last known state so it doesn't pop in. A new app version waits until Declan leaves the screen (or goes Home) before reloading. Don't add code that rebuilds the whole screen on a timer.

## Adding another partner (Quinn, Melbourne) — one app, two people
Same app, same database. Each partner has a row in `partners` with a city, a time zone and their own secret calendar link (change-9.sql).
1. Create their login: Supabase dashboard → Authentication → Users → Add user (their email + a password they change later). Copy the user's id.
2. Add their partner row (run with `supabase db query --yes --remote=udkbhgzmmnrwmadqakia`):
```sql
insert into partners (id, name, role, price_city, city_name, timezone, calendar_token)
values ('<their auth user id>', 'Quinn', 'partner', 'melbourne', 'Melbourne', 'Australia/Melbourne',
        replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
```
3. Quinn opens `https://niyyz33.github.io/declan-app/melbourne.html` in Safari → Add to Home Screen (this gives him the Melbourne icon and name). Declan keeps the normal link.
4. Ethan's owner screens then show a Declan / Quinn switcher (Meetups, Phones, Shipments, Statement). Bookings use the partner's own time zone (Melbourne has daylight saving).
Shared by both: models and deduction table, guides, rates/commission, Ethan's phone number. Per partner: list prices (`list_prices.city`), calendar link, alerts, phones, shipments, meetups. Statement fortnights and monthly counts use Brisbane time for both (Ethan's accounting clock). Declan's spreadsheet export is still Declan-only.

## How meetups and availability work (4 Nov 2026)
Ethan closes every sale and books every meetup; Declan never books. Ethan asks the seller for their phone number and puts it on the booking (`seller_contact`), so Declan can message or call them from his meetup card.
Each morning at 8am (their time) a push asks the partner when they're free that day (skipped if they use "same time every day"). When they save, Ethan gets a push, so he knows when to send leads. Ethan's booking form shows their free times for the chosen day and warns if the time is outside them. Tables: `partner_availability`; partner columns `default_avail_*`; function `set_default_availability`. SQL: change-12.sql and change-13.sql.
