# Strike Surge partner app (Declan)
Free web app (PWA) for Declan to log phones. Data lives in a SEPARATE Supabase project (see schema.sql).
Setup: run schema.sql in the new project, create the two logins, run after-users.sql, put the project URL +
public key in config.js, deploy this folder (GitHub Pages / Netlify / Cloudflare Pages).
Tests: `node deductions.test.js`
