// Tests for statement.js. All prices below are made-up numbers, not Ethan's real chart.
const assert = require('assert');
const S = require('./statement.js');
const AEST = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h - 10, mi); // a Brisbane wall-clock time

// ---- fortnightly periods: statement Sundays 20 Sep, 4 Oct, 18 Oct, 1 Nov, 15 Nov, 29 Nov, 13 Dec
const ds = (k) => new Date(S.period(k).date + 10 * 3600000).toISOString().slice(0, 10);
assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map(ds), ['2026-09-20', '2026-10-04', '2026-10-18', '2026-11-01', '2026-11-15', '2026-11-29', '2026-12-13']);
assert.strictEqual(S.currentPeriodIndex(AEST(2026, 11, 3, 20)), 5, '3 Nov belongs to the 15 Nov statement');
assert.strictEqual(S.currentPeriodIndex(AEST(2026, 11, 1, 23, 59)), 4, 'a phone logged ON the statement day is in that statement');
assert.strictEqual(S.currentPeriodIndex(AEST(2026, 11, 2, 0, 1)), 5, 'the next day starts the next fortnight');
assert.strictEqual(S.currentPeriodIndex(AEST(2026, 12, 5, 12)), 7, '5 Dec (launch) is in the 13 Dec statement');

// ---- made-up price table + chart
const ff = [{ model: 'Phone A', storage_gb: 128, ff_price_cents: 30000, multiplier: 1.0 }, { model: 'Phone A', storage_gb: 256, ff_price_cents: 32000, multiplier: 1.0 }, { model: 'Phone B', storage_gb: 128, ff_price_cents: 60000, multiplier: 0.9 }, { model: 'Phone C', storage_gb: 128, ff_price_cents: 10000, multiplier: 0.9 }];
const deds = [
  { model: 'Phone A', fault: 'Broken Screen', deduction_cents: 4000 }, { model: 'Phone A', fault: 'Broken Back', deduction_cents: 6000 },
  { model: 'Phone A', fault: 'Bad Battery (below 85%)', deduction_cents: 3000 }, { model: 'Phone A', fault: 'Per Lens Smashed', deduction_cents: 500 },
  { model: 'Phone B', fault: 'Broken Screen', deduction_cents: 10000 }, { model: 'Phone C', fault: 'Broken Screen', deduction_cents: 9000 },
];
const ph = (o) => Object.assign({ id: Math.random().toString(36).slice(2), type: 'damaged', model: 'Phone A', storage_gb: 128, battery_pct: 95, checklist: { faults: [] }, price_paid_cents: 10000, bought_at: new Date(AEST(2026, 12, 6, 10)).toISOString() }, o);

// ---- expected sale price
assert.strictEqual(S.expectedSale(ph({}), ff, deds), 30000, 'no faults = full price x multiplier');
assert.strictEqual(S.expectedSale(ph({ storage_gb: 256 }), ff, deds), 32000, 'storage row picked');
assert.strictEqual(S.expectedSale(ph({ checklist: { faults: ['screen_broken', 'screen_scratched'] } }), ff, deds), 26000, 'screen faults only deduct once');
assert.strictEqual(S.expectedSale(ph({ checklist: { faults: ['screen_third_party', 'back_broken'] } }), ff, deds), 20000, 'third-party screen counts as broken screen');
assert.strictEqual(S.expectedSale(ph({ battery_pct: 80 }), ff, deds), 27000, 'battery under 85% deducts even if not ticked');
assert.strictEqual(S.expectedSale(ph({ checklist: { faults: [], lenses_cracked: 2, lenses_exposed: 1 } }), ff, deds), 28500, 'lenses use the per-lens chart value');
assert.strictEqual(S.expectedSale(ph({ model: 'Phone B', checklist: { faults: ['screen_broken'] } }), ff, deds), Math.round(0.9 * 50000), 'multiplier applied');
assert.strictEqual(S.expectedSale(ph({ model: 'Phone C', checklist: { faults: ['screen_broken'] } }), ff, deds), 5000, 'floor of $50');
assert.strictEqual(S.expectedSale(ph({ model: 'Not In Table' }), ff, deds), null, 'uncovered model => null');
assert.strictEqual(S.expectedSale(ph({ storage_gb: 512 }), ff, deds), null, 'storage not in table => null');
assert.strictEqual(S.expectedSale(ph({ storage_gb: null }), ff, deds), 30000, 'unknown storage uses the base tier');

// ---- damaged fee = flat + pct of expected profit (never below 0), optional cap
const st = { flat_cents: 3000, pct: 10, cap_cents: null };
assert.deepStrictEqual(S.damagedFee(30000, 10000, st), { fee: 5000, profit: 20000, needsPrice: false }, '$30 + 10% of $200');
assert.strictEqual(S.damagedFee(8000, 10000, st).fee, 3000, 'a loss pays only the flat $30');
assert.strictEqual(S.damagedFee(null, 10000, st).needsPrice, true);
assert.strictEqual(S.damagedFee(null, 10000, st).fee, 3000);
assert.strictEqual(S.damagedFee(100000, 10000, st).fee, 12000, 'no cap');
assert.strictEqual(S.damagedFee(100000, 10000, Object.assign({}, st, { cap_cents: 10000 })).fee, 10000, 'cap applies');

// ---- flat fee (pct 0): same fee every phone, no price needed
assert.deepStrictEqual(S.damagedFee(null, 25000, { flat_cents: 3000, pct: 0 }), { fee: 3000, profit: null, needsPrice: false }, 'flat $30, nothing to guess');
assert.strictEqual(S.damagedFee(99999, 1, { flat_cents: 3000, pct: 0 }).fee, 3000);

// ---- mint commission bands (made-up)
const bands = [{ min_spread_cents: null, fee_cents: 3000 }, { min_spread_cents: 10000, fee_cents: 4500 }, { min_spread_cents: 20000, fee_cents: 7000 }];
assert.strictEqual(S.mintCommission(-500, bands), 3000, 'negative spread uses the lowest band');
assert.strictEqual(S.mintCommission(9999, bands), 3000);
assert.strictEqual(S.mintCommission(10000, bands), 4500, 'boundary belongs to the upper band');
assert.strictEqual(S.mintCommission(50000, bands), 7000);
assert.strictEqual(S.mintCommission(null, bands), null);

// ---- a whole statement, with netting and a manual price
const b1 = { id: 'b1', received_at: new Date(AEST(2026, 12, 9, 12)).toISOString() }, b2 = { id: 'b2', received_at: new Date(AEST(2026, 12, 20, 12)).toISOString() };
const d1 = ph({ id: 'd1', batch_id: 'b1' }), d2 = ph({ id: 'd2', batch_id: 'b1', model: 'Uncovered' });
const m1 = ph({ id: 'm1', type: 'mint', price_paid_cents: 24000 }), m2 = ph({ id: 'm2', type: 'mint', model: 'Uncovered', price_paid_cents: 15000, bought_at: new Date(AEST(2026, 12, 8, 9)).toISOString() });
const old = ph({ id: 'old', type: 'mint', bought_at: new Date(AEST(2026, 11, 20, 9)).toISOString() }), d3 = ph({ id: 'd3', batch_id: 'b2' });
const ctx = { phones: [d1, d2, m1, m2, old, d3], batches: [b1, b2], payments: [{ batch_id: 'b1', paid_on_ship_cents: 6000, paid_on_arrival_cents: 0 }], valuations: { d2: { expected_sale_cents: 20000 }, m2: { sheet_price_cents: 40000 } }, ff, deds, bands, settings: st };
const s = S.statement(7, ctx); // the 13 Dec statement
assert.strictEqual(s.mint.length, 2, 'only mint phones bought in the fortnight');
assert.strictEqual(s.mint.find((l) => l.phone.id === 'm1').spread, 6000, 'sheet 300 - paid 240');
assert.strictEqual(s.mint.find((l) => l.phone.id === 'm1').fee, 3000);
assert.strictEqual(s.mint.find((l) => l.phone.id === 'm2').fee, 7000, 'manual sheet price 400 - 150 = 250 spread');
assert.strictEqual(s.damaged.length, 1, 'only batches received in the fortnight');
const dl = s.damaged[0];
assert.strictEqual(dl.reimburse, 20000);
assert.strictEqual(dl.fees, 5000 + (3000 + 1000), 'd1 $50 + d2 ($30 + 10% of $100 manual)');
assert.strictEqual(dl.owed, 29000);
assert.strictEqual(dl.remaining, 23000, 'minus the $60 already paid');
assert.strictEqual(s.declanOwes, 10000);
assert.strictEqual(s.net, 23000 - 10000, 'Ethan pays Declan the difference');
assert.strictEqual(s.missing, 0);
assert.strictEqual(S.statement(7, Object.assign({}, ctx, { valuations: {} })).missing, 2, 'uncovered phones are flagged as needing a price');
assert.strictEqual(S.statement(8, ctx).damaged.length, 1, 'b2 (20 Dec) lands in the 27 Dec statement');
const flat = S.statement(7, Object.assign({}, ctx, { valuations: {}, settings: { flat_cents: 3000, pct: 0 } }));
assert.strictEqual(flat.damaged[0].fees, 6000, 'two phones x $30');
assert.strictEqual(flat.damaged[0].remaining, 20000 + 6000 - 6000, 'reimburse + fees - already paid');
assert.strictEqual(flat.damaged[0].lines.every((l) => !l.needsPrice && l.expected === null), true);
console.log('statement tests passed');
