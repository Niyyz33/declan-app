const D = require('./deductions.js');
const assert = require('assert');
const deds = [
  { model: 'iPhone 14', fault: 'Broken Screen', deduction_cents: 4000 },
  { model: 'iPhone 14', fault: 'Bad Mid Frame', deduction_cents: 10000 },
  { model: 'iPhone 12', fault: 'Bad Housing', deduction_cents: 5000 },
  { model: 'iPhone 14', fault: 'Broken Back', deduction_cents: 6000 },
];
assert.equal(D.batteryCents('iPhone 14'), 5000);
assert.equal(D.batteryCents('iPhone 15 Pro Max'), 7000);
assert.equal(D.batteryCents('iPhone XR'), 5000);
assert.equal(D.batteryCents('iPhone Air'), 7000);
assert.equal(D.batteryCents('iPhone 16e'), 7000);
// scratched + broken screen only charges once
let l = D.suggest({ model: 'iPhone 14', deds, faults: ['screen_broken', 'screen_scratched', 'back_broken'] });
assert.deepEqual(l.map(x => x.cents), [4000, 6000]);
// frame uses Mid Frame on a 14, Housing on a 12
assert.equal(D.suggest({ model: 'iPhone 14', deds, faults: ['frame'] })[0].cents, 10000);
assert.equal(D.suggest({ model: 'iPhone 12', deds, faults: ['frame'] })[0].cents, 5000);
// battery: <80 required, 80-84 optional, >=85 none
let b = D.suggest({ model: 'iPhone 15', deds: [], batteryPct: 79 })[0];
assert(b.required && b.cents === 7000);
b = D.suggest({ model: 'iPhone 13', deds: [], batteryPct: 82 })[0];
assert(!b.required && b.cents === 5000);
assert.equal(D.suggest({ model: 'iPhone 13', deds: [], batteryPct: 90 }).length, 0);
// lenses
l = D.suggest({ model: 'iPhone 14', deds, lensesCracked: 2, lensesExposed: 1 });
assert.deepEqual(l.map(x => x.cents), [4000, 5000]);
// unpriced model flagged
l = D.suggest({ model: 'iPhone 17', deds, faults: ['back_broken'] });
assert(!l[0].priced && l[0].cents === 0);
assert.equal(D.suggestType({ faults: [] }), 'mint');
assert.equal(D.suggestType({ faults: ['back_broken'] }), 'damaged');
console.log('deduction tests passed');
