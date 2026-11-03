(function () {
  'use strict';
  var D = window.Deductions;
  var $app = document.getElementById('app');
  var $banner = document.getElementById('banner');
  var sb = null, session = null;
  var catalogue = load('catalogue', { models: [], deds: [] });
  var serverPhones = load('phones', []);
  var queue = load('queue', []);

  // ---------- helpers ----------
  function load(k, d) { try { return JSON.parse(localStorage.getItem('declan_' + k)) || d; } catch (e) { return d; } }
  function save(k, v) { localStorage.setItem('declan_' + k, JSON.stringify(v)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(c) { return '$' + (c / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function storageText(gb) { return gb >= 1024 && gb % 1024 === 0 ? (gb / 1024) + 'TB' : gb + 'GB'; }
  function uuid() { return (crypto.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  function isNetworkError(e) { return !navigator.onLine || /fetch|network|load failed|timeout/i.test((e && e.message) || ''); }
  function $(id) { return document.getElementById(id); }

  // ---------- offline queue ----------
  function setQueue(q) { queue = q; save('queue', q); renderBanner(); }
  function renderBanner() {
    var pending = queue.filter(function (i) { return !i.failed; }).length;
    var failed = queue.filter(function (i) { return i.failed; });
    if (failed.length) { $banner.hidden = false; $banner.className = 'bad'; $banner.textContent = failed.length + ' phone(s) couldn’t be saved — tell Ethan: ' + failed[0].failed; }
    else if (pending) { $banner.hidden = false; $banner.className = ''; $banner.textContent = pending + ' waiting to send — will send automatically when you have signal'; }
    else { $banner.hidden = true; }
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
          if (!error) error = (await sb.from('partner_phones').update({ status: 'shipped', batch_id: item.batch.id }).in('id', item.phoneIds)).error;
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
    var r = await sb.from('partner_phones').select('*').order('bought_at', { ascending: false }).limit(300);
    if (!r.error) { serverPhones = r.data; save('phones', serverPhones); if (current === 'home' || current === 'phones' || current === 'ship') go(current); }
  }
  async function loadCatalogue() {
    if (!sb || !session || !navigator.onLine) return;
    var m = await sb.from('partner_models').select('*').order('sort_order');
    var d = await sb.from('partner_deductions').select('*').limit(2000);
    if (!m.error && !d.error && m.data.length) { catalogue = { models: m.data, deds: d.data }; save('catalogue', catalogue); }
  }
  function allPhones() {
    var ids = {}, out = [];
    queue.forEach(function (i) { if (i.kind === 'phone') { ids[i.row.id] = 1; out.push(Object.assign({ _pending: true }, i.row)); } });
    serverPhones.forEach(function (p) { if (!ids[p.id]) out.push(p); });
    // a queued shipment shows as shipped straight away
    queue.forEach(function (i) { if (i.kind === 'batch') out.forEach(function (p) { if (i.phoneIds.indexOf(p.id) > -1) { p = p; p.status = 'shipped'; } }); });
    return out.sort(function (a, b) { return new Date(b.bought_at) - new Date(a.bought_at); });
  }

  // ---------- routing ----------
  var current = '';
  function go(view, arg) { current = view; window.scrollTo(0, 0); ({ login: viewLogin, home: viewHome, log: viewLog, phones: viewPhones, ship: viewShip })[view](arg); }

  // ---------- login ----------
  function viewLogin(msg) {
    $app.innerHTML = '<h1>Strike Surge</h1><div class="card"><label>Email</label><input id="em" type="email" autocomplete="username" autocapitalize="none">' +
      '<label>Password</label><input id="pw" type="password" autocomplete="current-password"><div style="height:14px"></div><button id="go">Log in</button><div class="err" id="err">' + esc(msg || '') + '</div></div>';
    $('go').onclick = async function () {
      $('err').textContent = ''; $('go').disabled = true;
      var r = await sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value });
      $('go').disabled = false;
      if (r.error) { $('err').textContent = navigator.onLine ? 'That email or password isn’t right.' : 'You need signal to log in the first time.'; return; }
      session = r.data.session; await afterLogin();
    };
  }
  async function afterLogin() { await loadCatalogue(); await refreshPhones(); await syncQueue(); go('home'); }

  // ---------- home ----------
  function viewHome() {
    var phones = allPhones();
    var bought = phones.filter(function (p) { return p.type === 'damaged' && p.status === 'bought'; }).length;
    $app.innerHTML = '<h1>Hey Declan</h1>' +
      '<button id="log">+ Log a phone</button><div style="height:10px"></div>' +
      '<div class="row"><button class="secondary" id="phones">My phones (' + phones.length + ')</button><button class="secondary" id="ship">Ship a batch' + (bought ? ' (' + bought + ')' : '') + '</button></div>' +
      '<div class="card" style="margin-top:14px"><b>Meetups</b><div class="muted">Your meetups land in the shared “Declan Meetups” calendar on your phone.</div></div>' +
      '<p class="muted">Damaged phones: ship when you have 5 or more. Mint phones you keep.</p>' +
      '<button class="link" id="out">Log out</button>';
    $('log').onclick = function () { go('log'); }; $('phones').onclick = function () { go('phones'); }; $('ship').onclick = function () { go('ship'); };
    $('out').onclick = async function () { await sb.auth.signOut(); session = null; go('login'); };
  }

  // ---------- log a phone ----------
  var draft = null;
  function newDraft() { return { model: '', storage: '', colour: '', colourOther: '', battery: '', batteryUnknownPart: false, partsBattery: false, faults: {}, lensesCracked: 0, lensesExposed: 0, type: '', typeTouched: false, quote: '', paid: '', notes: '', ded: {}, dedTotal: '' }; }
  function selectedFaults() { return Object.keys(draft.faults).filter(function (k) { return draft.faults[k]; }); }
  function modelRec() { return catalogue.models.filter(function (m) { return m.name === draft.model; })[0]; }
  function faultCheck(id, label, hint) { return '<label class="check"><input type="checkbox" data-fault="' + id + '"' + (draft.faults[id] ? ' checked' : '') + '><span>' + label + (hint ? '<small>' + hint + '</small>' : '') + '</span></label>'; }
  function faultLabel(id) { return D.FAULTS.filter(function (f) { return f.id === id; })[0].label; }
  function f(id) { var x = D.FAULTS.filter(function (z) { return z.id === id; })[0]; return faultCheck(id, x.label, x.hint); }

  function viewLog() {
    if (!draft) draft = newDraft();
    var mr = modelRec();
    var colourOpts = mr ? mr.colours : [];
    $app.innerHTML = '<h1>Log a phone</h1>' +
      '<div class="card"><label>Model</label><select id="model"><option value="">Choose a model</option>' +
        catalogue.models.map(function (m) { return '<option' + (m.name === draft.model ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') + '</select>' +
      (mr ? '<label>Storage</label><select id="storage"><option value="">Unknown</option>' + mr.storage_tiers.map(function (g) { return '<option value="' + g + '"' + (String(g) === String(draft.storage) ? ' selected' : '') + '>' + storageText(g) + '</option>'; }).join('') + '</select>' +
        '<label>Colour</label><select id="colour"><option value="">Not set</option>' + colourOpts.map(function (c) { return '<option' + (c === draft.colour ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '<option value="__other"' + (draft.colour === '__other' ? ' selected' : '') + '>Other</option></select>' +
        (draft.colour === '__other' ? '<input id="colourOther" placeholder="Type the colour" value="' + esc(draft.colourOther) + '" style="margin-top:8px">' : '') : '') + '</div>' +

      '<h2><span class="step">1</span> Settings › Battery</h2><div class="card"><label>Battery health %</label><input id="battery" type="number" inputmode="numeric" min="1" max="100" value="' + esc(draft.battery) + '">' +
        '<label class="check"><input type="checkbox" id="bunk"' + (draft.batteryUnknownPart ? ' checked' : '') + '><span>It says “Unknown part” under Battery<small>Counts as a third-party battery</small></span></label></div>' +

      '<h2><span class="step">2</span> Parts and Service History</h2><div class="card">' + f('screen_third_party') +
        '<label class="check"><input type="checkbox" id="pbat"' + (draft.partsBattery ? ' checked' : '') + '><span>Replaced / third-party battery</span></label>' + f('parts_other') + '</div>' +

      '<h2><span class="step">3</span> Screen under the light</h2><div class="card">' + f('screen_scratched') + f('screen_broken') + '</div>' +

      '<h2><span class="step">4</span> Cameras (A4 paper test)</h2><div class="card"><div class="row"><div><label>Smashed lenses</label><input id="lc" type="number" inputmode="numeric" min="0" max="4" value="' + draft.lensesCracked + '"></div>' +
        '<div><label>Camera exposed (lens gone)</label><input id="le" type="number" inputmode="numeric" min="0" max="4" value="' + draft.lensesExposed + '"></div></div>' + f('rearCam') + f('frontCam') + '</div>' +

      '<h2><span class="step">5</span> Frame and back</h2><div class="card">' + f('frame') + f('back_broken') + '</div>' +

      '<h2><span class="step">6</span> Face ID, speaker, buttons</h2><div class="card">' + f('faceid') + f('speaker') + f('charging') + f('board') + '</div>' +

      '<h2>Price</h2><div class="card"><label>Quote you gave the seller ($)</label><input id="quote" inputmode="text" placeholder="e.g. 230-260" value="' + esc(draft.quote) + '"><div class="muted" id="quotehint" style="margin-top:6px"></div></div>' +
      '<div id="sum"></div>' +
      '<label>Notes (optional)</label><textarea id="notes" rows="2">' + esc(draft.notes) + '</textarea>' +
      '<div style="height:14px"></div><button id="save">Save phone</button><div class="err" id="err"></div>' +
      '<div style="height:10px"></div><button class="secondary" id="cancel">Cancel</button>';

    $('model').onchange = function () { draft.model = this.value; draft.storage = ''; draft.colour = ''; draft.ded = {}; viewLog(); };
    if ($('storage')) $('storage').onchange = function () { draft.storage = this.value; };
    if ($('colour')) $('colour').onchange = function () { draft.colour = this.value; viewLog(); };
    if ($('colourOther')) $('colourOther').oninput = function () { draft.colourOther = this.value; };
    $('battery').oninput = function () { draft.battery = this.value; draft.ded = {}; renderSummary(); };
    $('bunk').onchange = function () { draft.batteryUnknownPart = this.checked; renderSummary(); };
    $('pbat').onchange = function () { draft.partsBattery = this.checked; renderSummary(); };
    $('lc').oninput = function () { draft.lensesCracked = Math.max(0, parseInt(this.value, 10) || 0); renderSummary(); };
    $('le').oninput = function () { draft.lensesExposed = Math.max(0, parseInt(this.value, 10) || 0); renderSummary(); };
    $('quote').oninput = function () { draft.quote = this.value; renderSummary(); };
    $('notes').oninput = function () { draft.notes = this.value; };
    Array.prototype.forEach.call(document.querySelectorAll('[data-fault]'), function (el) { el.onchange = function () { draft.faults[el.getAttribute('data-fault')] = el.checked; renderSummary(); }; });
    $('cancel').onclick = function () { if (confirm('Throw this phone away without saving?')) { draft = null; go('home'); } };
    $('save').onclick = savePhone;
    renderSummary();
  }

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
  function dollarsToCents(v) { var n = parseFloat(v); return isNaN(n) ? null : Math.round(n * 100); }
  function renderSummary() {
    var t = totals(), q = parseQuote(draft.quote), qMax = q ? q.max : null, suggestType = D.suggestType({ faults: selectedFaults(), lensesCracked: draft.lensesCracked, lensesExposed: draft.lensesExposed });
    if (!draft.typeTouched) draft.type = suggestType;
    var html = '<h2>Deductions</h2><div class="card">';
    if (!t.lines.length) html += '<div class="muted">Nothing ticked, so no deductions.</div>';
    t.lines.forEach(function (l) {
      var s = lineState(l);
      html += '<div class="dedrow"><input type="checkbox" data-inc="' + l.id + '"' + (s.include ? ' checked' : '') + (l.required ? ' disabled' : '') + '><div style="flex:1">' + esc(l.label) +
        (l.required ? '<small class="muted" style="display:block">Always deducted under 80%</small>' : '') +
        (!l.priced ? '<small class="err" style="display:block">No set price for this model — ask Ethan, or type an amount</small>' : '') +
        '</div><input type="number" inputmode="decimal" data-amt="' + l.id + '" value="' + (s.cents / 100) + '"></div>';
    });
    html += '<div class="row between" style="margin-top:12px"><span>Total deductions</span><span style="flex:none;width:130px"><input id="dtotal" type="number" inputmode="decimal" value="' + (t.total / 100) + '" style="font-weight:800;font-size:18px"></span></div>' +
      '<div class="muted" id="dnote" style="margin-top:4px">' + (t.overridden ? 'You changed this total (suggested ' + money(t.sum) + '). <button class="link" id="dreset" type="button">Reset</button>' : 'You can type a different total here if you need to.') + '</div>';
    html += '<div class="row between" id="dleft">' + (qMax !== null ? '<span class="muted">Top of quote minus deductions</span><span>' + money(Math.max(0, qMax - t.total)) + '</span>' : '') + '</div>';
    html += '</div>' +
      '<div class="card"><label>Type</label><select id="type"><option value="damaged"' + (draft.type === 'damaged' ? ' selected' : '') + '>Damaged (ships to Ethan)</option><option value="mint"' + (draft.type === 'mint' ? ' selected' : '') + '>Mint (you keep it)</option></select>' +
      '<div class="muted" style="margin-top:6px">Suggested: ' + suggestType + (suggestType === 'mint' ? ' (nothing wrong, or just the battery)' : ' (it has a fault)') + '. Not sure? Ask Ethan.</div>' +
      '<label>Price paid ($)</label><input id="paid" type="number" inputmode="decimal" value="' + esc(draft.paid) + '">' +
      (qMax !== null && dollarsToCents(draft.paid) > qMax ? '<div class="err">That’s more than the top of the quote (' + money(qMax) + '). You can’t pay more than that.</div>' : '') + '</div>';
    $('sum').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('[data-inc]'), function (el) { el.onchange = function () { var id = el.getAttribute('data-inc'); draft.ded[id] = Object.assign({}, draft.ded[id], { include: el.checked }); renderSummary(); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-amt]'), function (el) { el.oninput = function () { var id = el.getAttribute('data-amt'); var c = dollarsToCents(el.value); draft.ded[id] = Object.assign({}, draft.ded[id], { cents: c === null ? 0 : c }); updateTotalsOnly(); }; });
    var hint = $('quotehint'); if (hint) hint.textContent = q ? (q.min === q.max ? 'Quote: ' + money(q.max) : 'Quote: ' + money(q.min) + ' to ' + money(q.max)) + ' \u2014 you can\u2019t pay more than ' + money(q.max) : 'Type it like 230-260, or just one price like 250.';
    $('dtotal').oninput = function () { draft.dedTotal = this.value; updateTotalsOnly(true); };
    if ($('dreset')) $('dreset').onclick = function () { draft.dedTotal = ''; renderSummary(); };
    $('type').onchange = function () { draft.type = this.value; draft.typeTouched = true; };
    $('paid').oninput = function () { draft.paid = this.value; updateTotalsOnly(); };
  }
  // re-render only the numbers while typing, so the keyboard doesn't lose focus
  function updateTotalsOnly(fromTotalBox) {
    var t = totals(), q = parseQuote(draft.quote), qMax = q ? q.max : null;
    var box = $('dtotal'); if (box && !fromTotalBox) box.value = t.total / 100;
    var left = $('dleft'); if (left) left.innerHTML = qMax !== null ? '<span class="muted">Top of quote minus deductions</span><span>' + money(Math.max(0, qMax - t.total)) + '</span>' : '';
    var note = $('dnote'); if (note) { note.innerHTML = t.overridden ? 'You changed this total (suggested ' + money(t.sum) + '). <button class="link" id="dreset" type="button">Reset</button>' : 'You can type a different total here if you need to.'; if ($('dreset')) $('dreset').onclick = function () { draft.dedTotal = ''; renderSummary(); }; }
    var warn = qMax !== null && dollarsToCents(draft.paid) > qMax;
    var existing = document.getElementById('capwarn');
    if (warn && !existing) { var d = document.createElement('div'); d.className = 'err'; d.id = 'capwarn'; d.textContent = 'That\u2019s more than the top of the quote (' + money(qMax) + '). You can\u2019t pay more than that.'; $('paid').insertAdjacentElement('afterend', d); }
    if (!warn && existing) existing.remove();
  }

  function savePhone() {
    var err = '';
    var q = parseQuote(draft.quote), qMin = q ? q.min : null, qMax = q ? q.max : null, paid = dollarsToCents(draft.paid);
    if (!draft.model) err = 'Choose the model.';
    else if (!q) err = 'Enter the quote you gave the seller, like 230-260.';
    else if (paid === null) err = 'Enter the price paid.';
    else if (paid > qMax) err = 'Price paid can’t be more than the top of the quote (' + money(qMax) + ').';
    else if (draft.battery !== '' && (isNaN(parseInt(draft.battery, 10)) || parseInt(draft.battery, 10) > 100)) err = 'Battery % should be 1–100.';
    if (err) { $('err').textContent = err; return; }
    var t = totals(), deductions = [];
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
    queue.push({ kind: 'phone', row: row }); setQueue(queue); draft = null; syncQueue();
    $app.innerHTML = '<h1 class="ok">Saved ✓</h1><div class="card">' + esc(row.model) + (row.storage_gb ? ' ' + storageText(row.storage_gb) : '') + '<br>Paid ' + money(row.price_paid_cents) + '</div>' +
      (navigator.onLine ? '' : '<p class="muted">No signal — it’s saved on your phone and will send by itself.</p>') + '<button id="again">Log another</button><div style="height:10px"></div><button class="secondary" id="home">Home</button>';
    $('again').onclick = function () { go('log'); }; $('home').onclick = function () { go('home'); };
  }

  // ---------- my phones ----------
  function viewPhones() {
    var phones = allPhones();
    $app.innerHTML = '<h1>My phones</h1>' + (phones.length ? phones.map(function (p) {
      return '<div class="card"><div class="row between"><b>' + esc(p.model) + (p.storage_gb ? ' ' + storageText(p.storage_gb) : '') + '</b><span class="pill ' + p.type + '">' + p.type + '</span></div>' +
        '<div class="muted">' + esc(p.colour || '') + ' · ' + new Date(p.bought_at).toLocaleDateString('en-AU') + '</div>' +
        '<div class="row between" style="margin-top:8px"><span>Paid ' + money(p.price_paid_cents) + '</span><span class="muted">Quote ' + money(p.quoted_min_cents) + '–' + money(p.quoted_max_cents) + '</span></div>' +
        (p.total_deductions_cents ? '<div class="muted">Deductions ' + money(p.total_deductions_cents) + '</div>' : '') +
        '<div style="margin-top:8px"><span class="pill ' + p.status + '">' + p.status + '</span>' + (p._pending ? ' <span class="muted">waiting to send</span>' : '') + '</div></div>';
    }).join('') : '<p class="muted">No phones yet.</p>') + '<button class="secondary" id="home">Back</button>';
    $('home').onclick = function () { go('home'); };
  }

  // ---------- ship a batch ----------
  function viewShip() {
    var ready = allPhones().filter(function (p) { return p.type === 'damaged' && p.status === 'bought'; });
    var sel = {}; ready.forEach(function (p) { sel[p.id] = true; });
    function render() {
      var n = Object.keys(sel).filter(function (k) { return sel[k]; }).length;
      $app.innerHTML = '<h1>Ship a batch</h1>' + (ready.length ? '<div class="card">' + ready.map(function (p) {
        return '<label class="check"><input type="checkbox" data-p="' + p.id + '"' + (sel[p.id] ? ' checked' : '') + '><span>' + esc(p.model) + (p.storage_gb ? ' ' + storageText(p.storage_gb) : '') + '<small>' + esc(p.colour || '') + ' · paid ' + money(p.price_paid_cents) + '</small></span></label>';
      }).join('') + '</div>' +
        '<div class="card"><b>' + n + ' selected</b><div class="muted">Ship when you have 5 or more.</div>' +
        (n > 0 && n < 5 ? '<label class="check"><input type="checkbox" id="few"><span>Ethan said it’s OK to ship fewer than 5</span></label>' : '') +
        '<label>Tracking number</label><input id="trk" autocapitalize="characters"></div>' +
        '<button id="go" ' + (n === 0 ? 'disabled' : '') + '>Mark as shipped</button><div class="err" id="err"></div>' : '<p class="muted">No damaged phones waiting to ship.</p>') +
        '<div style="height:10px"></div><button class="secondary" id="home">Back</button>';
      Array.prototype.forEach.call(document.querySelectorAll('[data-p]'), function (el) { el.onchange = function () { sel[el.getAttribute('data-p')] = el.checked; render(); }; });
      $('home').onclick = function () { go('home'); };
      if ($('go')) $('go').onclick = function () {
        var ids = Object.keys(sel).filter(function (k) { return sel[k]; }), trk = $('trk').value.trim();
        if (!ids.length) return;
        if (ids.length < 5 && !($('few') && $('few').checked)) { $('err').textContent = 'You need 5 phones to ship, or tick that Ethan said it’s OK.'; return; }
        if (!trk) { $('err').textContent = 'Enter the tracking number.'; return; }
        queue.push({ kind: 'batch', batch: { id: uuid(), tracking_number: trk, shipped_at: new Date().toISOString() }, phoneIds: ids }); setQueue(queue); syncQueue(); go('phones');
      };
    }
    render();
  }

  // ---------- boot ----------
  async function boot() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
    if (!window.CONFIG || !window.CONFIG.SUPABASE_URL) { $app.innerHTML = '<h1>Not set up yet</h1><p class="muted">Tell Ethan the app isn’t connected.</p>'; return; }
    sb = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'declan-auth' } });
    session = await liveSession();
    if (!session && hasStoredLogin()) session = { offlineUntilSignal: true };
    renderBanner();
    if (!session) return go('login');
    go('home');
    loadCatalogue(); refreshPhones(); syncQueue();
    window.addEventListener('online', function () { loadCatalogue(); syncQueue(); });
    setInterval(syncQueue, 30000);
  }
  boot();
})();
