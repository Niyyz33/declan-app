-- Change 9 (4 Nov 2026): a second partner (Quinn, Melbourne) in the same app.
-- Each partner now has a city name, a time zone and their own secret calendar link.
alter table partners add column if not exists city_name text not null default 'Townsville';
alter table partners add column if not exists timezone text not null default 'Australia/Brisbane';
alter table partners add column if not exists calendar_token text;

-- Declan keeps his existing calendar link: it moves from the global setting onto his own row.
update partners set calendar_token = (select value from app_settings where key = 'calendar_token')
  where role = 'partner' and calendar_token is null and exists (select 1 from app_settings where key = 'calendar_token');
create unique index if not exists partners_calendar_token_key on partners (calendar_token) where calendar_token is not null;
