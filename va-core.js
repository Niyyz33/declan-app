// Aston's helper logic: pricing, message wording and meetup time suggestions. Pure functions, no screen code, so it can be tested.
// The wording is Ethan's own (from his real chats). Nothing here holds a price: the numbers come from the database.
(function (root) {
  var STEP_CENTS = 2000; // each storage size up adds $20

  // ---- price ----
  // model: { storage_gb: [..], max_cents, step_cents }, picked: { storage, faults: [cents] }
  function price(model, storage, deductionCents) {
    if (!model || model.max_cents == null) return null;
    var idx = Math.max(0, (model.storage_gb || []).indexOf(Number(storage)));
    var max = model.max_cents + idx * (model.step_cents || STEP_CENTS);
    (deductionCents || []).forEach(function (c) { max -= c; });
    max = Math.max(0, Math.round(max / 100)); // whole dollars
    var low = Math.max(0, Math.floor((max - 50) / 10) * 10), high = Math.max(Math.ceil((max + 10) / 10) * 10, low);
    return { max: max, low: low, high: high };
  }

  function joinFaults(list) {
    var l = list.map(function (s) { return String(s).toLowerCase(); });
    if (l.length <= 1) return l.join('');
    return l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1];
  }
  // friendly wording for the fault names in the price table
  var FAULT_WORDS = { badBattery: 'battery', brokenScreen: 'broken screen', brokenBack: 'broken back', badHousing: 'housing', badMidFrame: 'frame', badChargingPort: 'charging port', noFaceID: 'Face ID', loudSpeakerIssue: 'speaker', rearCameraBroken: 'rear camera', frontCameraBroken: 'front camera', perLensSmashed: 'smashed camera lens', boardIssue: 'board issue', smallParts: 'small parts' };
  function faultWords(keys) { return keys.map(function (k) { return FAULT_WORDS[k] || k; }); }

  // ---- the quote messages (Ethan's words) ----
  function quoteMessages(p, faultKeys) {
    var range = '$' + p.low + '-$' + p.high, f = faultKeys && faultKeys.length ? joinFaults(faultWords(faultKeys)) : '';
    var out = [];
    if (f) {
      out.push({ label: 'With the faults', text: 'Hi, based on the model and current pricing, we would usually be around ' + range + ', provided taking into account the ' + f + '. Would that work for you?' });
      out.push({ label: 'Casual', text: 'Hey mate, we’d usually be around ' + range + ' for that model taking into account the ' + f + '. Would that work for you?' });
    } else {
      out.push({ label: 'Standard', text: 'Hi, based on the model and current pricing, we would usually be around ' + range + ', provided the rest of the phone is in good condition. Would that work for you?' });
      out.push({ label: 'Casual', text: 'Hey, we usually pay ' + range + ' for that model if the rest is in good condition, would that work for you?' });
    }
    return out;
  }

  // the seller says what they want: accept if it is within the most we can say, otherwise offer the most
  function counter(p, asked) {
    asked = Math.round(Number(asked));
    if (!p || !asked || asked <= 0) return null;
    if (asked <= p.max) return { within: true, price: asked, text: 'No worries at all im happy to do $' + asked + ' cash today if that works for you. let me know and can get you paid today' };
    return { within: false, price: p.max, text: 'no worries unfortunately those models aren’t worth that price anymore with the new release of the 18 series. id be happy to assess in person to see if i can do $' + p.max + ' cash does that work for you?' };
  }

  // ---- time suggestions ----
  // day's free window (minutes from midnight), existing meetups that day (start minutes), now (minutes, only for today)
  // returns up to n start times in minutes. A meetup takes ~30 min plus a 15 min gap.
  function suggestSlots(opts) {
    var win = opts.window, booked = (opts.booked || []).slice().sort(function (a, b) { return a - b; }), n = opts.n || 4, dur = opts.duration || 30, gap = opts.gap || 15, lead = opts.lead || 45;
    if (!win) return [];
    var earliest = win.start;
    if (opts.now != null) earliest = Math.max(earliest, opts.now + lead);
    earliest = Math.ceil(earliest / 5) * 5;
    var out = [];
    for (var t = earliest; t + dur <= win.end && out.length < n; t += 5) {
      var clash = booked.some(function (b) { return t < b + dur + gap && b < t + dur + gap; });
      if (clash) continue;
      if (out.length && t - out[out.length - 1] < 30) continue; // spread the options out
      out.push(t);
    }
    return out;
  }
  function clock(min) { var h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 === 0 ? 12 : h % 12; return h12 + ':' + (m < 10 ? '0' : '') + m + ap; }

  // ---- message library (Ethan's real wording). need: names of fill-ins the text uses ----
  var LIB = [
    { group: 'Start', items: [
      { t: 'Sweet any issues?', note: 'After they say the model.' },
      { t: 'sweet how much are you looking for?', note: 'On a good phone, to hear their number first.' },
      { t: 'no worries, what do you mean by glitches?', note: 'When the fault is vague.' },
      { t: 'No worries happy to check with the technician for current pricing on that one, in the mean time did you have a price in mind?', note: 'Model or phone not on the price list.' } ] },
    { group: 'Price pushback', items: [
      { t: 'no worries what price did you have in mind?', note: 'First reply when they say it is too low.' },
      { t: 'no worries did you have a different price in mind?', note: 'Same idea, other wording.' },
      { t: 'Happy to do ${price} if the battery health is above 80%?', need: ['price'], note: 'Only if Ethan has said a small step up is OK. Otherwise text Ethan.' },
      { t: 'No worries get back to me for quick and easy cash', note: 'When they will not move. Let it go.' } ] },
    { group: 'Not a fit', items: [
      { t: 'Unfortunately will need it to turn on.', note: 'It does not turn on.' },
      { t: 'No worries unfortunately mainly buying 13s and above, however due to the age of the model and current condition would be at about ${price} cash. Does that work for you', need: ['price'], note: 'iPhone 12 and older, only if the table gives a price.' },
      { t: 'Mainly iphones at this moment in time.', note: 'Asked about iPads or other devices.' },
      { t: 'Sorry but unfortunately we do not unlock phones.', note: 'Asked to unlock or remove a lock.' } ] },
    { group: 'Book the meetup', items: [
      { t: 'happy to meet you today at ${spot} if that works for you?', need: ['spot'], note: 'Offer today at the usual spot.' },
      { t: 'No worries happy to do ${time} does that work for you?', need: ['time'], note: 'Offer an exact time (use the suggested times on the Book tab).' },
      { t: 'Happy to do tomorrow instead', note: 'They cannot do today.' },
      { t: 'No worries mostly busy tomorrow, does a time today work for you?', note: 'They ask for a day that is full.' },
      { t: 'Sorry, but all my customers always come to me as I have many meetups at my spot, so I need to be available for everyone, and it’s just the way we have always done it', note: 'They ask us to meet somewhere else. Then offer another time.' },
      { t: 'Can I grab your number so we can text you before the meetup?', note: 'DRAFT, Ethan has not set wording for this. Needed before every booking.' } ] },
    { group: 'After booking', items: [
      { t: 'easy as booked in see you then', note: 'Ethan’s confirmation.' },
      { t: 'Just checking that still works for you?', note: 'If they go quiet before the meetup.' } ] },
    { group: 'Follow up', items: [
      { t: 'Hey, just following up with you if you’re still looking to sell your iPhone?', note: 'One day after the quote, if they seem interested.' },
      { t: 'Hey ! did you end up selling your phone!', note: 'Friendly check-in.' },
      { t: 'No worries at all, do let me know the second you want to get some cash for it and can book you in. Cheers', note: 'They decided to keep it.' } ] },
    { group: 'After the sale', items: [
      { t: 'Sell My Phone Townsville would love your feedback ${review}', need: ['review'], note: 'Review link (only after they have been paid).' } ] }
  ];
  function fill(text, vals) { return text.replace(/\$\{(\w+)\}/g, function (m, k) { return vals[k] ? vals[k] : m; }); }
  function missing(item, vals) { return (item.need || []).filter(function (k) { return !vals[k]; }); }

  var api = { price: price, joinFaults: joinFaults, faultWords: faultWords, quoteMessages: quoteMessages, counter: counter, suggestSlots: suggestSlots, clock: clock, LIB: LIB, fill: fill, missing: missing, STEP_CENTS: STEP_CENTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VACORE = api;
})(typeof window !== 'undefined' ? window : this);
