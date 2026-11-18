// get.showpilot.space (job 333): the profile picker and the monthly / yearly switch.
(function () {
  // Who it's for: tap a profile to show what it includes.
  var tabs = document.querySelectorAll('.tabs .tab');
  tabs.forEach(function (tab) {
    tab.style.setProperty('--c', tab.getAttribute('data-color'));
    tab.addEventListener('click', function () {
      var key = tab.getAttribute('data-profile');
      tabs.forEach(function (t) { t.setAttribute('aria-pressed', t === tab ? 'true' : 'false'); });
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
