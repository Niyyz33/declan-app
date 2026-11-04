// Builds one partner's Apple Calendar feed ("<Name> Meetups") from their meetup rows. Pure function so it can be tested.
const esc = (t) => String(t == null ? '' : t).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Calendar lines must be folded at 75 bytes; fold on characters with headroom for multi-byte ones.
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 70) { out.push(rest.slice(0, 70)); rest = ' ' + rest.slice(70); }
  out.push(rest);
  return out.join('\r\n');
}
const dollars = (c) => '$' + (c / 100).toLocaleString('en-AU', { maximumFractionDigits: 2 });

export function buildIcs(meetups, nowMs, who = { name: 'Declan', city: 'Townsville', tz: 'Australia/Brisbane' }) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cash for Phones ' + who.city + '//' + who.name + ' Meetups//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(who.name + ' Meetups'), 'X-WR-TIMEZONE:' + who.tz, 'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M',
  ];
  for (const m of meetups) {
    if (m.status === 'cancelled') continue;
    const start = new Date(m.starts_at), end = new Date(start.getTime() + 45 * 60000);
    const quote = m.quoted_min_cents === m.quoted_max_cents ? dollars(m.quoted_max_cents) : dollars(m.quoted_min_cents) + '-' + dollars(m.quoted_max_cents);
    const desc = ['Seller: ' + m.seller_name, 'Phone: ' + m.model, 'Quote: ' + quote, m.issues ? 'Issues: ' + m.issues : '', m.notes ? 'Notes: ' + m.notes : ''].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT', 'UID:' + m.id + '@cashforphones.' + who.city.toLowerCase().replace(/[^a-z]/g, ''), 'DTSTAMP:' + stamp(m.updated_at || m.created_at || nowMs),
      'DTSTART:' + stamp(start), 'DTEND:' + stamp(end),
      'SUMMARY:' + esc('Meetup: ' + m.model + ' (' + m.seller_name + ')'),
      ...(m.location ? ['LOCATION:' + esc(m.location)] : []),
      'DESCRIPTION:' + esc(desc), 'STATUS:CONFIRMED', 'TRANSP:OPAQUE',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Meetup in 1 hour', 'TRIGGER:-PT1H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Meetup in 15 minutes', 'TRIGGER:-PT15M', 'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
