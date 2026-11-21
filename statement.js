// Fortnightly statement maths for Ethan's side. Pure logic (no browser needed) so it can be tested.
// All numbers (price chart, commission bands, fee settings) are passed in from the database, never hard-coded here.
//  - DAMAGED phones: Ethan reimburses what Declan paid, plus a fee = flat + pct% of expected profit
//    (expected profit = expected sale price - price paid, never below 0). Optional per-phone cap on the fee.
//  - MINT phones: Declan keeps them; he owes Ethan a banded commission based on the spread
//    (price-sheet value - price paid).
(function (root) {
  var D = root.Deductions || (typeof require !== 'undefined' ? require('./deductions.js') : null);
  var DAY = 86400000;
  // Statement dates are Sundays every 14 days (same cadence as the Strike Surge statements), Brisbane time (UTC+10, no DST).
  var REF = Date.UTC(2026, 8, 5, 14, 0, 0); // Sun 6 Sep 2026 00:00 Brisbane

  // Period k = the fortnight ending on statement date k. A phone logged ON the statement day belongs to that statement.
  function period(k) {
    var date = REF + k * 14 * DAY;
    return { k: k, date: date, start: date - 13 * DAY, end: date + DAY }; // [start, end)
  }
  function currentPeriodIndex(nowMs) {
    var k = Math.ceil((nowMs - REF - DAY + 1) / (14 * DAY));
    while (period(k).end <= nowMs) k++;
    while (period(k - 1).end > nowMs) k--;
    return k;
  }

  function ffRow(ff, model, storage) {
    var rows = (ff || []).filter(function (r) { return r.model === model; });
    if (!rows.length) return null;
    if (storage) { var hit = rows.filter(function (r) { return Number(r.storage_gb) === Number(storage); })[0]; if (hit) return hit; }
    rows.sort(function (a, b) { return a.storage_gb - b.storage_gb; });
    return storage ? null : rows[0]; // unknown storage -> base tier; known-but-unlisted storage -> not covered
  }

  var CHART = { screen_broken: 'screen', screen_scratched: 'screen', screen_third_party: 'screen', back_broken: 'back', charging: 'charging', faceid: 'faceid', speaker: 'speaker', rearCam: 'rearCam', frontCam: 'frontCam', board: 'board', parts_other: 'smallParts', frame: 'frame' };
  // Sum of the chart's fixed-dollar deductions for this phone's faults (same chart Declan uses). Battery under 85% counts.
  function chartDeductions(phone, deds) {
    var seen = {}, sum = 0, cl = phone.checklist || {};
    (cl.faults || []).forEach(function (id) {
      var key = CHART[id]; if (!key || seen[key]) return; seen[key] = true;
      var c = D.benLookup(deds, phone.model, key); if (c !== null) sum += c;
    });
    var lowBattery = typeof phone.battery_pct === 'number' && phone.battery_pct < 85;
    if (lowBattery || cl.third_party_battery || phone.battery_unknown_part) {
      for (var i = 0; i < deds.length; i++) if (deds[i].model === phone.model && deds[i].fault === 'Bad Battery (below 85%)') { sum += deds[i].deduction_cents; break; }
    }
    var lenses = (cl.lenses_cracked || 0) + (cl.lenses_exposed || 0);
    if (lenses) for (var j = 0; j < deds.length; j++) if (deds[j].model === phone.model && deds[j].fault === 'Per Lens Smashed') { sum += deds[j].deduction_cents * lenses; break; }
    return sum;
  }

  // Expected sale price (cents) of a damaged phone, or null if the model/storage isn't in the price table.
  function expectedSale(phone, ff, deds) {
    var row = ffRow(ff, phone.model, phone.storage_gb);
    if (!row) return null;
    return Math.max(5000, Math.round(Number(row.multiplier) * (row.ff_price_cents - chartDeductions(phone, deds))));
  }
  // Price-sheet value (cents) of a phone with no faults, or null if not in the table.
  function sheetPrice(phone, ff) { var row = ffRow(ff, phone.model, phone.storage_gb); return row ? row.ff_price_cents : null; }

  // Which number damaged phone this is within its Brisbane calendar month (1 = first bought that month).
  function monthKey(iso) { var d = new Date(new Date(iso).getTime() + 10 * 3600000); return d.getUTCFullYear() + '-' + d.getUTCMonth(); }
  function monthOrdinals(phones) {
    var count = {}, ord = {};
    phones.filter(function (p) { return p.type === 'damaged'; }).sort(function (a, b) { return new Date(a.bought_at) - new Date(b.bought_at); }).forEach(function (p) {
      var k = monthKey(p.bought_at); count[k] = (count[k] || 0) + 1; ord[p.id] = count[k];
    });
    return ord;
  }
  // Declan's fee on a damaged phone. expectedCents null => unknown, so only the flat part counts and needsPrice is set.
  function damagedFee(expectedCents, paidCents, st, ordinal) {
    var flat = st.flat_cents || 0, pct = st.pct || 0;
    // Step-up: once more than `bonus_after` damaged phones are bought in a month, the rest of that month pay `bonus_cents`.
    if (st.bonus_after && st.bonus_cents && ordinal && ordinal > st.bonus_after) flat = st.bonus_cents;
    if (!pct) return { fee: flat, profit: null, needsPrice: false }; // a flat fee needs no price guess
    if (expectedCents === null || expectedCents === undefined) return { fee: flat, profit: null, needsPrice: true };
    var profit = expectedCents - paidCents, fee = flat + Math.round(pct / 100 * Math.max(profit, 0));
    if (st.cap_cents) fee = Math.min(fee, st.cap_cents);
    return { fee: fee, profit: profit, needsPrice: false };
  }
  // Commission on a mint phone from the bands (sorted by min_spread_cents; first band has no minimum).
  function mintCommission(spreadCents, bands) {
    if (spreadCents === null || spreadCents === undefined) return null;
    var b = (bands || []).slice().sort(function (a, c) { return (a.min_spread_cents == null ? -Infinity : a.min_spread_cents) - (c.min_spread_cents == null ? -Infinity : c.min_spread_cents); });
    var hit = null;
    b.forEach(function (x) { if (x.min_spread_cents == null || spreadCents >= x.min_spread_cents) hit = x; });
    return hit ? hit.fee_cents : null;
  }

  // Build one statement. ctx: {phones, batches, payments, valuations:{phone_id:{expected_sale_cents,sheet_price_cents}}, ff, deds, bands, settings}
  function statement(k, ctx) {
    var p = period(k), val = ctx.valuations || {};
    var mint = [], damaged = [], ords = monthOrdinals(ctx.phones || []);
    (ctx.phones || []).forEach(function (ph) {
      if (ph.type === 'mint') {
        var t = new Date(ph.bought_at).getTime();
        if (t < p.start || t >= p.end) return;
        var v = val[ph.id] || {}, sheet = v.sheet_price_cents != null ? v.sheet_price_cents : sheetPrice(ph, ctx.ff);
        var spread = sheet === null ? null : sheet - ph.price_paid_cents, fee = mintCommission(spread, ctx.bands);
        mint.push({ phone: ph, sheet: sheet, spread: spread, fee: fee, needsPrice: sheet === null });
      }
    });
    (ctx.batches || []).forEach(function (b) {
      if (!b.received_at) return;
      var t = new Date(b.received_at).getTime();
      if (t < p.start || t >= p.end) return;
      var phones = (ctx.phones || []).filter(function (ph) { return ph.batch_id === b.id; });
      var lines = phones.map(function (ph) {
        var v = val[ph.id] || {}, usePct = !!(ctx.settings && ctx.settings.pct), exp = !usePct ? null : v.expected_sale_cents != null ? v.expected_sale_cents : expectedSale(ph, ctx.ff, ctx.deds);
        var f = damagedFee(exp, ph.price_paid_cents, ctx.settings || {}, ords[ph.id]);
        return { phone: ph, ordinal: ords[ph.id], expected: exp, profit: f.profit, fee: f.fee, needsPrice: f.needsPrice, manual: v.expected_sale_cents != null };
      });
      var pay = (ctx.payments || []).filter(function (x) { return x.batch_id === b.id; })[0] || {};
      var reimburse = lines.reduce(function (a, l) { return a + l.phone.price_paid_cents; }, 0), fees = lines.reduce(function (a, l) { return a + l.fee; }, 0);
      var paid = (pay.paid_on_ship_cents || 0) + (pay.paid_on_arrival_cents || 0);
      damaged.push({ batch: b, lines: lines, reimburse: reimburse, fees: fees, owed: reimburse + fees, paid: paid, remaining: reimburse + fees - paid });
    });
    var declanOwes = mint.reduce(function (a, l) { return a + (l.fee || 0); }, 0);
    var ethanOwes = damaged.reduce(function (a, d) { return a + d.remaining; }, 0);
    var missing = mint.filter(function (l) { return l.needsPrice; }).length + damaged.reduce(function (a, d) { return a + d.lines.filter(function (l) { return l.needsPrice; }).length; }, 0);
    return { period: p, mint: mint, damaged: damaged, declanOwes: declanOwes, ethanOwes: ethanOwes, net: ethanOwes - declanOwes, missing: missing };
  }

  var api = { monthOrdinals: monthOrdinals, period: period, currentPeriodIndex: currentPeriodIndex, expectedSale: expectedSale, sheetPrice: sheetPrice, damagedFee: damagedFee, mintCommission: mintCommission, statement: statement, chartDeductions: chartDeductions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Statement = api;
})(typeof window !== 'undefined' ? window : this);
