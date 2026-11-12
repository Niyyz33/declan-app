(function () {
  'use strict';
  // No zoom, ever: block double-tap and pinch zoom. Cancelling a double-tap would also swallow the second tap's click,
  // so for buttons/links/chips we send that click ourselves — fast taps on + and − all still count.
  (function () {
    var last = 0, sx = 0, sy = 0;
    document.addEventListener('touchstart', function (e) { var t = e.touches[0]; if (t) { sx = t.clientX; sy = t.clientY; } }, { passive: true });
    document.addEventListener('touchend', function (e) {
      var now = Date.now(), t = e.changedTouches[0], moved = t && (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10);
      var isField = e.target && e.target.closest && e.target.closest('input, textarea, select');
      if (!moved && !isField && now - last <= 400 && e.touches.length === 0) {
        e.preventDefault();
        var hit = e.target && e.target.closest ? e.target.closest('button, a, label, .chip, .tab') : null;
        if (hit && !hit.disabled) hit.click();
      }
      last = now;
    }, { passive: false });
    ['gesturestart', 'gesturechange'].forEach(function (g) { document.addEventListener(g, function (e) { e.preventDefault(); }); });
  })();
  var D = window.Deductions;
  var $app = document.getElementById('app');
  var $banner = document.getElementById('banner');
  var $tabs = document.getElementById('tabs');
  var $actions = document.getElementById('actions');
  var sb = null, session = null;
  var VERSION = (window.CONFIG && window.CONFIG.APP_VERSION) || 'dev';
  var MIN_SHIP = 5;
  var catalogue = load('catalogue', { models: [], deds: [] });
  var listPrices = load('listprices', []);
  var onb = load('onb', { items: [], progress: [] });
  var onbOpen = false;
  var onbMyOpen = load('onbopen', false);
  var avail = load('avail', []);
  var serverPhones = load('phones', []);
  var serverBatches = load('batches', []);
  var queue = load('queue', []);
  var agreementRows = load('agreements', []);
  var profile = load('profile', { name: '', role: '', price_city: 'townsville', city_name: '', timezone: '', calendar_token: '', signed_off_at: null, avail_on: false, avail_start: null, avail_end: null, meet: '', ship: {}, tested: null });
  var meetups = load('meetups', []);
  var payments = load('payments', []);
  var ownerData = load('ownerdata', { ff: [], bands: [], settings: {}, valuations: [] });
  var S = window.Statement;
  var partnersList = load('partners', []);
  var settings = load('settings', {});
  var lastSync = load('lastsync', null);
  var draft = load('draft', null);

  // ---------- helpers ----------
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem('declan_' + k)); return v === null || v === undefined ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { if (v === null) localStorage.removeItem('declan_' + k); else localStorage.setItem('declan_' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(c) { return (c < 0 ? '−' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-AU', { minimumFractionDigits: Math.abs(c) % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }); }
  function storageText(gb) { return gb >= 1024 && gb % 1024 === 0 ? (gb / 1024) + 'TB' : gb + 'GB'; }
  function uuid() { return (crypto.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  function isNetworkError(e) { return !navigator.onLine || /fetch|network|load failed|timeout/i.test((e && e.message) || ''); }
  function $(id) { return document.getElementById(id); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function dollarsToCents(v) { var n = parseFloat(v); return isNaN(n) ? null : Math.round(n * 100); }
  // Android version of the install / alerts / calendar instructions. Only the Sydney page asks for it, and only on a phone that isn't an iPhone.
  function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isAndroidMode() { return !!(window.BRAND && window.BRAND.platform === 'android') && !isIOS(); }
  var installPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installPrompt = e; });
  // sms: links put the message after "?" on Android and after "&" on iPhone.
  function smsTo(n, body) { return 'sms:' + n + (body ? (isAndroidMode() ? '?' : '&') + 'body=' + encodeURIComponent(body) : ''); }
  function isStandalone() { return !!(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)); }
  function fmtDate(iso) { var d = new Date(iso); return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }); }
  function persistDraft() { save('draft', draft); }
  // On logout, forget the previous person's saved data so the next login on this phone starts clean.
  function clearCaches() { ['profile', 'phones', 'batches', 'meetups', 'settings', 'partners', 'lastsync', 'payments', 'ownerdata', 'listprices', 'pushhtml', 'onb', 'avail', 'agreements'].forEach(function (k) { save(k, null); }); agreementRows = []; listPrices = []; pushHtml = ''; onb = { items: [], progress: [] }; avail = []; profile = { name: '', role: '', price_city: 'townsville', city_name: '', timezone: '', calendar_token: '' }; serverPhones = []; serverBatches = []; payments = []; ownerData = { ff: [], bands: [], settings: {}, valuations: [] }; meetups = []; settings = {}; partnersList = []; lastSync = null; }
  // The version stamp is year.month.day.hhmm (e.g. 2026.11.03.2013) — show it as a plain "Updated 3 Nov, 8:13 pm".
  function versionText(v) {
    var m = /^(\d{4})\.(\d\d)\.(\d\d)\.(\d\d)(\d\d)$/.exec(v || '');
    if (!m) return 'Test version';
    var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return 'App updated ' + d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  }
  function isOwner() { return profile.role === 'owner'; }
  // ---- what a damaged phone pays, and how close to the step-up ($30 -> $35) ----
  function feeCard() {
    if (isOwner() || !session) return '';
    var f = +settings.fee_damaged_cents, bonus = +settings.fee_bonus_cents, after = +settings.fee_bonus_after;
    if (!f) return '';
    var ords = S.monthOrdinals(allPhones()), nowK = new Date(Date.now() + 10 * 3600000), month = nowK.getUTCFullYear() + '-' + nowK.getUTCMonth(), n = 0;
    allPhones().forEach(function (p) { if (p.type === 'damaged' && ords[p.id]) { var d = new Date(new Date(p.bought_at).getTime() + 10 * 3600000); if (d.getUTCFullYear() + '-' + d.getUTCMonth() === month) n++; } });
    var line;
    if (!after || !bonus) line = 'You earn <b>' + money(f) + '</b> for every damaged phone you buy.';
    else if (n >= after) line = 'You’re past ' + after + ' this month, so every damaged phone now pays <b>' + money(bonus) + '</b> for the rest of the month.';
    else line = 'You earn <b>' + money(f) + '</b> for every damaged phone. After <b>' + after + '</b> in a month, each one pays <b>' + money(bonus) + '</b> for the rest of that month.';
    return '<div class="card"><b>Your fee</b><div style="margin-top:8px;line-height:1.4">' + line + '</div>' + (after && bonus ? '<div class="row between" style="margin-top:10px"><span class="muted">Damaged phones this month</span><b>' + (n >= after ? n + ' (past ' + after + ')' : n + ' of ' + after) + '</b></div><div class="bar" style="margin:8px 0 0"><i style="width:' + Math.min(100, Math.round(n / after * 100)) + '%"></i></div>' : '') + '</div>';
  }
  // ---- my details: where I usually meet people + the address Ethan needs for my shipping label ----
  function detailsDone() { var sh = profile.ship || {}; return !!(profile.meet && sh.name && sh.street && sh.suburb && sh.state && sh.postcode); }
  function detailsCard() {
    if (isOwner() || detailsDone()) return '';
    return '<div class="card"><b>Add your details</b><div class="muted" style="margin:6px 0 12px">Where you usually meet people, and the address Ethan needs to send your shipping label.</div><button id="detailsgo">Add my details</button></div>';
  }
  function viewDetails() {
    var sh = profile.ship || {}, states = ['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT'];
    shell('<h1>My details</h1><div class="card"><b>Where you usually meet people</b><label>Meeting spot</label><input id="d_meet" autocomplete="off" placeholder="e.g. Stockland Aitkenvale, food court" value="' + esc(profile.meet || '') + '"><div class="hint">Ethan uses this when he books your meetups. Your confirm message includes it.</div></div>' +
      '<div class="card"><b>Address for your shipping label</b><div class="muted" style="margin:4px 0 0">Ethan fills in your label from this. It’s only seen by Ethan.</div>' +
      '<label>Full name</label><input id="d_name" autocomplete="name" value="' + esc(sh.name || '') + '"><label>Phone</label><input id="d_phone" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(sh.phone || '') + '">' +
      '<label>Street address</label><input id="d_street" autocomplete="street-address" value="' + esc(sh.street || '') + '"><label>Suburb</label><input id="d_suburb" autocomplete="address-level2" value="' + esc(sh.suburb || '') + '">' +
      '<div class="row"><div><label>State</label><select id="d_state"><option value="">Choose</option>' + states.map(function (x) { return '<option' + (sh.state === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div><div><label>Postcode</label><input id="d_post" inputmode="numeric" autocomplete="postal-code" maxlength="4" value="' + esc(sh.postcode || '') + '"></div></div>' +
      '<div class="err" id="err"></div></div><button id="save">Save</button><div class="gap"></div><button class="secondary" id="cancel">Back</button>');
    $('cancel').onclick = function () { go('home'); };
    $('save').onclick = async function () {
      var v = { meet: $('d_meet').value.trim(), name: $('d_name').value.trim(), phone: $('d_phone').value.trim(), street: $('d_street').value.trim(), suburb: $('d_suburb').value.trim(), state: $('d_state').value, postcode: $('d_post').value.trim() };
      if (!v.meet) { $('err').textContent = 'Add where you usually meet people.'; return; }
      if (!v.name || !v.street || !v.suburb || !v.state || !/^\d{4}$/.test(v.postcode)) { $('err').textContent = 'Fill in your name, street, suburb, state and a 4-digit postcode.'; return; }
      if (!navigator.onLine) { $('err').textContent = 'You need signal to save this.'; return; }
      $('save').disabled = true;
      var r = await sb.rpc('set_my_details', { p_meet: v.meet, p_name: v.name, p_phone: v.phone, p_street: v.street, p_suburb: v.suburb, p_state: v.state, p_postcode: v.postcode });
      if (r.error) { $('err').textContent = 'Couldn’t save: ' + r.error.message; $('save').disabled = false; return; }
      profile = Object.assign({}, profile, { meet: v.meet, ship: { name: v.name, phone: v.phone, street: v.street, suburb: v.suburb, state: v.state, postcode: v.postcode } }); save('profile', profile);
      go('home');
    };
  }

  // ---- agreements: read it, fill in your details and sign by typing your name. Ethan can countersign. ----
  async function loadAgreements() {
    if (!sb || !session || !session.user || !navigator.onLine) return;
    try {
      var r = await sb.from('agreements').select('id,partner_id,version,body_html,details,signed_name,signed_at,owner_signed_name,owner_signed_at');
      if (r && !r.error && r.data) { agreementRows = r.data; save('agreements', agreementRows); }
    } catch (e) { /* offline */ }
  }
  function agreementFor(partnerId, version) { return agreementRows.filter(function (r) { return r.partner_id === partnerId && r.version === version; })[0] || null; }
  function myAgreement() { return profile.agreement_version && session && session.user ? agreementFor(session.user.id, profile.agreement_version) : null; }
  function fmtStamp(iso) { return new Date(iso).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function agreementCard() {
    if (isOwner() || !profile.agreement_version || !(window.AGREEMENTS || {})[profile.agreement_version]) return '';
    var row = myAgreement();
    if (row) return '<div class="card"><div class="row between"><b>📝 Your agreement</b><span class="pill sold">Signed</span></div><div class="muted" style="margin:6px 0 10px">Signed ' + esc(fmtStamp(row.signed_at)) + '.</div><button class="secondary small" id="agreego">View it</button></div>';
    return '<div class="card" style="border-color:var(--amber)"><b>📝 Sign your agreement</b><div class="muted" style="margin:6px 0 12px">Read it, fill in your details and sign here in the app. It takes two minutes.</div><button id="agreego">Read and sign</button></div>';
  }
  function copyDoc(row) {
    var d = row.details || {};
    var rows = [['Full name', d.name], ['Date of birth', d.dob], ['Address', d.address], ['Mobile', d.mobile], ['Email', d.email]].map(function (x) { return '<tr><td>' + x[0] + '</td><td>' + esc(x[1] || '') + '</td></tr>'; }).join('');
    var html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Trial agreement</title><style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 18px;color:#111}h3{margin:20px 0 4px}table{border-collapse:collapse;width:100%;margin:12px 0}td{border:1px solid #bbb;padding:8px}.eyebrow{letter-spacing:.12em;text-transform:uppercase;font-size:13px;color:#555}.sig{margin-top:20px;border-top:2px solid #111;padding-top:8px}@media print{body{margin:0}}</style></head><body><h1>One-week trial agreement</h1>' + row.body_html +
      '<h3>Quinn’s details</h3><table>' + rows + '</table>' +
      '<div class="sig"><b>Signed electronically by ' + esc(row.signed_name) + '</b><br>' + esc(fmtStamp(row.signed_at)) + '</div>' +
      (row.owner_signed_at ? '<div class="sig"><b>Countersigned by ' + esc(row.owner_signed_name) + '</b><br>' + esc(fmtStamp(row.owner_signed_at)) + '</div>' : '<div class="sig">Not yet countersigned by Ethan</div>') + '</body></html>';
    var url = URL.createObjectURL(new Blob([html], { type: 'text/html' })), w = window.open(url, '_blank'); if (!w) location.href = url;
  }
  function viewAgreement() {
    var A = (window.AGREEMENTS || {})[profile.agreement_version], row = myAgreement();
    if (!A) { go('home'); return; }
    if (row) {
      shell('<h1>Your agreement</h1><div class="card"><b>✓ Signed</b><div class="muted">You signed on ' + esc(fmtStamp(row.signed_at)) + '.' + (row.owner_signed_at ? ' Ethan countersigned on ' + esc(fmtStamp(row.owner_signed_at)) + '.' : ' Ethan will countersign.') + '</div></div><div class="card agree">' + row.body_html + '</div><button id="acopy">Open a copy to save or print</button><div class="gap"></div><button class="secondary" id="aback">Back</button>');
      $('acopy').onclick = function () { copyDoc(row); }; $('aback').onclick = function () { go('home'); }; return;
    }
    var sh = profile.ship || {}, email = session && session.user ? session.user.email || '' : '', addr = [sh.street, sh.suburb, sh.state, sh.postcode].filter(Boolean).join(', ');
    shell('<h1>' + esc(A.title) + '</h1><div class="card agree">' + A.html + '</div>' +
      '<div class="card"><b>Your details</b><label>Full name</label><input id="a_name" autocomplete="name" value="' + esc(sh.name || '') + '"><label>Date of birth</label><input id="a_dob" type="date"><label>Address</label><input id="a_addr" autocomplete="street-address" value="' + esc(addr) + '"><label>Mobile</label><input id="a_mob" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(sh.phone || '') + '"><label>Email</label><input id="a_email" type="email" autocomplete="email" value="' + esc(email) + '"></div>' +
      '<div class="card"><label style="display:flex;gap:10px;align-items:flex-start;color:var(--text)"><input id="a_ok" type="checkbox" style="width:24px;height:24px;flex:none"><span>I am 18 or over, I have read this agreement, and I agree to it.</span></label><label>Type your full name to sign</label><input id="a_sig" autocomplete="off"><div class="hint">Typing your name here is your electronic signature. The date and time are recorded.</div><div class="err" id="err"></div></div>' +
      '<button id="asign">Sign agreement</button><div class="gap"></div><button class="secondary" id="aback">Back</button>');
    $('aback').onclick = function () { go('home'); };
    $('asign').onclick = async function () {
      var d = { name: $('a_name').value.trim(), dob: $('a_dob').value, address: $('a_addr').value.trim(), mobile: $('a_mob').value.trim(), email: $('a_email').value.trim() }, sig = $('a_sig').value.trim();
      if (!d.name || !d.dob || !d.address || !d.mobile || !d.email) { $('err').textContent = 'Fill in all of your details.'; return; }
      if (!$('a_ok').checked) { $('err').textContent = 'Tick the box to confirm you agree.'; return; }
      if (sig.toLowerCase().replace(/\s+/g, ' ') !== d.name.toLowerCase().replace(/\s+/g, ' ')) { $('err').textContent = 'Type your full name exactly as above to sign.'; return; }
      if (!navigator.onLine) { $('err').textContent = 'You need signal to sign.'; return; }
      $('asign').disabled = true;
      var r = await sb.rpc('sign_agreement', { p_version: profile.agreement_version, p_body: A.html, p_details: d, p_name: sig, p_ua: navigator.userAgent });
      if (r.error) { $('err').textContent = 'Couldn’t sign: ' + r.error.message; $('asign').disabled = false; return; }
      await loadAgreements(); go('agreement');
    };
  }
  function agreementOwnerCard() {
    var v = viewingPartner(); if (!v || !v.agreement_version) return '';
    var row = agreementFor(v.id, v.agreement_version);
    if (!row) return '<div class="card"><b>📝 ' + esc(v.name) + '’s agreement</b><div class="muted" style="margin-top:4px">Not signed yet. They sign it in their app (a card on Home).</div></div>';
    return '<div class="card"><div class="row between"><b>📝 ' + esc(v.name) + '’s agreement</b><span class="pill sold">Signed</span></div><div class="muted" style="margin:6px 0 10px">' + esc(row.signed_name) + ' signed ' + esc(fmtStamp(row.signed_at)) + '.' + (row.owner_signed_at ? ' You countersigned ' + esc(fmtStamp(row.owner_signed_at)) + '.' : ' Not countersigned yet.') + '</div><div class="row" style="gap:8px">' + (row.owner_signed_at ? '' : '<button class="small" data-acounter="' + row.id + '">Countersign</button>') + '<button class="secondary small" data-acopy="' + row.id + '">View signed copy</button></div></div>';
  }
  function bindAgreementsOwner() {
    [].forEach.call(document.querySelectorAll('[data-acopy]'), function (b) { b.onclick = function () { var r = agreementRows.filter(function (x) { return x.id === b.getAttribute('data-acopy'); })[0]; if (r) copyDoc(r); }; });
    [].forEach.call(document.querySelectorAll('[data-acounter]'), function (b) {
      b.onclick = async function () {
        var nm = window.prompt('Type your full name to countersign', 'Ethan Lancuba'); if (!nm || nm.trim().length < 3) return;
        b.disabled = true; var r = await sb.rpc('countersign_agreement', { p_id: b.getAttribute('data-acounter'), p_name: nm }); if (r.error) { alert('Couldn’t countersign: ' + r.error.message); b.disabled = false; return; }
        await loadAgreements(); go('omeetups', undefined, true);
      };
    });
  }
  // ---- one-time "send me a test alert" (hides for good once he says it arrived) ----
  var testState = '';
  function testCard() {
    if (isOwner() || profile.tested || !(window.CONFIG && window.CONFIG.VAPID_PUBLIC_KEY) || !('Notification' in window) || Notification.permission !== 'granted') return '';
    if (testState === 'sent') return '<div class="card"><b>Did the alert arrive?</b><div class="muted" style="margin:6px 0 12px">It should have buzzed your phone just now.</div><div class="row" style="gap:8px"><button id="testyes">Yes, it arrived</button><button class="secondary" id="testno">No</button></div></div>';
    if (testState === 'no') return '<div class="card"><b>Let’s fix that</b><div class="muted" style="margin:6px 0 12px">' + (isAndroidMode() ? 'Open the app from its <b>icon on your home screen</b>, not from Chrome. Then press and hold the icon, tap <b>App info</b> › <b>Notifications</b> and make sure they are on, and Do Not Disturb is off. Then try again.' : 'Open the app from its <b>Home Screen icon</b>, not Safari. Then check Settings › Notifications › Cash for Phones is on, and Focus or Do Not Disturb is off. Then try again.') + '</div><button id="testgo">Send another test</button></div>';
    return '<div class="card"><b>Check your alerts</b><div class="muted" style="margin:6px 0 12px">Send yourself one test alert. You only need to do this once.</div><button id="testgo">Send me a test alert</button><div class="err" id="testerr"></div></div>';
  }
  function bindTest() {
    if ($('testgo')) $('testgo').onclick = async function () {
      this.disabled = true; var r = await sb.functions.invoke('push-test');
      if (r.error || !r.data || !r.data.sent) { if ($('testerr')) $('testerr').textContent = 'No alert was sent. Turn alerts on first (Meetups tab), then try again.'; this.disabled = false; return; }
      testState = 'sent'; go('home', undefined, true);
    };
    if ($('testyes')) $('testyes').onclick = async function () { await sb.rpc('confirm_alerts_tested'); profile = Object.assign({}, profile, { tested: new Date().toISOString() }); save('profile', profile); testState = ''; go('home', undefined, true); };
    if ($('testno')) $('testno').onclick = function () { testState = 'no'; go('home', undefined, true); };
  }
  // ---- availability: Declan says when he's free each day; Ethan books meetups into those times ----
  function pTz(pid) { return partnerTz(pid) || 'Australia/Brisbane'; }
  function dayKey(offset, tz) { return new Date(Date.now() + (offset || 0) * 86400000).toLocaleDateString('en-CA', { timeZone: tz || profile.timezone || 'Australia/Brisbane' }); }
  function hmText(min) { var h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'pm' : 'am', h12 = h % 12 === 0 ? 12 : h % 12; return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap; }
  function hmInput(min) { return (Math.floor(min / 60) < 10 ? '0' : '') + Math.floor(min / 60) + ':' + (min % 60 < 10 ? '0' : '') + (min % 60); }
  function inputMin(v) { var m = /^(\d{1,2}):(\d{2})/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : null; }
  // what a partner has for one day: their own entry, else "same time every day" if it's on, else nothing
  function availFor(p, day) {
    var row = avail.filter(function (r) { return r.partner_id === p.id && r.day === day; })[0];
    if (row) return row.available ? { text: hmText(row.start_min) + ' – ' + hmText(row.end_min), start: row.start_min, end: row.end_min, ok: true } : { text: 'Not available', ok: false };
    if (p.default_avail_enabled || p.avail_on) { var st = p.default_avail_start_min != null ? p.default_avail_start_min : p.avail_start, en = p.default_avail_end_min != null ? p.default_avail_end_min : p.avail_end; if (st != null) return { text: hmText(st) + ' – ' + hmText(en) + ' (every day)', start: st, end: en, ok: true }; }
    return null;
  }
  function myPartner() { return { id: session && session.user && session.user.id, avail_on: profile.avail_on, avail_start: profile.avail_start, avail_end: profile.avail_end }; }
  async function loadAvailability() {
    if (!sb || !session || !navigator.onLine) return;
    try {
      var r = await sb.from('partner_availability').select('partner_id,day,available,start_min,end_min').gte('day', dayKey(-1)).order('day');
      if (r.error) return;
      var before = JSON.stringify(avail); avail = r.data; save('avail', avail);
      if (JSON.stringify(avail) !== before && ['home', 'omeetups', 'avail'].indexOf(current) > -1 && current !== 'avail' && !typingNow()) go(current, undefined, true);
    } catch (e) { /* offline */ }
  }
  function availCard() {
    if (isOwner() || !session || !session.user) return '';
    var t = availFor(myPartner(), dayKey(0)), tm = availFor(myPartner(), dayKey(1));
    return '<div class="card"><div class="row between"><b>Your times</b><button class="link fixed" id="availgo" style="width:auto">' + (t ? 'Change' : 'Set today') + '</button></div>' +
      '<div class="row between" style="margin-top:8px"><span class="muted">Today</span><b>' + (t ? esc(t.text) : '<span style="color:var(--amber)">not set yet</span>') + '</b></div>' +
      '<div class="row between" style="margin-top:6px"><span class="muted">Tomorrow</span><span>' + (tm ? esc(tm.text) : 'not set') + '</span></div></div>';
  }
  function availOwnerCard() {
    var v = viewingPartner(); if (!v) return '';
    var rows = [0, 1, 2].map(function (d) { var key = dayKey(d, v.timezone), a = availFor(v, key); return '<div class="row between" style="margin-top:6px"><span class="muted">' + (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : new Date(key + 'T12:00:00Z').toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })) + '</span><b>' + (a ? esc(a.text) : '<span class="muted">not set</span>') + '</b></div>'; }).join('');
    return '<div class="card"><b>' + esc(v.name) + ' · free times</b>' + rows + '</div>';
  }
  function viewAvail() {
    var me = myPartner(), tz = profile.timezone || 'Australia/Brisbane', pick = 0;
    function draw() {
      var day = dayKey(pick), cur = availFor(me, day), row = avail.filter(function (r) { return r.partner_id === me.id && r.day === day; })[0];
      var off = row ? !row.available : false, st = cur && cur.ok ? cur.start : (profile.avail_start != null ? profile.avail_start : 16 * 60), en = cur && cur.ok ? cur.end : (profile.avail_end != null ? profile.avail_end : 20 * 60);
      shell('<h1>When are you free?</h1><div class="chips" style="margin-bottom:14px"><button type="button" class="chip' + (pick === 0 ? ' on' : '') + '" data-d="0">Today</button><button type="button" class="chip' + (pick === 1 ? ' on' : '') + '" data-d="1">Tomorrow</button></div>' +
        '<div class="card"><label class="chk"><input type="checkbox" id="av_off"' + (off ? ' checked' : '') + '><span>I’m not available this day</span></label>' +
        '<div id="av_times"' + (off ? ' style="opacity:.4"' : '') + '><label>From</label><input id="av_s" type="time" value="' + hmInput(st) + '"><label>To</label><input id="av_e" type="time" value="' + hmInput(en) + '">' +
        '<label class="chk"><input type="checkbox" id="av_all"' + (profile.avail_on ? ' checked' : '') + '><span>Use these times every day</span></label><div class="hint">You work every day at the same time? Tick this and you won’t be asked each morning.</div></div>' +
        '<div class="err" id="err"></div></div><button id="save">Save and tell Ethan</button><div class="gap"></div><button class="secondary" id="cancel">Back</button>');
      all('[data-d]').forEach(function (b) { b.onclick = function () { pick = +b.getAttribute('data-d'); draw(); }; });
      $('av_off').onchange = function () { $('av_times').style.opacity = this.checked ? '.4' : '1'; };
      $('cancel').onclick = function () { go('home'); };
      $('save').onclick = async function () {
        var s0 = inputMin($('av_s').value), e0 = inputMin($('av_e').value), isOff = $('av_off').checked, every = $('av_all').checked && !isOff;
        if (!isOff && (s0 === null || e0 === null || e0 <= s0)) { $('err').textContent = 'Pick a start time that is before the end time.'; return; }
        if (!navigator.onLine) { $('err').textContent = 'You need signal to send this to Ethan.'; return; }
        $('save').disabled = true;
        var r = await sb.from('partner_availability').upsert({ partner_id: me.id, day: day, available: !isOff, start_min: isOff ? null : s0, end_min: isOff ? null : e0 }, { onConflict: 'partner_id,day' });
        if (r.error) { $('err').textContent = 'Couldn’t save: ' + r.error.message; $('save').disabled = false; return; }
        if (!isOff && (every !== profile.avail_on || (every && (s0 !== profile.avail_start || e0 !== profile.avail_end)))) { // marking one day off never touches “every day”
          var rr = await sb.rpc('set_default_availability', { p_enabled: every, p_start: every ? s0 : null, p_end: every ? e0 : null });
          if (rr.error) { $('err').textContent = 'Saved today, but couldn’t save “every day”: ' + rr.error.message; $('save').disabled = false; return; }
          profile = Object.assign({}, profile, { avail_on: every, avail_start: every ? s0 : null, avail_end: every ? e0 : null }); save('profile', profile);
        }
        await loadAvailability(); go('home');
      };
    }
    draw();
  }
  // ---- "Start here" checklist ----
  function onbDone(pid) {
    var set = {}; onb.progress.forEach(function (r) { if (r.partner_id === pid) set[r.item_id] = 1; });
    queue.forEach(function (i) { if (i.kind === 'onb' && i.pid === pid) { if (i.done) set[i.item] = 1; else delete set[i.item]; } });
    return set;
  }
  function toggleOnb(pid, item, done) {
    queue = queue.filter(function (i) { return !(i.kind === 'onb' && i.pid === pid && i.item === item); });
    queue.push({ kind: 'onb', pid: pid, item: item, done: done }); setQueue(queue); syncQueue(); go(current, undefined, true);
  }
  function onbRows(pid, who) {
    var done = onbDone(pid);
    return onb.items.map(function (it) {
      var on = !!done[it.id];
      return '<div class="onbrow"><button type="button" class="tick' + (on ? ' on' : '') + '" data-onb="' + it.id + '" data-pid="' + pid + '" aria-label="' + esc(it.label) + (on ? ' (done)' : ' (not done)') + '">' + (on ? '✓' : '') + '</button>' +
        '<div class="onbtext"><b>' + esc(it.label) + '</b><div class="muted">' + esc(it.detail || '') + '</div></div>' + (it.link && who === 'partner' ? '<a class="onblink" href="' + esc(it.link) + '">Open</a>' : '') + '</div>';
    }).join('');
  }
  function onbCount(pid) { var d = onbDone(pid); return onb.items.filter(function (it) { return d[it.id]; }).length; }
  function bindOnb() { all('[data-onb]').forEach(function (b) { b.onclick = function () { var pid = b.getAttribute('data-pid'), id = b.getAttribute('data-onb'); toggleOnb(pid, id, !onbDone(pid)[id]); }; }); }
  // for Declan / Quinn: top of Home
  function onbCard() {
    if (!settings.guides_published || !onb.items.length || !session || !session.user) return '';
    var pid = session.user.id, n = onbCount(pid), total = onb.items.length, signed = profile.signed_off_at, done = onbDone(pid);
    if (n === total && signed) return '<div class="card"><div class="row between"><b>✓ Start here</b><span class="muted">All done · signed off by Ethan</span></div></div>';
    var next = onb.items.filter(function (it) { return !done[it.id]; })[0];
    return '<div class="card"><div class="row between"><b>Start here</b><button class="link fixed" id="onbmytoggle" style="width:auto">' + (onbMyOpen ? 'Hide' : 'Show steps') + '</button></div>' +
      '<div class="row between" style="margin-top:6px"><span class="muted">' + n + ' of ' + total + ' done</span></div><div class="bar" style="margin:8px 0"><i style="width:' + Math.round(n / total * 100) + '%"></i></div>' +
      (n === total ? '<div class="good" style="margin-bottom:8px"><b>All done!</b> Ethan will sign you off.</div>' : !onbMyOpen && next ? '<div class="muted">Next: <b style="color:var(--text)">' + esc(next.label) + '</b></div>' : '') +
      (onbMyOpen ? '<div class="muted" style="margin-bottom:6px">Go through these in order. Tap the circle when you’ve done one.</div>' + onbRows(pid, 'partner') : '') + '</div>';
  }
  // for Ethan: the chosen partner's progress, with a sign-off
  function onbOwnerCard() {
    var v = viewingPartner(); if (!v || !onb.items.length) return '';
    var n = onbCount(v.id), total = onb.items.length, signed = (partnerById(v.id) || {}).signed_off_at;
    return '<div class="card"><div class="row between"><b>' + esc(v.name) + ' · ' + n + ' of ' + total + ' done</b><button class="link fixed" id="onbtoggle" style="width:auto">' + (onbOpen ? 'Hide' : 'Show') + '</button></div>' +
      '<div class="bar" style="margin:10px 0"><i style="width:' + Math.round(n / total * 100) + '%"></i></div>' +
      (signed ? '<div class="good"><b>Signed off ✓</b> ' + fmtDate(signed) + '</div>' : '') +
      (onbOpen ? '<div class="muted" style="margin-bottom:6px">You can tick the practice ones for them.</div>' + onbRows(v.id, 'owner') : '') +
      '<div class="gap"></div><button class="' + (signed ? 'secondary' : '') + '" id="signoff">' + (signed ? 'Undo sign-off' : 'Sign ' + esc(v.name) + ' off') + '</button></div>';
  }
  function bindOnbOwner() {
    bindOnb();
    if ($('onbtoggle')) $('onbtoggle').onclick = function () { onbOpen = !onbOpen; go(current, undefined, true); };
    if ($('signoff')) $('signoff').onclick = async function () {
      var v = viewingPartner(), cur = (partnerById(v.id) || {}).signed_off_at, val = cur ? null : new Date().toISOString();
      if (!cur && onbCount(v.id) < onb.items.length && !confirm(v.name + ' hasn’t finished the checklist yet. Sign off anyway?')) return;
      var r = await sb.from('partners').update({ signed_off_at: val }).eq('id', v.id).select('id');
      if (r.error || !(r.data || []).length) { alert('Couldn’t save that. Check your signal and try again.'); return; }
      partnersList = partnersList.map(function (p) { return p.id === v.id ? Object.assign({}, p, { signed_off_at: val }) : p; }); save('partners', partnersList);
      go(current, undefined, true);
    };
  }
  // ---- more than one partner (Declan in Townsville, Quinn in Melbourne, Harry in Sydney) ----
  var LOGOS = { Townsville: 'icons/logo.png', Melbourne: 'icons/logo-melbourne.png', Sydney: 'icons/logo-sydney.png' };
  function cityName() { return profile.city_name || (window.BRAND && window.BRAND.city) || 'Townsville'; }
  function logoSrc() { return LOGOS[cityName()] || 'icons/logo.png'; }
  // Each partner lives in their own city's version (own icon, name and logo): Declan on the main address, Quinn on melbourne.html.
  // If someone opens the wrong one, send them to theirs. Ethan (owner) can use either.
  function cityRedirect(path, city) {
    var m = /(^|\/)(index\.html|melbourne\.html|sydney\.html)?$/.exec(path); if (!m) return null; // only the real entry pages, never a test page
    var on = /melbourne\.html$/.test(path) ? 'Melbourne' : /sydney\.html$/.test(path) ? 'Sydney' : 'Townsville';
    var page = { Townsville: './', Melbourne: 'melbourne.html', Sydney: 'sydney.html' }[city];
    return page && on !== city ? page : null;
  }
  function routeToMyCity() { if (profile.role !== 'partner' || !profile.city_name) return; var to = cityRedirect(location.pathname, profile.city_name); if (to) location.replace(to + location.search); }
  var viewing = load('viewing', '');
  function partnerOptions() { return partnersList.filter(function (p) { return p.role === 'partner'; }); }
  function viewingPartner() { var ps = partnerOptions(); return ps.filter(function (p) { return p.id === viewing; })[0] || ps[0] || null; }
  function pn() { var v = viewingPartner(); return v ? v.name : 'Declan'; }
  function manyPartners() { return isOwner() && partnerOptions().length > 1; }
  function partnerById(id) { return partnersList.filter(function (p) { return p.id === id; })[0] || null; }
  function partnerTz(id) { var p = partnerById(id); return (p && p.timezone) || (!isOwner() && profile.timezone) || 'Australia/Brisbane'; }
  function partnerBar() {
    if (!manyPartners()) return '';
    var v = viewingPartner();
    return '<div class="chips" style="margin-bottom:14px">' + partnerOptions().map(function (p) { return '<button type="button" class="chip' + (v && v.id === p.id ? ' on' : '') + '" data-vp="' + p.id + '">' + esc(p.name) + (p.city_name ? ' · ' + esc(p.city_name) : '') + '</button>'; }).join('') + '</div>';
  }
  var PARTNER_VIEWS = ['omeetups', 'phones', 'oship', 'ostatement'];
  // Clock time in a given time zone <-> a UTC instant (Ethan books in the partner's local time, e.g. Melbourne's daylight saving)
  function tzParts(ms, tz) { var o = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).forEach(function (x) { o[x.type] = x.value; }); return o; }
  function tzOffsetMs(tz, ms) { var p = tzParts(ms, tz); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000; }
  function zonedToUtc(str, tz) { var m = str.match(/^(\d+)-(\d+)-(\d+)T(\d+):(\d+)/); if (!m) return null; var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); return new Date(guess - tzOffsetMs(tz, guess - tzOffsetMs(tz, guess))); }
  function toZonedInput(iso, tz) { var p = tzParts(new Date(iso).getTime(), tz); return p.year + '-' + p.month + '-' + p.day + 'T' + (p.hour === '24' ? '00' : p.hour) + ':' + p.minute; }
  // Recommended Facebook price for a phone: its model + storage in the city its partner sells in
  function priceFor(p) {
    var city = profile.price_city || 'townsville';
    if (isOwner()) { var pr = partnersList.filter(function (x) { return x.id === p.partner_id; })[0]; city = (pr && pr.price_city) || 'townsville'; }
    return listPrices.filter(function (x) { return x.city === city && x.model === p.model && x.storage_gb === p.storage_gb; })[0] || null;
  }
  function fmtWhen(iso, pid) {
    var d = new Date(iso), tz = isOwner() && pid ? partnerTz(pid) : undefined, o1 = { weekday: 'short', day: 'numeric', month: 'short' }, o2 = { hour: 'numeric', minute: '2-digit' };
    if (tz) { o1.timeZone = tz; o2.timeZone = tz; }
    var city = tz && tz !== Intl.DateTimeFormat().resolvedOptions().timeZone && partnerById(pid) && partnerById(pid).city_name ? ' (' + partnerById(pid).city_name + ' time)' : '';
    return d.toLocaleDateString('en-AU', o1) + ' · ' + d.toLocaleTimeString('en-AU', o2) + city;
  }
  function quoteText(min, max) { return min === max ? String(max / 100) : (min / 100) + '-' + (max / 100); }
  function mapsLink(place) { return isAndroidMode() ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place) : 'https://maps.apple.com/?q=' + encodeURIComponent(place); }
  var MEETUP_STATUS = { booked: ['bought', 'Booked'], bought: ['received', '✓ Bought'], no_sale: ['kept', 'No sale'], no_show: ['damaged', 'No show'], cancelled: ['kept', 'Cancelled'] };

  var ICON = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    list: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    doc: '<svg viewBox="0 0 24 24"><path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M14.5 3.5V7.5h4M9 12h6M9 15.5h6"/></svg>',
    box: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/></svg>'
  };

  // ---------- offline queue ----------
  function setQueue(q) { queue = q; save('queue', q); renderBanner(); }
  function renderBanner() {
    var loud = queue.filter(function (i) { return i.kind !== 'onb'; }); // checklist ticks sync quietly, no banner
    var pending = loud.filter(function (i) { return !i.failed; }).length;
    var failed = loud.filter(function (i) { return i.failed; });
    if (failed.length) { $banner.hidden = false; $banner.className = 'bad'; $banner.textContent = failed.length + (failed.length === 1 ? ' item' : ' items') + ' couldn’t be sent — tap to see why'; $banner.onclick = function () { go('issues'); }; }
    else if (pending) { $banner.hidden = false; $banner.className = ''; $banner.onclick = null; $banner.textContent = pending + ' waiting to send — sends by itself when you have signal'; }
    else { $banner.hidden = true; $banner.onclick = null; }
    var st = $('sentstatus');
    if (st) {
      if (failed.length || pending) { st.textContent = ''; }
      else if (!navigator.onLine) { st.className = 'muted'; st.textContent = 'Offline — nothing waiting'; }
      else { st.className = 'ok'; st.textContent = 'All sent ✓'; }
    }
    renderTabs();
  }
  var syncing = false;
  // The saved login is renewed hourly in the background. With no signal that renewal fails, so a
  // phone that's been offline a while must still OPEN the app (the login is still saved) and just
  // wait to send until signal returns and the renewal works.
  function hasStoredLogin() { try { var v = JSON.parse(localStorage.getItem('declan-auth')); return !!(v && v.refresh_token); } catch (e) { return false; } }
  async function liveSession() { try { var r = await sb.auth.getSession(); return r.data && r.data.session; } catch (e) { return null; } }
  async function syncQueue() {
    if (syncing || !sb || !session || !queue.length) return;
    if (!(await liveSession())) return;
    syncing = true;
    try {
      for (var i = 0; i < queue.length; i++) {
        var item = queue[i];
        if (item.failed) continue;
        var error = null;
        if (item.kind === 'phone') {
          error = (await sb.from('partner_phones').upsert(item.row, { onConflict: 'id' })).error;
        } else if (item.kind === 'batch') {
          error = (await sb.from('partner_batches').upsert(item.batch, { onConflict: 'id' })).error;
          if (!error) {
            var r = await sb.from('partner_phones').update({ batch_id: item.batch.id }).in('id', item.phoneIds).select('id');
            error = r.error;
            if (!error && (r.data || []).length < item.phoneIds.length) error = { message: 'Some phones in this shipment hadn’t saved yet. Tell Ethan.' };
          }
        } else if (item.kind === 'posted') {
          var p1 = await sb.from('partner_batches').update({ posted_at: item.at }).eq('id', item.id).select('id');
          error = p1.error;
          if (!error && !(p1.data || []).length) error = { message: 'That shipment couldn’t be updated. Tell Ethan.' };
          if (!error) error = (await sb.from('partner_phones').update({ status: 'shipped' }).eq('batch_id', item.id)).error;
        } else if (item.kind === 'edit') {
          var e1 = await sb.from('partner_phones').update(item.patch).eq('id', item.id).select('id');
          error = e1.error;
          if (!error && !(e1.data || []).length) error = { message: 'That phone can’t be changed any more (it may already be shipped).' };
        } else if (item.kind === 'meetup') {
          var m1 = await sb.from('partner_meetups').update(item.patch).eq('id', item.id).select('id');
          error = m1.error;
          if (!error && !(m1.data || []).length) error = { message: 'That meetup couldn’t be updated. Tell Ethan.' };
        } else if (item.kind === 'onb') {
          error = item.done ? (await sb.from('onboarding_progress').upsert({ partner_id: item.pid, item_id: item.item }, { onConflict: 'partner_id,item_id' })).error
            : (await sb.from('onboarding_progress').delete().eq('partner_id', item.pid).eq('item_id', item.item)).error;
        } else if (item.kind === 'delete') {
          var d1 = await sb.from('partner_phones').delete().eq('id', item.id).select('id');
          error = d1.error;
          if (!error && !(d1.data || []).length) error = { message: 'That phone can’t be deleted any more (it may already be shipped).' };
        }
        if (error) {
          if (isNetworkError(error)) break;
          if (item.kind === 'onb') { queue.splice(i, 1); i--; continue; }
          item.failed = error.message;
        } else { queue.splice(i, 1); i--; }
      }
    } catch (e) { /* network dropped mid-sync; try again later */ }
    setQueue(queue); syncing = false;
    if (navigator.onLine) refreshPhones();
  }
  var refreshing = null;
  function dataSig() { return JSON.stringify([serverPhones, serverBatches, meetups, payments, ownerData]); }
  function typingNow() { var a = document.activeElement; return !!(a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox' && a.type !== 'button'))); }
  function syncLine() { return (lastSync ? 'Synced ' + fmtDate(lastSync) + ' · ' : '') + esc(versionText(VERSION)); }
  // One refresh at a time, and the screen is only redrawn when something really changed. Before this, every refresh
  // (open, every 30 seconds, coming back to the app) rebuilt the whole screen, which made it flash and jump.
  function refreshPhones() {
    if (refreshing) return refreshing;
    refreshing = doRefreshPhones().then(function () { refreshing = null; }, function () { refreshing = null; });
    return refreshing;
  }
  async function loadOnboarding() {
    if (!sb || !session || !navigator.onLine) return;
    try {
      var it = await sb.from('onboarding_items').select('id,label,detail,link,sort_order').order('sort_order');
      var pr = await sb.from('onboarding_progress').select('partner_id,item_id');
      if (it.error || pr.error) return;
      var before = JSON.stringify(onb); onb = { items: it.data, progress: pr.data }; save('onb', onb);
      if (JSON.stringify(onb) !== before && ['home', 'omeetups'].indexOf(current) > -1 && !typingNow()) go(current, undefined, true);
    } catch (e) { /* offline */ }
  }
  async function doRefreshPhones() {
    if (!sb || !session || !navigator.onLine) return;
    loadOnboarding(); loadAvailability();
    var before = dataSig();
    try {
      var r = await sb.from('partner_phones').select('*').order('bought_at', { ascending: false }).limit(500);
      var b = await sb.from('partner_batches').select('*').order('shipped_at', { ascending: false }).limit(100);
      if (!r.error) { serverPhones = r.data; save('phones', serverPhones); lastSync = new Date().toISOString(); save('lastsync', lastSync); }
      if (b && !b.error) { serverBatches = b.data; save('batches', serverBatches); }
      if (isOwner()) {
        var pm = await sb.from('batch_payments').select('*'); if (pm && !pm.error) { payments = pm.data; save('payments', payments); }
        var ep = await sb.from('expected_prices').select('*'), cb = await sb.from('commission_bands').select('*').order('band_no'), os = await sb.from('owner_settings').select('*'), pv = await sb.from('phone_valuations').select('*');
        if (ep && !ep.error && cb && !cb.error && os && !os.error && pv && !pv.error) { var so = {}; os.data.forEach(function (x) { so[x.key] = x.value; }); ownerData = { ff: ep.data, bands: cb.data, settings: so, valuations: pv.data }; save('ownerdata', ownerData); }
      }
      var mt = await sb.from('partner_meetups').select('*').order('starts_at', { ascending: true }).limit(400);
      if (mt && !mt.error) { meetups = mt.data; save('meetups', meetups); }
      if (dataSig() === before) { var sl = $('syncline'); if (sl) sl.innerHTML = syncLine(); return; }
      if (['home', 'phones', 'ship', 'oship', 'meetups', 'omeetups', 'ostatement'].indexOf(current) > -1 && !typingNow()) go(current, undefined, true);
    } catch (e) { /* offline */ }
  }
  async function loadCatalogue() {
    if (!sb || !session || !navigator.onLine) return;
    try {
      var m = await sb.from('partner_models').select('*').order('sort_order');
      var d = await sb.from('partner_deductions').select('*').limit(2000);
      if (!m.error && !d.error && m.data.length) { catalogue = { models: m.data, deds: d.data }; save('catalogue', catalogue); }
      var lp = await sb.from('list_prices').select('model,storage_gb,city,list_cents,lowest_cents,estimate').limit(1000);
      if (lp && !lp.error && lp.data && lp.data.length) { listPrices = lp.data; save('listprices', listPrices); }
    } catch (e) { /* offline */ }
  }
  async function loadProfile() {
    if (!sb || !session || !session.user || !navigator.onLine) return;
    try {
      var p = await sb.from('partners').select('name,role,price_city,city_name,timezone,calendar_token,signed_off_at,default_avail_enabled,default_avail_start_min,default_avail_end_min,meet_location,ship_name,ship_phone,ship_street,ship_suburb,ship_state,ship_postcode,alerts_tested_at,agreement_version').eq('id', session.user.id).maybeSingle();
      var before = profile.role;
      if (p.data && p.data.name) { profile = { name: p.data.name, role: p.data.role || '', price_city: p.data.price_city || 'townsville', city_name: p.data.city_name || '', timezone: p.data.timezone || '', calendar_token: p.data.calendar_token || '', signed_off_at: p.data.signed_off_at || null, avail_on: !!p.data.default_avail_enabled, avail_start: p.data.default_avail_start_min, avail_end: p.data.default_avail_end_min, meet: p.data.meet_location || '', ship: { name: p.data.ship_name || '', phone: p.data.ship_phone || '', street: p.data.ship_street || '', suburb: p.data.ship_suburb || '', state: p.data.ship_state || '', postcode: p.data.ship_postcode || '' }, tested: p.data.alerts_tested_at || null, agreement_version: p.data.agreement_version || null }; save('profile', profile); routeToMyCity(); }
      if (before !== profile.role && current && current !== 'login') setTimeout(function () { go(isOwner() ? 'omeetups' : 'home'); }, 0);
      if (profile.role === 'owner') { var pl = await sb.from('partners').select('id,name,role,agreement_version,price_city,city_name,timezone,signed_off_at,default_avail_enabled,default_avail_start_min,default_avail_end_min,meet_location,ship_name,ship_phone,ship_street,ship_suburb,ship_state,ship_postcode'); if (pl && !pl.error) { var plBefore = JSON.stringify(partnersList); partnersList = pl.data; save('partners', partnersList); if (JSON.stringify(partnersList) !== plBefore && ['omeetups', 'phones', 'oship', 'ostatement'].indexOf(current) > -1 && !typingNow()) go(current, undefined, true); } }
      var s = await sb.from('app_settings').select('key,value');
      if (!s.error && s.data) { var o = {}; s.data.forEach(function (x) { o[x.key] = x.value; }); settings = o; save('settings', o); }
      await loadAgreements();
    } catch (e) { /* offline, or settings not set up yet */ }
  }
  // Everything Declan has, with unsent changes applied on top so the screen is always right.
  function allPhones() {
    var edits = {}, deleted = {}, requested = {}, posted = {}, ids = {}, out = [];
    queue.forEach(function (i) {
      if (i.kind === 'edit') edits[i.id] = Object.assign(edits[i.id] || {}, i.patch);
      if (i.kind === 'delete') deleted[i.id] = 1;
      if (i.kind === 'batch') i.phoneIds.forEach(function (id) { requested[id] = i.batch.id; });
      if (i.kind === 'posted') posted[i.id] = 1;
    });
    queue.forEach(function (i) { if (i.kind === 'phone') { ids[i.row.id] = 1; out.push(Object.assign({ _pending: true, _failed: !!i.failed }, i.row)); } });
    serverPhones.forEach(function (p) { if (!ids[p.id]) out.push(Object.assign({}, p)); });
    out = out.filter(function (p) { return !deleted[p.id]; }).map(function (p) {
      if (edits[p.id]) Object.assign(p, edits[p.id], { _pending: true });
      if (requested[p.id]) p.batch_id = requested[p.id];
      if (p.batch_id && posted[p.batch_id]) p.status = 'shipped';
      return p;
    });
    out = out.sort(function (a, b) { return new Date(b.bought_at) - new Date(a.bought_at); });
    if (manyPartners()) { var vp = viewingPartner(); out = out.filter(function (p) { return !p.partner_id || (vp && p.partner_id === vp.id); }); }
    return out;
  }
  // Meetups with a partner's unsent answers (bought / no sale / no show) applied on top.
  function allMeetups() {
    var patches = {};
    queue.forEach(function (i) { if (i.kind === 'meetup') patches[i.id] = Object.assign(patches[i.id] || {}, i.patch); });
    var list = meetups.map(function (m) { return patches[m.id] ? Object.assign({}, m, patches[m.id], { _pending: true }) : m; });
    if (manyPartners()) { var vp = viewingPartner(); list = list.filter(function (m) { return vp && m.partner_id === vp.id; }); }
    return list;
  }
  function readyToShip() { return allPhones().filter(function (p) { return p.type === 'damaged' && p.status === 'bought' && !p.batch_id && !p._failed; }); }
  // Where a shipment is up to: waiting (for Ethan's label) -> label (ready to post) -> posted -> received.
  function allBatches() {
    var posted = {};
    queue.forEach(function (i) { if (i.kind === 'posted') posted[i.id] = i.at; });
    var out = serverBatches.map(function (b) { return posted[b.id] && !b.posted_at ? Object.assign({}, b, { posted_at: posted[b.id], _pending: true }) : b; });
    queue.forEach(function (i) { if (i.kind === 'batch' && !out.some(function (b) { return b.id === i.batch.id; })) out.unshift(Object.assign({ _pending: true, created_at: i.batch.shipped_at }, i.batch)); });
    out = out.sort(function (a, b) { return new Date(b.created_at || b.shipped_at) - new Date(a.created_at || a.shipped_at); });
    if (manyPartners()) { var vp = viewingPartner(); out = out.filter(function (b) { return !b.partner_id || (vp && b.partner_id === vp.id); }); }
    return out;
  }
  function batchStage(b) { return b.received_at ? 'received' : b.posted_at ? 'posted' : b.label_sent_at ? 'label' : 'waiting'; }
  var STAGE_TEXT = { waiting: ['bought', '⏳ Waiting for label'], label: ['shipped', '🏷️ Label ready'], posted: ['shipped', '📦 On its way'], received: ['received', '✓ Received'] };
  function batchTracking(id) { var b = serverBatches.filter(function (x) { return x.id === id; })[0]; if (b) return b.tracking_number; var q = queue.filter(function (i) { return i.kind === 'batch' && i.batch.id === id; })[0]; return q ? q.batch.tracking_number : ''; }

  // ---------- routing ----------
  var current = '';
  var pendingReload = false;
  var VIEWS = {};
  VIEWS.avail = viewAvail;
  VIEWS.details = viewDetails; VIEWS.agreement = viewAgreement;
  function go(view, arg, keepScroll) {
    if (pendingReload && view === 'home') { location.reload(); return; }
    if (isOwner() && (view === 'home' || view === 'log')) view = 'omeetups';
    if (isOwner() && view === 'ship') view = 'oship';
    if (!isOwner() && view === 'oship') view = 'ship';
    current = view;
    if (!keepScroll) window.scrollTo(0, 0);
    var scroll = window.scrollY;
    $app.className = (view === 'log' || view === 'login') ? 'nobar' : '';
    noAnim = !!keepScroll;
    $actions.innerHTML = '';
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    document.body.classList.remove('kb');
    var typed = {};
    if (keepScroll) all('[data-trk],[data-pship],[data-parr]').forEach(function (el) { if (el.value) typed[el.outerHTML.match(/data-(trk|pship|parr)="[^"]*"/)[0]] = el.value; });
    VIEWS[view](arg);
    all('[data-trk],[data-pship],[data-parr]').forEach(function (el) { var k = el.outerHTML.match(/data-(trk|pship|parr)="[^"]*"/)[0]; if (typed[k] !== undefined) el.value = typed[k]; });
    if (keepScroll) window.scrollTo(0, scroll);
    renderTabs();
  }
  var noAnim = false;
  function shell(html) {
    if (PARTNER_VIEWS.indexOf(current) > -1 && manyPartners()) html = html.replace('</h1>', '</h1>' + partnerBar());
    $app.innerHTML = '<div class="view"' + (noAnim ? ' style="animation:none"' : '') + '>' + html + '</div>';
    all('[data-vp]').forEach(function (b) { b.onclick = function () { viewing = b.getAttribute('data-vp'); save('viewing', viewing); go(current, undefined, true); }; });
  }
  function renderTabs() {
    var hide = !session || current === 'login' || current === 'log' || current === 'edit' || current === 'sold' || current === 'fbdesc' || current === 'avail' || current === 'details' || !current;
    $tabs.hidden = hide;
    if (hide) return;
    var active = current === 'sold' || current === 'fbdesc' ? 'phones' : current === 'avail' || current === 'details' ? 'home' : current === 'orates' ? 'ostatement' : current === 'issues' || current === 'help' ? 'home' : current === 'edit' ? 'phones' : current === 'obook' ? 'obook' : current;
    var ready = readyToShip().length;
    function tab(id, label, icon, extra) { return '<button class="tab ' + id + (active === id ? ' on' : '') + '" data-tab="' + id + '">' + icon + (extra || '') + '<span>' + label + '</span></button>'; }
    if (isOwner()) {
      var waiting = allBatches().filter(function (b) { return batchStage(b) === 'waiting'; }).length;
      $tabs.innerHTML = tab('omeetups', 'Meetups', ICON.cal) + tab('obook', 'Book', ICON.plus) + tab('oship', 'Shipments', ICON.box, waiting ? '<span class="dot">' + waiting + '</span>' : '') + tab('phones', 'Phones', ICON.list) + tab('ostatement', 'Statement', ICON.doc);
    }
    else {
      var labelsReady = allBatches().filter(function (b) { return batchStage(b) === 'label'; }).length;
      var due = allMeetups().filter(function (m) { return m.status === 'booked' && new Date(m.starts_at) < new Date(); }).length;
      $tabs.innerHTML = tab('home', 'Home', ICON.home) + tab('meetups', 'Meetups', ICON.cal, due ? '<span class="dot">' + due + '</span>' : '') + tab('log', 'Log', ICON.plus) + tab('phones', 'Phones', ICON.list) +
        tab('ship', 'Ship', ICON.box, labelsReady ? '<span class="dot">' + labelsReady + '</span>' : ready >= MIN_SHIP ? '<span class="dot">' + ready + '</span>' : '');
    }
    all('[data-tab]').forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-tab')); }; });
  }

  // ---------- login ----------
  VIEWS.login = function (msg) {
    shell('<div class="brand"><img src="' + logoSrc() + '" alt="Cash for Phones ' + esc(cityName()) + '"><h1>Cash for Phones</h1><div class="sub">' + esc(cityName()) + ' partner app</div></div>' +
      installTip() +
      '<div class="card"><label>Email</label><input id="em" type="email" autocomplete="username" autocapitalize="none" autocorrect="off">' +
      '<label>Password</label><input id="pw" type="password" autocomplete="current-password"><div class="gap"></div><button id="go">Log in</button><div class="err" id="err">' + esc(msg || '') + '</div>' +
      '<div class="muted" style="margin-top:12px;text-align:center">Forgot your password? Message Ethan — he can reset it.</div></div>');
    $('go').onclick = async function () {
      $('err').textContent = ''; $('go').disabled = true;
      var r = await sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value });
      $('go').disabled = false;
      if (r.error) { $('err').textContent = navigator.onLine ? 'That email or password isn’t right.' : 'You need signal to log in the first time.'; return; }
      session = r.data.session; await afterLogin();
    };
  };
  async function afterLogin() { await Promise.all([loadCatalogue(), loadProfile()]); await refreshPhones(); await syncQueue(); go(isOwner() ? 'omeetups' : 'home'); }
  function installTip() {
    if (isStandalone() || load('hideinstall', false)) return '';
    if (isAndroidMode()) return '<div class="tip"><b>Do this first:</b> open this page in <b>Chrome</b> (not inside WhatsApp, Messenger or another app). Tap the <b>⋮</b> menu at the top right, then <b>Install app</b> (or <b>Add to Home screen</b>, then <b>Install</b>). Then open the app from its icon and log in there. That way it keeps you logged in and never loses a phone you logged.' + (installPrompt ? '<div style="margin-top:8px"><button class="small" id="doinstall" type="button">Install the app</button></div>' : '') + '<div style="margin-top:8px"><button class="link" id="hideinstall" type="button" onclick="localStorage.setItem(\'declan_hideinstall\',\'true\');this.closest(\'.tip\').remove()">Already done</button></div></div>';
    return '<div class="tip"><b>Do this first:</b> tap the Share button <b>⬆︎</b> in Safari, choose <b>Add to Home Screen</b>, then open the app from your Home Screen and log in there. That way it keeps you logged in and never loses a phone you logged.<div style="margin-top:8px"><button class="link" id="hideinstall" type="button" onclick="localStorage.setItem(\'declan_hideinstall\',\'true\');this.closest(\'.tip\').remove()">Already done</button></div></div>';
  }

  // ---------- home ----------
  VIEWS.home = function () {
    var ready = readyToShip().length;
    var inProgress = draft && draft.model;
    var name = profile.name ? 'Hey ' + esc(profile.name) : 'Hey';
    var tel = phoneForLinks();
    shell('<div class="greet"><img src="' + logoSrc() + '" alt=""><div><h1>' + name + ' 👋</h1><div id="sentstatus" style="font-weight:600;font-size:14px"></div></div></div>' +
      installTip() +
      (inProgress ? '<div class="card"><b>Phone in progress</b><div class="muted">' + esc(draft.model) + ' — saved, pick up where you left off.</div><div class="row" style="margin-top:12px"><button id="cont">Continue</button><button class="secondary" id="discard">Discard</button></div></div>' : '') +
      agreementCard() + nextMeetupCard() + '<div id="pushcard"></div>' + testCard() + detailsCard() + availCard() + feeCard() + reviewCard() + onbCard() +
      '<button id="log" style="font-size:18px;padding:18px">＋ Log a phone</button>' +
      '<h2>Ready to ship</h2><div class="card"><div class="row between"><b>' + ready + ' damaged ' + (ready === 1 ? 'phone' : 'phones') + '</b><span class="muted fixed">' + (ready >= MIN_SHIP ? 'Ready to ship!' : (MIN_SHIP - ready) + ' more to go') + '</span></div>' +
      '<div class="bar"><i style="width:' + Math.min(100, Math.round(ready / MIN_SHIP * 100)) + '%"></i></div>' +
      '<div class="muted">Ship when you have ' + MIN_SHIP + ' or more. Mint phones you keep.</div>' +
      (ready ? '<div style="height:12px"></div><button class="' + (ready >= MIN_SHIP ? '' : 'secondary') + '" id="ship">Get a shipping label</button>' : '') + '</div>' +
      (settings.guides_published ? '<a class="btnlink" href="guides.html" style="margin-bottom:12px">📖 Guides</a>' : '') +
      (tel ? '<h2>Need Ethan?</h2><div class="row"><a class="btnlink green" href="sms:' + tel + '">💬 Message Ethan</a><a class="btnlink" href="tel:' + tel + '">📞 Call</a></div>' : '') +
      '<div class="row" style="margin-top:18px"><button class="link" id="help">Rules &amp; help</button><button class="link" id="mydetails">My details</button><button class="link" id="out" style="text-align:right">Log out</button></div>' +
      '<div class="sync" id="syncline">' + syncLine() + '</div>');
    if ($('agreego')) $('agreego').onclick = function () { go('agreement'); };
    if ($('nextm')) $('nextm').onclick = function () { go('meetups'); };
    bindOnb();
    if ($('onbmytoggle')) $('onbmytoggle').onclick = function () { onbMyOpen = !onbMyOpen; save('onbopen', onbMyOpen); go('home', undefined, true); };
    if ($('availgo')) $('availgo').onclick = function () { go('avail'); };
    if ($('detailsgo')) $('detailsgo').onclick = function () { go('details'); };
    bindTest();
    renderPushCard();
    $('log').onclick = function () { go('log'); }; if ($('ship')) $('ship').onclick = function () { go('ship'); };
    if ($('cont')) $('cont').onclick = function () { go('log'); };
    if ($('discard')) $('discard').onclick = function () { if (confirm('Throw this phone away without saving?')) { draft = null; persistDraft(); go('home'); } };
    $('help').onclick = function () { go('help'); };
    $('mydetails').onclick = function () { go('details'); };
    $('out').onclick = async function () {
      if (queue.filter(function (i) { return i.kind !== 'onb'; }).length && !confirm('You have phones that haven’t sent yet. If you log out now you could lose them. Log out anyway?')) return;
      try { await sb.auth.signOut(); } catch (e) { /* offline */ }
      session = null; current = ''; clearCaches(); go('login');
    };
    renderBanner();
  };
  function phoneForLinks() { var n = (settings.ethan_phone || '').replace(/[^\d+]/g, ''); if (!n) return ''; if (n.charAt(0) === '0') n = '+61' + n.slice(1); return n; }

  VIEWS.help = function () {
    var tel = phoneForLinks();
    shell('<h1>Rules &amp; help</h1>' +
      '<div class="card"><b>The rules</b><ul class="rules">' +
      '<li>Log each phone <b>after</b> you’ve bought it — not during the sale.</li>' +
      '<li>Price paid should stay within <b>the quote minus the deductions</b>. If it goes over, the app still saves it but flags it for Ethan.</li>' +
      '<li>Battery under 85%: $50 off (iPhone 14 and below) or $70 off (15 and above). Always taken under 80%.</li>' +
      '<li>Smashed camera lens: $20 each. If the camera itself is exposed: $50 each.</li>' +
      '<li>A scratched or replaced screen counts as a broken screen.</li>' +
      '<li>Damaged phones: when you have ' + MIN_SHIP + ' or more (or Ethan says it’s OK to ship fewer), tap <b>Ship › Message Ethan for a label</b>. It opens a text to Ethan, all written out for you. He sends back the label — print it, pack the box and post it, then tap <b>I’ve posted it</b>.</li>' +
      '<li>Mint phones you keep.</li></ul></div>' +
      '<div class="card"><b>Using the app</b><ul class="rules"><li>No signal? Keep logging. Phones are saved on your phone and send by themselves.</li>' +
      '<li>Made a mistake? In <b>Phones</b>, tap <b>Edit</b> or <b>Delete</b> — only until it’s shipped.</li>' +
      '<li>If the app closes halfway through a phone, it’s saved. Open the app and tap <b>Continue</b>.</li></ul></div>' +
      (tel ? '<div class="row"><a class="btnlink green" href="sms:' + tel + '">💬 Message Ethan</a><a class="btnlink" href="tel:' + tel + '">📞 Call</a></div>' : '') +
      '<a class="btnlink" href="ship-guide.html" style="margin-top:6px">📦 How to pack &amp; post</a>' +
      '<div class="gap"></div><button class="secondary" id="back">Back</button><div class="sync">' + esc(versionText(VERSION)) + '</div>');
    $('back').onclick = function () { go('home'); };
  };

  VIEWS.issues = function () {
    var failed = queue.filter(function (i) { return i.failed; });
    shell('<h1>Couldn’t send</h1>' + (failed.length ? failed.map(function (i) {
      return '<div class="card"><b>' + esc(describe(i)) + '</b><div class="err">' + esc(i.failed) + '</div><div class="muted" style="margin-top:6px">Tell Ethan if this keeps happening.</div>' +
        '<div class="row" style="margin-top:12px"><button data-retry="' + queue.indexOf(i) + '">Try again</button><button class="danger" data-drop="' + queue.indexOf(i) + '">Delete</button></div></div>';
    }).join('') : '<div class="empty">Nothing stuck. All good ✓</div>') + '<button class="secondary" id="back">Back</button>');
    all('[data-retry]').forEach(function (b) { b.onclick = function () { delete queue[+b.getAttribute('data-retry')].failed; setQueue(queue); syncQueue(); go('home'); }; });
    all('[data-drop]').forEach(function (b) { b.onclick = function () { if (confirm('Delete this? It will not be sent.')) { queue.splice(+b.getAttribute('data-drop'), 1); setQueue(queue); go(queue.some(function (i) { return i.failed; }) ? 'issues' : 'home'); } }; });
    $('back').onclick = function () { go('home'); };
  };
  function describe(i) {
    if (i.kind === 'phone') return i.row.model + (i.row.storage_gb ? ' ' + storageText(i.row.storage_gb) : '') + ' — paid ' + money(i.row.price_paid_cents);
    if (i.kind === 'batch') return 'Label request for ' + i.phoneIds.length + ' phones';
    if (i.kind === 'posted') return 'Marking a shipment as posted';
    if (i.kind === 'edit') return 'A change to a saved phone';
    if (i.kind === 'onb') return 'A checklist tick';
    if (i.kind === 'meetup') return 'Your answer for a meetup';
    return 'Deleting a phone';
  }

  // ---------- log a phone ----------
  var STEPS = [
    { id: 'phone', title: 'The phone' }, { id: 'battery', title: 'Battery' }, { id: 'parts', title: 'Parts & service history' },
    { id: 'screen', title: 'Screen' }, { id: 'cameras', title: 'Cameras' }, { id: 'frame', title: 'Frame & back' },
    { id: 'buttons', title: 'Face ID, speaker & buttons' }, { id: 'price', title: 'Price paid' }
  ];
  function newDraft() { return { step: 0, mode: 'steps', model: '', storage: '', colour: '', colourOther: '', battery: '', batteryUnknownPart: false, partsBattery: false, faults: {}, lensesCracked: 0, lensesExposed: 0, type: '', typeTouched: false, quote: '', paid: '', notes: '', ded: {}, dedTotal: '' }; }
  function selectedFaults() { return Object.keys(draft.faults).filter(function (k) { return draft.faults[k]; }); }
  function modelRec() { return catalogue.models.filter(function (m) { return m.name === draft.model; })[0]; }
  function faultLabel(id) { return D.FAULTS.filter(function (f) { return f.id === id; })[0].label; }
  function faultChip(id) {
    var x = D.FAULTS.filter(function (z) { return z.id === id; })[0];
    return '<button type="button" class="chip bad' + (draft.faults[id] ? ' on' : '') + '" data-fault="' + id + '">' + x.label + (x.hint ? '<small>' + x.hint + '</small>' : '') + '</button>';
  }
  function genOf(name) {
    var m = /iPhone (\d+)/.exec(name);
    if (m) return { key: parseInt(m[1], 10), label: 'iPhone ' + m[1] + ' family' };
    if (/iPhone (XS|XR|X)\b/.test(name)) return { key: 10, label: 'iPhone X / XS / XR' };
    if (/Air/.test(name)) return { key: 17.5, label: 'iPhone Air' };
    return { key: 0, label: 'Other' };
  }
  function modelOptions() {
    var groups = {}, order = [];
    catalogue.models.forEach(function (m) { var g = genOf(m.name); if (!groups[g.label]) { groups[g.label] = { key: g.key, items: [] }; order.push(g.label); } groups[g.label].items.push(m); });
    order.sort(function (a, b) { return groups[b].key - groups[a].key; });
    return order.map(function (l) {
      return '<optgroup label="' + esc(l) + '">' + groups[l].items.map(function (m) { return '<option' + (m.name === draft.model ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
  }
  function stepBody(id) {
    var mr = modelRec();
    if (id === 'phone') {
      if (!catalogue.models.length) return '<div class="card"><div class="err">The phone list hasn’t loaded yet. Connect to the internet once, then reopen the app.</div></div>';
      return '<div class="card"><label>Model</label><select id="model"><option value="">Choose a model</option>' + modelOptions() + '</select>' +
        (mr ? '<label>Storage</label><div class="chips">' + mr.storage_tiers.map(function (g) { return '<button type="button" class="chip' + (String(g) === String(draft.storage) ? ' on' : '') + '" data-storage="' + g + '">' + storageText(g) + '</button>'; }).join('') + '</div>' +
          '<label>Colour</label><div class="chips">' + mr.colours.map(function (c) { return '<button type="button" class="chip' + (c === draft.colour ? ' on' : '') + '" data-colour="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') +
          '<button type="button" class="chip' + (draft.colour === '__other' ? ' on' : '') + '" data-colour="__other">Other</button></div>' +
          (draft.colour === '__other' ? '<input id="colourOther" placeholder="Type the colour" value="' + esc(draft.colourOther) + '" style="margin-top:10px">' : '') : '') + '</div>';
    }
    if (id === 'battery') return '<div class="card"><label>Battery health % (Settings › Battery)</label><input id="battery" type="number" inputmode="numeric" min="1" max="100" value="' + esc(draft.battery) + '" placeholder="e.g. 87">' +
      '<div class="gap"></div><div class="chips"><button type="button" class="chip bad' + (draft.batteryUnknownPart ? ' on' : '') + '" id="bunk">It says “Unknown part”<small>Counts as a third-party battery</small></button></div></div>' +
      '<button type="button" class="secondary" id="perfect">Everything else is perfect → go to price</button>';
    if (id === 'parts') return '<div class="card"><div class="chips">' + faultChip('screen_third_party') +
      '<button type="button" class="chip bad' + (draft.partsBattery ? ' on' : '') + '" id="pbat">Replaced / third-party battery</button>' + faultChip('parts_other') + '</div><div class="hint">Look under Settings › General › About › Parts and Service History. Tap nothing if it’s all genuine.</div></div>';
    if (id === 'screen') return '<div class="card"><div class="chips">' + faultChip('screen_scratched') + faultChip('screen_broken') + '</div><div class="hint">Check under the light. A scratched or replaced screen counts as a broken screen.</div></div>';
    if (id === 'cameras') return '<div class="card"><div class="row" style="flex-wrap:wrap"><div style="min-width:150px"><label>Smashed lenses</label><div class="stepper"><button type="button" data-lens="lc" data-d="-1">−</button><b id="lcv">' + draft.lensesCracked + '</b><button type="button" data-lens="lc" data-d="1">＋</button></div></div>' +
      '<div style="min-width:150px"><label>Camera exposed (lens gone)</label><div class="stepper"><button type="button" data-lens="le" data-d="-1">−</button><b id="lev">' + draft.lensesExposed + '</b><button type="button" data-lens="le" data-d="1">＋</button></div></div></div>' +
      '<label>Camera not working</label><div class="chips">' + faultChip('rearCam') + faultChip('frontCam') + '</div><div class="hint">Check the front and back cameras both work.</div></div>';
    if (id === 'frame') return '<div class="card"><div class="chips">' + faultChip('frame') + faultChip('back_broken') + '</div></div>';
    if (id === 'buttons') return '<div class="card"><div class="chips">' + faultChip('faceid') + faultChip('speaker') + '</div></div>';
    if (id === 'price') return '<div class="card"><label>Quote for this phone ($)</label><input id="quote" inputmode="text" placeholder="e.g. 230-260" value="' + esc(draft.quote) + '"><div class="hint" id="quotehint"></div></div><div id="sum"></div>' +
      '<label>Notes (optional)</label><textarea id="notes" rows="2">' + esc(draft.notes) + '</textarea>' +
      '<div class="err" id="err"></div>';
    return '';
  }
  VIEWS.log = function () {
    if (!draft) { draft = newDraft(); persistDraft(); }
    var page = draft.mode === 'page', last = STEPS.length - 1;
    var ids = page ? STEPS : [STEPS[draft.step]];
    var progress = '<div class="steps">' + STEPS.map(function (s, i) { return '<i class="' + (i < draft.step ? 'done' : i === draft.step ? 'cur' : '') + '"></i>'; }).join('') + '</div>';
    var body = ids.map(function (s) { return (page ? '<h2>' + s.title + '</h2>' : '') + stepBody(s.id); }).join('');
    shell('<div class="row between" style="margin-bottom:4px"><button class="link" id="home">‹ Home</button><button class="link" id="mode" style="text-align:right">' + (page ? 'Step by step' : 'One page view') + '</button></div>' +
      (page ? '<h1>Log a phone</h1>' : '<h1>' + STEPS[draft.step].title + '</h1>' + progress) + body +
      (page ? '<div class="gap"></div><button class="link" id="startover">Start over</button>' : '') +
      '');
    $actions.innerHTML = '<div class="actionbar"><div class="inner">' + (page ? '<button id="save">Save phone</button>' : (draft.step > 0 ? '<button class="secondary" id="back">Back</button>' : '') +
        (draft.step < last ? '<button id="next">Next</button>' : '<button id="save">Save phone</button>')) + '</div></div>';
    bindLog();
    if (document.getElementById('sum')) renderSummary();
  };
  function bindLog() {
    $('home').onclick = function () { go('home'); };
    $('mode').onclick = function () { draft.mode = draft.mode === 'page' ? 'steps' : 'page'; persistDraft(); go('log'); };
    if ($('startover')) $('startover').onclick = function () { if (confirm('Clear this phone and start again?')) { draft = newDraft(); persistDraft(); go('log'); } };
    if ($('model')) $('model').onchange = function () { draft.model = this.value; draft.storage = ''; draft.colour = ''; draft.ded = {}; persistDraft(); go('log', undefined, true); };
    all('[data-storage]').forEach(function (b) { b.onclick = function () { draft.storage = draft.storage === b.getAttribute('data-storage') ? '' : b.getAttribute('data-storage'); persistDraft(); go('log', undefined, true); }; });
    all('[data-colour]').forEach(function (b) { b.onclick = function () { draft.colour = draft.colour === b.getAttribute('data-colour') ? '' : b.getAttribute('data-colour'); persistDraft(); go('log', undefined, true); }; });
    if ($('colourOther')) $('colourOther').oninput = function () { draft.colourOther = this.value; persistDraft(); };
    if ($('battery')) $('battery').oninput = function () { draft.battery = this.value; draft.ded = {}; persistDraft(); refreshSummary(); };
    if ($('bunk')) $('bunk').onclick = function () { draft.batteryUnknownPart = !draft.batteryUnknownPart; this.classList.toggle('on', draft.batteryUnknownPart); persistDraft(); refreshSummary(); };
    if ($('pbat')) $('pbat').onclick = function () { draft.partsBattery = !draft.partsBattery; this.classList.toggle('on', draft.partsBattery); persistDraft(); refreshSummary(); };
    all('[data-fault]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-fault'); draft.faults[id] = !draft.faults[id]; b.classList.toggle('on', !!draft.faults[id]); persistDraft(); refreshSummary(); }; });
    all('[data-lens]').forEach(function (b) {
      b.onclick = function () {
        var key = b.getAttribute('data-lens') === 'lc' ? 'lensesCracked' : 'lensesExposed';
        draft[key] = Math.max(0, Math.min(4, draft[key] + parseInt(b.getAttribute('data-d'), 10)));
        $(key === 'lensesCracked' ? 'lcv' : 'lev').textContent = draft[key]; persistDraft(); refreshSummary();
      };
    });
    if ($('perfect')) $('perfect').onclick = function () {
      if (draft.battery === '') { alert('Enter the battery % first.'); return; }
      draft.faults = {}; draft.lensesCracked = 0; draft.lensesExposed = 0; draft.step = STEPS.length - 1; persistDraft(); go('log');
    };
    if ($('quote')) $('quote').oninput = function () { draft.quote = this.value; persistDraft(); updateTotalsOnly(); };
    if ($('notes')) $('notes').oninput = function () { draft.notes = this.value; persistDraft(); };
    if ($('back')) $('back').onclick = function () { draft.step = Math.max(0, draft.step - 1); persistDraft(); go('log'); };
    if ($('next')) $('next').onclick = function () {
      if (draft.step === 0 && !draft.model) { alert('Choose the model first.'); return; }
      if (draft.step === 1 && draft.battery !== '' && (isNaN(parseInt(draft.battery, 10)) || parseInt(draft.battery, 10) > 100 || parseInt(draft.battery, 10) < 1)) { alert('Battery % should be between 1 and 100.'); return; }
      draft.step = Math.min(STEPS.length - 1, draft.step + 1); persistDraft(); go('log');
    };
    if ($('save')) $('save').onclick = savePhone;
  }
  function refreshSummary() { if ($('sum')) renderSummary(); }

  function computeLines() {
    var pct = draft.battery === '' ? null : parseInt(draft.battery, 10);
    return D.suggest({
      model: draft.model, deds: catalogue.deds, batteryPct: isNaN(pct) ? null : pct,
      thirdPartyBattery: draft.batteryUnknownPart || draft.partsBattery,
      faults: selectedFaults(), lensesCracked: draft.lensesCracked, lensesExposed: draft.lensesExposed
    });
  }
  function lineState(line) { var s = draft.ded[line.id] || {}; return { include: line.required ? true : (s.include === undefined ? true : s.include), cents: s.cents === undefined ? line.cents : s.cents }; }
  // "230-260", "230 to 260", "$230 - $260" or just "250" all work.
  function parseQuote(str) {
    var nums = (String(str).replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || []).map(parseFloat);
    if (!nums.length) return null;
    var a = nums[0], b = nums.length > 1 ? nums[1] : nums[0];
    return { min: Math.round(Math.min(a, b) * 100), max: Math.round(Math.max(a, b) * 100) };
  }
  function totals() {
    var lines = computeLines(), sum = 0;
    lines.forEach(function (l) { var s = lineState(l); if (s.include) sum += s.cents; });
    var override = draft.dedTotal !== '' ? dollarsToCents(draft.dedTotal) : null;
    return { lines: lines, sum: sum, total: override === null ? sum : override, overridden: override !== null };
  }
  function overLimit(p) { return typeof p.quoted_max_cents === 'number' && p.price_paid_cents > Math.max(0, p.quoted_max_cents - (p.total_deductions_cents || 0)); }
  // The most Declan may pay: the top of the quote minus the deductions. Never below $0.
  function maxPay(q, total) { return q ? Math.max(0, q.max - total) : null; }
  function renderSummary() {
    var t = totals(), q = parseQuote(draft.quote), suggestType = D.suggestType({ faults: selectedFaults(), lensesCracked: draft.lensesCracked, lensesExposed: draft.lensesExposed });
    if (!draft.typeTouched) draft.type = suggestType;
    var html = '';
    html += '<div class="card"><b>Deductions</b><div class="muted">What was wrong with it and what came off the price. Untick or change anything that doesn’t apply.</div>';
    if (!t.lines.length) html += '<div class="muted" style="margin-top:6px">Nothing ticked, so no deductions.</div>';
    t.lines.forEach(function (l) {
      var s = lineState(l);
      html += '<div class="dedrow"><button type="button" class="tog' + (s.include ? ' on' : '') + '" data-inc="' + l.id + '"' + (l.required ? ' disabled' : '') + '>' + (s.include ? '✓' : '') + '</button><div style="flex:1">' + esc(l.label) +
        (l.required ? '<small style="display:block">Always deducted under 80%</small>' : '') +
        (!l.priced ? '<small class="err" style="display:block">No set price for this model — ask Ethan, or type an amount</small>' : '') +
        '</div><input class="amt" type="number" inputmode="decimal" data-amt="' + l.id + '" value="' + (s.cents / 100) + '"></div>';
    });
    html += '<div class="row between" style="margin-top:12px"><span><b>Total deductions</b></span><span class="fixed" style="width:120px"><input id="dtotal" type="number" inputmode="decimal" value="' + (t.total / 100) + '" style="font-weight:800;font-size:18px"></span></div>' +
      '<div class="muted" id="dnote" style="margin-top:6px">' + dnote(t) + '</div></div>';
    html += '<div class="card"><label>Type</label><div class="seg" id="typeseg"><button type="button" data-type="damaged" class="' + (draft.type === 'damaged' ? 'on damaged' : '') + '">Damaged</button><button type="button" data-type="mint" class="' + (draft.type === 'mint' ? 'on mint' : '') + '">Mint</button></div>' +
      '<div class="hint">' + (draft.type === 'damaged' ? 'Ships to Ethan.' : 'You keep it.') + ' Suggested: ' + suggestType + (suggestType === 'mint' ? ' (nothing wrong)' : ' (it has a fault)') + '. Not sure? Ask Ethan.</div>' +
      '<label>Price paid ($)</label><input id="paid" type="number" inputmode="decimal" value="' + esc(draft.paid) + '"><div id="capwarn"></div></div>';
    $('sum').innerHTML = html;
    all('[data-inc]').forEach(function (el) { el.onclick = function () { var id = el.getAttribute('data-inc'); var cur = lineState({ id: id, required: false, cents: 0 }); draft.ded[id] = Object.assign({}, draft.ded[id], { include: !cur.include }); persistDraft(); renderSummary(); }; });
    all('[data-amt]').forEach(function (el) { el.oninput = function () { var id = el.getAttribute('data-amt'); var c = dollarsToCents(el.value); draft.ded[id] = Object.assign({}, draft.ded[id], { cents: c === null ? 0 : c }); persistDraft(); updateTotalsOnly(); }; });
    $('dtotal').oninput = function () { draft.dedTotal = this.value; persistDraft(); updateTotalsOnly(true); };
    all('[data-type]').forEach(function (b) { b.onclick = function () { draft.type = b.getAttribute('data-type'); draft.typeTouched = true; persistDraft(); renderSummary(); }; });
    $('paid').oninput = function () { draft.paid = this.value; persistDraft(); updateTotalsOnly(); };
    wireReset(); updateTotalsOnly(draft.dedTotal !== '');
  }
  function dnote(t) { return t.overridden ? 'You changed this total (suggested ' + money(t.sum) + '). <button class="link" id="dreset" type="button">Reset</button>' : 'You can type a different total here if you need to.'; }
  function wireReset() { if ($('dreset')) $('dreset').onclick = function () { draft.dedTotal = ''; persistDraft(); renderSummary(); }; }
  // re-render only the numbers while typing, so the keyboard doesn't lose focus
  function updateTotalsOnly(fromTotalBox) {
    var t = totals(), q = parseQuote(draft.quote);
    var box = $('dtotal'); if (box && !fromTotalBox) box.value = t.total / 100;
    var note = $('dnote'); if (note) { note.innerHTML = dnote(t); wireReset(); }
    var hint = $('quotehint'); if (hint) hint.textContent = q ? (q.min === q.max ? 'Quote: ' + money(q.max) : 'Quote: ' + money(q.min) + ' to ' + money(q.max)) : 'Type it like 230-260, or just one price like 250.';
    var cap = maxPay(q, t.total), paid = dollarsToCents(draft.paid);
    var warn = $('capwarn');
    if (warn) warn.innerHTML = (cap !== null && paid !== null && paid > cap) ? '<div class="err">This is ' + money(paid - cap) + ' over the limit (' + money(cap) + ' = top of the quote minus deductions). You can still save it — Ethan will see it flagged.</div>' : '';
  }

  var saving = false;
  function savePhone() {
    if (saving) return;
    var err = '';
    var q = parseQuote(draft.quote), qMin = q ? q.min : null, qMax = q ? q.max : null, paid = dollarsToCents(draft.paid), t = totals(), cap = maxPay(q, t.total);
    if (!draft.model) err = 'Choose the model.';
    else if (!q) err = 'Enter the quote for this phone, like 230-260.';
    else if (paid === null) err = 'Enter the price paid.';
    else if (draft.battery !== '' && (isNaN(parseInt(draft.battery, 10)) || parseInt(draft.battery, 10) > 100)) err = 'Battery % should be 1–100.';
    if (err) { if (draft.mode === 'steps' && draft.step !== STEPS.length - 1) { draft.step = STEPS.length - 1; persistDraft(); go('log'); } if ($('err')) $('err').textContent = err; else alert(err); return; }
    saving = true;
    var deductions = [];
    t.lines.forEach(function (l) { var s = lineState(l); if (s.include) deductions.push({ label: l.label, cents: s.cents }); });
    if (t.overridden && t.total !== t.sum) deductions.push({ label: 'Adjusted by Declan', cents: t.total - t.sum });
    var issues = selectedFaults().map(faultLabel);
    if (draft.lensesCracked) issues.push('Smashed camera lens x' + draft.lensesCracked);
    if (draft.lensesExposed) issues.push('Camera exposed x' + draft.lensesExposed);
    if (draft.batteryUnknownPart || draft.partsBattery) issues.push('Replaced / third-party battery');
    var colour = draft.colour === '__other' ? (draft.colourOther || null) : (draft.colour || null);
    var row = {
      id: uuid(), type: draft.type || 'damaged', model: draft.model, storage_gb: draft.storage ? parseInt(draft.storage, 10) : null, colour: colour,
      battery_pct: draft.battery === '' ? null : parseInt(draft.battery, 10), battery_unknown_part: !!draft.batteryUnknownPart,
      checklist: { third_party_battery: !!(draft.batteryUnknownPart || draft.partsBattery), faults: selectedFaults(), lenses_cracked: draft.lensesCracked, lenses_exposed: draft.lensesExposed },
      issues: issues, quoted_min_cents: qMin, quoted_max_cents: qMax, price_paid_cents: paid, deductions: deductions, total_deductions_cents: t.total,
      notes: draft.notes || null, status: 'bought', bought_at: new Date().toISOString()
    };
    queue.push({ kind: 'phone', row: row });
    if (draft.meetupId) queue.push({ kind: 'meetup', id: draft.meetupId, patch: { status: 'bought', phone_id: row.id } });
    setQueue(queue); draft = null; persistDraft(); saving = false; syncQueue();
    current = 'saved'; $actions.innerHTML = ''; renderTabs();
    shell('<div class="brand"><h1 class="ok">Saved ✓</h1></div><div class="card"><b>' + esc(row.model) + (row.storage_gb ? ' ' + storageText(row.storage_gb) : '') + '</b><div class="muted">' + esc(row.colour || '') + '</div><div style="margin-top:8px">Paid ' + money(row.price_paid_cents) + ' · <span class="pill ' + row.type + '">' + row.type + '</span></div></div>' +
      (navigator.onLine ? '' : '<p class="muted">No signal — it’s saved on your phone and will send by itself.</p>') +
      (row.type === 'damaged' && readyToShip().length >= MIN_SHIP ? '<div class="tip"><b>You have ' + readyToShip().length + ' damaged phones — time to ship a batch!</b></div>' : '') +
      '<button id="again">Log another</button><div class="gap"></div><button class="secondary" id="home">Home</button>');
    $app.className = '';
    $('again').onclick = function () { go('log'); }; $('home').onclick = function () { go('home'); };
  }

  // ---------- my phones ----------
  var phoneFilter = 'all', phoneSearch = '';
  function statusLabel(p) {
    if (p.type === 'mint' && p.status === 'bought') return p.sold_price_cents != null ? ['received', '✓ Sold'] : ['kept', 'With you'];
    if (p.batch_id && p.status === 'bought') { var b = allBatches().filter(function (x) { return x.id === p.batch_id; })[0]; if (b) return STAGE_TEXT[batchStage(b)]; }
    return { bought: ['bought', 'Bought'], shipped: ['shipped', '📦 Shipped'], received: ['received', '✓ Received'] }[p.status] || ['bought', p.status];
  }
  VIEWS.phones = function () {
    var phones = allPhones();
    var filters = [['all', 'All'], ['toship', 'To ship'], ['shipped', 'Shipped'], ['received', 'Received'], ['mint', 'Mint']];
    var shown = phones.filter(function (p) {
      if (phoneFilter === 'toship' && !(p.type === 'damaged' && p.status === 'bought')) return false;
      if (phoneFilter === 'shipped' && p.status !== 'shipped') return false;
      if (phoneFilter === 'received' && p.status !== 'received') return false;
      if (phoneFilter === 'mint' && p.type !== 'mint') return false;
      var s = phoneSearch.toLowerCase();
      return !s || (p.model + ' ' + (p.colour || '') + ' ' + (p.notes || '')).toLowerCase().indexOf(s) > -1;
    });
    shell('<h1>' + (isOwner() ? pn() + '’s phones' : 'My phones') + '</h1><input id="search" type="search" placeholder="Search model or colour" value="' + esc(phoneSearch) + '" style="margin-bottom:10px">' +
      '<div class="chips" style="margin-bottom:14px">' + filters.map(function (f) { return '<button type="button" class="chip' + (phoneFilter === f[0] ? ' on' : '') + '" data-filter="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      (shown.length ? shown.map(function (p) {
        var st = statusLabel(p), canEdit = !isOwner() && p.status === 'bought' && !p._failed, track = p.batch_id ? batchTracking(p.batch_id) : '';
        return '<div class="card phonecard"><div class="top"><div><div class="name">' + esc(p.model) + (p.storage_gb ? ' ' + storageText(p.storage_gb) : '') + '</div><div class="meta">' + esc(p.colour || '') + (p.colour ? ' · ' : '') + fmtDate(p.bought_at) + '</div></div><span class="pill ' + p.type + '">' + p.type + '</span></div>' +
          '<div class="money"><span>Paid ' + money(p.price_paid_cents) + '</span><span class="muted">Quote ' + money(p.quoted_min_cents) + (p.quoted_max_cents !== p.quoted_min_cents ? '–' + money(p.quoted_max_cents) : '') + '</span></div>' +
          (p.total_deductions_cents ? '<div class="muted">Deductions ' + money(p.total_deductions_cents) + '</div>' : '') +
          '<div style="margin-top:10px"><span class="pill ' + st[0] + '">' + st[1] + '</span>' + (overLimit(p) ? ' <span class="pill damaged">⚠ Over limit</span>' : '') + (p._failed ? ' <span class="err">couldn’t send</span>' : p._pending ? ' <span class="muted">waiting to send</span>' : '') + (track ? ' <span class="muted">· Tracking ' + esc(track) + '</span>' : '') + '</div>' +
          (p.type === 'mint' && p.sold_price_cents != null ? '<div style="margin-top:8px"><b>Sold for ' + money(p.sold_price_cents) + '</b> <span class="muted">· ' + (p.sold_price_cents - p.price_paid_cents >= 0 ? '+' : '') + money(p.sold_price_cents - p.price_paid_cents) + ' on what you paid</span>' + (priceFor(p) ? '<div class="muted">Recommended list was ' + money(priceFor(p).list_cents) + ' · ' + (p.sold_price_cents - priceFor(p).list_cents >= 0 ? '+' : '') + money(p.sold_price_cents - priceFor(p).list_cents) + '</div>' : '') + '</div>' : '') +
          (!isOwner() && p.type === 'mint' && !p._failed ? '<div class="acts"><button class="small" data-sold="' + p.id + '">' + (p.sold_price_cents != null ? 'Change sale price' : '💰 Mark sold') + '</button>' + (p.sold_price_cents == null ? '<button class="secondary small" data-fb="' + p.id + '">📋 Facebook description</button>' : '') + (canEdit && p.sold_price_cents == null ? '<button class="secondary small" data-edit="' + p.id + '">Edit</button><button class="secondary small" data-del="' + p.id + '" style="color:var(--red)">Delete</button>' : '') + '</div>'
            : canEdit ? '<div class="acts"><button class="secondary small" data-edit="' + p.id + '">Edit</button><button class="secondary small" data-del="' + p.id + '" style="color:var(--red)">Delete</button></div>' : '') + '</div>';
      }).join('') : '<div class="empty">' + (phones.length ? 'Nothing matches that.' : 'No phones yet. Log your first one!') + '</div>'));
    $('search').oninput = function () { phoneSearch = this.value; var pos = this.selectionStart; go('phones', undefined, true); var s = $('search'); s.focus(); s.setSelectionRange(pos, pos); };
    all('[data-filter]').forEach(function (b) { b.onclick = function () { phoneFilter = b.getAttribute('data-filter'); go('phones', undefined, true); }; });
    all('[data-edit]').forEach(function (b) { b.onclick = function () { go('edit', b.getAttribute('data-edit')); }; });
    all('[data-sold]').forEach(function (b) { b.onclick = function () { go('sold', b.getAttribute('data-sold')); }; });
    all('[data-fb]').forEach(function (b) { b.onclick = function () { go('fbdesc', b.getAttribute('data-fb')); }; });
    all('[data-del]').forEach(function (b) { b.onclick = function () { deletePhone(b.getAttribute('data-del')); }; });
  };
  function deletePhone(id) {
    if (!confirm('Delete this phone? Only do this if you logged it by mistake.')) return;
    var qi = queue.filter(function (i) { return i.kind === 'phone' && i.row.id === id; })[0];
    if (qi) { queue = queue.filter(function (i) { return i !== qi && !((i.kind === 'edit' || i.kind === 'delete') && i.id === id); }); setQueue(queue); }
    else { queue.push({ kind: 'delete', id: id }); setQueue(queue); syncQueue(); }
    go('phones', undefined, true);
  }
  VIEWS.sold = function (id) {
    var p = allPhones().filter(function (x) { return x.id === id; })[0];
    if (!p) return go('phones');
    shell('<h1>Mark sold</h1><div class="card"><b>' + esc(p.model) + (p.storage_gb ? ' ' + storageText(p.storage_gb) : '') + '</b><div class="muted">You paid ' + money(p.price_paid_cents) + '. Put in what it sold for.</div>' +
      '<label>Sold for ($)</label><input id="sp" type="number" inputmode="decimal" value="' + (p.sold_price_cents != null ? p.sold_price_cents / 100 : '') + '" autofocus><div class="err" id="err"></div></div>' +
      '<button id="save">Save</button><div class="gap"></div><button class="secondary" id="cancel">Cancel</button>' + (p.sold_price_cents != null ? '<div class="gap"></div><button class="link" id="unsell">It didn’t sell after all</button>' : ''));
    $('cancel').onclick = function () { go('phones'); };
    function put(cents, at) {
      var qi = queue.filter(function (i) { return i.kind === 'phone' && i.row.id === id; })[0], patch = { sold_price_cents: cents, sold_at: at };
      if (qi) { Object.assign(qi.row, patch); delete qi.failed; setQueue(queue); }
      else { queue = queue.filter(function (i) { return !(i.kind === 'edit' && i.id === id && 'sold_price_cents' in i.patch); }); queue.push({ kind: 'edit', id: id, patch: patch }); setQueue(queue); }
      syncQueue(); go('phones');
    }
    $('save').onclick = function () { var c = dollarsToCents($('sp').value); if (c === null || c < 0) { $('err').textContent = 'Enter what it sold for.'; return; } put(c, p.sold_at || new Date().toISOString()); };
    if ($('unsell')) $('unsell').onclick = function () { put(null, null); };
  };
  // Facebook Marketplace description, same wording rules as Ethan's first app (no bullet points, never states something he hasn't confirmed)
  function fbNaturalJoin(a) { return a.length < 2 ? (a[0] || '') : a.length === 2 ? a[0] + ' and ' + a[1] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function fbListing(inp) {
    var title = inp.model + (inp.storage ? ' - ' + inp.storage : '');
    var lines = [title + (inp.grade ? ', in ' + inp.grade.toLowerCase() + ' condition.' : '.'), ''];
    var faults = inp.faults.filter(function (f) { return inp.battery == null || !/battery/i.test(f); });
    function faultLine(f) { return /face id/i.test(f) && /(not work|doesn.t work|broken)/i.test(f) ? 'Face ID does not work (but password works perfectly fine!)' : f; }
    if (!faults.length) lines.push('All features are working perfectly 😊');
    else { faults.forEach(function (f) { lines.push(faultLine(f)); }); inp.working.forEach(function (w) { lines.push(w); }); }
    if (inp.battery != null && inp.battery >= 80) lines.push('Battery health is at ' + inp.battery + '%.');
    if (inp.noCracks) lines.push('No cracks or major damage.');
    if (inp.accessories.length) lines.push('Comes with ' + fbNaturalJoin(inp.accessories) + '.');
    lines.push('', 'Has been factory reset and ready for the next user.', 'Happy for you to check everything out for yourself before you buy 👌', '', 'Feel free to message with any questions.');
    if (inp.pickup) lines.push('Pickup ' + inp.pickup + '.');
    return { title: title, description: lines.join('\n') };
  }
  var fbState = {};
  function priceCard(p) {
    var pr = priceFor(p);
    if (!pr) return '<div class="card"><b>Recommended price</b><div class="muted" style="margin-top:6px">No price yet for this one. Ask Ethan.</div></div>';
    return '<div class="card"><b>Recommended price</b><div class="pricerow"><div><small>List it at</small><div class="big">' + money(pr.list_cents) + '</div></div><div><small>Lowest to accept</small><div class="big">' + money(pr.lowest_cents) + '</div></div></div>' +
      (pr.estimate ? '<div class="hint">An estimate. There aren’t many recent sales of this one.</div>' : '') + '<div class="hint">Battery and the case don’t change the price. For a lowball, offer about $20 under the list price.</div></div>';
  }
  VIEWS.fbdesc = function (id) {
    var p = allPhones().filter(function (x) { return x.id === id; })[0];
    if (!p) return go('phones');
    var st = fbState[id] || (fbState[id] = { grade: '', noCracks: false, accessories: '', working: '' });
    var pickup = ''; try { pickup = localStorage.getItem('fb_pickup') || ''; } catch (e) { /* fine without it */ }
    var faults = p.issues || [], grades = ['', 'Mint', 'Excellent', 'Great', 'Good'];
    function list(t) { return t.split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
    function make() { return fbListing({ model: p.model, storage: p.storage_gb ? storageText(p.storage_gb) : '', battery: p.battery_pct, faults: faults, working: list(st.working), grade: st.grade, noCracks: st.noCracks, accessories: list(st.accessories), pickup: pickup.trim() }); }
    shell('<h1>Facebook description</h1>' +
      '<div class="card"><b>' + esc(p.model) + (p.storage_gb ? ' ' + storageText(p.storage_gb) : '') + '</b><div class="muted">' + esc([p.colour, p.battery_pct != null ? 'battery ' + p.battery_pct + '%' : ''].filter(Boolean).join(' · ')) + (faults.length ? '<br>Faults: ' + esc(faults.join(', ')) : '') + '</div><div class="hint">Model, storage, colour, battery and faults come from what you logged.</div></div>' + priceCard(p) +
      '<div class="card"><label>Condition</label><div class="chips" id="gradechips">' + grades.map(function (g) { return '<button type="button" class="chip' + (st.grade === g ? ' on' : '') + '" data-grade="' + g + '">' + (g || 'Leave out') + '</button>'; }).join('') + '</div>' +
      '<label class="chk"><input type="checkbox" id="nocr"' + (st.noCracks ? ' checked' : '') + '><span>No cracks or major damage (only tick if it’s true)</span></label>' +
      '<label>Comes with (optional)</label><input id="acc" placeholder="e.g. box, charger" value="' + esc(st.accessories) + '">' +
      (faults.length ? '<label>Things that work (optional)</label><input id="wrk" placeholder="e.g. Face ID works, Cameras work" value="' + esc(st.working) + '">' : '') +
      '<label>Pickup suburb (optional)</label><input id="pk" placeholder="e.g. Kirwan 4817" value="' + esc(pickup) + '"><div class="hint">Saved on this phone for next time.</div></div>' +
      '<div class="card"><div class="row between"><b>Title</b><button class="secondary small fixed" id="cpt">Copy</button></div><div class="fbbox" id="fbt"></div></div>' +
      '<div class="card"><div class="row between"><b>Description</b><button class="small fixed" id="cpd">Copy</button></div><div class="fbbox" id="fbd"></div></div>' +
      '<button class="secondary" id="back">Back</button>');
    function paint() { var l = make(); $('fbt').textContent = l.title; $('fbd').textContent = l.description; }
    paint();
    all('[data-grade]').forEach(function (b) { b.onclick = function () { st.grade = b.getAttribute('data-grade'); all('[data-grade]').forEach(function (x) { x.classList.toggle('on', x === b); }); paint(); }; });
    $('nocr').onchange = function () { st.noCracks = this.checked; paint(); };
    $('acc').oninput = function () { st.accessories = this.value; paint(); };
    if ($('wrk')) $('wrk').oninput = function () { st.working = this.value; paint(); };
    $('pk').oninput = function () { pickup = this.value; try { localStorage.setItem('fb_pickup', pickup); } catch (e) { /* fine */ } paint(); };
    function copyBtn(btn, get) { btn.onclick = function () { var t = get(); copyText(t); var old = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = old; }, 1600); }; }
    copyBtn($('cpt'), function () { return make().title; });
    copyBtn($('cpd'), function () { return make().description; });
    $('back').onclick = function () { go('phones'); };
  };
  VIEWS.edit = function (id) {
    var p = allPhones().filter(function (x) { return x.id === id; })[0];
    if (!p) return go('phones');
    shell('<h1>Edit phone</h1><div class="card"><b>' + esc(p.model) + (p.storage_gb ? ' ' + storageText(p.storage_gb) : '') + '</b><div class="muted">You can fix the quote, price paid and notes. Deductions stay as logged (' + money(p.total_deductions_cents || 0) + ').</div></div>' +
      '<div class="card"><label>Quote ($)</label><input id="eq" inputmode="text" value="' + esc(p.quoted_min_cents === p.quoted_max_cents ? p.quoted_max_cents / 100 : (p.quoted_min_cents / 100) + '-' + (p.quoted_max_cents / 100)) + '">' +
      '<label>Price paid ($)</label><input id="ep" type="number" inputmode="decimal" value="' + (p.price_paid_cents / 100) + '"><label>Notes</label><textarea id="en" rows="2">' + esc(p.notes || '') + '</textarea><div class="err" id="err"></div></div>' +
      '<button id="save">Save changes</button><div class="gap"></div><button class="secondary" id="cancel">Cancel</button>');
    $('cancel').onclick = function () { go('phones'); };
    $('save').onclick = function () {
      var q = parseQuote($('eq').value), paid = dollarsToCents($('ep').value);
      if (!q) { $('err').textContent = 'Enter the quote, like 230-260.'; return; }
      if (paid === null) { $('err').textContent = 'Enter the price paid.'; return; }
      var patch = { quoted_min_cents: q.min, quoted_max_cents: q.max, price_paid_cents: paid, notes: $('en').value.trim() || null };
      var qi = queue.filter(function (i) { return i.kind === 'phone' && i.row.id === id; })[0];
      if (qi) { Object.assign(qi.row, patch); delete qi.failed; setQueue(queue); }
      else { queue = queue.filter(function (i) { return !(i.kind === 'edit' && i.id === id); }); queue.push({ kind: 'edit', id: id, patch: Object.assign({ edited_at: new Date().toISOString() }, patch) }); setQueue(queue); }
      syncQueue(); go('phones');
    };
  };

  // ---------- shipping ----------
  // Declan asks for a label once he has enough damaged phones; Ethan sends it; Declan prints, packs and posts;
  // Ethan marks it received. Each side sees where the shipment is up to.
  function batchPhones(id) { return allPhones().filter(function (p) { return p.batch_id === id; }); }
  // The text Declan sends Ethan to ask for a label: the phones, what he paid, and what he'll pack them in.
  function labelMessage(phones) {
    var n = phones.length, total = phones.reduce(function (a, p) { return a + (p.price_paid_cents || 0); }, 0);
    var lines = phones.map(function (p, i) { return (i + 1) + '. ' + p.model + (p.storage_gb ? ' ' + storageText(p.storage_gb) : '') + (p.colour ? ' (' + p.colour + ')' : '') + ' - ' + ((p.issues || []).length ? p.issues.join(', ') : 'damage as logged') + ' - paid ' + money(p.price_paid_cents); });
    return 'Hey Ethan, it\'s ' + (profile.name || 'Declan') + ' 👋\n\nI\'ve got ' + n + ' damaged phone' + (n === 1 ? '' : 's') + ' ready to ship:\n\n' + lines.join('\n') +
      '\n\nTotal I\'ve paid: ' + money(total) + '\n\nCan you send me the postage label please? I\'ll pack them in ' + (n >= 10 ? 'a medium' : 'a small') + ' box with bubble wrap and post them as soon as I\'ve got it.\n\nThanks!';
  }
  function smsHref(body) { var n = phoneForLinks(); return n ? smsTo(n, body) : '#'; }
  function copyText(t) { try { if (navigator.clipboard) navigator.clipboard.writeText(t); } catch (e) { /* the message still opens in Messages */ } }
  VIEWS.ship = function () {
    var ready = readyToShip(), sel = {}; ready.forEach(function (p) { sel[p.id] = true; });
    var batches = allBatches(), asked = null; // asked = the phones in the message he just opened, waiting for "I sent it"
    function chosen() { return ready.filter(function (p) { return sel[p.id]; }); }
    function render() {
      var n = Object.keys(sel).filter(function (k) { return sel[k]; }).length;
      var req = ready.length ? '<h2>Ready to ship</h2><div class="card"><div class="row between"><b>Damaged phones</b><span class="muted fixed">' + n + ' selected</span></div>' + ready.map(function (p) {
        return '<div style="margin-top:8px"><button type="button" class="chip' + (sel[p.id] ? ' on good' : '') + '" style="width:100%;border-radius:14px" data-p="' + p.id + '">' + esc(p.model) + (p.storage_gb ? ' ' + storageText(p.storage_gb) : '') + '<small>' + esc(p.colour || '') + ' · paid ' + money(p.price_paid_cents) + '</small></button></div>';
      }).join('') + '</div><div class="card"><div class="bar"><i style="width:' + Math.min(100, Math.round(n / MIN_SHIP * 100)) + '%"></i></div><div class="muted">Ask for a label when you have ' + MIN_SHIP + ' or more. Ethan will send it to you.</div>' +
        (n > 0 && n < MIN_SHIP ? '<div style="margin-top:10px"><button type="button" class="chip' + (window._few ? ' on' : '') + '" id="few">Ethan said it’s OK to ship fewer than ' + MIN_SHIP + '</button></div>' : '') + '</div>' +
        (asked ? '<div class="card"><b>Did you send the message to Ethan?</b><div class="muted">Messages should have opened with everything written out. The message is also copied, so you can paste it if it didn’t.</div><div class="gap"></div><button id="sent">Yes, I sent it</button><div class="gap"></div><button class="secondary" id="again">Copy the message again</button><div class="gap"></div><button class="link" id="notyet">Not yet</button></div>'
          : n === 0 ? '<button disabled>Message Ethan for a label</button>' : '<a class="btnlink green" id="go" href="' + smsHref(labelMessage(chosen())) + '">💬 Message Ethan for a label</a>') + '<div class="err" id="err"></div>' : '<div class="empty">No damaged phones waiting to ship.</div>';
      var mine = batches.length ? '<h2>Your shipments</h2>' + batches.map(function (b) {
        var st = batchStage(b), ph = batchPhones(b.id), t = STAGE_TEXT[st];
        var body = st === 'waiting' ? '<div class="muted">Ethan will text you the label. When he’s sent it, it shows up here with your tracking number.</div>'
          : st === 'label' ? '<div style="margin-top:8px"><b>Tracking ' + esc(b.tracking_number || '') + '</b></div><div class="muted">Print the label, pack the box and post it. Then tap the button.</div><div class="gap"></div><button data-posted="' + b.id + '">I’ve posted it</button>'
          : st === 'posted' ? '<div class="muted" style="margin-top:6px">Tracking ' + esc(b.tracking_number || '') + ' · posted ' + fmtDate(b.posted_at) + '</div>'
          : '<div class="muted" style="margin-top:6px">Received by Ethan ' + fmtDate(b.received_at) + '</div>';
        return '<div class="card"><div class="row between"><b>' + ph.length + ' phones</b><span class="pill ' + t[0] + ' fixed">' + t[1] + '</span></div>' + body + (b._pending ? '<div class="muted">waiting to send</div>' : '') + '</div>';
      }).join('') : '';
      shell('<h1>Ship</h1><a class="btnlink" href="ship-guide.html" style="margin-bottom:14px">📦 How to pack &amp; post</a>' + req + mine);
      all('[data-p]').forEach(function (b) { b.onclick = function () { sel[b.getAttribute('data-p')] = !sel[b.getAttribute('data-p')]; render(); }; });
      if ($('few')) $('few').onclick = function () { window._few = !window._few; render(); };
      all('[data-posted]').forEach(function (b) { b.onclick = function () { if (!confirm('Have you posted the box?')) return; queue.push({ kind: 'posted', id: b.getAttribute('data-posted'), at: new Date().toISOString() }); setQueue(queue); syncQueue(); go('ship', undefined, true); }; });
      if ($('go')) $('go').onclick = function (e) {
        var ids = Object.keys(sel).filter(function (k) { return sel[k]; });
        if (ids.length < MIN_SHIP && !window._few) { e.preventDefault(); $('err').textContent = 'You need ' + MIN_SHIP + ' phones, or tick that Ethan said it’s OK.'; return; }
        copyText(labelMessage(chosen()));                 // the text opens in Messages; this is the backup
        asked = ids.slice();
        setTimeout(function () { render(); }, 500);       // let Messages open first
      };
      if ($('again')) $('again').onclick = function () { copyText(labelMessage(ready.filter(function (p) { return asked.indexOf(p.id) > -1; }))); $('again').textContent = 'Copied ✓'; };
      if ($('notyet')) $('notyet').onclick = function () { asked = null; render(); };
      if ($('sent')) $('sent').onclick = function () {
        // Now (and only now) the phones are marked as waiting for a label, so nothing is locked if he never sent the text.
        queue.push({ kind: 'batch', batch: { id: uuid(), tracking_number: null, shipped_at: new Date().toISOString() }, phoneIds: asked }); setQueue(queue);
        window._few = false; syncQueue(); go('ship');
      };
    }
    render();
  };

  // Ethan's side: send labels, mark received, note what he's paid.
  function paymentFor(id) { return payments.filter(function (p) { return p.batch_id === id; })[0] || {}; }
  function shipFromText(p) { return [p.ship_name, p.ship_street, [p.ship_suburb, p.ship_state, p.ship_postcode].filter(Boolean).join(' '), p.ship_phone].filter(Boolean).join('\n'); }
  function shipFromCard() {
    var v = viewingPartner(); if (!v) return '';
    if (!v.ship_street) return '<div class="card"><b>' + esc(v.name) + '’s address</b><div class="muted" style="margin-top:6px">Not added yet. They add it under My details.</div></div>';
    return '<div class="card"><div class="row between"><b>' + esc(v.name) + '’s address for the label</b><button class="secondary small fixed" id="copyship">Copy</button></div><div style="margin-top:8px;white-space:pre-line;overflow-wrap:anywhere">' + esc(shipFromText(v)) + '</div></div>';
  }
  VIEWS.oship = function () {
    var batches = allBatches();
    shell('<h1>Shipments</h1><div id="pushcard"></div>' + shipFromCard() + (batches.length ? batches.map(function (b) {
      var st = batchStage(b), ph = batchPhones(b.id), t = STAGE_TEXT[st], pay = paymentFor(b.id), total = ph.reduce(function (a, p) { return a + (p.price_paid_cents || 0); }, 0);
      var action = st === 'waiting' ? '<label>Tracking number from your label</label><input data-trk="' + b.id + '" autocapitalize="characters" autocomplete="off" placeholder="e.g. 34ABC123456"><div class="gap"></div><button data-label="' + b.id + '">Label sent to ' + esc(pn()) + '</button>'
        : st !== 'received' ? '<div class="muted" style="margin-top:6px">Tracking ' + esc(b.tracking_number || '') + (st === 'posted' ? ' · posted ' + fmtDate(b.posted_at) : ' · waiting for ' + esc(pn()) + ' to post') + '</div><div class="gap"></div><button data-recv="' + b.id + '">Mark received</button>'
        : '<div class="muted" style="margin-top:6px">Tracking ' + esc(b.tracking_number || '') + ' · received ' + fmtDate(b.received_at) + '</div>';
      return '<div class="card"><div class="row between"><b>' + ph.length + ' phones · ' + money(total) + ' paid by ' + esc(pn()) + '</b><span class="pill ' + t[0] + ' fixed">' + t[1] + '</span></div>' +
        '<div class="muted" style="margin:6px 0">' + ph.map(function (p) { return esc(p.model) + (p.storage_gb ? ' ' + storageText(p.storage_gb) : ''); }).join(' · ') + '</div>' + action +
        '<h2 style="margin-top:18px">What you’ve paid</h2><div class="row"><div><label>On shipping ($)</label><input type="number" inputmode="decimal" data-pship="' + b.id + '" value="' + (pay.paid_on_ship_cents != null ? pay.paid_on_ship_cents / 100 : '') + '"></div>' +
        '<div><label>On arrival ($)</label><input type="number" inputmode="decimal" data-parr="' + b.id + '" value="' + (pay.paid_on_arrival_cents != null ? pay.paid_on_arrival_cents / 100 : '') + '"></div></div><div class="gap"></div><button class="secondary" data-savepay="' + b.id + '">Save payments</button><div class="err" data-err="' + b.id + '"></div></div>';
    }).join('') : '<div class="empty">No shipments yet. When ' + esc(pn()) + ' asks for a label it shows up here.</div>'));
    function fail(id, msg) { var e = document.querySelector('[data-err="' + id + '"]'); if (e) e.textContent = msg; }
    if ($('copyship')) $('copyship').onclick = function () { copyText(shipFromText(viewingPartner())); this.textContent = 'Copied ✓'; };
    all('[data-label]').forEach(function (btn) {
      btn.onclick = async function () {
        var id = btn.getAttribute('data-label'), trk = document.querySelector('[data-trk="' + id + '"]').value.trim();
        if (!trk) { fail(id, 'Enter the tracking number first.'); return; }
        if (!navigator.onLine) { fail(id, 'You need signal to do that.'); return; }
        btn.disabled = true;
        var r = await sb.from('partner_batches').update({ tracking_number: trk, label_sent_at: new Date().toISOString() }).eq('id', id).select('id');
        if (r.error || !(r.data || []).length) { fail(id, 'Couldn’t save: ' + (r.error ? r.error.message : 'not allowed')); btn.disabled = false; return; }
        await refreshPhones(); go('oship', undefined, true);
      };
    });
    all('[data-recv]').forEach(function (btn) {
      btn.onclick = async function () {
        var id = btn.getAttribute('data-recv');
        if (!confirm('Mark this shipment as received?')) return;
        if (!navigator.onLine) { fail(id, 'You need signal to do that.'); return; }
        btn.disabled = true;
        var r = await sb.from('partner_batches').update({ received_at: new Date().toISOString() }).eq('id', id).select('id');
        if (r.error) { fail(id, 'Couldn’t save: ' + r.error.message); btn.disabled = false; return; }
        var r2 = await sb.from('partner_phones').update({ status: 'received' }).eq('batch_id', id);
        if (r2.error) { fail(id, 'Marked received, but the phones didn’t update: ' + r2.error.message); }
        await refreshPhones(); go('oship', undefined, true);
      };
    });
    all('[data-savepay]').forEach(function (btn) {
      btn.onclick = async function () {
        var id = btn.getAttribute('data-savepay'), a = dollarsToCents(document.querySelector('[data-pship="' + id + '"]').value), c = dollarsToCents(document.querySelector('[data-parr="' + id + '"]').value), old = paymentFor(id), now = new Date().toISOString();
        if (!navigator.onLine) { fail(id, 'You need signal to do that.'); return; }
        var row = { batch_id: id, paid_on_ship_cents: a, paid_on_ship_at: a === null ? null : (old.paid_on_ship_cents === a && old.paid_on_ship_at ? old.paid_on_ship_at : now), paid_on_arrival_cents: c, paid_on_arrival_at: c === null ? null : (old.paid_on_arrival_cents === c && old.paid_on_arrival_at ? old.paid_on_arrival_at : now) };
        var r = await sb.from('batch_payments').upsert(row, { onConflict: 'batch_id' });
        if (r.error) { fail(id, 'Couldn’t save: ' + r.error.message); return; }
        fail(id, ''); btn.textContent = 'Saved ✓'; await refreshPhones();
        renderPushCard();
  };
    });
  };

  // ---------- statement (Ethan only) ----------
  var stmtK = null;
  function ownerSettings() { var s = ownerData.settings || {}; return { flat_cents: +s.damaged_flat_cents || 0, pct: +s.damaged_pct || 0, cap_cents: s.damaged_cap_cents ? +s.damaged_cap_cents : null, bonus_after: +s.damaged_bonus_after || 0, bonus_cents: +s.damaged_bonus_cents || 0 }; }
  function valuationMap() { var m = {}; (ownerData.valuations || []).forEach(function (v) { m[v.phone_id] = v; }); return m; }
  function buildStatement(k) {
    return S.statement(k, { phones: allPhones(), batches: allBatches(), payments: payments, valuations: valuationMap(), ff: ownerData.ff, deds: catalogue.deds, bands: ownerData.bands, settings: ownerSettings() });
  }
  function fmtPeriod(p) { return 'Fortnight to ' + new Date(p.date + 10 * 3600000).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function priceInput(kind, phoneId, current) { return '<div class="row" style="margin-top:6px"><input type="number" inputmode="decimal" data-val="' + kind + '" data-ph="' + phoneId + '" placeholder="' + (kind === 'expected' ? 'Expected sale $' : 'Price-sheet value $') + '" value="' + (current != null ? current / 100 : '') + '"><button class="secondary small fixed" data-saveval="' + phoneId + '" data-kind="' + kind + '">Save</button></div>'; }
  function statementText(st) {
    var L = [fmtPeriod(st.period), ''];
    st.damaged.forEach(function (d) { L.push('Damaged shipment (' + d.lines.length + ' phones): reimburse ' + money(d.reimburse) + ' + fees ' + money(d.fees) + ' = ' + money(d.owed) + ', paid ' + money(d.paid) + ', still owed ' + money(d.remaining)); });
    if (st.mint.length) L.push('Mint commission owed by ' + pn() + ': ' + money(st.declanOwes) + ' (' + st.mint.length + ' phones)');
    L.push('', st.net > 0 ? 'Net: Ethan pays ' + pn() + ' ' + money(st.net) : st.net < 0 ? 'Net: ' + pn() + ' pays Ethan ' + money(-st.net) : 'Net: even');
    return L.join('\n');
  }
  // "Damaged phones bought this month: 31 of 35 before the fee steps up" (this calendar month, Brisbane time).
  function stepUpNote() {
    var os = ownerSettings(); if (!os.bonus_after) return '';
    var ords = S.monthOrdinals(allPhones()), nowKey = new Date(Date.now() + 10 * 3600000), month = nowKey.getUTCFullYear() + '-' + nowKey.getUTCMonth(), n = 0;
    allPhones().forEach(function (p) { if (p.type === 'damaged' && ords[p.id]) { var d = new Date(new Date(p.bought_at).getTime() + 10 * 3600000); if (d.getUTCFullYear() + '-' + d.getUTCMonth() === month) n++; } });
    return '<div class="tip">Damaged phones bought this month: <b>' + n + '</b>. ' + (n > os.bonus_after ? 'Past ' + os.bonus_after + ' — each one now pays ' + money(os.bonus_cents) + ' for the rest of the month.' : (os.bonus_after - n) + ' more until the fee steps up to ' + money(os.bonus_cents) + '.') + '</div>';
  }
  VIEWS.ostatement = function () {
    if (stmtK === null) stmtK = S.currentPeriodIndex(Date.now());
    var st = buildStatement(stmtK), noData = !(ownerData.ff && ownerData.ff.length);
    var netHtml = st.net > 0 ? '<div class="big" style="color:#8ff0ab">You pay ' + esc(pn()) + ' ' + money(st.net) + '</div>' : st.net < 0 ? '<div class="big" style="color:#ffd27a">' + esc(pn()) + ' pays you ' + money(-st.net) + '</div>' : '<div class="big">Even</div>';
    shell('<h1>Statement</h1><div class="row between" style="margin-bottom:12px"><button class="secondary small fixed" id="prevk">‹</button><b style="text-align:center">' + fmtPeriod(st.period) + '</b><button class="secondary small fixed" id="nextk">›</button></div>' +
      (noData ? '<div class="tip">The price table hasn’t loaded yet. Open this once with signal.</div>' : '') + stepUpNote() +
      '<div class="card" style="text-align:center"><div class="muted">Net for this fortnight</div>' + netHtml + (st.missing ? '<div style="color:var(--amber);margin-top:6px">⚠ ' + st.missing + (st.missing === 1 ? ' phone needs' : ' phones need') + ' a price from you — see below</div>' : '') + '</div>' +
      '<h2>You owe ' + esc(pn()) + ' · damaged phones</h2>' + (st.damaged.length ? st.damaged.map(function (d) {
        return '<div class="card"><div class="row between"><b>' + d.lines.length + ' phones</b><span class="muted fixed">received ' + fmtDate(d.batch.received_at) + '</span></div>' + d.lines.map(function (l) {
          var ph = l.phone;
          return '<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row between"><span>' + esc(ph.model) + (ph.storage_gb ? ' ' + storageText(ph.storage_gb) : '') + '</span><b class="fixed">fee ' + money(l.fee) + '</b></div>' +
            '<div class="muted">Paid ' + money(ph.price_paid_cents) + (l.ordinal ? ' · #' + l.ordinal + ' damaged phone that month' : '') + (ownerSettings().pct ? ' · expected sale ' + (l.expected === null ? '<span style="color:var(--amber)">needs a price</span>' : money(l.expected) + (l.manual ? ' (you set it)' : '')) + (l.profit === null ? '' : ' · profit ' + money(l.profit)) : '') + '</div>' +
            (ownerSettings().pct && (l.needsPrice || l.manual) ? priceInput('expected', ph.id, l.manual ? l.expected : null) : '') + '</div>';
        }).join('') +
          '<div class="row between" style="margin-top:10px"><span>Reimburse what he paid</span><b class="fixed">' + money(d.reimburse) + '</b></div><div class="row between"><span>Fees</span><b class="fixed">' + money(d.fees) + '</b></div>' +
          '<div class="row between"><span>Already paid</span><b class="fixed">−' + money(d.paid) + '</b></div><div class="row between"><b>Still to pay</b><b class="fixed">' + money(d.remaining) + '</b></div></div>';
      }).join('') : '<div class="empty">No damaged shipments received in this fortnight.</div>') +
      '<h2>' + esc(pn()) + ' owes you · mint phones</h2>' + (st.mint.length ? '<div class="card">' + st.mint.map(function (l) {
        var ph = l.phone;
        return '<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row between"><span>' + esc(ph.model) + (ph.storage_gb ? ' ' + storageText(ph.storage_gb) : '') + '</span><b class="fixed">' + (l.fee === null ? '—' : money(l.fee)) + '</b></div>' +
          '<div class="muted">Paid ' + money(ph.price_paid_cents) + ' · price sheet ' + (l.sheet === null ? '<span style="color:var(--amber)">needs a price</span>' : money(l.sheet)) + (l.spread === null ? '' : ' · spread ' + money(l.spread)) + '</div>' +
          (l.needsPrice || (valuationMap()[ph.id] || {}).sheet_price_cents != null ? priceInput('sheet', ph.id, (valuationMap()[ph.id] || {}).sheet_price_cents) : '') + '</div>';
      }).join('') + '<div class="row between" style="margin-top:10px"><b>Commission owed</b><b class="fixed">' + money(st.declanOwes) + '</b></div></div>' : '<div class="empty">No mint phones logged in this fortnight.</div>') +
      '<div class="gap"></div><button id="copy">Copy statement</button><div class="gap"></div><button class="secondary" id="rates">Change rates</button>');
    $('prevk').onclick = function () { stmtK--; go('ostatement', undefined, true); };
    $('nextk').onclick = function () { stmtK++; go('ostatement', undefined, true); };
    $('copy').onclick = function () { var t = statementText(st); if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { $('copy').textContent = 'Copied ✓'; }); else prompt('Copy this:', t); };
    $('rates').onclick = function () { go('orates'); };
    all('[data-saveval]').forEach(function (b) {
      b.onclick = async function () {
        var id = b.getAttribute('data-saveval'), kind = b.getAttribute('data-kind'), inp = document.querySelector('[data-val="' + kind + '"][data-ph="' + id + '"]'), cents = dollarsToCents(inp.value);
        if (!navigator.onLine) { alert('You need signal to do that.'); return; }
        var row = { phone_id: id, updated_at: new Date().toISOString() }, old = valuationMap()[id] || {};
        row.expected_sale_cents = kind === 'expected' ? cents : (old.expected_sale_cents == null ? null : old.expected_sale_cents);
        row.sheet_price_cents = kind === 'sheet' ? cents : (old.sheet_price_cents == null ? null : old.sheet_price_cents);
        var r = await sb.from('phone_valuations').upsert(row, { onConflict: 'phone_id' });
        if (r.error) { alert('Couldn’t save: ' + r.error.message); return; }
        await refreshPhones(); go('ostatement', undefined, true);
      };
    });
  };
  VIEWS.orates = function () {
    var os = ownerSettings(), bands = (ownerData.bands || []).slice().sort(function (a, b) { return a.band_no - b.band_no; });
    shell('<h1>Rates</h1><div class="card"><b>Damaged phones — fee to Declan</b><div class="muted">You pay back what he paid, plus a fee for each phone.</div><label>Fee per phone ($)</label><input id="rflat" type="number" inputmode="decimal" value="' + os.flat_cents / 100 + '">' +
      '<div class="row"><div><label>After this many damaged phones in a month</label><input id="rafter" type="number" inputmode="numeric" value="' + (os.bonus_after || '') + '" placeholder="e.g. 35"></div><div><label>…the rest of the month pays ($)</label><input id="rbonus" type="number" inputmode="decimal" value="' + (os.bonus_cents ? os.bonus_cents / 100 : '') + '" placeholder="e.g. 35"></div></div><div class="hint">Leave both empty for one flat fee all month.</div></div>' +
      '<div class="card"><b>Mint phones — commission by spread</b><div class="muted">Spread = price-sheet value minus what Declan paid.</div>' + bands.map(function (b) {
        return '<div class="row" style="margin-top:10px"><div>' + (b.min_spread_cents == null ? '<label>Under the next band</label><input disabled value="from $0 (or less)">' : '<label>Spread from ($)</label><input type="number" inputmode="decimal" data-bmin="' + b.band_no + '" value="' + b.min_spread_cents / 100 + '">') + '</div><div><label>Commission ($)</label><input type="number" inputmode="decimal" data-bfee="' + b.band_no + '" value="' + b.fee_cents / 100 + '"></div></div>';
      }).join('') + '</div><div class="err" id="err"></div><button id="save">Save rates</button><div class="gap"></div><button class="secondary" id="back">Back</button>');
    $('back').onclick = function () { go('ostatement'); };
    $('save').onclick = async function () {
      if (!navigator.onLine) { $('err').textContent = 'You need signal to do that.'; return; }
      var flat = dollarsToCents($('rflat').value);
      if (flat === null) { $('err').textContent = 'Enter the flat fee.'; return; }
      var after = $('rafter').value === '' ? 0 : parseInt($('rafter').value, 10), bonus = $('rbonus').value === '' ? 0 : dollarsToCents($('rbonus').value);
      if (isNaN(after) || bonus === null) { $('err').textContent = 'Check the step-up numbers.'; return; }
      var r = await sb.from('owner_settings').upsert([{ key: 'damaged_flat_cents', value: String(flat) }, { key: 'damaged_pct', value: '0' }, { key: 'damaged_bonus_after', value: String(after) }, { key: 'damaged_bonus_cents', value: String(bonus) }], { onConflict: 'key' });
      if (r.error) { $('err').textContent = 'Couldn’t save: ' + r.error.message; return; }
      await sb.from('app_settings').upsert([{ key: 'fee_damaged_cents', value: String(flat) }, { key: 'fee_bonus_after', value: String(after) }, { key: 'fee_bonus_cents', value: String(bonus) }], { onConflict: 'key' }); // so partners see the same numbers
      var brows = bands.map(function (b) { var mi = document.querySelector('[data-bmin="' + b.band_no + '"]'), fe = document.querySelector('[data-bfee="' + b.band_no + '"]'); return { band_no: b.band_no, min_spread_cents: mi ? dollarsToCents(mi.value) : null, fee_cents: dollarsToCents(fe.value) }; });
      if (brows.some(function (b) { return b.fee_cents === null || (b.band_no !== 1 && b.min_spread_cents === null); })) { $('err').textContent = 'Fill in every band.'; return; }
      r = await sb.from('commission_bands').upsert(brows, { onConflict: 'band_no' });
      if (r.error) { $('err').textContent = 'Couldn’t save: ' + r.error.message; return; }
      await refreshPhones(); go('ostatement');
    };
  };

  // ---------- push notifications (meetup booked / one hour to go) ----------
  function b64ToBytes(b64) { var raw = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), out = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; }
  function pushSupported() { return !!(window.CONFIG && window.CONFIG.VAPID_PUBLIC_KEY) && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  async function pushSubscribe() {
    var reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(window.CONFIG.VAPID_PUBLIC_KEY) });
    var j = sub.toJSON();
    var r = await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: session.user.id }, { onConflict: 'endpoint' });
    return !r.error;
  }
  // Quietly keeps this phone's saved subscription fresh each time the app opens (only once alerts are on).
  async function ensurePush() {
    if (!pushSupported() || Notification.permission !== 'granted' || !session || !session.user || !navigator.onLine) return;
    try { await pushSubscribe(); } catch (e) { /* try again next launch */ }
  }
  var pushHtml = load('pushhtml', '');
  function paintPush(el, html) { if (el.innerHTML && pushHtml === html) { bindPush(); return; } { el.innerHTML = html; try { localStorage.setItem('declan_pushhtml', JSON.stringify(html)); } catch (e) { /* fine */ } pushHtml = html; bindPush(); } }
  async function renderPushCard() {
    var el = $('pushcard');
    if (!el || !(window.CONFIG && window.CONFIG.VAPID_PUBLIC_KEY)) return;
    if (pushHtml && !el.innerHTML) { el.innerHTML = pushHtml; bindPush(); }
    var what = isOwner() ? 'when Declan asks for a label or posts a batch, and an hour before each meetup' : 'the moment Ethan books a meetup, and another one an hour before';
    if (!pushSupported() || !isStandalone()) { paintPush(el, '<div class="tip"><b>Want alerts?</b> ' + (isAndroidMode() ? 'Install the app first (Chrome ⋮ menu › Install app), open it from its icon, then turn alerts on here.' : 'Add the app to your Home Screen first (Share ⬆︎ → Add to Home Screen), open it from the icon, then turn alerts on here.') + '</div>'); return; }
    if (Notification.permission === 'denied') { paintPush(el, '<div class="tip">Alerts are blocked. ' + (isAndroidMode() ? 'Press and hold the app icon, tap <b>App info</b> › <b>Notifications</b> and turn them on.' : 'Turn them on in <b>Settings › Notifications › Cash for Phones</b>.') + '</div>'); return; }
    var on = false;
    try { var reg = await navigator.serviceWorker.ready; on = Notification.permission === 'granted' && !!(await reg.pushManager.getSubscription()); } catch (e) { /* ignore */ }
    if (on) { paintPush(el, '<div class="muted" style="margin:0 2px 12px">🔔 Alerts are on — you’ll get one ' + what + '.</div>'); return; }
    paintPush(el, '<div class="card"><b>🔔 Alerts</b><div class="muted">Get a notification ' + what + '.</div><div class="gap"></div><button id="pushon">Turn on alerts</button><div class="err" id="pusherr"></div></div>');
  }
  function bindPush() {
    var btn = $('pushon'); if (!btn) return;
    btn.onclick = async function () {
      $('pusherr').textContent = '';
      try {
        var perm = await Notification.requestPermission();
        if (perm !== 'granted') { $('pusherr').textContent = (isAndroidMode() ? 'Alerts weren’t allowed. Press and hold the app icon, tap App info › Notifications to change this.' : 'Alerts weren’t allowed. You can change this in Settings › Notifications.'); return; }
        if (!(await pushSubscribe())) { $('pusherr').textContent = 'Couldn’t save that. Check your signal and try again.'; return; }
        renderPushCard();
      } catch (e) { $('pusherr').textContent = 'Couldn’t turn alerts on: ' + (e && e.message ? e.message : 'try again'); }
    };
  }

  // ---------- meetups ----------
  function sortedMeetups() { return allMeetups().slice().sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); }); }
  function calendarCard() {
    var tok = profile.calendar_token || settings.calendar_token;
    if (!tok || isOwner()) return '';
    var url = window.CONFIG.SUPABASE_URL.replace(/^https?:\/\//, 'webcal://') + '/functions/v1/calendar?token=' + tok;
    if (isAndroidMode()) {
      var https = window.CONFIG.SUPABASE_URL + '/functions/v1/calendar?token=' + tok;
      return '<div class="card"><b>📅 Google Calendar (optional)</b><div class="muted">Your meetups can show up in Google Calendar too. On a computer, open calendar.google.com, click <b>+</b> next to <b>Other calendars</b>, choose <b>From URL</b>, paste the link below and click <b>Add calendar</b>. It then appears in the Google Calendar app on your phone. Google can take a few hours to show changes, so rely on the alerts and the list below for anything last-minute. Reminders come from the Google Calendar settings for this calendar.</div><div class="gap"></div><button class="small" data-calcopy="' + esc(https) + '">Copy calendar link</button></div>';
    }
    return '<div class="card"><b>📅 Apple Calendar</b><div class="muted">Add this once. Every meetup Ethan books then appears in your calendar by itself, with a reminder. Changes can take a little while to show up, so check this list for anything last-minute.</div><div class="gap"></div><a class="btnlink green" href="' + url + '">Add to Apple Calendar</a></div>';
  }
  function nextMeetupCard() {
    var now = new Date(), mine = sortedMeetups().filter(function (m) { return m.status === 'booked'; });
    var next = mine.filter(function (m) { return new Date(m.starts_at) >= now; })[0];
    var overdue = mine.filter(function (m) { return new Date(m.starts_at) < now; }).length;
    var html = '';
    if (overdue) html += '<div class="tip" id="nextm"><b>' + overdue + (overdue === 1 ? ' meetup needs' : ' meetups need') + ' an answer.</b> Log the phone you bought, or mark it No sale / No show. Tap here.</div>';
    if (next) html += '<div class="card" id="nextm" style="cursor:pointer"><div class="muted" style="font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:12px">Next meetup</div><div class="name" style="font-size:18px;font-weight:800;margin-top:4px">' + fmtWhen(next.starts_at, next.partner_id) + '</div><div>' + esc(next.seller_name) + ' · ' + esc(next.model) + '</div>' + (next.location ? '<div class="muted">📍 ' + esc(next.location) + '</div>' : '') + '</div>';
    return html;
  }
  // Google review link (Ethan sets it in app_settings). Partners ask every seller once they've been paid.
  function reviewUrl() { return String(settings.review_url || '').trim(); }
  function reviewCard() {
    if (isOwner() || !reviewUrl()) return '';
    return '<div class="card"><b>⭐ Google review link</b><div class="muted" style="margin-top:2px">Ask every seller once they’ve been paid. Show them this, or send it to them.</div><div class="row" style="margin-top:10px;gap:8px"><button class="small" data-review="share">Share link</button><button class="secondary small" data-review="copy">Copy link</button></div></div>';
  }
  document.addEventListener('click', function (e) {
    var cb = e.target && e.target.closest ? e.target.closest('[data-calcopy]') : null;
    if (cb) { var link = cb.getAttribute('data-calcopy'); try { navigator.clipboard.writeText(link).then(function () { cb.textContent = 'Copied ✓'; }, function () { cb.textContent = link; }); } catch (err) { cb.textContent = link; } return; }
  });
  document.addEventListener('click', function (e) {
    var ib = e.target && e.target.closest ? e.target.closest('#doinstall') : null;
    if (ib && installPrompt) { installPrompt.prompt(); installPrompt.userChoice.then(function () { installPrompt = null; ib.closest('.tip').remove(); }).catch(function () { /* ignore */ }); return; }
  });
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-review]') : null, u = reviewUrl();
    if (!b || !u) return;
    if (b.getAttribute('data-review') === 'copy') { try { navigator.clipboard.writeText(u); b.textContent = 'Copied ✓'; } catch (err) { b.textContent = u; } }
    else if (navigator.share) navigator.share({ title: 'Leave us a review', url: u }).catch(function () { /* cancelled */ });
    else window.location.href = u;
  });
  function telFor(n) { var d = String(n || '').replace(/[^\d+]/g, ''); if (d.charAt(0) === '0') d = '+61' + d.slice(1); return d; }
  // Drafted texts for the seller: one to confirm the time (the app alerts Declan an hour before) and one for when he arrives
  function sellerButtons(m) {
    var tel = telFor(m.seller_contact), me = profile.name || 'Declan', first = String(m.seller_name || '').split(' ')[0] || 'there';
    if (isOwner()) return '<div class="row" style="margin-top:8px;gap:8px"><a class="btnlink green" href="sms:' + tel + '">💬 Message ' + esc(first) + '</a><a class="btnlink" href="tel:' + tel + '">📞 Call</a></div><div class="muted" style="margin-top:4px">' + esc(m.seller_contact) + '</div>';
    var d = new Date(m.starts_at), clock = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }), isToday = d.toDateString() === new Date().toDateString(),
      day = isToday ? ' today' : ' on ' + d.toLocaleDateString('en-AU', { weekday: 'long' });
    var confirmTxt = 'Hey ' + first + ', it’s ' + me + ' from Cash for Phones. Just checking you’re still good for our ' + clock + ' meetup' + (m.location ? ' at ' + m.location : '') + day + ' for your ' + m.model + '?';
    var arriveTxt = 'Hey ' + first + ', it’s ' + me + '. I’ve just arrived' + (m.location ? ' at ' + m.location : '') + '.';
    return '<div style="margin-top:8px"><a class="btnlink green" href="' + smsTo(tel, confirmTxt) + '">💬 Confirm with ' + esc(first) + '</a></div>' +
      '<div class="row" style="margin-top:8px;gap:8px"><a class="btnlink" href="' + smsTo(tel, arriveTxt) + '">📍 I’ve arrived</a><a class="btnlink" href="tel:' + tel + '">📞 Call</a></div><div class="muted" style="margin-top:4px">' + esc(m.seller_contact) + '</div>';
  }
  function meetupCard(m) {
    var st = MEETUP_STATUS[m.status] || ['bought', m.status], owner = isOwner(), booked = m.status === 'booked', late = booked && new Date(m.starts_at) < new Date();
    var acts = '';
    if (owner && booked) acts = '<div class="acts"><button class="secondary small" data-medit="' + m.id + '">Edit</button><button class="secondary small" data-mcancel="' + m.id + '" style="color:var(--red)">Cancel meetup</button></div>';
    if (!owner && booked) acts = '<div class="acts"><button class="small" data-mlog="' + m.id + '">Log this phone</button><button class="secondary small" data-mans="no_sale" data-id="' + m.id + '">No sale</button><button class="secondary small" data-mans="no_show" data-id="' + m.id + '">No show</button>' + (reviewUrl() ? '<button class="secondary small" data-review="share">⭐ Review link</button>' : '') + '</div>';
    return '<div class="card phonecard"><div class="top"><div><div class="name">' + fmtWhen(m.starts_at, m.partner_id) + '</div><div class="meta">' + (late ? '<span style="color:var(--amber)">Did this happen? </span>' : '') + esc(m.model) + '</div></div><span class="pill ' + st[0] + '">' + st[1] + '</span></div>' +
      '<div style="margin-top:8px"><b>' + esc(m.seller_name) + '</b> · Quote ' + money(m.quoted_min_cents) + (m.quoted_max_cents !== m.quoted_min_cents ? '–' + money(m.quoted_max_cents) : '') + '</div>' +
      (m.issues ? '<div class="muted">' + esc(m.issues) + '</div>' : '') +
      (m.seller_contact ? sellerButtons(m) : '') +
      (m.location ? '<div style="margin-top:6px"><a class="maplink" href="' + mapsLink(m.location) + '">📍 ' + esc(m.location) + '</a></div>' : '') +
      (m.notes ? '<div class="muted" style="margin-top:4px">' + esc(m.notes) + '</div>' : '') +
      (m._pending ? '<div class="muted" style="margin-top:6px">waiting to send</div>' : '') + acts + '</div>';
  }
  function meetupSections() {
    var now = new Date(), list = sortedMeetups(), booked = list.filter(function (m) { return m.status === 'booked'; });
    var upcoming = booked.filter(function (m) { return new Date(m.starts_at) >= now; });
    var toClose = booked.filter(function (m) { return new Date(m.starts_at) < now; });
    var done = list.filter(function (m) { return m.status !== 'booked'; }).reverse().slice(0, 25);
    return (toClose.length ? '<h2>Needs an answer</h2>' + toClose.map(meetupCard).join('') : '') +
      '<h2>Upcoming</h2>' + (upcoming.length ? upcoming.map(meetupCard).join('') : '<div class="empty">No meetups booked.</div>') +
      (done.length ? '<h2>Done</h2>' + done.map(meetupCard).join('') : '');
  }
  function bindMeetupActions() {
    all('[data-mlog]').forEach(function (b) { b.onclick = function () { startLogFromMeetup(b.getAttribute('data-mlog')); }; });
    all('[data-mans]').forEach(function (b) {
      b.onclick = function () {
        var st = b.getAttribute('data-mans'), id = b.getAttribute('data-id');
        if (!confirm(st === 'no_sale' ? 'Mark this as No sale (you met but didn’t buy)?' : 'Mark this as No show (the seller didn’t turn up)?')) return;
        queue.push({ kind: 'meetup', id: id, patch: { status: st } }); setQueue(queue); syncQueue(); go('meetups', undefined, true);
      };
    });
    all('[data-medit]').forEach(function (b) { b.onclick = function () { go('obook', b.getAttribute('data-medit')); }; });
    all('[data-mcancel]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('Cancel this meetup? It disappears from their calendar.')) return;
        if (!navigator.onLine) { alert('You need signal to do that.'); return; }
        var r = await sb.from('partner_meetups').update({ status: 'cancelled' }).eq('id', b.getAttribute('data-mcancel')).select('id');
        if (r.error) { alert('Couldn’t cancel: ' + r.error.message); return; }
        await refreshPhones(); go('omeetups', undefined, true);
      };
    });
  }
  function startLogFromMeetup(id) {
    var m = meetups.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    if (draft && draft.model && !confirm('You have another phone half-logged. Replace it with this one?')) return;
    draft = newDraft(); draft.meetupId = id;
    if (catalogue.models.some(function (x) { return x.name === m.model; })) draft.model = m.model;
    draft.quote = quoteText(m.quoted_min_cents, m.quoted_max_cents);
    persistDraft(); go('log');
  }
  VIEWS.meetups = function () {
    shell('<h1>Meetups</h1><div id="pushcard"></div>' + calendarCard() + reviewCard() + meetupSections());
    bindMeetupActions(); renderPushCard();
  };

  // owner side: book Declan's meetups
  VIEWS.omeetups = function () {
    shell('<h1>' + pn() + '’s meetups</h1><a class="btnlink" href="guides.html" style="margin-bottom:12px">📖 Preview the guides</a><div id="pushcard"></div>' + availOwnerCard() + agreementOwnerCard() + onbOwnerCard() + '<button id="book">＋ Book a meetup</button>' + meetupSections() +
      '<div class="row" style="margin-top:18px"><span class="muted">' + esc(profile.name || 'Ethan') + ' · owner · ' + esc(versionText(VERSION)) + '</span><button class="link" id="out" style="text-align:right">Log out</button></div>');
    $('book').onclick = function () { go('obook'); };
    bindOnbOwner(); bindAgreementsOwner();
    renderPushCard();
    $('out').onclick = async function () { try { await sb.auth.signOut(); } catch (e) { /* offline */ } session = null; current = ''; clearCaches(); go('login'); };
    bindMeetupActions();
  };
  function toLocalInput(iso) { var d = new Date(iso), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  VIEWS.obook = function (id) {
    var m = id ? meetups.filter(function (x) { return x.id === id; })[0] : null;
    var who = m ? partnerById(m.partner_id) : viewingPartner(), tz = who ? (who.timezone || 'Australia/Brisbane') : 'Australia/Brisbane';
    shell('<h1>' + (m ? 'Edit meetup' : 'Book a meetup') + '</h1><div class="card">' +
      (!m && partnerOptions().length > 1 ? '<label>Booking for</label><select id="sp">' + partnerOptions().map(function (p) { return '<option value="' + p.id + '"' + (who && who.id === p.id ? ' selected' : '') + '>' + esc(p.name) + (p.city_name ? ' · ' + esc(p.city_name) : '') + '</option>'; }).join('') + '</select>' : '') +
      '<label>Seller’s name</label><input id="sn" autocomplete="off" value="' + esc(m ? m.seller_name : '') + '">' +
      '<label>Seller’s phone number</label><input id="sc" type="tel" inputmode="tel" autocomplete="off" placeholder="e.g. 0412 345 678" value="' + esc(m ? m.seller_contact || '' : '') + '"><div class="hint">Declan gets this on his meetup card so he can message them.</div>' +
      '<label>Phone model</label><input id="sm" list="modellist" autocomplete="off" placeholder="e.g. iPhone 14 Pro 256GB" value="' + esc(m ? m.model : '') + '"><datalist id="modellist">' + catalogue.models.map(function (x) { return '<option value="' + esc(x.name) + '">'; }).join('') + '</datalist>' +
      '<label>Issues</label><textarea id="si" rows="2" placeholder="e.g. cracked screen, battery 82%">' + esc(m ? m.issues || '' : '') + '</textarea>' +
      '<label>Quote ($)</label><input id="sq" inputmode="text" placeholder="e.g. 230-260" value="' + esc(m ? quoteText(m.quoted_min_cents, m.quoted_max_cents) : '') + '">' +
      '<label>Date and time' + (who && who.city_name && tz !== Intl.DateTimeFormat().resolvedOptions().timeZone ? ' (' + esc(who.city_name) + ' time)' : '') + '</label><input id="sw" type="datetime-local" value="' + (m ? toZonedInput(m.starts_at, tz) : '') + '"><div class="hint" id="avh"></div>' +
      '<label>Where are they meeting?</label><input id="sl" autocomplete="off" placeholder="e.g. Stockland Aitkenvale, food court" value="' + esc(m ? m.location || '' : '') + '">' +
      '<label>Notes for ' + esc(who ? who.name : 'them') + ' (optional)</label><textarea id="sx" rows="2">' + esc(m ? m.notes || '' : '') + '</textarea>' +
      '<div class="err" id="err"></div></div><button id="save">' + (m ? 'Save changes' : 'Book it') + '</button><div class="gap"></div><button class="secondary" id="cancel">Cancel</button>');
    $('cancel').onclick = function () { go('omeetups'); };
    // what the partner said about the day you're booking
    function availHint() {
      var p = $('sp') ? partnerById($('sp').value) : who, v = $('sw').value; if (!p) return null;
      if (!v) { $('avh').textContent = ''; return null; }
      var a = availFor(p, v.slice(0, 10)), mins = inputMin(v.slice(11)), out = false;
      if (!a) { $('avh').innerHTML = '<span class="muted">' + esc(p.name) + ' hasn’t said when he’s free that day.</span>'; return null; }
      out = !a.ok || (mins !== null && (mins < a.start || mins >= a.end));
      $('avh').innerHTML = (out ? '<span style="color:var(--amber)">⚠ ' : '<span style="color:var(--green)">✓ ') + esc(p.name) + ': ' + esc(a.text) + '</span>';
      return out ? a : null;
    }
    $('sw').onchange = availHint; $('sw').oninput = availHint; availHint();
    // the partner's usual meeting spot goes in for you (you can still change it)
    var lastSpot = '';
    function fillSpot() { var p = $('sp') ? partnerById($('sp').value) : who; if (!m && p && p.meet_location && (!$('sl').value || $('sl').value === lastSpot)) { $('sl').value = p.meet_location; } lastSpot = p && p.meet_location || ''; }
    if ($('sp')) $('sp').onchange = function () { availHint(); fillSpot(); };
    fillSpot();
    $('save').onclick = async function () {
      var picked = $('sp') ? partnerById($('sp').value) : who, ptz = picked ? (picked.timezone || 'Australia/Brisbane') : tz;
      var q = parseQuote($('sq').value), when = $('sw').value ? zonedToUtc($('sw').value, ptz) : null, declan = picked, err = '';
      if (!$('sn').value.trim()) err = 'Enter the seller’s name.';
      else if (!$('sm').value.trim()) err = 'Enter the phone model.';
      else if (!q) err = 'Enter the quote, like 230-260.';
      else if (!when || isNaN(when)) err = 'Pick the date and time.';
      else if (!$('sl').value.trim()) err = 'Enter where they’re meeting.';
      else if (!declan) err = 'Their login isn’t set up yet.';
      else if (!navigator.onLine) err = 'You need signal to book a meetup.';
      if (err) { $('err').textContent = err; return; }
      var outside = availHint(); if (outside && !confirm('That’s outside ' + (picked ? picked.name : 'their') + '’s free times (' + outside.text + '). Book it anyway?')) return;
      $('save').disabled = true;
      var fields = { seller_name: $('sn').value.trim(), seller_contact: $('sc').value.trim() || null, model: $('sm').value.trim(), issues: $('si').value.trim() || null, quoted_min_cents: q.min, quoted_max_cents: q.max, starts_at: when.toISOString(), location: $('sl').value.trim(), notes: $('sx').value.trim() || null };
      var r = m ? await sb.from('partner_meetups').update(fields).eq('id', id).select('id') : await sb.from('partner_meetups').insert(Object.assign({ id: uuid(), partner_id: declan.id, status: 'booked' }, fields));
      if (r.error) { $('err').textContent = 'Couldn’t save: ' + r.error.message; $('save').disabled = false; return; }
      await refreshPhones(); go('omeetups');
    };
  };

  // ---------- boot ----------
  async function boot() {
    if ('serviceWorker' in navigator) {
      var had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').catch(function () {});
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!had) { had = true; return; } // first install, nothing to refresh
        // A new version is ready. Don't reload while Declan is looking at the screen (that's the flash): wait until he leaves the app or goes Home.
        if (document.hidden && !(current === 'log' && draft && draft.model)) location.reload(); else pendingReload = true;
      });
    }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* not supported */ }
    document.addEventListener('focusin', function (e) { var t = e.target; if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'checkbox'))) document.body.classList.add('kb'); });
    setInterval(function () { var a = document.activeElement; if (document.body.classList.contains('kb') && !(a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox')))) document.body.classList.remove('kb'); }, 1500);
    document.addEventListener('focusout', function () { setTimeout(function () { var a = document.activeElement; if (!(a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox')))) document.body.classList.remove('kb'); }, 80); });
    if (!window.CONFIG || !window.CONFIG.SUPABASE_URL) { shell('<h1>Not set up yet</h1><p class="muted">Tell Ethan the app isn’t connected.</p>'); return; }
    sb = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'declan-auth' } });
    session = await liveSession();
    if (!session && hasStoredLogin()) session = { offlineUntilSignal: true };
    renderBanner();
    if (!session) return go('login');
    routeToMyCity();
    go(isOwner() ? 'omeetups' : 'home');
    var deep = new URLSearchParams(location.search).get('go');
    if (deep === 'meetups' && !isOwner()) go('meetups');
    if (deep === 'avail' && !isOwner()) go('avail');
    if (deep === 'ship') go(isOwner() ? 'oship' : 'ship');
    if (deep === 'agreement' && !isOwner()) loadProfile().then(function () { if (profile.agreement_version) go('agreement'); });
    if (deep) history.replaceState(null, '', location.pathname);
    loadCatalogue(); loadProfile(); refreshPhones(); syncQueue(); ensurePush();
    window.addEventListener('online', function () { loadCatalogue(); loadProfile(); syncQueue(); renderBanner(); });
    window.addEventListener('offline', renderBanner);
    document.addEventListener('visibilitychange', function () { if (document.hidden) { if (pendingReload && !(current === 'log' && draft && draft.model)) location.reload(); } else { syncQueue(); refreshPhones(); } });
    setInterval(syncQueue, 30000);
  }
  boot();
})();
