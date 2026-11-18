// get.showpilot.space (jobs 333, 338): the feature tour, the profile picker
// and the monthly / yearly switch.
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Feature tour: tabs that also play through on their own.
  var tour = document.querySelector('[data-tour]');
  if (tour) {
    var tabs = Array.prototype.slice.call(tour.querySelectorAll('[role="tab"]'));
    var count = tour.querySelector('[data-count]');
    var playBtn = tour.querySelector('[data-play]');
    var DUR = 6500;
    var cur = 0, timer = null, stopped = reduce, hovering = false;
    if (stopped) tour.setAttribute('data-stopped', '');

    var show = function (i, focus) {
      cur = (i + tabs.length) % tabs.length;
      tabs.forEach(function (t, k) {
        var on = k === cur;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
        // Restart the progress line on the new tab.
        var m = t.querySelector('.meter span');
        if (m) { m.style.animation = 'none'; void m.offsetWidth; m.style.animation = ''; }
      });
      if (count) count.textContent = (cur < 9 ? '0' : '') + (cur + 1);
      if (focus) tabs[cur].focus();
      if (window.matchMedia('(max-width: 1020px)').matches) {
        tabs[cur].scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
      }
      schedule();
    };
    var schedule = function () {
      clearTimeout(timer);
      if (stopped || hovering || document.hidden) return;
      timer = setTimeout(function () { show(cur + 1); }, DUR);
    };
    var setPaused = function (p) {
      if (p) tour.setAttribute('data-paused', ''); else tour.removeAttribute('data-paused');
    };
    var stop = function () {
      stopped = true; clearTimeout(timer); tour.setAttribute('data-stopped', '');
      playBtn.setAttribute('aria-label', 'Play the slideshow');
    };
    var play = function () {
      stopped = false; tour.removeAttribute('data-stopped');
      playBtn.setAttribute('aria-label', 'Pause the slideshow');
      show(cur);
    };

    tabs.forEach(function (t, k) {
      t.addEventListener('click', function () { stop(); show(k); });
      t.addEventListener('keydown', function (e) {
        var d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (d) { e.preventDefault(); stop(); show(cur + d, true); }
        if (e.key === 'Home') { e.preventDefault(); stop(); show(0, true); }
        if (e.key === 'End') { e.preventDefault(); stop(); show(tabs.length - 1, true); }
      });
    });
    tour.querySelector('[data-prev]').addEventListener('click', function () { stop(); show(cur - 1); });
    tour.querySelector('[data-next]').addEventListener('click', function () { stop(); show(cur + 1); });
    playBtn.addEventListener('click', function () { if (stopped) play(); else stop(); });
    tour.addEventListener('mouseenter', function () { hovering = true; setPaused(true); clearTimeout(timer); });
    tour.addEventListener('mouseleave', function () { hovering = false; setPaused(false); schedule(); });
    tour.addEventListener('focusin', function () { if (!stopped) { hovering = true; setPaused(true); clearTimeout(timer); } });
    tour.addEventListener('focusout', function (e) { if (!tour.contains(e.relatedTarget)) { hovering = false; setPaused(false); schedule(); } });
    document.addEventListener('visibilitychange', schedule);

    // Only start playing once the tour is on screen.
    if ('IntersectionObserver' in window) {
      var seen = false;
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && !seen) { seen = true; show(0); } });
      }, { threshold: 0.35 }).observe(tour);
    } else show(0);
  }

  // Who it's for: tap a profile to show what it includes.
  var ptabs = document.querySelectorAll('.tabs .tab');
  ptabs.forEach(function (tab) {
    tab.style.setProperty('--c', tab.getAttribute('data-color'));
    tab.addEventListener('click', function () {
      var key = tab.getAttribute('data-profile');
      ptabs.forEach(function (t) { t.setAttribute('aria-pressed', t === tab ? 'true' : 'false'); });
      document.querySelectorAll('.panel').forEach(function (p) {
        p.hidden = p.getAttribute('data-panel') !== key;
      });
    });
  });

  // Pricing: monthly or yearly (10% off).
  var bills = document.querySelectorAll('[data-billing]');
  bills.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var yearly = btn.getAttribute('data-billing') === 'yearly';
      bills.forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      document.querySelectorAll('.plan [data-m]').forEach(function (el) {
        el.textContent = el.getAttribute(yearly ? 'data-y' : 'data-m');
      });
      document.querySelectorAll('.plan .per').forEach(function (el) {
        el.textContent = el.getAttribute('data-y');
        el.hidden = !yearly;
      });
    });
  });
})();
