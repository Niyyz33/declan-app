// Aston's screens: price a phone, copy a message, book a meetup into Quinn's calendar, one-day follow-ups. Loaded only by va.html.
// Everything he sees comes from tables the database lets him read (price table, meetups for the partners marked va_can_book, his leads).
(function () {
  'use strict';
  var A = window.APP, C = window.VACORE, esc = A.esc, $ = A.$, all = A.all, VIEWS = A.VIEWS, go = A.go, shell = A.shell;
  var models = A.load('vamodels', []), deds = A.load('vadeds', []), leads = A.load('valeads', []);
  var P = Object.assign({ model: '', storage: null, faults: {}, asked: '', label: '', tone: 'Friendly' }, A.load('vastate', {})); // the phone being priced (kept while he moves around, and across reloads)
  function saveP() { A.save('vastate', P); }
  var BOOKFILL = null;   // carried from Price / Follow-ups to the Book screen
  var COPY = [];         // text for each Copy button on screen
  var MSG = { time: '', price: '' }; // fill-ins on the Messages screen

  function ethanPhone() { return (A.settings() || {}).ethan_phone || ''; }
  function quinn() { return A.partners().filter(function (p) { return p.role === 'partner'; })[0] || null; }
  function modelByName(n) { n = String(n || '').trim().toLowerCase(); return models.filter(function (m) { return m.name.toLowerCase() === n; })[0] || null; }
  function modelByCode(c) { return models.filter(function (m) { return m.code === c; })[0] || null; }
  function dedsFor(code) { return deds.filter(function (d) { return d.model_code === code; }).sort(function (a, b) { return a.sort_order - b.sort_order; }); }
  function dollars(c) { return '$' + Math.round(c / 100); }
  function storageText(g) { return g >= 1024 ? (g / 1024) + 'TB' : g + 'GB'; }
  function ago(iso) { var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); if (m < 60) return m + ' min ago'; var h = Math.round(m / 60); if (h < 24) return h + ' h ago'; return Math.round(h / 24) + ' d ago'; }
  function textEthan(body) { var n = ethanPhone(); return n ? A.smsTo(A.telFor(n), body || '') : ''; }

  // ---------- data ----------
  var refreshing = false;
  async function refresh() {
    var sb = A.sb(); if (!sb || !A.session() || !navigator.onLine || refreshing) return; refreshing = true;
    try {
      var pr = await sb.rpc('va_partners'), m = await sb.from('va_models').select('*').order('sort_order'), d = await sb.from('va_deductions').select('*').limit(2000), l = await sb.from('va_leads').select('*').order('quoted_at', { ascending: false }).limit(200);
      var s = await sb.from('app_settings').select('key,value'); var before = JSON.stringify([models, deds, leads, A.partners()]);
      if (s && !s.error) { var o = {}; s.data.forEach(function (x) { o[x.key] = x.value; }); var cur = A.settings(); Object.keys(o).forEach(function (k) { cur[k] = o[k]; }); A.save('settings', cur); }
      if (pr && !pr.error) A.setPartners(pr.data.map(function (p) { return Object.assign({}, p, { role: 'partner' }); }));
      if (m && !m.error && m.data.length) { models = m.data; A.save('vamodels', models); }
      if (d && !d.error) { deds = d.data; A.save('vadeds', deds); }
      if (l && !l.error) { leads = l.data; A.save('valeads', leads); }
      if (JSON.stringify([models, deds, leads, A.partners()]) !== before && /^va/.test(A.current()) && !A.typingNow()) go(A.current(), undefined, true);
    } catch (e) { /* offline */ }
    refreshing = false;
  }

  // ---------- tabs ----------
  function tabs(tab, ICON) {
    var due = dueLeads().length;
    return tab('vaprice', 'Price', ICON.list) + tab('vamsgs', 'Messages', ICON.doc) + tab('vabook', 'Book', ICON.plus) + tab('vafollow', 'Follow-ups', ICON.home, due ? '<span class="dot">' + due + '</span>' : '') + tab('vameetups', 'Meetups', ICON.cal);
  }
  function dueLeads() { var now = Date.now(); return leads.filter(function (l) { return l.status === 'quoted' && new Date(l.follow_up_due_at).getTime() <= now; }); }

  // ---------- copy ----------
  function copyBtn(text, label, cls) { COPY.push(text); return '<button type="button" class="' + (cls || 'small') + '" data-copy="' + (COPY.length - 1) + '">' + esc(label || 'Copy') + '</button>'; }
  function bindCopy() {
    all('[data-copy]').forEach(function (b) {
      b.onclick = function () {
        var t = COPY[+b.getAttribute('data-copy')], label = b.textContent;
        function done(ok) { b.textContent = ok ? 'Copied ✓' : 'Press Cmd+C'; setTimeout(function () { b.textContent = label; }, 1600); }
        function fallback() { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* blocked */ } document.body.removeChild(ta); done(ok); }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { done(true); }, fallback); else fallback();
      };
    });
  }
  function msgCard(text, note, extra) { return '<div class="msg"><div class="msgtext">' + esc(text) + '</div>' + (note ? '<div class="muted msgnote">' + esc(note) + '</div>' : '') + '<div class="acts">' + copyBtn(text) + (extra || '') + '</div></div>'; }
  function head(title, sub) { return '<h1>' + esc(title) + '</h1>' + (sub ? '<div class="muted" style="margin:-6px 0 14px">' + sub + '</div>' : '') + '<div id="pushcard"></div>'; }

  // ---------- WELCOME, TODAY STRIP, SETUP GUIDE ----------
  function isPhone() { return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || ''); }
  function stats() {
    var q = quinn(), tz = (q && q.timezone) || 'Australia/Brisbane', now = Date.now(), out = [];
    var mine = A.allMeetups().filter(function (m) { return m.status === 'booked'; }), next = mine.filter(function (m) { return new Date(m.starts_at).getTime() >= now; }).sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); })[0];
    var missing = mine.filter(function (m) { return now - new Date(m.starts_at).getTime() >= 30 * 60000; }).length, due = dueLeads().length, av = q ? A.availFor(q, A.dayKey(0, tz)) : null;
    out.push('<button type="button" class="stat' + (due ? ' hot' : '') + '" data-go="vafollow"><b>' + due + '</b><span>follow-up' + (due === 1 ? '' : 's') + ' due</span></button>');
    out.push('<button type="button" class="stat" data-go="vameetups"><b>' + (next ? new Date(next.starts_at).toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toUpperCase() : '–') + '</b><span>' + (next ? 'next meetup' : 'no meetups booked') + '</span></button>');
    out.push('<button type="button" class="stat" data-go="vameetups"><b>' + (av && av.ok ? esc(av.text.replace(' (every day)', '')) : av ? 'Off' : 'Not set') + '</b><span>' + esc(q ? q.name : 'Quinn') + ' today</span></button>');
    if (missing) out.push('<button type="button" class="stat hot" data-go="vameetups"><b>' + missing + '</b><span>outcome' + (missing === 1 ? '' : 's') + ' missing</span></button>');
    return '<div class="stats">' + out.join('') + '</div>';
  }
  function hero() {
    var name = A.profile().name || 'Aston';
    return '<div class="hero"><div><div class="heroh">Welcome ' + esc(name) + ',</div><div class="herosub">let’s close some deals.</div></div><button type="button" class="secondary small" data-go="vahelp">Guide</button></div>' + stats();
  }
  var STEPS = [
    { id: 'bookmark', laptop: true, t: 'Bookmark this page on your laptop', d: 'So it is one click away, or opens by itself when you start your browser.' },
    { id: 'homescreen', phone: true, t: 'Add the app to your Home Screen', d: 'Open it from its icon from now on.' },
    { id: 'alerts', t: 'Turn on alerts', d: 'So a follow-up or a missing outcome finds you. Use the Alerts box below.' },
    { id: 'keys', t: 'Set up your keyboard shortcuts', d: 'Type a short code and the whole message appears.', go: 'vakeys', goLabel: 'Show me' },
    { id: 'invite', t: 'Accept the Business Suite invite', d: 'Ethan sends it to your email. Accept it so you can reply to sellers.' },
    { id: 'practice', t: 'Price a practice phone', d: 'Pick a model, tick a fault, tap Copy on the message.' }
  ];
  function setupState() { var st = A.load('vasetup', { done: {}, hidden: false }); st.done = st.done || {}; return st; }
  function setupCard() {
    var st = setupState();
    if (st.hidden) return '<div class="setuplink"><button type="button" class="link" id="showsetup">Show the setup guide</button></div>';
    var steps = STEPS.filter(function (x) { return isPhone() ? !x.laptop : !x.phone; }), n = steps.filter(function (x) { return st.done[x.id]; }).length;
    var open = st.open === undefined ? !isPhone() : !!st.open; // phones start collapsed so the price tool is on screen
    var h = '<div class="card setup"><div class="row between"><b>Getting started</b><span class="muted">' + n + ' of ' + steps.length + ' done</span></div><div class="bar" style="margin:8px 0 4px"><i style="width:' + Math.round(n / steps.length * 100) + '%"></i></div>';
    h += '<button type="button" class="link" id="toggsetup" style="text-align:left;padding:4px 0">' + (open ? 'Hide the steps' : 'Show the steps') + '</button>';
    if (open) h += '<div class="steps">';
    if (open) steps.forEach(function (x) {
      var on = !!st.done[x.id];
      h += '<div class="step' + (on ? ' on' : '') + '"><button type="button" class="tick' + (on ? ' on' : '') + '" data-sdone="' + x.id + '" aria-label="' + esc(x.t) + (on ? ' (done)' : ' (not done)') + '">' + (on ? '✓' : '') + '</button><div class="steptext"><b>' + esc(x.t) + '</b><div class="muted">' + esc(x.d) + (x.laptop ? ' <i>Laptop only: ignore this on an iPhone.</i>' : '') + '</div>' +
        '<div class="acts"><button type="button" class="secondary small" data-go="' + (x.go || 'vahelp') + '">' + esc(x.goLabel || 'How to do it') + '</button></div></div></div>';
    });
    if (open) h += '</div>';
    h += '<button type="button" class="link" id="hidesetup" style="text-align:left;padding:4px 0">' + (n === steps.length ? 'All done. Hide this guide' : 'Hide this guide for now') + '</button></div>';
    return h;
  }
  function bindWelcome() {
    all('[data-go]').forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-go')); }; });
    all('[data-sdone]').forEach(function (b) { b.onclick = function () { var st = setupState(), k = b.getAttribute('data-sdone'); st.done[k] = !st.done[k]; A.save('vasetup', st); VIEWS.vaprice(); }; });
    var tg = $('toggsetup'); if (tg) tg.onclick = function () { var st = setupState(); st.open = !(st.open === undefined ? !isPhone() : st.open); A.save('vasetup', st); VIEWS.vaprice(); };
    var h = $('hidesetup'); if (h) h.onclick = function () { var st = setupState(); st.hidden = true; A.save('vasetup', st); VIEWS.vaprice(); };
    var sh = $('showsetup'); if (sh) sh.onclick = function () { var st = setupState(); st.hidden = false; A.save('vasetup', st); VIEWS.vaprice(); };
  }

  // ---------- PRICE ----------
  function curModel() { return modelByCode(P.model); }
  // every model as a single tap, like Ethan's app (no drop-down to open or get stuck)
  function modelChips(selected, attr) {
    return '<div class="chips modelchips">' + models.map(function (x) { return '<button type="button" class="chip' + (x.code === selected ? ' on' : '') + (x.max_cents == null ? ' dim' : '') + '" data-' + attr + '="' + esc(x.code) + '">' + esc(x.name) + '</button>'; }).join('') + '</div>';
  }
  function faultNamesFor(x) { return C.faultNames(dedsFor(x.m.code).filter(function (d) { return x.keys.indexOf(d.issue_key) > -1; }).map(function (d) { return d.issue_name; })); }
  function curStorage(m) { return P.storage && m.storage_gb.indexOf(P.storage) > -1 ? P.storage : m.storage_gb[0]; }
  function pricing() {
    var m = curModel(); if (!m) return null;
    var st = curStorage(m), keys = Object.keys(P.faults).filter(function (k) { return P.faults[k]; }), dd = dedsFor(m.code).filter(function (d) { return keys.indexOf(d.issue_key) > -1; });
    var p = C.price(m, st, dd.map(function (d) { return d.cents; }));
    return { m: m, st: st, keys: keys, p: p, ded: dd.reduce(function (a, d) { return a + d.cents; }, 0) };
  }
  function phoneLine(x) { return x.m.name + (x.m.storage_gb.length ? ' ' + storageText(x.st) : ''); }
  function priceOut() {
    var x = pricing(), h = '';
    if (!x) return '<div class="muted" style="margin-top:6px">Pick the model the seller says. You get the opening range and the most you can say.</div>';
    if (!x.p) {
      var nm = 'No worries happy to check with the technician for current pricing on that one, in the mean time did you have a price in mind?';
      return '<div class="tip" style="margin-top:12px"><b>No price set for ' + esc(x.m.name) + '.</b> Use this message, then text Ethan the model and faults.</div>' + msgCard(nm, '', ethanPhone() ? '<a class="btnlink small" href="' + textEthan('Price check: ' + x.m.name) + '">💬 Text Ethan</a>' : '');
    }
    var names = dedsFor(x.m.code).filter(function (d) { return x.keys.indexOf(d.issue_key) > -1; }).map(function (d) { return d.issue_name; }), asked = P.asked && C.counter(x.p, P.asked);
    h += '<div class="pricebox"><div><div class="muted lab">Opening range</div><div class="big">$' + x.p.low + '–$' + x.p.high + '</div></div><div><div class="muted lab">Most you can say</div><div class="big gold">$' + x.p.max + '</div></div></div>';
    if (x.ded) h += '<div class="muted" style="margin-top:6px">Faults taken off: −' + dollars(x.ded) + '</div>';
    h += '<h2>Send the quote</h2><div class="chips" style="margin-bottom:10px">' + C.TONES.map(function (t) { return '<button type="button" class="chip' + (P.tone === t ? ' on' : '') + '" data-tone="' + t + '">' + t + '</button>'; }).join('') + '</div>' + msgCard(C.quoteMessage(P.tone, x.p, names), '');
    h += '<h2>The seller says a price</h2><div class="row" style="gap:8px"><input id="asked" inputmode="numeric" placeholder="They want $" value="' + esc(P.asked) + '" style="max-width:160px"></div>';
    if (asked) h += msgCard(asked.text, asked.within ? 'Inside your limit, you can say yes.' : 'Above your limit ($' + x.p.max + '). Offer the most you can say. To go higher, text Ethan.', !asked.within && ethanPhone() ? '<a class="btnlink small" href="' + textEthan('Seller wants $' + P.asked + ' for ' + phoneLine(x) + ', max is $' + x.p.max) + '">💬 Ask Ethan</a>' : '');
    h += '<h2>Next</h2><div class="card"><label>Who is it? (name or username)</label><input id="lead" autocomplete="off" placeholder="e.g. Nathan, or the Instagram name" value="' + esc(P.label) + '"><div class="gap"></div><div class="acts"><button type="button" id="startfu" class="small">Start 1-day follow-up</button><button type="button" id="tobook" class="small secondary">Book a meetup</button></div><div class="err" id="err"></div></div>';
    return h;
  }
  VIEWS.vaprice = function () {
    var m = curModel(), html = hero() + setupCard() + head('Price a phone');
    html += '<div class="vagrid"><div class="card"><label>Phone model</label>' + (models.length ? modelChips(P.model, 'model') : '<div class="muted">Loading the price list…</div>');
    if (m) {
      html += '<label>Storage</label><div class="chips">' + m.storage_gb.map(function (g) { return '<button type="button" class="chip' + (g === curStorage(m) ? ' on' : '') + '" data-st="' + g + '">' + storageText(g) + '</button>'; }).join('') + '</div>';
      var dd = dedsFor(m.code);
      if (dd.length) html += '<label>Faults the seller mentions</label><div class="chips">' + dd.map(function (d) { return '<button type="button" class="chip bad' + (P.faults[d.issue_key] ? ' on' : '') + '" data-f="' + d.issue_key + '">' + esc(d.issue_name) + '</button>'; }).join('') + '</div>';
    }
    html += '</div><div id="out"></div></div><div style="margin-top:14px"><button type="button" class="link" id="clear">Clear and start again</button></div>';
    shell(html); paintOut(); bindPrice();
  };
  function paintOut() { COPY = []; var o = $('out'); if (o) o.innerHTML = priceOut(); bindCopy(); bindOut(); }
  function bindPrice() {
    all('[data-model]').forEach(function (b) { b.onclick = function () { var c = b.getAttribute('data-model'); if (c !== P.model) { P.model = c; P.storage = null; P.faults = {}; P.asked = ''; saveP(); } VIEWS.vaprice(); }; });
    all('[data-st]').forEach(function (b) { b.onclick = function () { P.storage = +b.getAttribute('data-st'); saveP(); VIEWS.vaprice(); }; });
    all('[data-f]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-f'); P.faults[k] = !P.faults[k]; saveP(); VIEWS.vaprice(); }; });
    $('clear').onclick = function () { P = { model: '', storage: null, faults: {}, asked: '', label: '', tone: P.tone }; saveP(); VIEWS.vaprice(); };
    bindWelcome();
    A.renderPushCard && A.renderPushCard();
  }
  function bindOut() {
    all('[data-tone]').forEach(function (b) { b.onclick = function () { P.tone = b.getAttribute('data-tone'); saveP(); paintOut(); }; });
    var asked = $('asked'); if (asked) asked.oninput = function () { P.asked = asked.value.replace(/[^\d]/g, ''); clearTimeout(asked._t); asked._t = setTimeout(function () { var pos = asked.selectionStart; paintOut(); var n = $('asked'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } } }, 400); };
    var lead = $('lead'); if (lead) lead.oninput = function () { P.label = lead.value; saveP(); };
    var fu = $('startfu'); if (fu) fu.onclick = async function () {
      var x = pricing(); if (!x || !x.p) return; P.label = ($('lead').value || '').trim();
      if (!P.label) { $('err').textContent = 'Type who it is first, so you can find them tomorrow.'; return; }
      fu.disabled = true;
      var row = { id: A.uuid(), label: P.label, model: phoneLine(x), issues: x.keys.length ? C.joinFaults(C.faultWords(x.keys)) : null, quote_text: '$' + x.p.low + '-$' + x.p.high };
      var r = await A.sb().from('va_leads').insert(row);
      if (r.error) { $('err').textContent = 'Couldn’t save: ' + r.error.message; fu.disabled = false; return; }
      leads.unshift(Object.assign({ status: 'quoted', quoted_at: new Date().toISOString(), follow_up_due_at: new Date(Date.now() + 86400000).toISOString() }, row)); A.save('valeads', leads);
      fu.textContent = 'Saved. You will be reminded tomorrow ✓'; $('err').textContent = '';
    };
    var bk = $('tobook'); if (bk) bk.onclick = function () { var x = pricing(); if (!x) return; P.label = ($('lead').value || '').trim(); BOOKFILL = { model: phoneLine(x), issues: x.keys.length ? C.joinFaults(C.faultWords(x.keys)) : '', quote: x.p ? x.p.low + '-' + x.p.high : '', name: P.label }; go('vabook'); };
  }

  // ---------- MESSAGES ----------
  VIEWS.vamsgs = function () {
    var q = quinn(), spot = (q && q.meet_location) || '', review = ((A.settings() || {}).review_url) || '';
    var vals = { time: MSG.time, price: MSG.price ? '$' + MSG.price.replace(/^\$/, '') : '', spot: MSG.spot !== undefined ? MSG.spot : spot, review: review };
    COPY = [];
    var html = head('Messages', 'Ethan’s own wording. Tap Copy, then paste into Business Suite.') +
      '<div class="card"><b>Fill in</b><div class="muted">Only the messages that need them use these.</div><div class="fillrow"><div><label>Time</label><input id="f_time" placeholder="e.g. 4:15PM" value="' + esc(MSG.time) + '"></div><div><label>Price</label><input id="f_price" inputmode="numeric" placeholder="e.g. 250" value="' + esc(MSG.price) + '"></div><div><label>Meetup spot</label><input id="f_spot" value="' + esc(vals.spot) + '"></div></div></div>';
    C.LIB.forEach(function (g) {
      html += '<h2>' + esc(g.group) + '</h2>';
      g.items.forEach(function (it) {
        var miss = C.missing(it, vals), text = C.fill(it.t, vals);
        html += '<div class="msg"><div class="msgtext">' + esc(text) + '</div>' + (it.note ? '<div class="muted msgnote">' + esc(it.note) + '</div>' : '') + '<div class="acts">' + (miss.length ? '<button type="button" class="small" disabled>Fill in ' + esc(miss.join(' and ')) + ' first</button>' : copyBtn(text)) + '</div></div>';
      });
    });
    html += '<div class="card" style="margin-top:16px"><b>Faster on your phone</b><div class="muted">Set up iPhone keyboard shortcuts so you can type a short code and the whole message appears.</div><div class="gap"></div><button type="button" class="secondary small" id="keys">Set up keyboard shortcuts</button></div>';
    html += '<div class="card" style="margin-top:16px"><b>Something not here?</b><div class="muted">Scam, deposit, shipping, a seller who is rude, or a price question. Text Ethan.</div><div class="gap"></div><div class="acts">' + (ethanPhone() ? '<a class="btnlink small" href="' + textEthan('') + '">💬 Text Ethan</a>' : '') + '<button type="button" class="secondary small" id="rules">Rules and when to text Ethan</button></div></div>';
    shell(html); bindCopy();
    function upd() { MSG.time = $('f_time').value.trim(); MSG.price = $('f_price').value.replace(/[^\d]/g, ''); MSG.spot = $('f_spot').value; }
    ['f_time', 'f_price', 'f_spot'].forEach(function (id) { var el = $(id); el.onchange = function () { upd(); VIEWS.vamsgs(); }; });
    $('rules').onclick = function () { go('varules'); };
    $('keys').onclick = function () { go('vakeys'); };
    A.renderPushCard && A.renderPushCard();
  };

  // ---------- BOOK ----------
  var BK = { day: null, time: '' };
  function parseRange(str) { var m = /(\d+)\D+(\d+)/.exec(str || ''); if (m) return { min: Math.min(+m[1], +m[2]) * 100, max: Math.max(+m[1], +m[2]) * 100 }; m = /^\s*\$?(\d+)\s*$/.exec(str || ''); return m ? { min: +m[1] * 100, max: +m[1] * 100 } : null; }
  function minutesOf(iso, tz) { var p = A.tzParts(new Date(iso).getTime(), tz); return (+p.hour % 24) * 60 + +p.minute; }
  function dayOf(iso, tz) { var p = A.tzParts(new Date(iso).getTime(), tz); return p.year + '-' + p.month + '-' + p.day; }
  function dayLabel(key, i) { return i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(key + 'T12:00:00Z').toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }); }
  VIEWS.vabook = function (id) {
    var q = quinn(); COPY = [];
    if (!q) { shell(head('Book a meetup') + '<div class="card">Quinn’s details haven’t loaded yet. Check your signal and try again in a moment.</div>'); return; }
    if (!BK.rerender) BK.draft = null; BK.rerender = false;
    var tz = q.timezone || 'Australia/Brisbane', m = id ? A.meetups().filter(function (x) { return x.id === id; })[0] : null, fill = BK.draft || (!m && BOOKFILL ? BOOKFILL : {}), dr = BK.draft || {};
    if (m && !BK.editing) { BK.editing = id; BK.day = dayOf(m.starts_at, tz); BK.time = A.toZonedInput(m.starts_at, tz).slice(11); }
    if (!m) BK.editing = null;
    var days = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return A.dayKey(i, tz); }); if (!BK.day || days.indexOf(BK.day) < 0 && !m) BK.day = days[0];
    var av = A.availFor(q, BK.day), nowMin = BK.day === days[0] ? minutesOf(new Date().toISOString(), tz) : null;
    var bookedMin = A.meetups().filter(function (x) { return x.partner_id === q.id && x.status === 'booked' && x.id !== id && dayOf(x.starts_at, tz) === BK.day; }).map(function (x) { return minutesOf(x.starts_at, tz); });
    var slots = av && av.ok ? C.suggestSlots({ window: { start: av.start, end: av.end }, booked: bookedMin, now: nowMin, n: 5 }) : [];
    var html = head(m ? 'Edit meetup' : 'Book a meetup', 'Into ' + esc(q.name) + '’s calendar. ' + esc(q.name) + ' gets an alert straight away.') + '<div class="card">' +
      '<label>Seller’s name</label><input id="sn" autocomplete="off" value="' + esc(dr.name !== undefined ? dr.name : m ? m.seller_name : fill.name || '') + '">' +
      '<label>Seller’s phone number (needed to book)</label><input id="sc" type="tel" inputmode="tel" autocomplete="off" placeholder="e.g. 0412 345 678" value="' + esc(dr.phone !== undefined ? dr.phone : m ? m.seller_contact || '' : '') + '">' +
      '<label>Phone model</label><input id="sm" autocomplete="off" placeholder="e.g. iPhone 14 Pro 128GB" value="' + esc(dr.model !== undefined ? dr.model : m ? m.model : fill.model || '') + '"><div class="gap"></div><button type="button" class="link" id="pickm">Choose from the list</button><div id="mlist" hidden>' + modelChips('', 'bm') + '</div>' +
      '<label>Issues</label><textarea id="si" rows="2" placeholder="e.g. cracked screen, battery 82%">' + esc(dr.issues !== undefined ? dr.issues : m ? m.issues || '' : fill.issues || '') + '</textarea>' +
      '<label>Price you told them ($)</label><input id="sq" inputmode="text" placeholder="e.g. 230-290, or one number if agreed" value="' + esc(dr.quote !== undefined ? dr.quote : m ? (m.quoted_min_cents === m.quoted_max_cents ? m.quoted_min_cents / 100 : m.quoted_min_cents / 100 + '-' + m.quoted_max_cents / 100) : fill.quote || '') + '">' +
      '<label>Day</label><div class="chips">' + days.map(function (k, i) { return '<button type="button" class="chip' + (k === BK.day ? ' on' : '') + '" data-day="' + k + '">' + esc(dayLabel(k, i)) + '</button>'; }).join('') + '</div>' +
      '<div class="hint" id="avline">' + (av ? (av.ok ? '<span style="color:var(--green)">✓ ' + esc(q.name) + ' is free ' + esc(av.text) + '</span>' : '<span style="color:var(--amber)">⚠ ' + esc(q.name) + ' is not available this day</span>') : '<span class="muted">' + esc(q.name) + ' hasn’t said when he is free this day.</span>') + '</div>' +
      (slots.length ? '<label>Suggested times</label><div class="chips">' + slots.map(function (t) { var v = (t < 600 ? '0' : '') + Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60); return '<button type="button" class="chip' + (BK.time === v ? ' on' : '') + '" data-time="' + v + '">' + C.clock(t) + '</button>'; }).join('') + '</div>' : '') +
      '<label>Or pick a time</label><input id="st" type="time" value="' + esc(BK.time) + '">' +
      '<label>Where?</label><input id="sl" autocomplete="off" placeholder="Meetup spot" value="' + esc(dr.loc !== undefined ? dr.loc : m ? m.location || '' : q.meet_location || '') + '">' +
      '<label>Note for ' + esc(q.name) + ' (optional)</label><textarea id="sx" rows="2">' + esc(dr.notes !== undefined ? dr.notes : m ? m.notes || '' : '') + '</textarea>' +
      '<div class="err" id="err"></div></div><button id="save">' + (m ? 'Save changes' : 'Book it') + '</button><div class="gap"></div><button class="secondary" id="cancel">Cancel</button>';
    shell(html);
    all('[data-day]').forEach(function (b) { b.onclick = function () { keepFields(); BK.day = b.getAttribute('data-day'); BK.time = ''; VIEWS.vabook(id); }; });
    all('[data-time]').forEach(function (b) { b.onclick = function () { keepFields(); BK.time = b.getAttribute('data-time'); VIEWS.vabook(id); }; });
    $('pickm').onclick = function () { var l = $('mlist'); l.hidden = !l.hidden; };
    all('[data-bm]').forEach(function (b) { b.onclick = function () { var x = modelByCode(b.getAttribute('data-bm')); $('sm').value = x.name; $('mlist').hidden = true; }; });
    $('st').onchange = function () { BK.time = $('st').value; };
    $('st').oninput = function () { BK.time = $('st').value; };
    function keepFields() { BK.draft = { name: $('sn').value, phone: $('sc').value, model: $('sm').value, issues: $('si').value, quote: $('sq').value, loc: $('sl').value, notes: $('sx').value }; BK.rerender = true; }
    $('cancel').onclick = function () { BOOKFILL = null; BK.editing = null; BK.draft = null; go('vameetups'); };
    $('save').onclick = async function () {
      BK.time = $('st').value || BK.time;
      var rng = parseRange($('sq').value), err = '', when = BK.time ? A.zonedToUtc(BK.day + 'T' + BK.time, tz) : null;
      if (!$('sn').value.trim()) err = 'Enter the seller’s name.';
      else if (String($('sc').value).replace(/\D/g, '').length < 8) err = 'Enter the seller’s phone number. A meetup can’t be booked without it.';
      else if (!$('sm').value.trim()) err = 'Enter the phone model.';
      else if (!rng) err = 'Enter the price, like 230-290.';
      else if (!when || isNaN(when)) err = 'Pick a day and a time.';
      else if (!$('sl').value.trim()) err = 'Enter where they’re meeting.';
      else if (!navigator.onLine) err = 'You need signal to book.';
      if (err) { $('err').textContent = err; return; }
      var mins = BK.time.split(':'); mins = +mins[0] * 60 + +mins[1];
      var outside = !av || !av.ok || mins < av.start || mins + 15 > av.end;
      if (outside && !confirm((!av ? q.name + ' hasn’t said when he is free that day. ' : 'That’s outside ' + q.name + '’s free times (' + (av.text || 'not available') + '). ') + 'Check with him first. Book it anyway?')) return;
      var clash = bookedMin.some(function (b) { return Math.abs(b - mins) < 30; });
      if (clash && !confirm('That’s within 30 minutes of another meetup that day. Book it anyway?')) return;
      $('save').disabled = true;
      var fields = { seller_name: $('sn').value.trim(), seller_contact: $('sc').value.trim(), model: $('sm').value.trim(), issues: $('si').value.trim() || null, quoted_min_cents: rng.min, quoted_max_cents: rng.max, starts_at: when.toISOString(), location: $('sl').value.trim(), notes: $('sx').value.trim() || null };
      var sb = A.sb(), r = m ? await sb.from('partner_meetups').update(fields).eq('id', id).select('id') : await sb.from('partner_meetups').insert(Object.assign({ id: A.uuid(), partner_id: q.id, status: 'booked' }, fields));
      if (r.error) { $('err').textContent = 'Couldn’t save: ' + r.error.message; $('save').disabled = false; return; }
      // a lead that was waiting for a follow-up is now booked
      var nm = fields.seller_name.toLowerCase();
      var lead = leads.filter(function (l) { return (l.status === 'quoted' || l.status === 'followed_up' || l.status === 'replied') && (nm.indexOf(String(l.label).toLowerCase()) > -1 || String(l.label).toLowerCase().indexOf(nm) > -1); })[0];
      if (lead) { await sb.from('va_leads').update({ status: 'booked', updated_at: new Date().toISOString() }).eq('id', lead.id); lead.status = 'booked'; A.save('valeads', leads); }
      BOOKFILL = null; BK.editing = null; BK.draft = null; await A.refreshPhones(); go('vabooked', { fields: fields, tz: tz, qname: q.name });
    };
  };
  VIEWS.vabooked = function (arg) {
    COPY = []; var f = arg.fields, when = new Date(f.starts_at);
    var day = new Date(f.starts_at).toLocaleDateString('en-AU', { timeZone: arg.tz, weekday: 'long' }), clock = when.toLocaleTimeString('en-AU', { timeZone: arg.tz, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toUpperCase();
    var mine = 'easy as booked in see you then', draft = 'Booked in for ' + day + ' at ' + clock + ' at ' + f.location + '. ' + arg.qname + ' will be meeting you and will text you before. Any problems just let me know.';
    shell(head('Booked ✓') + '<div class="card"><b>' + esc(f.seller_name) + '</b> · ' + esc(f.model) + '<div class="muted">' + esc(day + ' ' + clock) + ' · ' + esc(f.location) + '</div><div class="muted">' + esc(arg.qname) + ' has been alerted.</div></div><h2>Tell the seller</h2>' +
      msgCard(mine, 'Ethan’s confirmation.') + msgCard(draft, 'DRAFT: includes who is meeting them. Ethan has not set this wording yet.') +
      '<div class="gap"></div><button id="next">Back to Price</button><div class="gap"></div><button class="secondary" id="mt">See Meetups</button>');
    bindCopy(); $('next').onclick = function () { P = { model: '', storage: null, faults: {}, asked: '', label: '', tone: P.tone }; saveP(); go('vaprice'); }; $('mt').onclick = function () { go('vameetups'); };
  };

  // ---------- FOLLOW-UPS ----------
  var FU = 'Hey, just following up with you if you’re still looking to sell your iPhone?', CLOSE = 'No worries at all, do let me know the second you want to get some cash for it and can book you in. Cheers';
  async function setLead(l, status, extra) {
    var patch = Object.assign({ status: status, updated_at: new Date().toISOString() }, extra || {});
    var r = await A.sb().from('va_leads').update(patch).eq('id', l.id); if (r.error) { alert('Couldn’t save: ' + r.error.message); return; }
    Object.assign(l, patch); A.save('valeads', leads); VIEWS.vafollow();
  }
  function leadCard(l, due) {
    var acts = '';
    if (l.status === 'quoted' || l.status === 'followed_up') acts += (l.status === 'quoted' ? copyBtn(FU, 'Copy follow-up') : copyBtn(CLOSE, 'Copy close-out')) + (l.status === 'quoted' ? '<button type="button" class="secondary small" data-lead="followed_up" data-id="' + l.id + '">I sent it</button>' : '') + '<button type="button" class="secondary small" data-lead="replied" data-id="' + l.id + '">They replied: cancel reminder</button><button type="button" class="secondary small" data-lead="booked" data-id="' + l.id + '">Booked: cancel reminder</button><button type="button" class="secondary small" data-book="' + l.id + '">Book now</button><button type="button" class="secondary small" data-lead="dead" data-id="' + l.id + '">Not interested</button>';
    if (l.status === 'replied') acts += '<button type="button" class="small" data-book="' + l.id + '">Book</button><button type="button" class="secondary small" data-lead="dead" data-id="' + l.id + '">Not interested</button>';
    return '<div class="card"><div class="row between"><b>' + esc(l.label) + '</b><span class="muted">' + (l.status === 'quoted' ? (due ? '<span style="color:var(--amber)">due now</span>' : 'follow up ' + new Date(l.follow_up_due_at).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })) : l.status === 'followed_up' ? 'followed up ' + ago(l.followed_up_at || l.updated_at) : 'replied') + '</span></div><div class="muted">' + esc(l.model || '') + (l.quote_text ? ' · quoted ' + esc(l.quote_text) : '') + ' · ' + ago(l.quoted_at) + '</div>' + (l.issues ? '<div class="muted">' + esc(l.issues) + '</div>' : '') + '<div class="acts" style="margin-top:8px">' + acts + '</div></div>';
  }
  VIEWS.vafollow = function () {
    COPY = []; var due = dueLeads(), live = leads.filter(function (l) { return l.status === 'quoted' && due.indexOf(l) < 0; }), fu = leads.filter(function (l) { return l.status === 'followed_up'; }), rep = leads.filter(function (l) { return l.status === 'replied'; });
    var html = head('Follow-ups', 'One follow-up a day after the quote, only if they seem interested.');
    html += '<div class="card"><b>Add a quote you already sent</b><label>Name or username</label><input id="al" autocomplete="off"><label>Phone (optional)</label><input id="am" placeholder="e.g. iPhone 14 Pro"><label>What you quoted (optional)</label><input id="aq" placeholder="e.g. 230-290"><div class="gap"></div><button class="small" id="addl">Start 1-day follow-up</button><div class="err" id="err"></div></div>';
    html += '<h2>Due now' + (due.length ? ' (' + due.length + ')' : '') + '</h2>' + (due.length ? due.map(function (l) { return leadCard(l, true); }).join('') : '<div class="empty">Nothing due.</div>');
    if (rep.length) html += '<h2>Replied, not booked yet</h2>' + rep.map(function (l) { return leadCard(l); }).join('');
    if (live.length) html += '<h2>Reminders coming up</h2><div class="muted" style="margin:-4px 2px 10px">They got back to you, or you booked them already? Tap <b>They replied</b> or <b>Booked</b> and the reminder is cancelled.</div>' + live.map(function (l) { return leadCard(l); }).join('');
    if (fu.length) html += '<h2>Followed up</h2>' + fu.map(function (l) { return leadCard(l); }).join('');
    shell(html); bindCopy(); A.renderPushCard && A.renderPushCard();
    $('addl').onclick = async function () {
      var label = $('al').value.trim(); if (!label) { $('err').textContent = 'Type who it is.'; return; }
      var row = { id: A.uuid(), label: label, model: $('am').value.trim() || null, quote_text: $('aq').value.trim() || null }, r = await A.sb().from('va_leads').insert(row);
      if (r.error) { $('err').textContent = 'Couldn’t save: ' + r.error.message; return; }
      leads.unshift(Object.assign({ status: 'quoted', quoted_at: new Date().toISOString(), follow_up_due_at: new Date(Date.now() + 86400000).toISOString() }, row)); A.save('valeads', leads); VIEWS.vafollow();
    };
    all('[data-lead]').forEach(function (b) { b.onclick = function () { var l = leads.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0], st = b.getAttribute('data-lead'); if (l) setLead(l, st, st === 'followed_up' ? { followed_up_at: new Date().toISOString() } : null); }; });
    all('[data-book]').forEach(function (b) { b.onclick = function () { var l = leads.filter(function (x) { return x.id === b.getAttribute('data-book'); })[0]; if (!l) return; BOOKFILL = { name: l.label, model: l.model || '', issues: l.issues || '', quote: (l.quote_text || '').replace(/\$/g, '') }; go('vabook'); }; });
  };

  // ---------- MEETUPS ----------
  VIEWS.vameetups = function () {
    var q = quinn();
    shell(head((q ? q.name + '’s' : '') + ' meetups') + A.availOwnerCard() + '<button id="book">＋ Book a meetup</button>' + A.meetupSections() +
      '<div class="row" style="margin-top:18px"><span class="muted">' + esc(A.profile().name || 'Aston') + ' · ' + esc(A.versionText()) + '</span><button class="link" id="out" style="text-align:right">Log out</button></div>');
    $('book').onclick = function () { BOOKFILL = null; BK.editing = null; go('vabook'); };
    $('out').onclick = function () { A.logout(); };
    A.bindMeetupActions(); A.renderPushCard && A.renderPushCard();
  };

  // ---------- GUIDE ----------
  VIEWS.vahelp = function () {
    COPY = []; var link = location.origin + location.pathname.replace(/[^/]*$/, '') + 'va.html';
    var sec = function (t, body) { return '<div class="card"><b>' + esc(t) + '</b><div class="howto">' + body + '</div></div>'; };
    shell(head('Guide', 'Everything you need to get set up. Nothing here is permanent: tick things off on the first page when you are done.') +
      '<div class="card"><b>Your link</b><div class="muted" style="margin:4px 0 8px;overflow-wrap:anywhere">' + esc(link) + '</div>' + copyBtn(link, 'Copy link') + '</div>' +
      '<h2>On your laptop <span class="muted" style="text-transform:none;letter-spacing:0">(ignore this part on an iPhone)</span></h2>' +
      sec('1. Bookmark it', '<ol><li>Open the link above in your browser.</li><li>Press <b>Cmd + D</b> on a Mac (<b>Ctrl + D</b> on Windows) and click <b>Done</b>.</li><li>To see it all the time, show the bookmarks bar: <b>Cmd + Shift + B</b> (Ctrl + Shift + B on Windows) in Chrome, or <b>View, Show Favorites Bar</b> in Safari.</li></ol>') +
      sec('2. Open it automatically when you start your browser', '<div class="muted" style="margin-bottom:6px"><b>Chrome:</b></div><ol><li>Click the three dots at the top right, then <b>Settings</b>.</li><li>Click <b>On startup</b>, choose <b>Open a specific page or set of pages</b>.</li><li>Click <b>Add a new page</b>, paste your link, and click <b>Add</b>.</li></ol><div class="muted" style="margin:8px 0 6px"><b>Safari:</b></div><ol><li>Open the link, then <b>Safari, Settings, General</b>.</li><li>Click <b>Set to Current Page</b> next to Homepage.</li><li>Set <b>New windows open with</b> to <b>Homepage</b>.</li></ol>') +
      sec('3. Optional: keep it as its own tab', '<ol><li>Right-click the tab and choose <b>Pin tab</b> (Chrome) so it never gets lost.</li><li>On a Mac in Safari you can also use <b>File, Add to Dock</b>. That also makes alerts work like a normal app.</li></ol>') +
      '<h2>On your iPhone</h2>' +
      sec('Add it to your Home Screen', '<ol><li>Open the link in <b>Safari</b>.</li><li>Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li><li>Open it from the icon from now on, then tap <b>Turn on alerts</b> in the box on the first page.</li></ol>') +
      '<h2>Both</h2>' +
      sec('Keyboard shortcuts', '<div class="muted">Type a short code and the whole message appears, in any app including Business Suite.</div><div class="gap"></div><button type="button" class="secondary small" id="gokeys">Set up keyboard shortcuts</button>') +
      sec('A normal chat', '<ol><li>Business Suite on one side, this app on the other.</li><li><b>Price</b>: pick the model, tap the faults, pick a tone, tap <b>Copy</b>, paste it in the chat.</li><li>If they are quiet, tap <b>Start 1-day follow-up</b> so you are reminded tomorrow.</li><li>Get their number, then <b>Book</b> into Quinn’s calendar.</li></ol>') +
      '<div class="gap"></div><button id="back">Back to Price</button>');
    bindCopy(); $('gokeys').onclick = function () { go('vakeys'); }; $('back').onclick = function () { go('vaprice'); };
  };

  // ---------- KEYBOARD SHORTCUTS (iPhone / Mac text replacement) ----------
  VIEWS.vakeys = function () {
    COPY = [];
    var html = head('Keyboard shortcuts', 'Type the short code, tap space, and the whole message appears. Works in any app, including Business Suite.') +
      '<div class="card"><b>Set it up once (iPhone)</b><div class="muted" style="margin-top:6px">1. Open <b>Settings</b>, <b>General</b>, <b>Keyboard</b>, <b>Text Replacement</b>.<br>2. Tap the <b>+</b> at the top right.<br>3. Paste the message into <b>Phrase</b> and the code into <b>Shortcut</b>, then tap <b>Save</b>.</div><div class="muted" style="margin-top:10px">On a Mac: <b>System Settings</b>, <b>Keyboard</b>, <b>Text Replacements</b>. If iCloud is on, one device sets both.</div></div>' +
      '<div class="muted" style="margin:10px 2px">The price quote still comes from the Price tab, because it changes with every phone.</div>';
    C.KEYS.forEach(function (k) {
      html += '<div class="msg"><div class="muted msgnote" style="margin:0 0 6px">Shortcut: <b style="color:var(--text)">' + esc(k[0]) + '</b></div><div class="msgtext">' + esc(k[1]) + '</div><div class="acts">' + copyBtn(k[1], 'Copy phrase') + copyBtn(k[0], 'Copy shortcut', 'secondary small') + '</div></div>';
    });
    html += '<div class="gap"></div><button class="secondary" id="back">Back to Messages</button>';
    shell(html); bindCopy(); $('back').onclick = function () { go('vamsgs'); };
  };

  // ---------- RULES ----------
  VIEWS.varules = function () {
    var t = ethanPhone(), q = quinn();
    var rule = function (h, p) { return '<div class="card"><b>' + esc(h) + '</b><div class="muted" style="margin-top:4px">' + esc(p) + '</div></div>'; };
    shell(head('Rules and when to text Ethan') +
      '<h2>Before you book</h2>' +
      rule('Reply within 5 minutes', 'Ethan wants a reply inside 5 minutes, 99.67% of the time. Fast first replies win the seller.') +
      rule('Always get the seller’s phone number', 'You can’t book without it. ' + (q ? q.name : 'Quinn') + ' texts them an hour before and when he arrives.') +
      rule('It has to turn on', 'If it does not turn on, do not book. Use “Unfortunately will need it to turn on.”') +
      rule('Mainly iPhone 13 and above', 'The ads say 12 and up, but Ethan is mainly buying 13s and above. Older models only if the price table gives a price.') +
      rule('Stay inside the price table', 'Never go above “Most you can say”. If a seller wants more, offer the most, then text Ethan only if they will not move.') +
      '<h2>Booking</h2>' +
      rule('Only ' + (q ? q.name : 'Quinn') + '’s calendar', 'Times come from the free times he sets in the app. If a seller needs a time outside them, text ' + (q ? q.name : 'Quinn') + ' to ask first.') +
      rule('One spot', 'Everyone meets at the meetup spot on the Book screen. If a seller asks for somewhere else, use the “all my customers come to me” message and offer another time.') +
      rule('The price only changes in person', (q ? q.name : 'Quinn') + ' checks the phone at the meetup. The price can only go down if he finds something wrong that the seller did not say.') +
      '<h2>Follow-ups</h2>' +
      rule('One follow-up, one day later', 'Only if they seem interested and have not replied. The Follow-ups tab reminds you. After that, let it go.') +
      '<h2>Text Ethan if</h2>' +
      rule('Something is not covered', 'A scam or a deposit request, shipping, a seller who is rude or threatening, a model with no price, or anything you are not sure about. He said you will be fine, so it is only when needed.') +
      rule('Keep it private', 'The price table and these rules are for you only. Do not send screenshots of them to sellers.') +
      (t ? '<a class="btnlink green" href="' + textEthan('') + '" style="margin-top:12px">💬 Text Ethan</a>' : '') + '<div class="gap"></div><button class="secondary" id="back">Back to Messages</button>');
    $('back').onclick = function () { go('vamsgs'); };
  };

  window.VA = { refresh: refresh, tabs: tabs };
})();
