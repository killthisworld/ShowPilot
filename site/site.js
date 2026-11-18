// get.showpilot.space (jobs 333, 338, 341): a feature tour for each profile
// (pick your seat, then tap a feature or let it play through).
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var narrow = function () { return window.matchMedia('(max-width: 1020px)').matches; };
  var DUR = 6500;
  // While someone is scrolling or touching the page, the slideshow waits, so
  // a slide change never happens under their finger (phones).
  var lastInput = 0;
  var busy = function () { return Date.now() - lastInput < 1500; };
  ['scroll', 'touchstart', 'touchmove', 'wheel'].forEach(function (ev) {
    window.addEventListener(ev, function () { lastInput = Date.now(); }, { passive: true });
  });

  // One tour (one profile's features).
  function Tour(el) {
    var tabs = Array.prototype.slice.call(el.querySelectorAll('[role="tab"]'));
    var count = el.querySelector('[data-count]');
    var playBtn = el.querySelector('[data-play]');
    var cur = 0, timer = null, stopped = reduce, hovering = false, active = false;
    if (stopped) el.setAttribute('data-stopped', '');

    var schedule = function () {
      clearTimeout(timer);
      if (!active || stopped || hovering || document.hidden) return;
      timer = setTimeout(function () { if (busy()) { schedule(); return; } show(cur + 1); }, DUR);
    };
    var show = function (i, focus) {
      cur = (i + tabs.length) % tabs.length;
      tabs.forEach(function (t, k) {
        var on = k === cur;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
        var m = t.querySelector('.meter span');
        if (m) { m.style.animation = 'none'; void m.offsetWidth; m.style.animation = ''; }
      });
      if (count) count.textContent = (cur < 9 ? '0' : '') + (cur + 1);
      if (focus) tabs[cur].focus();
      // Keep the current feature name in view in the sideways row on phones.
      // Only that row moves (scrollLeft), never the page.
      if (narrow() && active) {
        var list = tabs[cur].parentNode, t = tabs[cur];
        var left = t.getBoundingClientRect().left - list.getBoundingClientRect().left;
        if (left < 0 || left + t.offsetWidth > list.clientWidth) list.scrollLeft += left - 16;
      }
      schedule();
    };
    var stop = function () {
      stopped = true; clearTimeout(timer); el.setAttribute('data-stopped', '');
      playBtn.setAttribute('aria-label', 'Play the slideshow');
    };
    var play = function () {
      stopped = false; el.removeAttribute('data-stopped');
      playBtn.setAttribute('aria-label', 'Pause the slideshow');
      show(cur);
    };
    var setPaused = function (p) { if (p) el.setAttribute('data-paused', ''); else el.removeAttribute('data-paused'); };

    tabs.forEach(function (t, k) {
      t.addEventListener('click', function () { stop(); show(k); });
      t.addEventListener('keydown', function (e) {
        var d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (d) { e.preventDefault(); stop(); show(cur + d, true); }
        if (e.key === 'Home') { e.preventDefault(); stop(); show(0, true); }
        if (e.key === 'End') { e.preventDefault(); stop(); show(tabs.length - 1, true); }
      });
    });
    el.querySelector('[data-prev]').addEventListener('click', function () { stop(); show(cur - 1); });
    el.querySelector('[data-next]').addEventListener('click', function () { stop(); show(cur + 1); });
    playBtn.addEventListener('click', function () { if (stopped) play(); else stop(); });
    el.addEventListener('mouseenter', function () { hovering = true; setPaused(true); clearTimeout(timer); });
    el.addEventListener('mouseleave', function () { hovering = false; setPaused(false); schedule(); });
    el.addEventListener('focusin', function () { if (!stopped) { hovering = true; setPaused(true); clearTimeout(timer); } });
    el.addEventListener('focusout', function (e) { if (!el.contains(e.relatedTarget)) { hovering = false; setPaused(false); schedule(); } });
    document.addEventListener('visibilitychange', schedule);

    return {
      el: el,
      start: function () { active = true; el.hidden = false; show(0); },
      sleep: function () { active = false; clearTimeout(timer); el.hidden = true; },
    };
  }

  var tours = {};
  document.querySelectorAll('[data-tour]').forEach(function (el) { tours[el.getAttribute('data-tour')] = Tour(el); });
  var seats = document.querySelectorAll('[data-seat]');
  var current = seats.length ? seats[0].getAttribute('data-seat') : null;
  var pick = function (key) {
    current = key;
    seats.forEach(function (s) { s.setAttribute('aria-pressed', s.getAttribute('data-seat') === key ? 'true' : 'false'); });
    Object.keys(tours).forEach(function (k) { if (k !== key) tours[k].sleep(); });
    tours[key].start();
  };
  seats.forEach(function (s) { s.addEventListener('click', function () { pick(s.getAttribute('data-seat')); }); });

  // Start playing once the tour is on screen.
  var section = document.getElementById('tour');
  if (current && section) {
    if ('IntersectionObserver' in window) {
      var seen = false;
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && !seen) { seen = true; pick(current); } });
      }, { threshold: 0.25 }).observe(section);
    } else pick(current);
  }

  // Plans: pick monthly or yearly, and Create account carries the choice.
  document.querySelectorAll('[data-plan]').forEach(function (set) {
    var role = set.getAttribute('data-plan');
    var cta = document.querySelector('[data-plan-cta="' + role + '"]');
    set.addEventListener('change', function (e) {
      var bill = e.target.value;
      cta.href = 'https://showpilot.space/register?role=' + role + '&billing=' + bill;
      cta.querySelector('[data-bill-label]').textContent = bill === 'yearly' ? 'Yearly' : 'Monthly';
    });
  });
})();
