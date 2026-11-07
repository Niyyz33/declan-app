-- Hold back a partner's 8am "what time are you free today?" prompt until a start date.
alter table partners add column if not exists avail_prompts_from date;
update partners set avail_prompts_from = '2026-11-21' where name = 'Quinn' and role = 'partner';
update partners set avail_prompts_from = '2026-12-06' where name = 'Declan' and role = 'partner';
