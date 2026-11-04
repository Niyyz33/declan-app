-- Change 15 (4 Nov 2026): let partners SEE the damaged-phone fee and the step-up (these are not secret; the full rates stay owner-only).
insert into app_settings (key, value) values ('fee_damaged_cents', '3000'), ('fee_bonus_after', '35'), ('fee_bonus_cents', '3500')
on conflict (key) do update set value = excluded.value;
