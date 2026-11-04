import { buildIcs } from './ics.mjs';
import assert from 'node:assert';
const ics = buildIcs([
  { id: 'a1', seller_name: 'Sam', model: 'iPhone 14 Pro, 256GB', issues: 'cracked screen; battery 82%', quoted_min_cents: 23000, quoted_max_cents: 26000, starts_at: '2026-11-05T05:30:00.000Z', location: 'Stockland Aitkenvale, food court', notes: 'Wear a red top', status: 'booked', updated_at: '2026-11-03T10:00:00Z' },
  { id: 'b2', seller_name: 'Cancelled Person', model: 'iPhone 12', quoted_min_cents: 10000, quoted_max_cents: 10000, starts_at: '2026-11-06T05:30:00.000Z', status: 'cancelled' },
], Date.now());
assert(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
assert(ics.includes('DTSTART:20261105T053000Z'), 'start time in UTC');
assert(ics.includes('DTEND:20261105T061500Z'), '45 minute event');
assert(ics.includes('SUMMARY:Meetup: iPhone 14 Pro\\, 256GB (Sam)'), 'commas escaped');
assert(!ics.includes('Cancelled Person'), 'cancelled meetups are left out');
assert(ics.includes('TRIGGER:-PT1H') && ics.includes('TRIGGER:-PT15M'), 'reminders');
assert(ics.split('\r\n').every((l) => l.length <= 75), 'lines folded');
assert(ics.includes('X-WR-CALNAME:Declan Meetups') && ics.includes('X-WR-TIMEZONE:Australia/Brisbane') && ics.includes('UID:a1@cashforphones.townsville'), 'default is Declan in Townsville (his existing calendar keeps working)');
const mel = buildIcs([{ id: 'm1', seller_name: 'Lee', model: 'iPhone 15', quoted_min_cents: 40000, quoted_max_cents: 40000, starts_at: '2027-03-06T04:00:00.000Z', status: 'booked' }], Date.now(), { name: 'Quinn', city: 'Melbourne', tz: 'Australia/Melbourne' });
assert(mel.includes('X-WR-CALNAME:Quinn Meetups') && mel.includes('X-WR-TIMEZONE:Australia/Melbourne') && mel.includes('UID:m1@cashforphones.melbourne'), 'Melbourne feed uses its own name, time zone and id');
console.log('calendar feed tests passed');
