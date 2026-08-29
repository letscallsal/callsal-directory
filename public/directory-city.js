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

  function listEl() {
    return document.querySelector('[data-city-list]');
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

  function setMiss(on) {
    var miss = missEl();
    if (miss) miss.hidden = !on;
  }

  function isOpen() {
    var root = wrap();
    return Boolean(root && root.classList.contains('is-open'));
  }

  function setOpen(on) {
    var root = wrap();
    var list = listEl();
    var input = inputEl();
    if (!root || !list) return;
    root.classList.toggle('is-open', on);
    list.hidden = !on;
    if (input) input.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) {
      filterSuggestions(input ? input.value : '');
    } else {
      cityButtons().forEach(function (el) { el.classList.remove('is-hi'); });
    }
  }

  function markActive(city) {
    var want = (city || '').toLowerCase();
    cityButtons().forEach(function (el) {
      var val = (el.getAttribute('data-city-pick') || '').toLowerCase();
      el.classList.toggle('is-on', val === want);
    });
  }

  function visibleButtons() {
    var list = listEl();
    if (!list) return [];
    return Array.prototype.slice.call(list.querySelectorAll('li')).filter(function (li) {
      return !li.hidden;
    }).map(function (li) {
      return li.querySelector('[data-city-pick]');
    }).filter(Boolean);
  }

  function highlightAt(index) {
    var buttons = visibleButtons();
    if (!buttons.length) return;
    var i = ((index % buttons.length) + buttons.length) % buttons.length;
    buttons.forEach(function (el, n) {
      el.classList.toggle('is-hi', n === i);
    });
    var on = buttons[i];
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  function highlighted() {
    return document.querySelector('[data-city-list] [data-city-pick].is-hi');
  }

  function filterSuggestions(query) {
    var q = (query || '').trim().toLowerCase();
    var list = listEl();
    if (!list) return 0;

    var items = Array.prototype.slice.call(list.querySelectorAll('li'));
    var allItem = null;
    var starts = [];
    var contains = [];
    var hidden = [];
    var shown = 0;

    items.forEach(function (li) {
      var btn = li.querySelector('[data-city-pick]');
      var city = ((btn && btn.getAttribute('data-city-pick')) || '').trim();
      var label = ((btn && (btn.getAttribute('data-city-label') || btn.textContent)) || city).trim();
      var popular = btn && btn.getAttribute('data-city-popular') === '1';
      if (!city) {
        allItem = li;
        var showAll = !q || 'all cities'.indexOf(q) === 0 || q === 'all';
        li.hidden = !showAll;
        if (showAll) shown += 1;
        return;
      }
      if (!q) {
        li.hidden = !popular;
        if (popular) {
          starts.push(li);
          shown += 1;
        } else {
          hidden.push(li);
        }
        return;
      }
      var name = (label + ' ' + city).toLowerCase();
      if (name.indexOf(q) === 0 || city.toLowerCase().indexOf(q) === 0) {
        li.hidden = false;
        starts.push(li);
        shown += 1;
      } else if (name.indexOf(q) !== -1) {
        li.hidden = false;
        contains.push(li);
        shown += 1;
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
    cityButtons().forEach(function (el) { el.classList.remove('is-hi'); });
    var first = visibleButtons()[0];
    if (first && q) first.classList.add('is-hi');
    return shown;
  }

  function matchCity(query) {
    var typed = (query || '').trim().toLowerCase();
    if (!typed || typed === 'all cities' || typed === 'all') return { city: '', region: '', country: '', label: '' };
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
    var label = (meta && meta.label) || chosen;
    var input = inputEl();
    if (input) input.value = chosen ? label : '';
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
        if (chosen) sessionStorage.setItem(KEY, JSON.stringify({ city: chosen, region: region, country: country, label: label }));
        else sessionStorage.removeItem(KEY);
      } catch (err) { /* private mode */ }
    }
    setOpen(false);
  }

  function pickFromButton(pick) {
    if (!pick) return;
    var city = pick.getAttribute('data-city-pick') || '';
    var region = pick.getAttribute('data-city-region') || '';
    var country = pick.getAttribute('data-city-country') || '';
    var label = pick.getAttribute('data-city-label') || (city ? pick.textContent : '');
    applyCity(city, true, { region: region, country: country, label: label });
  }

  function tryApplyFromBar() {
    var hi = highlighted();
    if (hi) {
      pickFromButton(hi);
      return;
    }
    var input = inputEl();
    if (!input) return;
    var typed = (input.value || '').trim();
    var match = matchCity(typed);
    if (match) {
      applyCity(match.city, true, match);
      return;
    }
    var first = visibleButtons()[0];
    if (first && typed) {
      pickFromButton(first);
      return;
    }
    setMiss(true);
    setOpen(true);
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
    else applyCity('', false);
    setOpen(false);
  }

  document.addEventListener('input', function (event) {
    var input = event.target && event.target.closest && event.target.closest('[data-city-input]');
    if (!input) return;
    setMiss(false);
    setOpen(true);
    var shown = filterSuggestions(input.value);
    setMiss(Boolean((input.value || '').trim()) && shown === 0);
  });

  document.addEventListener('focusin', function (event) {
    if (event.target && event.target.closest && event.target.closest('[data-city-input]')) {
      setOpen(true);
    }
  });

  document.addEventListener('click', function (event) {
    var pick = event.target && event.target.closest && event.target.closest('[data-city-pick]');
    if (pick) {
      event.preventDefault();
      pickFromButton(pick);
      return;
    }
    var root = wrap();
    if (root && event.target && event.target.closest && event.target.closest('[data-guest-city]')) {
      if (event.target.closest('[data-city-input]') || event.target.closest('[data-city-list]')) return;
    }
    setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    var input = event.target && event.target.closest && event.target.closest('[data-city-input]');
    if (!input) return;
    var buttons = visibleButtons();
    var hi = highlighted();
    var idx = hi ? buttons.indexOf(hi) : -1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      highlightAt(idx < 0 ? 0 : idx + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      highlightAt(idx < 0 ? buttons.length - 1 : idx - 1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      tryApplyFromBar();
    }
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
