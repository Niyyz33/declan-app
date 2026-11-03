// Deduction helper for Declan's inspection. Pure logic (no browser needed) so it can be tested.
// Ethan's rules (3 Nov 2026): follow Ben's table for every fault, EXCEPT:
//  - battery under 85%: $50 on iPhone 14 and below, $70 on iPhone 15 and above; always under 80%
//  - smashed camera lens: $20 per lens; $50 per lens if the camera itself is exposed
//  - scratched or third-party/replaced screen = the full broken-screen deduction
//  - third-party parts always deduct; frame chips/scratches deduct
(function (root) {
  var BEN = {
    screen: 'Broken Screen', back: 'Broken Back', charging: 'Bad Charging Port', faceid: 'No FACE ID',
    speaker: 'Loud Speaker Issue', rearCam: 'Rear Camera Broken', frontCam: 'Front Camera Broken',
    board: 'Board Issue', smallParts: 'Small Parts'
  };
  var FAULTS = [
    { id: 'screen_broken', label: 'Broken screen', ben: 'screen' },
    { id: 'screen_scratched', label: 'Scratched screen', ben: 'screen', hint: 'Counts as a broken screen' },
    { id: 'screen_third_party', label: 'Replaced / third-party screen', ben: 'screen', hint: 'Counts as a broken screen' },
    { id: 'back_broken', label: 'Broken back', ben: 'back' },
    { id: 'frame', label: 'Frame chips / scratches / bent', ben: 'frame' },
    { id: 'charging', label: 'Charging port issue', ben: 'charging' },
    { id: 'faceid', label: 'Face ID not working', ben: 'faceid' },
    { id: 'speaker', label: 'Speaker / earpiece / buttons issue', ben: 'speaker' },
    { id: 'rearCam', label: 'Rear camera not working', ben: 'rearCam' },
    { id: 'frontCam', label: 'Front camera not working', ben: 'frontCam' },
    { id: 'board', label: 'Wi-Fi / Bluetooth / cellular issue', ben: 'board' },
    { id: 'parts_other', label: 'Other third-party / replaced parts', ben: 'smallParts' }
  ];

  // "iPhone 14 and below" vs "15 and above". XS/XR/11 count as below; Air counts as 17.
  function modelNumber(name) {
    var m = /iPhone (\d+)/.exec(name || '');
    if (m) return parseInt(m[1], 10);
    if (/iPhone (XS|XR|X)\b/.test(name || '')) return 10;
    if (/Air/.test(name || '')) return 17;
    return null;
  }
  function batteryCents(model) {
    var n = modelNumber(model);
    return n !== null && n >= 15 ? 7000 : 5000;
  }

  function benLookup(deds, model, benKey) {
    if (benKey === 'frame') {
      var h = benLookup(deds, model, 'housing'), mf = benLookup(deds, model, 'midframe');
      return h !== null ? h : mf;
    }
    var fault = benKey === 'housing' ? 'Bad Housing' : benKey === 'midframe' ? 'Bad Mid Frame' : BEN[benKey];
    for (var i = 0; i < deds.length; i++) {
      if (deds[i].model === model && deds[i].fault === fault) return deds[i].deduction_cents;
    }
    return null;
  }

  // Returns the suggested deduction lines. Declan can still untick or edit any non-required line.
  function suggest(o) {
    var lines = [], seen = {};
    var deds = o.deds || [];
    (o.faults || []).forEach(function (id) {
      var f = FAULTS.filter(function (x) { return x.id === id; })[0];
      if (!f || seen[f.ben]) return; // e.g. scratched + broken screen only deducts once
      seen[f.ben] = true;
      var cents = benLookup(deds, o.model, f.ben);
      lines.push({ id: f.id, label: f.label, cents: cents === null ? 0 : cents, priced: cents !== null, required: false });
    });
    var pct = o.batteryPct;
    var lowBattery = typeof pct === 'number' && pct < 85;
    if (lowBattery || o.thirdPartyBattery) {
      lines.push({
        id: 'battery',
        label: o.thirdPartyBattery && !lowBattery ? 'Replaced / third-party battery' : 'Battery under 85% (' + pct + '%)',
        cents: batteryCents(o.model), priced: true,
        required: typeof pct === 'number' && pct < 80
      });
    }
    var cracked = o.lensesCracked || 0, exposed = o.lensesExposed || 0;
    if (cracked > 0) lines.push({ id: 'lens_cracked', label: 'Smashed camera lens x' + cracked, cents: 2000 * cracked, priced: true, required: false });
    if (exposed > 0) lines.push({ id: 'lens_exposed', label: 'Camera exposed (lens gone) x' + exposed, cents: 5000 * exposed, priced: true, required: false });
    return lines;
  }

  // mint = no faults, or only a bad battery. Anything else = damaged. (Declan can override.)
  function suggestType(o) {
    return (o.faults || []).length === 0 && !o.lensesCracked && !o.lensesExposed ? 'mint' : 'damaged';
  }

  var api = { FAULTS: FAULTS, modelNumber: modelNumber, batteryCents: batteryCents, benLookup: benLookup, suggest: suggest, suggestType: suggestType };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Deductions = api;
})(typeof window !== 'undefined' ? window : this);
