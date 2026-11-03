(function () {
  'use strict';
  var D = window.Deductions;
  var $app = document.getElementById('app');
  var $banner = document.getElementById('banner');
  var $tabs = document.getElementById('tabs');
  var $actions = document.getElementById('actions');
  var sb = null, session = null;
  var VERSION = (window.CONFIG && window.CONFIG.APP_VERSION) || 'dev';
  var MIN_SHIP = 5;
  var catalogue = load('catalogue', { models: [], deds: [] });
  var serverPhones = load('phones', []);
  var serverBatches = load('batches', []);
  var queue = load('queue', []);
  var profile = load('profile', { name: '', role: '' });
  var meetups = load('meetups', []);
  var partnersList = load('partners', []);
  var settings = load('settings', {});
  var lastSync = load('lastsync', null);
  var draft = load('draft', null);

  // ---------- helpers ----------
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem('declan_' + k)); return v === null || v === undefined ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { if (v === null) localStorage.removeItem('declan_' + k); else localStorage.setItem('declan_' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(c) { return '$' + (c / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function storageText(gb) { return gb >= 1024 && gb % 1024 === 0 ? (gb / 1024) + 'TB' : gb + 'GB'; }
  function uuid() { return (crypto.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  function isNetworkError(e) { return !navigator.onLine || /fetch|network|load failed|timeout/i.test((e && e.message) || ''); }
  function $(id) { return document.getElementById(id); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function dollarsToCents(v) { var n = parseFloat(v); return isNaN(n) ? null : Math.round(n * 100); }
  function isStandalone() { return !!(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)); }
  function fmtDate(iso) { var d = new Date(iso); return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }); }
  function persistDraft() { save('draft', draft); }
  // On logout, forget the previous person's saved data so the next login on this phone starts clean.
  function clearCaches() { ['profile', 'phones', 'batches', 'meetups', 'settings', 'partners', 'lastsync'].forEach(function (k) { save(k, null); }); profile = { name: '', role: '' }; serverPhones = []; serverBatches = []; meetups = []; settings = {}; partnersList = []; lastSync = null; }
  // The version stamp is year.month.day.hhmm (e.g. 2026.11.03.2013) — show it as a plain "Updated 3 Nov, 8:13 pm".
  function versionText(v) {
    var m = /^(\d{4})\.(\d\d)\.(\d\d)\.(\d\d)(\d\d)$/.exec(v || '');
    if (!m) return 'Test version';
    var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return 'App updated ' + d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  }
  function isOwner() { return profile.role === 'owner'; }
  function fmtWhen(iso) { var d = new Date(iso); return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }); }
  function quoteText(min, max) { return min === max ? String(max / 100) : (min / 100) + '-' + (max / 100); }
  function mapsLink(place) { return 'https://maps.apple.com/?q=' + encodeURIComponent(place); }
  var MEETUP_STATUS = { booked: ['bought', 'Booked'], bought: ['received', '✓ Bought'], no_sale: ['kept', 'No sale'], no_show: ['damaged', 'No show'], cancelled: ['kept', 'Cancelled'] };

  var ICON = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    list: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    box: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/></svg>'
  };

  // ---------- offline queue ----------
  function setQueue(q) { queue = q; save('queue', q); renderBanner(); }
  function renderBanner() {
    var pending = queue.filter(function (i) { return !i.failed; }).length;
    var failed = queue.filter(function (i) { return i.failed; });
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
            var r = await sb.from('partner_phones').update({ status: 'shipped', batch_id: item.batch.id }).in('id', item.phoneIds).select('id');
            error = r.error;
            if (!error && (r.data || []).length < item.phoneIds.length) error = { message: 'Some phones in this shipment hadn’t saved yet. Tell Ethan.' };
          }
        } else if (item.kind === 'edit') {
          var e1 = await sb.from('partner_phones').update(item.patch).eq('id', item.id).select('id');
          error = e1.error;
          if (!error && !(e1.data || []).length) error = { message: 'That phone can’t be changed any more (it may already be shipped).' };
        } else if (item.kind === 'meetup') {
          var m1 = await sb.from('partner_meetups').update(item.patch).eq('id', item.id).select('id');
          error = m1.error;
          if (!error && !(m1.data || []).length) error = { message: 'That meetup couldn’t be updated. Tell Ethan.' };
        } else if (item.kind === 'delete') {
          var d1 = await sb.from('partner_phones').delete().eq('id', item.id).select('id');
          error = d1.error;
          if (!error && !(d1.data || []).length) error = { message: 'That phone can’t be deleted any more (it may already be shipped).' };
        }
        if (error) {
          if (isNetworkError(error)) break;
          item.failed = error.message;
        } else { queue.splice(i, 1); i--; }
      }
    } catch (e) { /* network dropped mid-sync; try again later */ }
    setQueue(queue); syncing = false;
    if (navigator.onLine) refreshPhones();
  }
  async function refreshPhones() {
    if (!sb || !session || !navigator.onLine) return;
    try {
      var r = await sb.from('partner_phones').select('*').order('bought_at', { ascending: false }).limit(500);
      var b = await sb.from('partner_batches').select('*').order('shipped_at', { ascending: false }).limit(100);
      if (!r.error) { serverPhones = r.data; save('phones', serverPhones); lastSync = new Date().toISOString(); save('lastsync', lastSync); }
      if (b && !b.error) { serverBatches = b.data; save('batches', serverBatches); }
      var mt = await sb.from('partner_meetups').select('*').order('starts_at', { ascending: true }).limit(400);
      if (mt && !mt.error) { meetups = mt.data; save('meetups', meetups); }
      if (['home', 'phones', 'ship', 'meetups', 'omeetups'].indexOf(current) > -1) go(current, undefined, true);
    } catch (e) { /* offline */ }
  }
  async function loadCatalogue() {
    if (!sb || !session || !navigator.onLine) return;
    try {
      var m = await sb.from('partner_models').select('*').order('sort_order');
      var d = await sb.from('partner_deductions').select('*').limit(2000);
      if (!m.error && !d.error && m.data.length) { catalogue = { models: m.data, deds: d.data }; save('catalogue', catalogue); }
    } catch (e) { /* offline */ }
  }
  async function loadProfile() {
    if (!sb || !session || !session.user || !navigator.onLine) return;
    try {
      var p = await sb.from('partners').select('name,role').eq('id', session.user.id).maybeSingle();
      var before = profile.role;
      if (p.data && p.data.name) { profile = { name: p.data.name, role: p.data.role || '' }; save('profile', profile); }
      if (before !== profile.role && current && current !== 'login') setTimeout(function () { go(isOwner() ? 'omeetups' : 'home'); }, 0);
      if (profile.role === 'owner') { var pl = await sb.from('partners').select('id,name,role'); if (pl && !pl.error) { partnersList = pl.data; save('partners', partnersList); } }
      var s = await sb.from('app_settings').select('key,value');
      if (!s.error && s.data) { var o = {}; s.data.forEach(function (x) { o[x.key] = x.value; }); settings = o; save('settings', o); }
    } catch (e) { /* offline, or settings not set up yet */ }
  }
  // Everything Declan has, with unsent changes applied on top so the screen is always right.
  function allPhones() {
    var edits = {}, deleted = {}, shipped = {}, ids = {}, out = [];
    queue.forEach(function (i) {
      if (i.kind === 'edit') edits[i.id] = Object.assign(edits[i.id] || {}, i.patch);
      if (i.kind === 'delete') deleted[i.id] = 1;
      if (i.kind === 'batch') i.phoneIds.forEach(function (id) { shipped[id] = i.batch.id; });
    });
    queue.forEach(function (i) { if (i.kind === 'phone') { ids[i.row.id] = 1; out.push(Object.assign({ _pending: true, _failed: !!i.failed }, i.row)); } });
    serverPhones.forEach(function (p) { if (!ids[p.id]) out.push(Object.assign({}, p)); });
    out = out.filter(function (p) { return !deleted[p.id]; }).map(function (p) {
      if (edits[p.id]) Object.assign(p, edits[p.id], { _pending: true });
      if (shipped[p.id]) { p.status = 'shipped'; p.batch_id = shipped[p.id]; }
      return p;
    });
    return out.sort(function (a, b) { return new Date(b.bought_at) - new Date(a.bought_at); });
  }
  // Meetups with Declan's unsent answers (bought / no sale / no show) applied on top.
  function allMeetups() {
    var patches = {};
    queue.forEach(function (i) { if (i.kind === 'meetup') patches[i.id] = Object.assign(patches[i.id] || {}, i.patch); });
    return meetups.map(function (m) { return patches[m.id] ? Object.assign({}, m, patches[m.id], { _pending: true }) : m; });
  }
  function readyToShip() { return allPhones().filter(function (p) { return p.type === 'damaged' && p.status === 'bought' && !p._failed; }); }
  function batchTracking(id) { var b = serverBatches.filter(function (x) { return x.id === id; })[0]; if (b) return b.tracking_number; var q = queue.filter(function (i) { return i.kind === 'batch' && i.batch.id === id; })[0]; return q ? q.batch.tracking_number : ''; }

  // ---------- routing ----------
  var current = '';
  var pendingReload = false;
  var VIEWS = {};
  function go(view, arg, keepScroll) {
    if (pendingReload && view === 'home') { location.reload(); return; }
    if (isOwner() && (view === 'home' || view === 'log' || view === 'ship')) view = 'omeetups';
    current = view;
    if (!keepScroll) window.scrollTo(0, 0);
    var scroll = window.scrollY;
    $app.className = (view === 'log' || view === 'login') ? 'nobar' : '';
    noAnim = !!keepScroll;
    $actions.innerHTML = '';
    VIEWS[view](arg);
    if (keepScroll) window.scrollTo(0, scroll);
    renderTabs();
  }
  var noAnim = false;
  function shell(html) { $app.innerHTML = '<div class="view"' + (noAnim ? ' style="animation:none"' : '') + '>' + html + '</div>'; }
  function renderTabs() {
    var hide = !session || current === 'login' || current === 'log' || current === 'edit' || !current;
    $tabs.hidden = hide;
    if (hide) return;
    var active = current === 'issues' || current === 'help' ? 'home' : current === 'edit' ? 'phones' : current === 'obook' ? 'obook' : current;
    var ready = readyToShip().length;
    function tab(id, label, icon, extra) { return '<button class="tab ' + id + (active === id ? ' on' : '') + '" data-tab="' + id + '">' + icon + (extra || '') + '<span>' + label + '</span></button>'; }
    if (isOwner()) { $tabs.innerHTML = tab('omeetups', 'Meetups', ICON.cal) + tab('obook', 'Book', ICON.plus) + tab('phones', 'Phones', ICON.list); }
    else {
      var due = allMeetups().filter(function (m) { return m.status === 'booked' && new Date(m.starts_at) < new Date(); }).length;
      $tabs.innerHTML = tab('home', 'Home', ICON.home) + tab('meetups', 'Meetups', ICON.cal, due ? '<span class="dot">' + due + '</span>' : '') + tab('log', 'Log', ICON.plus) + tab('phones', 'Phones', ICON.list) +
        tab('ship', 'Ship', ICON.box, ready >= MIN_SHIP ? '<span class="dot">' + ready + '</span>' : '');
    }
    all('[data-tab]').forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-tab')); }; });
  }

  // ---------- login ----------
  VIEWS.login = function (msg) {
    shell('<div class="brand"><img src="icons/logo.png" alt="Cash for Phones Townsville"><h1>Cash for Phones</h1><div class="sub">Townsville partner app</div></div>' +
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
    return '<div class="tip"><b>Do this first:</b> tap the Share button <b>⬆︎</b> in Safari, choose <b>Add to Home Screen</b>, then open the app from your Home Screen and log in there. That way it keeps you logged in and never loses a phone you logged.<div style="margin-top:8px"><button class="link" id="hideinstall" type="button" onclick="localStorage.setItem(\'declan_hideinstall\',\'true\');this.closest(\'.tip\').remove()">Already done</button></div></div>';
  }

  // ---------- home ----------
  VIEWS.home = function () {
    var ready = readyToShip().length;
    var inProgress = draft && draft.model;
    var name = profile.name ? 'Hey ' + esc(profile.name) : 'Hey';
    var tel = phoneForLinks();
    shell('<div class="greet"><img src="icons/logo.png" alt=""><div><h1>' + name + ' 👋</h1><div id="sentstatus" style="font-weight:600;font-size:14px"></div></div></div>' +
      installTip() +
      (inProgress ? '<div class="card"><b>Phone in progress</b><div class="muted">' + esc(draft.model) + ' — saved, pick up where you left off.</div><div class="row" style="margin-top:12px"><button id="cont">Continue</button><button class="secondary" id="discard">Discard</button></div></div>' : '') +
      nextMeetupCard() + '<div id="pushcard"></div>' +
      '<button id="log" style="font-size:18px;padding:18px">＋ Log a phone</button>' +
      '<h2>Ready to ship</h2><div class="card"><div class="row between"><b>' + ready + ' damaged ' + (ready === 1 ? 'phone' : 'phones') + '</b><span class="muted fixed">' + (ready >= MIN_SHIP ? 'Ready to ship!' : (MIN_SHIP - ready) + ' more to go') + '</span></div>' +
      '<div class="bar"><i style="width:' + Math.min(100, Math.round(ready / MIN_SHIP * 100)) + '%"></i></div>' +
      '<div class="muted">Ship when you have ' + MIN_SHIP + ' or more. Mint phones you keep.</div>' +
      (ready ? '<div style="height:12px"></div><button class="' + (ready >= MIN_SHIP ? '' : 'secondary') + '" id="ship">Ship a batch</button>' : '') + '</div>' +
      (tel ? '<h2>Need Ethan?</h2><div class="row"><a class="btnlink green" href="sms:' + tel + '">💬 Message Ethan</a><a class="btnlink" href="tel:' + tel + '">📞 Call</a></div>' : '') +
      '<div class="row" style="margin-top:18px"><button class="link" id="help">Rules &amp; help</button><button class="link" id="out" style="text-align:right">Log out</button></div>' +
      '<div class="sync">' + (lastSync ? 'Synced ' + fmtDate(lastSync) + ' · ' : '') + esc(versionText(VERSION)) + '</div>');
    if ($('nextm')) $('nextm').onclick = function () { go('meetups'); };
    renderPushCard();
    $('log').onclick = function () { go('log'); }; if ($('ship')) $('ship').onclick = function () { go('ship'); };
    if ($('cont')) $('cont').onclick = function () { go('log'); };
    if ($('discard')) $('discard').onclick = function () { if (confirm('Throw this phone away without saving?')) { draft = null; persistDraft(); go('home'); } };
    $('help').onclick = function () { go('help'); };
    $('out').onclick = async function () {
      if (queue.length && !confirm('You have phones that haven’t sent yet. If you log out now you could lose them. Log out anyway?')) return;
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
      '<li>Price paid can’t be more than <b>the quote minus the deductions</b>. The app blocks it.</li>' +
      '<li>Battery under 85%: $50 off (iPhone 14 and below) or $70 off (15 and above). Always taken under 80%.</li>' +
      '<li>Smashed camera lens: $20 each. If the camera itself is exposed: $50 each.</li>' +
      '<li>A scratched or replaced screen counts as a broken screen.</li>' +
      '<li>Damaged phones: ship when you have ' + MIN_SHIP + ' or more (or Ethan says it’s OK to ship fewer).</li>' +
      '<li>Mint phones you keep.</li></ul></div>' +
      '<div class="card"><b>Using the app</b><ul class="rules"><li>No signal? Keep logging. Phones are saved on your phone and send by themselves.</li>' +
      '<li>Made a mistake? In <b>Phones</b>, tap <b>Edit</b> or <b>Delete</b> — only until it’s shipped.</li>' +
      '<li>If the app closes halfway through a phone, it’s saved. Open the app and tap <b>Continue</b>.</li></ul></div>' +
      (tel ? '<div class="row"><a class="btnlink green" href="sms:' + tel + '">💬 Message Ethan</a><a class="btnlink" href="tel:' + tel + '">📞 Call</a></div>' : '') +
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
    if (i.kind === 'batch') return 'Shipment ' + i.batch.tracking_number + ' (' + i.phoneIds.length + ' phones)';
    if (i.kind === 'edit') return 'A change to a saved phone';
    if (i.kind === 'meetup') return 'Your answer for a meetup';
    return 'Deleting a phone';
  }

  // ---------- log a phone ----------
  var STEPS = [
    { id: 'phone', title: 'The phone' }, { id: 'battery', title: 'Battery' }, { id: 'parts', title: 'Parts & service history' },
    { id: 'screen', title: 'Screen' }, { id: 'cameras', title: 'Cameras' }, { id: 'frame', title: 'Frame & back' },
    { id: 'buttons', title: 'Face ID, speaker & ports' }, { id: 'price', title: 'Price paid' }
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
    if (id === 'cameras') return '<div class="card"><div class="row"><div><label>Smashed lenses</label><div class="stepper"><button type="button" data-lens="lc" data-d="-1">−</button><b id="lcv">' + draft.lensesCracked + '</b><button type="button" data-lens="lc" data-d="1">＋</button></div></div>' +
      '<div><label>Camera exposed (lens gone)</label><div class="stepper"><button type="button" data-lens="le" data-d="-1">−</button><b id="lev">' + draft.lensesExposed + '</b><button type="button" data-lens="le" data-d="1">＋</button></div></div></div>' +
      '<label>Camera not working</label><div class="chips">' + faultChip('rearCam') + faultChip('frontCam') + '</div><div class="hint">A4 paper test: point each camera at a sheet of paper and check it’s clear.</div></div>';
    if (id === 'frame') return '<div class="card"><div class="chips">' + faultChip('frame') + faultChip('back_broken') + '</div></div>';
    if (id === 'buttons') return '<div class="card"><div class="chips">' + faultChip('faceid') + faultChip('speaker') + faultChip('charging') + faultChip('board') + '</div></div>';
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
    if (warn) warn.innerHTML = (cap !== null && paid !== null && paid > cap) ? '<div class="err">You can’t pay more than ' + money(cap) + ' (the top of the quote minus deductions).</div>' : '';
  }

  var saving = false;
  function savePhone() {
    if (saving) return;
    var err = '';
    var q = parseQuote(draft.quote), qMin = q ? q.min : null, qMax = q ? q.max : null, paid = dollarsToCents(draft.paid), t = totals(), cap = maxPay(q, t.total);
    if (!draft.model) err = 'Choose the model.';
    else if (!q) err = 'Enter the quote for this phone, like 230-260.';
    else if (paid === null) err = 'Enter the price paid.';
    else if (paid > cap) err = 'You can’t pay more than ' + money(cap) + ' (the top of the quote minus deductions).';
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
    if (p.type === 'mint' && p.status === 'bought') return ['kept', 'With you'];
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
    shell('<h1>My phones</h1><input id="search" type="search" placeholder="Search model or colour" value="' + esc(phoneSearch) + '" style="margin-bottom:10px">' +
      '<div class="chips" style="margin-bottom:14px">' + filters.map(function (f) { return '<button type="button" class="chip' + (phoneFilter === f[0] ? ' on' : '') + '" data-filter="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      (shown.length ? shown.map(function (p) {
        var st = statusLabel(p), canEdit = !isOwner() && p.status === 'bought' && !p._failed, track = p.batch_id ? batchTracking(p.batch_id) : '';
        return '<div class="card phonecard"><div class="top"><div><div class="name">' + esc(p.model) + (p.storage_gb ? ' ' + storageText(p.storage_gb) : '') + '</div><div class="meta">' + esc(p.colour || '') + (p.colour ? ' · ' : '') + fmtDate(p.bought_at) + '</div></div><span class="pill ' + p.type + '">' + p.type + '</span></div>' +
          '<div class="money"><span>Paid ' + money(p.price_paid_cents) + '</span><span class="muted">Quote ' + money(p.quoted_min_cents) + (p.quoted_max_cents !== p.quoted_min_cents ? '–' + money(p.quoted_max_cents) : '') + '</span></div>' +
          (p.total_deductions_cents ? '<div class="muted">Deductions ' + money(p.total_deductions_cents) + '</div>' : '') +
          '<div style="margin-top:10px"><span class="pill ' + st[0] + '">' + st[1] + '</span>' + (p._failed ? ' <span class="err">couldn’t send</span>' : p._pending ? ' <span class="muted">waiting to send</span>' : '') + (track ? ' <span class="muted">· Tracking ' + esc(track) + '</span>' : '') + '</div>' +
          (canEdit ? '<div class="acts"><button class="secondary small" data-edit="' + p.id + '">Edit</button><button class="secondary small" data-del="' + p.id + '" style="color:var(--red)">Delete</button></div>' : '') + '</div>';
      }).join('') : '<div class="empty">' + (phones.length ? 'Nothing matches that.' : 'No phones yet. Log your first one!') + '</div>'));
    $('search').oninput = function () { phoneSearch = this.value; var pos = this.selectionStart; go('phones', undefined, true); var s = $('search'); s.focus(); s.setSelectionRange(pos, pos); };
    all('[data-filter]').forEach(function (b) { b.onclick = function () { phoneFilter = b.getAttribute('data-filter'); go('phones', undefined, true); }; });
    all('[data-edit]').forEach(function (b) { b.onclick = function () { go('edit', b.getAttribute('data-edit')); }; });
    all('[data-del]').forEach(function (b) { b.onclick = function () { deletePhone(b.getAttribute('data-del')); }; });
  };
  function deletePhone(id) {
    if (!confirm('Delete this phone? Only do this if you logged it by mistake.')) return;
    var qi = queue.filter(function (i) { return i.kind === 'phone' && i.row.id === id; })[0];
    if (qi) { queue = queue.filter(function (i) { return i !== qi && !((i.kind === 'edit' || i.kind === 'delete') && i.id === id); }); setQueue(queue); }
    else { queue.push({ kind: 'delete', id: id }); setQueue(queue); syncQueue(); }
    go('phones', undefined, true);
  }
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
      var cap = maxPay(q, p.total_deductions_cents || 0);
      if (paid > cap) { $('err').textContent = 'You can’t pay more than ' + money(cap) + ' (the top of the quote minus deductions).'; return; }
      var patch = { quoted_min_cents: q.min, quoted_max_cents: q.max, price_paid_cents: paid, notes: $('en').value.trim() || null };
      var qi = queue.filter(function (i) { return i.kind === 'phone' && i.row.id === id; })[0];
      if (qi) { Object.assign(qi.row, patch); delete qi.failed; setQueue(queue); }
      else { queue = queue.filter(function (i) { return !(i.kind === 'edit' && i.id === id); }); queue.push({ kind: 'edit', id: id, patch: Object.assign({ edited_at: new Date().toISOString() }, patch) }); setQueue(queue); }
      syncQueue(); go('phones');
    };
  };

  // ---------- ship a batch ----------
  VIEWS.ship = function () {
    var ready = readyToShip();
    var sel = {}; ready.forEach(function (p) { sel[p.id] = true; });
    var history = serverBatches.slice();
    queue.forEach(function (i) { if (i.kind === 'batch' && !history.some(function (b) { return b.id === i.batch.id; })) history.unshift(Object.assign({ _pending: true }, i.batch)); });
    function render() {
      var n = Object.keys(sel).filter(function (k) { return sel[k]; }).length;
      shell('<h1>Ship a batch</h1>' + (ready.length ? '<div class="card"><div class="row between"><b>Damaged phones ready</b><span class="muted fixed">' + n + ' selected</span></div>' + ready.map(function (p) {
        return '<div style="margin-top:8px"><button type="button" class="chip' + (sel[p.id] ? ' on good' : '') + '" style="width:100%;border-radius:14px" data-p="' + p.id + '">' + esc(p.model) + (p.storage_gb ? ' ' + storageText(p.storage_gb) : '') + '<small>' + esc(p.colour || '') + ' · paid ' + money(p.price_paid_cents) + '</small></button></div>';
      }).join('') + '</div>' +
        '<div class="card"><div class="bar"><i style="width:' + Math.min(100, Math.round(n / MIN_SHIP * 100)) + '%"></i></div><div class="muted">Ship when you have ' + MIN_SHIP + ' or more.</div>' +
        (n > 0 && n < MIN_SHIP ? '<div style="margin-top:10px"><button type="button" class="chip' + (window._few ? ' on' : '') + '" id="few">Ethan said it’s OK to ship fewer than ' + MIN_SHIP + '</button></div>' : '') +
        '<label>Tracking number</label><input id="trk" autocapitalize="characters" autocomplete="off"></div>' +
        '<button id="go" ' + (n === 0 ? 'disabled' : '') + '>Mark as shipped</button><div class="err" id="err"></div>' : '<div class="empty">No damaged phones waiting to ship.</div>') +
        (history.length ? '<h2>Past shipments</h2>' + history.map(function (b) {
          var count = serverPhones.filter(function (p) { return p.batch_id === b.id; }).length || (b.phoneIds ? b.phoneIds.length : 0);
          return '<div class="card flat"><div class="row between"><b>' + esc(b.tracking_number) + '</b><span class="muted fixed">' + new Date(b.shipped_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + '</span></div>' +
            '<div class="muted">' + (count ? count + ' phones · ' : '') + (b._pending ? 'waiting to send' : b.received_at ? '✓ Received by Ethan' : b.label_sent_at ? 'Label sent' : 'On its way') + '</div></div>';
        }).join('') : ''));
      var trk = $('trk'); if (trk && window._trk) trk.value = window._trk;
      if (trk) trk.oninput = function () { window._trk = this.value; };
      all('[data-p]').forEach(function (b) { b.onclick = function () { sel[b.getAttribute('data-p')] = !sel[b.getAttribute('data-p')]; render(); }; });
      if ($('few')) $('few').onclick = function () { window._few = !window._few; render(); };
      if ($('go')) $('go').onclick = function () {
        var ids = Object.keys(sel).filter(function (k) { return sel[k]; }), t = $('trk').value.trim();
        if (!ids.length) return;
        if (ids.length < MIN_SHIP && !window._few) { $('err').textContent = 'You need ' + MIN_SHIP + ' phones to ship, or tick that Ethan said it’s OK.'; return; }
        if (!t) { $('err').textContent = 'Enter the tracking number.'; return; }
        $('go').disabled = true;
        queue.push({ kind: 'batch', batch: { id: uuid(), tracking_number: t, shipped_at: new Date().toISOString() }, phoneIds: ids }); setQueue(queue);
        window._few = false; window._trk = ''; syncQueue(); go('phones');
      };
    }
    render();
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
  async function renderPushCard() {
    var el = $('pushcard');
    if (!el || isOwner() || !(window.CONFIG && window.CONFIG.VAPID_PUBLIC_KEY)) return;
    if (!pushSupported() || !isStandalone()) { el.innerHTML = '<div class="tip"><b>Want an alert an hour before each meetup?</b> Add the app to your Home Screen first (Share ⬆︎ → Add to Home Screen), open it from the icon, then turn alerts on here.</div>'; return; }
    if (Notification.permission === 'denied') { el.innerHTML = '<div class="tip">Alerts are blocked. Turn them on in <b>Settings › Notifications › Cash for Phones</b>.</div>'; return; }
    var on = false;
    try { var reg = await navigator.serviceWorker.ready; on = Notification.permission === 'granted' && !!(await reg.pushManager.getSubscription()); } catch (e) { /* ignore */ }
    if (on) { el.innerHTML = '<div class="muted" style="margin:0 2px 12px">🔔 Meetup alerts are on — you’ll get one when Ethan books and one an hour before.</div>'; return; }
    el.innerHTML = '<div class="card"><b>🔔 Meetup alerts</b><div class="muted">Get a notification the moment Ethan books a meetup, and another one hour before.</div><div class="gap"></div><button id="pushon">Turn on alerts</button><div class="err" id="pusherr"></div></div>';
    $('pushon').onclick = async function () {
      $('pusherr').textContent = '';
      try {
        var perm = await Notification.requestPermission();
        if (perm !== 'granted') { $('pusherr').textContent = 'Alerts weren’t allowed. You can change this in Settings › Notifications.'; return; }
        if (!(await pushSubscribe())) { $('pusherr').textContent = 'Couldn’t save that. Check your signal and try again.'; return; }
        renderPushCard();
      } catch (e) { $('pusherr').textContent = 'Couldn’t turn alerts on: ' + (e && e.message ? e.message : 'try again'); }
    };
  }

  // ---------- meetups ----------
  function sortedMeetups() { return allMeetups().slice().sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); }); }
  function calendarCard() {
    var tok = settings.calendar_token;
    if (!tok || isOwner()) return '';
    var url = window.CONFIG.SUPABASE_URL.replace(/^https?:\/\//, 'webcal://') + '/functions/v1/calendar?token=' + tok;
    return '<div class="card"><b>📅 Apple Calendar</b><div class="muted">Add this once. Every meetup Ethan books then appears in your calendar by itself, with a reminder. Changes can take a little while to show up, so check this list for anything last-minute.</div><div class="gap"></div><a class="btnlink green" href="' + url + '">Add to Apple Calendar</a></div>';
  }
  function nextMeetupCard() {
    var now = new Date(), mine = sortedMeetups().filter(function (m) { return m.status === 'booked'; });
    var next = mine.filter(function (m) { return new Date(m.starts_at) >= now; })[0];
    var overdue = mine.filter(function (m) { return new Date(m.starts_at) < now; }).length;
    var html = '';
    if (overdue) html += '<div class="tip" id="nextm"><b>' + overdue + (overdue === 1 ? ' meetup needs' : ' meetups need') + ' an answer.</b> Log the phone you bought, or mark it No sale / No show. Tap here.</div>';
    if (next) html += '<div class="card" id="nextm" style="cursor:pointer"><div class="muted" style="font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:12px">Next meetup</div><div class="name" style="font-size:18px;font-weight:800;margin-top:4px">' + fmtWhen(next.starts_at) + '</div><div>' + esc(next.seller_name) + ' · ' + esc(next.model) + '</div>' + (next.location ? '<div class="muted">📍 ' + esc(next.location) + '</div>' : '') + '</div>';
    return html;
  }
  function meetupCard(m) {
    var st = MEETUP_STATUS[m.status] || ['bought', m.status], owner = isOwner(), booked = m.status === 'booked', late = booked && new Date(m.starts_at) < new Date();
    var acts = '';
    if (owner && booked) acts = '<div class="acts"><button class="secondary small" data-medit="' + m.id + '">Edit</button><button class="secondary small" data-mcancel="' + m.id + '" style="color:var(--red)">Cancel meetup</button></div>';
    if (!owner && booked) acts = '<div class="acts"><button class="small" data-mlog="' + m.id + '">Log this phone</button><button class="secondary small" data-mans="no_sale" data-id="' + m.id + '">No sale</button><button class="secondary small" data-mans="no_show" data-id="' + m.id + '">No show</button></div>';
    return '<div class="card phonecard"><div class="top"><div><div class="name">' + fmtWhen(m.starts_at) + '</div><div class="meta">' + (late ? '<span style="color:var(--amber)">Did this happen? </span>' : '') + esc(m.model) + '</div></div><span class="pill ' + st[0] + '">' + st[1] + '</span></div>' +
      '<div style="margin-top:8px"><b>' + esc(m.seller_name) + '</b> · Quote ' + money(m.quoted_min_cents) + (m.quoted_max_cents !== m.quoted_min_cents ? '–' + money(m.quoted_max_cents) : '') + '</div>' +
      (m.issues ? '<div class="muted">' + esc(m.issues) + '</div>' : '') +
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
        if (!confirm('Cancel this meetup? It disappears from Declan’s calendar.')) return;
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
    shell('<h1>Meetups</h1><div id="pushcard"></div>' + calendarCard() + meetupSections());
    bindMeetupActions(); renderPushCard();
  };

  // owner side: book Declan's meetups
  VIEWS.omeetups = function () {
    shell('<h1>Declan’s meetups</h1><button id="book">＋ Book a meetup</button>' + meetupSections() +
      '<div class="row" style="margin-top:18px"><span class="muted">' + esc(profile.name || 'Ethan') + ' · owner · ' + esc(versionText(VERSION)) + '</span><button class="link" id="out" style="text-align:right">Log out</button></div>');
    $('book').onclick = function () { go('obook'); };
    $('out').onclick = async function () { try { await sb.auth.signOut(); } catch (e) { /* offline */ } session = null; current = ''; clearCaches(); go('login'); };
    bindMeetupActions();
  };
  function toLocalInput(iso) { var d = new Date(iso), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  VIEWS.obook = function (id) {
    var m = id ? meetups.filter(function (x) { return x.id === id; })[0] : null;
    shell('<h1>' + (m ? 'Edit meetup' : 'Book a meetup') + '</h1><div class="card">' +
      '<label>Seller’s name</label><input id="sn" autocomplete="off" value="' + esc(m ? m.seller_name : '') + '">' +
      '<label>Phone model</label><input id="sm" list="modellist" autocomplete="off" placeholder="e.g. iPhone 14 Pro 256GB" value="' + esc(m ? m.model : '') + '"><datalist id="modellist">' + catalogue.models.map(function (x) { return '<option value="' + esc(x.name) + '">'; }).join('') + '</datalist>' +
      '<label>Issues</label><textarea id="si" rows="2" placeholder="e.g. cracked screen, battery 82%">' + esc(m ? m.issues || '' : '') + '</textarea>' +
      '<label>Quote ($)</label><input id="sq" inputmode="text" placeholder="e.g. 230-260" value="' + esc(m ? quoteText(m.quoted_min_cents, m.quoted_max_cents) : '') + '">' +
      '<label>Date and time</label><input id="sw" type="datetime-local" value="' + (m ? toLocalInput(m.starts_at) : '') + '">' +
      '<label>Where are they meeting?</label><input id="sl" autocomplete="off" placeholder="e.g. Stockland Aitkenvale, food court" value="' + esc(m ? m.location || '' : '') + '">' +
      '<label>Notes for Declan (optional)</label><textarea id="sx" rows="2">' + esc(m ? m.notes || '' : '') + '</textarea>' +
      '<div class="err" id="err"></div></div><button id="save">' + (m ? 'Save changes' : 'Book it') + '</button><div class="gap"></div><button class="secondary" id="cancel">Cancel</button>');
    $('cancel').onclick = function () { go('omeetups'); };
    $('save').onclick = async function () {
      var q = parseQuote($('sq').value), when = $('sw').value ? new Date($('sw').value) : null, declan = partnersList.filter(function (p) { return p.role === 'partner'; })[0], err = '';
      if (!$('sn').value.trim()) err = 'Enter the seller’s name.';
      else if (!$('sm').value.trim()) err = 'Enter the phone model.';
      else if (!q) err = 'Enter the quote, like 230-260.';
      else if (!when || isNaN(when)) err = 'Pick the date and time.';
      else if (!$('sl').value.trim()) err = 'Enter where they’re meeting.';
      else if (!declan) err = 'Declan’s login isn’t set up yet.';
      else if (!navigator.onLine) err = 'You need signal to book a meetup.';
      if (err) { $('err').textContent = err; return; }
      $('save').disabled = true;
      var fields = { seller_name: $('sn').value.trim(), model: $('sm').value.trim(), issues: $('si').value.trim() || null, quoted_min_cents: q.min, quoted_max_cents: q.max, starts_at: when.toISOString(), location: $('sl').value.trim(), notes: $('sx').value.trim() || null };
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
        if (current === 'log' && draft && draft.model) pendingReload = true; else location.reload();
      });
    }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* not supported */ }
    document.addEventListener('focusin', function (e) { var t = e.target; if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'checkbox'))) document.body.classList.add('kb'); });
    document.addEventListener('focusout', function () { setTimeout(function () { var a = document.activeElement; if (!(a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox')))) document.body.classList.remove('kb'); }, 80); });
    if (!window.CONFIG || !window.CONFIG.SUPABASE_URL) { shell('<h1>Not set up yet</h1><p class="muted">Tell Ethan the app isn’t connected.</p>'); return; }
    sb = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'declan-auth' } });
    session = await liveSession();
    if (!session && hasStoredLogin()) session = { offlineUntilSignal: true };
    renderBanner();
    if (!session) return go('login');
    go(isOwner() ? 'omeetups' : 'home');
    var deep = new URLSearchParams(location.search).get('go');
    if (deep === 'meetups' && !isOwner()) go('meetups');
    if (deep) history.replaceState(null, '', location.pathname);
    loadCatalogue(); loadProfile(); refreshPhones(); syncQueue(); ensurePush();
    window.addEventListener('online', function () { loadCatalogue(); loadProfile(); syncQueue(); renderBanner(); });
    window.addEventListener('offline', renderBanner);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { syncQueue(); refreshPhones(); } });
    setInterval(syncQueue, 30000);
  }
  boot();
})();
