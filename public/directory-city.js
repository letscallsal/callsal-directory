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
      .map(function (el) {
        return {
          city: (el.getAttribute('data-city-pick') || '').trim(),
          region: (el.getAttribute('data-city-region') || '').trim(),
          country: (el.getAttribute('data-city-country') || '').trim(),
          label: (el.getAttribute('data-city-label') || el.textContent || '').trim(),
        };
      })
      .filter(function (item) { return item.city; });
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
      var label = ((btn && (btn.getAttribute('data-city-label') || btn.textContent)) || city).trim();
      var popular = btn && btn.getAttribute('data-city-popular') === '1';
      if (!city) {
        allItem = li;
        li.hidden = false;
        return;
      }
      if (!q) {
        li.hidden = !popular;
        if (popular) starts.push(li);
        else hidden.push(li);
        return;
      }
      var name = (label + ' ' + city).toLowerCase();
      if (name.indexOf(q) === 0 || city.toLowerCase().indexOf(q) === 0) {
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
      var ca = ((a.querySelector('[data-city-pick]') && a.querySelector('[data-city-pick]').getAttribute('data-city-label')) || '').toLowerCase();
      var cb = ((b.querySelector('[data-city-pick]') && b.querySelector('[data-city-pick]').getAttribute('data-city-label')) || '').toLowerCase();
      return ca.localeCompare(cb);
    }
    starts.sort(byName);
    contains.sort(byName);

    var ordered = (allItem ? [allItem] : []).concat(starts, contains, hidden);
    ordered.forEach(function (li) { list.appendChild(li); });
  }

  function matchCity(query) {
    var typed = (query || '').trim().toLowerCase();
    if (!typed || typed === 'all cities') return { city: '', region: '', country: '' };
    var list = catalogCities();
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      var city = item.city.toLowerCase();
      var label = (item.label || '').toLowerCase();
      var combo = (item.city + ' ' + item.region).toLowerCase();
      var comma = (item.city + ', ' + item.region).toLowerCase();
      if (city === typed || label === typed || combo === typed || comma === typed) return item;
    }
    return null;
  }

  function setSidebarCity(city) {
    var want = (city || '').toLowerCase();
    document.querySelectorAll('[data-filter-city]').forEach(function (btn) {
      var val = (btn.getAttribute('data-filter-city') || '').toLowerCase();
      btn.classList.toggle('is-on', val === want);
    });
  }

  function applyCityCards(city) {
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
  }

  function emitCity(city, region, country) {
    window.dispatchEvent(new CustomEvent('callsal:city-applied', {
      detail: { city: city || '', region: region || '', country: country || '' },
    }));
  }

  function applyCity(city, persist, meta) {
    var chosen = (city || '').trim();
    var region = (meta && meta.region) || '';
    var country = (meta && meta.country) || '';
    var input = inputEl();
    if (input) input.value = chosen;
    markActive(chosen);
    setMiss(false);
    setSidebarCity(chosen);
    if (typeof window.__dirApplyShopFilters === 'function') {
      window.__dirApplyShopFilters();
    } else {
      applyCityCards(chosen);
    }
    emitCity(chosen, region, country);
    if (persist !== false) {
      try {
        if (chosen) sessionStorage.setItem(KEY, JSON.stringify({ city: chosen, region: region, country: country }));
        else sessionStorage.removeItem(KEY);
      } catch (err) { /* private mode */ }
    }
  }

  function tryApplyFromBar() {
    var input = inputEl();
    if (!input) return;
    var typed = (input.value || '').trim();
    var match = matchCity(typed);
    if (match && !match.city) {
      applyCity('');
      return;
    }
    if (match) {
      applyCity(match.city, true, match);
      return;
    }
    if (typed.length < 2) {
      setMiss(true);
      return;
    }
    applyCity(typed, true, {});
  }

  async function hideIfAuthed() {
    var root = wrap();
    if (!root) return true;
    root.hidden = false;
    return false;
  }

  async function restore() {
    var hidden = await hideIfAuthed();
    var root = wrap();
    if (!root || hidden) return;
    var saved = '';
    try { saved = sessionStorage.getItem(KEY) || ''; } catch (err) { saved = ''; }
    var parsed = null;
    try { parsed = saved.charAt(0) === '{' ? JSON.parse(saved) : { city: saved }; } catch (err) { parsed = { city: saved }; }
    var match = matchCity((parsed && parsed.city) || '');
    if (match && match.city) applyCity(match.city, false, match);
    else if (parsed && parsed.city) applyCity(parsed.city, false, parsed);
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
      var region = pick.getAttribute('data-city-region') || '';
      var country = pick.getAttribute('data-city-country') || '';
      var label = pick.getAttribute('data-city-label') || city;
      var input = inputEl();
      if (input) input.value = city ? label : '';
      filterSuggestions(city ? label : '');
      applyCity(city, true, { region: region, country: country });
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
