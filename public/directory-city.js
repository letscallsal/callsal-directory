(function () {
  if (window.__dirCityBound) return;
  window.__dirCityBound = true;

  var KEY = 'directory:guest-city';

  function wrap() {
    return document.querySelector('[data-guest-city]');
  }

  function inputEl() {
    return document.querySelector('[data-city-input]');
  }

  function missEl() {
    return document.querySelector('[data-city-miss]');
  }

  function cityButtons() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-city-pick]'));
  }

  function catalogCities() {
    return cityButtons()
      .map(function (el) { return (el.getAttribute('data-city-pick') || '').trim(); })
      .filter(Boolean);
  }

  function isApp() {
    return document.documentElement.classList.contains('is-app');
  }

  function setMiss(on) {
    var miss = missEl();
    if (miss) miss.hidden = !on;
  }

  function markActive(city) {
    var want = (city || '').toLowerCase();
    cityButtons().forEach(function (el) {
      var val = (el.getAttribute('data-city-pick') || '').toLowerCase();
      el.classList.toggle('is-on', val === want);
    });
  }

  function filterSuggestions(query) {
    var q = (query || '').trim().toLowerCase();
    var list = document.querySelector('[data-city-list]');
    if (!list) return;

    var items = Array.prototype.slice.call(list.querySelectorAll('li'));
    var allItem = null;
    var starts = [];
    var contains = [];
    var hidden = [];

    items.forEach(function (li) {
      var btn = li.querySelector('[data-city-pick]');
      var city = ((btn && btn.getAttribute('data-city-pick')) || '').trim();
      if (!city) {
        allItem = li;
        li.hidden = false;
        return;
      }
      if (!q) {
        li.hidden = false;
        starts.push(li);
        return;
      }
      var name = city.toLowerCase();
      if (name.indexOf(q) === 0) {
        li.hidden = false;
        starts.push(li);
      } else if (name.indexOf(q) !== -1) {
        li.hidden = false;
        contains.push(li);
      } else {
        li.hidden = true;
        hidden.push(li);
      }
    });

    function byName(a, b) {
      var ca = ((a.querySelector('[data-city-pick]') && a.querySelector('[data-city-pick]').getAttribute('data-city-pick')) || '').toLowerCase();
      var cb = ((b.querySelector('[data-city-pick]') && b.querySelector('[data-city-pick]').getAttribute('data-city-pick')) || '').toLowerCase();
      return ca.localeCompare(cb);
    }
    starts.sort(byName);
    contains.sort(byName);

    var ordered = (allItem ? [allItem] : []).concat(starts, contains, hidden);
    ordered.forEach(function (li) { list.appendChild(li); });
  }

  function exactCity(query) {
    var typed = (query || '').trim().toLowerCase();
    if (!typed || typed === 'all cities') return '';
    var list = catalogCities();
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].toLowerCase() === typed) return list[i];
    }
    return null;
  }

  function syncMenu(city) {
    var want = (city || '').toLowerCase();
    var now = document.querySelector('[data-filter-now="city"]');
    if (now) now.textContent = city || 'All cities';
    var match = document.querySelector('[data-filter-city="' + want + '"]');
    if (match) match.click();
  }

  function applyCity(city, persist) {
    var chosen = (city || '').trim();
    document.querySelectorAll('[data-card-slug]').forEach(function (card) {
      if (!chosen) {
        card.hidden = false;
        return;
      }
      var shopCity = (card.getAttribute('data-shop-city') || '').toLowerCase();
      card.hidden = shopCity !== chosen.toLowerCase();
    });
    document.querySelectorAll('[data-shop-row]').forEach(function (row) {
      var visible = Array.prototype.slice.call(row.querySelectorAll('[data-card-slug]')).some(function (card) {
        return !card.hidden;
      });
      row.hidden = !visible;
    });
    if (persist !== false) {
      try {
        if (chosen) sessionStorage.setItem(KEY, chosen);
        else sessionStorage.removeItem(KEY);
      } catch (err) { /* private mode */ }
    }
    var input = inputEl();
    if (input) input.value = chosen;
    markActive(chosen);
    setMiss(false);
    syncMenu(chosen);
  }

  function tryApplyFromBar() {
    var input = inputEl();
    if (!input) return;
    var match = exactCity(input.value);
    if (match === null) {
      setMiss(true);
      return;
    }
    applyCity(match);
  }

  async function hideIfAuthed() {
    var root = wrap();
    if (!root) return true;
    if (isApp()) {
      root.hidden = true;
      return true;
    }
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      var data = await res.json();
      if (res.ok && data.user) {
        root.hidden = true;
        return true;
      }
    } catch (err) { /* guest */ }
    root.hidden = false;
    return false;
  }

  async function restore() {
    var hidden = await hideIfAuthed();
    var root = wrap();
    if (!root || hidden) return;
    var saved = '';
    try { saved = sessionStorage.getItem(KEY) || ''; } catch (err) { saved = ''; }
    var match = exactCity(saved);
    if (match) applyCity(match, false);
    else applyCity('', false);
    var input = inputEl();
    filterSuggestions(input ? input.value : '');
  }

  document.addEventListener('input', function (event) {
    var input = event.target && event.target.closest && event.target.closest('[data-city-input]');
    if (!input) return;
    setMiss(false);
    filterSuggestions(input.value);
  });

  document.addEventListener('click', function (event) {
    var pick = event.target && event.target.closest && event.target.closest('[data-city-pick]');
    if (pick) {
      var city = pick.getAttribute('data-city-pick') || '';
      var input = inputEl();
      if (input) input.value = city;
      filterSuggestions(city);
      markActive(city);
      setMiss(false);
      return;
    }
    if (event.target && event.target.closest && event.target.closest('[data-city-apply]')) {
      tryApplyFromBar();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    if (!event.target || !event.target.closest || !event.target.closest('[data-city-input]')) return;
    event.preventDefault();
    tryApplyFromBar();
  });

  window.addEventListener('callsal:page-applied', function () {
    void restore();
  });

  if (typeof MutationObserver === 'function') {
    new MutationObserver(function () {
      void hideIfAuthed();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { void restore(); });
  } else {
    void restore();
  }
})();
