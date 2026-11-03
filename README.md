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
