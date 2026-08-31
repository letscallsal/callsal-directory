(function () {
  if (window.__dirCityBound) return;
  window.__dirCityBound = true;

  var KEY = 'directory:guest-city';
  var timer = 0;
  var lastQuery = '';

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

  function setMiss(on) {
    var miss = missEl();
    if (miss) miss.hidden = !on;
  }

  function setOpen(on) {
    var root = wrap();
    var list = listEl();
    var input = inputEl();
    if (!root || !list) return;
    var has = Boolean(list.children.length);
    root.classList.toggle('is-open', on && has);
    list.hidden = !(on && has);
    if (input) input.setAttribute('aria-expanded', on && has ? 'true' : 'false');
  }

  function visibleButtons() {
    var list = listEl();
    if (!list) return [];
    return Array.prototype.slice.call(list.querySelectorAll('[data-city-pick]'));
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

  function renderSuggestions(rows) {
    var list = listEl();
    if (!list) return;
    list.innerHTML = (rows || []).map(function (row) {
      var label = row.label || '';
      var main = row.main || label;
      var secondary = row.secondary || '';
      var text = secondary ? main + ' — ' + secondary : main;
      return '<li><button type="button" class="guest-city-opt" data-city-pick="' +
        escapeAttr(row.id || '') +
        '" data-city-label="' + escapeAttr(label) +
        '" role="option" dir="auto">' + escapeHtml(text) + '</button></li>';
    }).join('');
    var first = visibleButtons()[0];
    if (first) first.classList.add('is-hi');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&' + 'amp;')
      .replace(/</g, '&' + 'lt;')
      .replace(/>/g, '&' + 'gt;')
      .replace(/"/g, '&' + 'quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function fetchSuggestions(query) {
    var q = (query || '').trim();
    lastQuery = q;
    if (q.length < 2) {
      renderSuggestions([]);
      setMiss(false);
      setOpen(false);
      return;
    }
    fetch('/api/suggest?q=' + encodeURIComponent(q), { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (q !== lastQuery) return;
        var rows = (data && data.suggestions) || [];
        renderSuggestions(rows);
        setMiss(!rows.length);
        setOpen(Boolean(rows.length));
      })
      .catch(function () {
        if (q !== lastQuery) return;
        setMiss(true);
        setOpen(false);
      });
  }

  function emitPlace(place) {
    window.dispatchEvent(new CustomEvent('callsal:city-applied', {
      detail: {
        city: (place && place.city) || '',
        region: (place && place.region) || '',
        country: (place && place.country) || '',
        label: (place && place.label) || '',
        lat: place && place.lat,
        lng: place && place.lng,
      },
    }));
  }

  function applyPlace(place) {
    var input = inputEl();
    var label = (place && (place.label || place.city)) || '';
    if (input) input.value = label;
    setMiss(false);
    setOpen(false);
    emitPlace(place);
    try {
      if (place && place.lat) sessionStorage.setItem(KEY, JSON.stringify(place));
      else sessionStorage.removeItem(KEY);
    } catch (err) { /* private mode */ }
  }

  function pickFromButton(pick) {
    if (!pick) return;
    var id = pick.getAttribute('data-city-pick') || '';
    var label = pick.getAttribute('data-city-label') || pick.textContent || '';
    if (!id) return;
    fetch('/api/suggest?placeId=' + encodeURIComponent(id), { credentials: 'same-origin' })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (payload) {
        if (!payload.ok || !payload.data || !payload.data.place) {
          setMiss(true);
          return;
        }
        applyPlace(payload.data.place);
      })
      .catch(function () { setMiss(true); });
    if (inputEl()) inputEl().value = label;
    setOpen(false);
  }

  function tryApplyFromBar() {
    var hi = highlighted();
    if (hi) {
      pickFromButton(hi);
      return;
    }
    var input = inputEl();
    var typed = input ? (input.value || '').trim() : '';
    if (!typed) return;
    fetch('/api/suggest?q=' + encodeURIComponent(typed) + '&resolve=1', { credentials: 'same-origin' })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (payload) {
        if (!payload.ok || !payload.data || !payload.data.place) {
          setMiss(true);
          setOpen(true);
          return;
        }
        applyPlace(payload.data.place);
      })
      .catch(function () {
        setMiss(true);
        setOpen(true);
      });
  }

  document.addEventListener('input', function (event) {
    var input = event.target && event.target.closest && event.target.closest('[data-city-input]');
    if (!input) return;
    setMiss(false);
    window.clearTimeout(timer);
    timer = window.setTimeout(function () { fetchSuggestions(input.value); }, 220);
  });

  document.addEventListener('focusin', function (event) {
    if (event.target && event.target.closest && event.target.closest('[data-city-input]')) {
      var val = event.target.value || '';
      if (val.trim().length >= 2) fetchSuggestions(val);
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
})();
