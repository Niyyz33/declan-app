// Overflow audit: finds any text or element that runs outside its own box (cards, buttons, pills, drawings) or off the screen.
// Run it in the browser on a page: eval this file, then call auditOverflow(). An empty list means clean.
(function () {
  function boxed(el) { // does this element draw a visible box (background / border) that text could spill out of?
    var s = getComputedStyle(el);
    var bg = s.backgroundColor, hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    var hasImg = s.backgroundImage && s.backgroundImage !== 'none';
    var hasBorder = parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderLeftWidth) > 0;
    return hasBg || hasImg || hasBorder;
  }
  function label(el) { return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''); }
  function snip(t) { return (t || '').replace(/\s+/g, ' ').trim().slice(0, 48); }
  window.auditOverflow = function (root) {
    root = root || document.body;
    var issues = [], W = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > W + 1) issues.push('PAGE scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + W);
    // 1) text that sticks out of the nearest visible box, or off the screen
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      var p = n.parentElement; if (!p || /SCRIPT|STYLE|TITLE/.test(p.tagName) || p.closest('svg')) continue;
      var cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var r = document.createRange(); r.selectNodeContents(n); var tr = r.getBoundingClientRect(); if (!tr.width) continue;
      if (tr.right > W + 1 || tr.left < -1) { issues.push('OFF-SCREEN text "' + snip(n.nodeValue) + '" in ' + label(p)); continue; }
      var box = p;
      while (box && box !== document.body && !boxed(box)) box = box.parentElement;
      if (box && box !== document.body) {
        var bs = getComputedStyle(box); if (/hidden|auto|scroll|clip/.test(bs.overflowX)) continue;
        var br = box.getBoundingClientRect();
        if (tr.right > br.right + 1.5 || tr.left < br.left - 1.5) issues.push('TEXT outside box "' + snip(n.nodeValue) + '" in ' + label(box));
      }
    }
    // 2) boxes that stick out of their parent box
    [].forEach.call(root.querySelectorAll('*'), function (el) {
      if (el.closest('svg') || /SCRIPT|STYLE/.test(el.tagName)) return;
      var s = getComputedStyle(el); if (s.display === 'none' || s.position === 'fixed') return;
      var r = el.getBoundingClientRect(); if (!r.width) return;
      if (r.right > W + 1.5 || r.left < -1.5) { issues.push('BOX off-screen: ' + label(el)); return; }
      var par = el.parentElement; if (!par || par === document.body || !boxed(par)) return;
      var ps = getComputedStyle(par); if (/hidden|auto|scroll|clip/.test(ps.overflowX)) return;
      var pr = par.getBoundingClientRect();
      if (r.right > pr.right + 1.5 || r.left < pr.left - 1.5) issues.push('BOX outside its parent: ' + label(el) + ' in ' + label(par));
    });
    // 3) drawings: every label inside a drawing must stay inside the drawing's own frame
    [].forEach.call(root.querySelectorAll('svg'), function (svg) {
      var vb = svg.viewBox && svg.viewBox.baseVal; if (!vb || !vb.width) return;
      [].forEach.call(svg.querySelectorAll('text'), function (t) {
        if (!t.textContent.trim()) return;
        var b; try { b = t.getBBox(); } catch (e) { return; }
        if (b.x < vb.x - 1 || b.x + b.width > vb.x + vb.width + 1 || b.y < vb.y - 1 || b.y + b.height > vb.y + vb.height + 1) issues.push('DRAWING text outside frame: "' + snip(t.textContent) + '"');
        // and inside the nearest panel it sits on (a rounded card drawn inside the picture)
        var tb = t.getBoundingClientRect(), best = null;
        [].forEach.call(svg.querySelectorAll('rect'), function (rc) { var q = rc.getBoundingClientRect(); if (q.width > 60 && q.height > 40 && tb.left >= q.left - 1 && tb.left <= q.right - 4 && tb.top >= q.top - 1 && tb.bottom <= q.bottom + 1) { if (!best || q.width * q.height < best.w * best.h) best = { l: q.left, r: q.right, w: q.width, h: q.height }; } });
        if (best && (tb.right > best.r + 1.5 || tb.left < best.l - 1.5)) issues.push('DRAWING text spills out of its panel: "' + snip(t.textContent) + '"');
      });
    });
    return issues;
  };
})();
