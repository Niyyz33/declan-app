var C = require('./va-core.js'), assert = require('assert');
// price: made-up numbers, not real ones
var m = { storage_gb: [128, 256, 512], max_cents: 28000, step_cents: 2000 };
var p = C.price(m, 128, []); assert.deepStrictEqual(p, { max: 280, low: 230, high: 290 });
assert.strictEqual(C.price(m, 256, []).max, 300);
assert.strictEqual(C.price(m, 512, []).max, 320);
assert.strictEqual(C.price(m, 128, [5000, 3000]).max, 200);
assert.deepStrictEqual(C.price(m, 128, [99999]), { max: 0, low: 0, high: 10 });
assert.strictEqual(C.price({ storage_gb: [64], max_cents: null }, 64, []), null);
// messages
var q = C.quoteMessages(p, []);
assert.ok(/\$230-\$290/.test(q[0].text) && /good condition/.test(q[0].text));
var qf = C.quoteMessages(p, ['brokenScreen', 'brokenBack']);
assert.ok(/taking into account the broken screen and broken back/.test(qf[0].text));
// counter
assert.strictEqual(C.counter(p, 250).within, true);
assert.ok(/\$250 cash today/.test(C.counter(p, 250).text));
var hi = C.counter(p, 450); assert.strictEqual(hi.within, false); assert.ok(/\$280 cash/.test(hi.text));
assert.strictEqual(C.counter(p, 0), null);
// slots
var s = C.suggestSlots({ window: { start: 14 * 60, end: 18 * 60 }, booked: [], n: 4 });
assert.deepStrictEqual(s, [840, 870, 900, 930]);
s = C.suggestSlots({ window: { start: 14 * 60, end: 18 * 60 }, booked: [840], n: 3 });
assert.ok(s[0] >= 840 + 30 + 15 && s.length === 3);
s = C.suggestSlots({ window: { start: 14 * 60, end: 18 * 60 }, booked: [], now: 15 * 60 + 2, n: 2 });
assert.strictEqual(s[0], 15 * 60 + 50); // now + 45 min rounded up to 5
assert.deepStrictEqual(C.suggestSlots({ window: null }), []);
assert.deepStrictEqual(C.suggestSlots({ window: { start: 600, end: 620 } }), []); // too short for a meetup
assert.strictEqual(C.clock(16 * 60 + 15), '4:15PM'); assert.strictEqual(C.clock(0), '12:00AM');
// library fill-ins
var it = { t: 'happy to do ${time}', need: ['time'] };
assert.deepStrictEqual(C.missing(it, {}), ['time']); assert.strictEqual(C.fill(it.t, { time: '4:15PM' }), 'happy to do 4:15PM');
C.LIB.forEach(function (g) { g.items.forEach(function (i) { assert.ok(i.t.length > 5); }); });
console.log('va-core tests passed');
