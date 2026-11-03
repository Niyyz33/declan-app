// Shared drawing kit for Declan's guides: Bubbles (the character) and the illustrations.
// Use <div data-bubbles='{"wave":true}'></div> and <div data-art="cracked"></div> in a page and the kit fills them in.
(function () {
  'use strict';

  // ---------- no zoom: block double-tap and pinch zoom, but still count every tap ----------
  (function () {
    var last = 0, sx = 0, sy = 0;
    document.addEventListener('touchstart', function (e) { var t = e.touches[0]; if (t) { sx = t.clientX; sy = t.clientY; } }, { passive: true });
    document.addEventListener('touchend', function (e) {
      var now = Date.now(), t = e.changedTouches[0], moved = t && (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10);
      var isField = e.target && e.target.closest && e.target.closest('input, textarea, select');
      if (!moved && !isField && now - last <= 400 && e.touches.length === 0) {
        e.preventDefault();
        var hit = e.target && e.target.closest ? e.target.closest('button, a, label') : null;
        if (hit && !hit.disabled) hit.click();
      }
      last = now;
    }, { passive: false });
    ['gesturestart', 'gesturechange'].forEach(function (g) { document.addEventListener(g, function (e) { e.preventDefault(); }); });
  })();

  var SKIN = '#f6cfa8', NAVY = '#0a1b3a', GREEN = '#1a9221', GREEN2 = '#25c24d';

  // ---------- Bubbles ----------
  function arm(side, hx, hy) {
    var sx = side === 'l' ? 40 : 120, sy = 132, mx = (sx + hx) / 2 + (side === 'l' ? -10 : 10), my = (sy + hy) / 2 + 8;
    return '<path d="M' + sx + ' ' + sy + ' Q' + mx + ' ' + my + ' ' + hx + ' ' + hy + '" stroke="' + GREEN + '" stroke-width="19" fill="none" stroke-linecap="round"/><circle cx="' + hx + '" cy="' + hy + '" r="10" fill="' + SKIN + '"/>';
  }
  function bubbles(opt) {
    opt = opt || {};
    var L = opt.l || [46, 168], R = opt.r || [114, 168];
    var wave = opt.wave ? '<path d="M' + (R[0] + 14) + ' ' + (R[1] - 10) + ' q8 -6 4 -16 M' + (R[0] + 22) + ' ' + (R[1] - 2) + ' q10 -4 8 -14" stroke="#9fb1cf" stroke-width="3" fill="none" stroke-linecap="round"/>' : '';
    var mouth = opt.mouth === 'o' ? '<ellipse cx="80" cy="102" rx="6" ry="7" fill="#7a2d2d"/>' : opt.mouth === 'flat' ? '<path d="M68 100 L92 100" stroke="#3a1f1f" stroke-width="3.5" stroke-linecap="round"/>' : '<path d="M62 96 Q80 116 98 96 Z" fill="#fff" stroke="#3a1f1f" stroke-width="3" stroke-linejoin="round"/>';
    return '<svg viewBox="0 0 160 190" role="img" aria-label="Bubbles">' +
      '<path d="M26 190 C26 140 46 120 80 120 C114 120 134 140 134 190 Z" fill="' + GREEN + '"/><path d="M62 122 Q80 140 98 122" stroke="#126e18" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<rect x="68" y="108" width="24" height="18" rx="8" fill="' + SKIN + '"/>' + arm('l', L[0], L[1]) + arm('r', R[0], R[1]) +
      '<circle cx="42" cy="84" r="8" fill="' + SKIN + '"/><circle cx="118" cy="84" r="8" fill="' + SKIN + '"/><circle cx="80" cy="78" r="38" fill="' + SKIN + '"/>' +
      '<path d="M41 72 C41 44 58 31 80 31 C102 31 119 44 119 72 Z" fill="' + NAVY + '"/><path d="M40 70 Q80 56 120 70 L126 76 Q80 64 34 76 Z" fill="#06122a"/>' +
      '<circle cx="80" cy="50" r="11" fill="' + GREEN2 + '"/><rect x="75" y="44" width="10" height="13" rx="2.5" fill="#fff"/><rect x="77" y="46" width="6" height="8" rx="1" fill="' + GREEN + '"/>' +
      '<circle cx="66" cy="84" r="5.2" fill="#1a1a2e"/><circle cx="94" cy="84" r="5.2" fill="#1a1a2e"/><circle cx="67.8" cy="82" r="1.8" fill="#fff"/><circle cx="95.8" cy="82" r="1.8" fill="#fff"/>' +
      '<path d="M58 74 Q66 69 74 73 M86 73 Q94 69 102 74" stroke="#5a3a24" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="55" cy="96" r="6" fill="#ff9aa2" opacity=".55"/><circle cx="105" cy="96" r="6" fill="#ff9aa2" opacity=".55"/>' + mouth + wave + (opt.props || '') + '</svg>';
  }

  // ---------- illustrations ----------
  function svg(vb, inner, cls) { return '<svg class="' + (cls || 'art') + '" viewBox="' + vb + '" role="img">' + inner + '</svg>'; }
  function body(x, y, w, h, screen) { // phone seen from the front
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="20" fill="#0c1424" stroke="#4a5d86" stroke-width="3"/>' +
      '<rect x="' + (x + 6) + '" y="' + (y + 8) + '" width="' + (w - 12) + '" height="' + (h - 16) + '" rx="14" fill="' + (screen || '#123f80') + '"/>' +
      '<rect x="' + (x + w / 2 - 14) + '" y="' + (y + 14) + '" width="28" height="8" rx="4" fill="#050a14"/>';
  }
  var A = {
    cracked: function () { // spider-web cracks from one hit
      var cx = 66, cy = 96, rays = [[8, 34], [40, 14], [96, 22], [118, 70], [112, 140], [96, 196], [40, 204], [10, 150], [12, 90]], s = '';
      rays.forEach(function (r) { var mx = (cx + r[0]) / 2 + 4, my = (cy + r[1]) / 2 - 5; s += '<polyline points="' + cx + ',' + cy + ' ' + mx + ',' + my + ' ' + r[0] + ',' + r[1] + '" fill="none" stroke="#eaf3ff" stroke-width="1.8" stroke-linejoin="round"/>'; });
      s += '<polygon points="52,84 66,76 80,86 86,100 76,112 58,110 50,98" fill="none" stroke="#eaf3ff" stroke-width="1.6"/><polygon points="38,70 66,56 96,70 104,102 90,126 56,130 36,106" fill="none" stroke="#eaf3ff" stroke-width="1.4" stroke-opacity=".85"/><polygon points="22,58 60,38 108,50 118,108 100,150 50,156 22,120" fill="none" stroke="#eaf3ff" stroke-width="1.2" stroke-opacity=".6"/>';
      return svg('0 0 132 220', body(4, 4, 124, 212) + s);
    },
    scratched: function () {
      var l = [[24, 60, 70, 40], [30, 90, 96, 58], [40, 126, 108, 84], [24, 150, 82, 120], [64, 170, 112, 140], [20, 40, 54, 26], [74, 190, 108, 172], [44, 74, 88, 52]], s = '';
      l.forEach(function (p, i) { s += '<line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + p[2] + '" y2="' + p[3] + '" stroke="#dbe9ff" stroke-width="' + (i % 3 ? 1 : 1.6) + '" stroke-opacity="' + (i % 2 ? .5 : .7) + '" stroke-linecap="round"/>'; });
      return svg('0 0 132 220', body(4, 4, 124, 212) + s);
    },
    clean: function () { return svg('0 0 132 220', body(4, 4, 124, 212) + '<path d="M30 60 q40 -20 72 -2" stroke="#8fc6ff" stroke-opacity=".25" stroke-width="10" fill="none" stroke-linecap="round"/>'); },
    nail: function () { // the fingernail test
      return svg('0 0 330 150', '<rect x="0" y="112" width="330" height="38" fill="#0c2347"/><rect x="16" y="74" width="298" height="40" rx="8" fill="#123f80"/>' +
        '<path d="M44 96 l28 -4 l30 5 l32 -5 l30 4 l34 -3 l30 4" stroke="#dbe9ff" stroke-width="2.2" fill="none" stroke-opacity=".85" stroke-linecap="round"/>' +
        '<g transform="translate(250,74) rotate(28)"><rect x="-21" y="-44" width="42" height="64" rx="21" fill="' + SKIN + '" stroke="#d9a97f" stroke-width="2"/><ellipse cx="0" cy="6" rx="12" ry="10" fill="#fde8d2" stroke="#d9a97f"/></g>' +
        '<path d="M200 96 l-26 0 M200 88 l-20 -8 M200 104 l-20 8" stroke="#ffd27a" stroke-width="3" stroke-linecap="round"/>' +
        '<text x="16" y="26" font-size="13.5" font-weight="800" fill="#ffd27a">Nail catches = deep scratch</text><text x="16" y="48" font-size="12.5" fill="#9fb1cf">Slide your nail across it, slowly</text>');
    },
    bent: function () {
      return svg('0 0 330 190', '<rect x="0" y="150" width="330" height="40" fill="#0c2347"/>' +
        '<text x="24" y="26" font-size="14" font-weight="800" fill="#8ff0ab">Straight</text><rect x="24" y="36" width="282" height="12" rx="6" fill="#6e7f9f"/><line x1="24" y1="42" x2="306" y2="42" stroke="#8ff0ab" stroke-width="2" stroke-dasharray="3 5"/>' +
        '<text x="24" y="86" font-size="14" font-weight="800" fill="#ff9a9d">Bent</text><path d="M24 138 Q165 70 306 138" stroke="#6e7f9f" stroke-width="12" fill="none" stroke-linecap="round"/><line x1="24" y1="138" x2="306" y2="138" stroke="#ff9a9d" stroke-width="2" stroke-dasharray="3 5"/>' +
        '<path d="M165 138 L165 104" stroke="#ffd27a" stroke-width="3"/><path d="M158 112 L165 102 L172 112" stroke="#ffd27a" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="176" y="124" font-size="13" font-weight="800" fill="#ffd27a">gap = bent</text>');
    },
    ruler: function () { return A.bent(); },
    battery: function () { // a drawn copy of the iPhone battery health screen
      return svg('0 0 330 190', '<rect x="14" y="10" width="302" height="170" rx="18" fill="#1c1c1e"/><text x="165" y="40" text-anchor="middle" font-size="17" font-weight="700" fill="#fff">Battery Health &amp; Charging</text>' +
        '<rect x="28" y="56" width="274" height="64" rx="12" fill="#2c2c2e"/><text x="44" y="84" font-size="16" fill="#fff">Maximum Capacity</text><text x="286" y="86" text-anchor="end" font-size="26" font-weight="800" fill="#ff6b6f">82%</text><text x="44" y="108" font-size="12.5" fill="#9a9aa0">Battery capacity compared to when it was new</text>' +
        '<rect x="22" y="50" width="286" height="76" rx="14" fill="none" stroke="#ffd27a" stroke-width="3" stroke-dasharray="5 5"/>' +
        '<text x="165" y="154" text-anchor="middle" font-size="14.5" font-weight="800" fill="#ffd27a">Under 85% = deduct</text><text x="165" y="172" text-anchor="middle" font-size="12.5" fill="#9fb1cf">Settings › Battery › Battery Health</text>');
    },
    parts: function () {
      return svg('0 0 330 190', '<rect x="14" y="10" width="302" height="170" rx="18" fill="#1c1c1e"/><text x="165" y="38" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">Parts and Service History</text>' +
        '<rect x="28" y="52" width="274" height="108" rx="12" fill="#2c2c2e"/>' +
        '<text x="44" y="82" font-size="15.5" fill="#fff">Battery</text><text x="286" y="82" text-anchor="end" font-size="15.5" font-weight="800" fill="#ffd27a">Unknown Part</text><line x1="44" y1="96" x2="286" y2="96" stroke="#3a3a3c"/>' +
        '<text x="44" y="122" font-size="15.5" fill="#fff">Display</text><text x="286" y="122" text-anchor="end" font-size="15.5" font-weight="800" fill="#ffd27a">Unknown Part</text><line x1="44" y1="136" x2="286" y2="136" stroke="#3a3a3c"/>' +
        '<text x="44" y="152" font-size="12.5" fill="#9a9aa0">Settings › General › About › Parts and Service History</text>');
    },
    paper: function () {
      return svg('0 0 330 196', '<rect x="0" y="158" width="330" height="38" fill="#0c2347"/><rect x="190" y="14" width="120" height="136" rx="4" fill="#fff" transform="rotate(4 250 82)"/><text x="250" y="88" text-anchor="middle" font-size="22" font-weight="900" fill="#c9d3e6" transform="rotate(4 250 82)">A4</text>' +
        '<g transform="translate(34,30)"><rect width="84" height="108" rx="16" fill="#3a4a6a" stroke="#0a1220" stroke-width="2"/><rect x="8" y="8" width="42" height="42" rx="10" fill="#10192e"/><circle cx="20" cy="20" r="8" fill="#050a14" stroke="#7fa6e8"/><circle cx="38" cy="20" r="8" fill="#050a14" stroke="#7fa6e8"/><circle cx="29" cy="39" r="8" fill="#050a14" stroke="#7fa6e8"/></g>' +
        '<path d="M120 62 L190 38 M120 78 L190 106" stroke="#ffd27a" stroke-width="2.5" stroke-dasharray="3 5"/><text x="165" y="182" text-anchor="middle" font-size="13" fill="#9fb1cf">Point each camera at white paper: no black spots</text>');
    },
    hello: function () { // the set-up screen of a freshly reset phone
      return svg('0 0 132 220', body(4, 4, 124, 212, '#0b0b10') + '<text x="66" y="104" text-anchor="middle" font-size="32" font-style="italic" font-weight="300" fill="#fff" font-family="Georgia,serif">hello</text><text x="66" y="130" text-anchor="middle" font-size="10" fill="#8a8a95">swipe up to open</text>');
    },
    lock: function () {
      return svg('0 0 132 220', body(4, 4, 124, 212, '#14161f') + '<rect x="40" y="88" width="52" height="42" rx="8" fill="#ffd27a"/><path d="M48 88 V74 a18 18 0 0 1 36 0 V88" stroke="#ffd27a" stroke-width="7" fill="none"/><text x="66" y="156" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">Activation Lock</text><text x="66" y="170" text-anchor="middle" font-size="9.5" fill="#9a9aa8">needs the Apple ID</text><circle cx="108" cy="40" r="16" fill="#ff5a5f"/><path d="M101 33 L115 47 M115 33 L101 47" stroke="#fff" stroke-width="4" stroke-linecap="round"/>');
    },
    tick: function () { return svg('0 0 60 60', '<circle cx="30" cy="30" r="28" fill="#25c24d"/><path d="M17 31 l9 9 l18 -20" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>', 'icon'); },
    cross: function () { return svg('0 0 60 60', '<circle cx="30" cy="30" r="28" fill="#ff5a5f"/><path d="M19 19 L41 41 M41 19 L19 41" stroke="#fff" stroke-width="6" stroke-linecap="round"/>', 'icon'); },
    faceid: function () { return svg('0 0 80 80', '<g stroke="#8fc6ff" stroke-width="4" fill="none" stroke-linecap="round"><path d="M14 28 V18 a4 4 0 0 1 4 -4 H28 M52 14 H62 a4 4 0 0 1 4 4 V28 M66 52 V62 a4 4 0 0 1 -4 4 H52 M28 66 H18 a4 4 0 0 1 -4 -4 V52"/><path d="M30 32 V38 M50 32 V38 M40 34 V44 H36 M31 52 q9 7 18 0"/></g>', 'icon'); },
    speaker: function () { return svg('0 0 80 80', '<path d="M16 32 H28 L44 18 V62 L28 48 H16 Z" fill="#8fc6ff"/><path d="M52 30 q8 10 0 20 M60 22 q14 18 0 36" stroke="#8fc6ff" stroke-width="4" fill="none" stroke-linecap="round"/>', 'icon'); },
    charge: function () { return svg('0 0 80 80', '<rect x="26" y="10" width="28" height="30" rx="6" fill="#8fc6ff"/><rect x="31" y="2" width="5" height="12" fill="#8fc6ff"/><rect x="44" y="2" width="5" height="12" fill="#8fc6ff"/><path d="M40 40 V58 q0 12 -12 12" stroke="#8fc6ff" stroke-width="5" fill="none" stroke-linecap="round"/>', 'icon'); },
    power: function () { return svg('0 0 80 80', '<path d="M40 12 V38" stroke="#8fc6ff" stroke-width="6" stroke-linecap="round"/><path d="M24 24 a24 24 0 1 0 32 0" stroke="#8fc6ff" stroke-width="6" fill="none" stroke-linecap="round"/>', 'icon'); },
    cash: function () { return svg('0 0 80 80', '<rect x="8" y="24" width="64" height="36" rx="5" fill="#25c24d"/><circle cx="40" cy="42" r="10" fill="#0d5a22"/><text x="40" y="47" text-anchor="middle" font-size="14" font-weight="900" fill="#d6ffe1">$</text><rect x="14" y="30" width="6" height="6" rx="2" fill="#0d5a22"/><rect x="60" y="48" width="6" height="6" rx="2" fill="#0d5a22"/>', 'icon'); },
    pin: function () { return svg('0 0 80 80', '<path d="M40 70 C22 48 18 40 18 32 a22 22 0 0 1 44 0 c0 8 -4 16 -22 38 z" fill="#ff5a5f"/><circle cx="40" cy="32" r="8" fill="#fff"/>', 'icon'); },
    chat: function () { return svg('0 0 80 80', '<path d="M12 18 h56 a6 6 0 0 1 6 6 v28 a6 6 0 0 1 -6 6 H40 L24 72 V58 H12 a6 6 0 0 1 -6 -6 V24 a6 6 0 0 1 6 -6 z" fill="#25c24d"/><circle cx="28" cy="38" r="4" fill="#fff"/><circle cx="40" cy="38" r="4" fill="#fff"/><circle cx="52" cy="38" r="4" fill="#fff"/>', 'icon'); },
    bell: function () { return svg('0 0 80 80', '<path d="M40 10 a4 4 0 0 1 4 4 v2 c12 3 18 12 18 24 v10 l6 8 H12 l6 -8 V40 c0 -12 6 -21 18 -24 v-2 a4 4 0 0 1 4 -4 z" fill="#ffd27a"/><path d="M32 66 a8 8 0 0 0 16 0" fill="#e3a93a"/>', 'icon'); },
    calendar: function () { return svg('0 0 80 80', '<rect x="10" y="16" width="60" height="54" rx="8" fill="#fff"/><rect x="10" y="16" width="60" height="16" rx="8" fill="#ff5a5f"/><rect x="10" y="26" width="60" height="6" fill="#ff5a5f"/><rect x="22" y="8" width="6" height="14" rx="3" fill="#cfd6e4"/><rect x="52" y="8" width="6" height="14" rx="3" fill="#cfd6e4"/><text x="40" y="60" text-anchor="middle" font-size="24" font-weight="900" fill="#0a1b3a">6</text>', 'icon'); },
    share: function () { return svg('0 0 80 80', '<rect x="16" y="30" width="48" height="40" rx="8" fill="none" stroke="#5aa0ff" stroke-width="5"/><path d="M40 8 V44 M28 20 L40 8 L52 20" stroke="#5aa0ff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>', 'icon'); },
    home: function () { return svg('0 0 80 80', '<rect x="12" y="12" width="56" height="56" rx="14" fill="#06183a" stroke="#25c24d" stroke-width="4"/><path d="M26 42 L40 29 L54 42 V56 H26 Z" fill="#25c24d"/>', 'icon'); },
    book: function () { return svg('0 0 80 80', '<path d="M10 16 q16 -6 30 4 q14 -10 30 -4 V62 q-16 -6 -30 4 q-14 -10 -30 -4 Z" fill="#5aa0ff"/><path d="M40 20 V66" stroke="#0a1b3a" stroke-width="3"/>', 'icon'); },
    sell: function () { return svg('0 0 80 80', '<path d="M10 40 L40 10 H64 V34 L34 64 Z" fill="#ffd27a"/><circle cx="53" cy="22" r="5" fill="#0a1b3a"/><text x="38" y="44" text-anchor="middle" font-size="16" font-weight="900" fill="#7a4d00" transform="rotate(-45 38 44)">$$</text>', 'icon'); },
    wrench: function () { return svg('0 0 80 80', '<path d="M52 12 a16 16 0 0 0 -14 22 L12 60 a6 6 0 0 0 8 8 L46 42 a16 16 0 0 0 22 -14 l-10 10 -10 -2 -2 -10 z" fill="#8fc6ff"/>', 'icon'); },
    magnify: function () { return svg('0 0 80 80', '<circle cx="34" cy="34" r="20" fill="none" stroke="#8fc6ff" stroke-width="7"/><path d="M50 50 L68 68" stroke="#8fc6ff" stroke-width="8" stroke-linecap="round"/>', 'icon'); },
    walk: function () { return svg('0 0 80 80', '<circle cx="46" cy="16" r="8" fill="#f6cfa8"/><path d="M44 26 L36 46 L24 52 M44 26 L56 38 L66 36 M36 46 L40 62 L32 74 M36 46 L52 56 L52 72" stroke="#ff9a9d" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>', 'icon'); },
    box: function () { return svg('0 0 80 80', '<path d="M8 28 L40 12 L72 28 L40 44 Z" fill="#e2bd86"/><path d="M8 28 V54 L40 70 V44 Z" fill="#c4965c"/><path d="M72 28 V54 L40 70 V44 Z" fill="#a97c46"/><path d="M26 20 L58 36" stroke="#f3e2bd" stroke-width="5"/>', 'icon'); },
    phone: function () { return svg('0 0 80 80', '<rect x="22" y="6" width="36" height="68" rx="9" fill="#1f4e9c" stroke="#8fc6ff" stroke-width="3"/><rect x="28" y="14" width="24" height="46" rx="3" fill="#0b2a55"/><circle cx="40" cy="67" r="3" fill="#8fc6ff"/>', 'icon'); }
  };

  function render() {
    [].forEach.call(document.querySelectorAll('[data-bubbles]'), function (el) { var o = {}; try { o = JSON.parse(el.getAttribute('data-bubbles') || '{}'); } catch (e) { /* default pose */ } el.innerHTML = bubbles(o); });
    [].forEach.call(document.querySelectorAll('[data-art]'), function (el) { var f = A[el.getAttribute('data-art')]; if (f) el.innerHTML = f(); });
    // checklists remember what has been ticked
    [].forEach.call(document.querySelectorAll('.checks[data-key]'), function (box) {
      var key = 'guide_' + box.getAttribute('data-key'), saved = {}; try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { /* ignore */ }
      [].forEach.call(box.querySelectorAll('input'), function (inp, i) { inp.checked = !!saved[i]; inp.onchange = function () { saved[i] = inp.checked; try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) { /* ignore */ } }; });
    });
    // Ethan's preview banner (Declan never sees this)
    try { var prof = JSON.parse(localStorage.getItem('declan_profile') || '{}'); var pv = document.getElementById('preview'); if (pv && prof.role === 'owner') pv.style.display = 'block'; } catch (e) { /* ignore */ }
  }
  window.Kit = { bubbles: bubbles, art: function (n) { return A[n] ? A[n]() : ''; }, render: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
