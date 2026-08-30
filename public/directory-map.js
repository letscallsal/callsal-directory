(function () {
  if (window.__dirMapBound) return;
  window.__dirMapBound = true;

  var TYPE_LABELS = {
    barber: 'Barber',
    food: 'Food',
    dental: 'Dental',
    legal: 'Legal',
    salon: 'Salon',
    accounting: 'Accounting',
    auto: 'Auto',
    fitness: 'Fitness',
    wellness: 'Wellness',
    trades: 'Trades',
    other: 'Local',
  };

  var ICON_WEB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/></svg>';
  var ICON_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h3l1.2 4.2-2 1.2a12 12 0 0 0 5.4 5.4l1.2-2H21l.2 3.2A16 16 0 0 1 7 3z"/></svg>';
  var ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/></svg>';
  var ICON_IG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17.2" cy="6.8" r="0.8" fill="currentColor" stroke="none"/></svg>';

  var map = null;
  var layer = null;
  var markers = {};
  var shops = [];
  var lastSearch = null;
  var loading = false;
  var moved = false;

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  function isLeads() {
    return document.documentElement.classList.contains('is-leads');
  }

  function isApp() {
    return document.documentElement.classList.contains('is-app')
      || document.documentElement.classList.contains('is-map-locked');
  }

  function canvas() {
    return document.querySelector('[data-map]');
  }

  function listEl() {
    return document.querySelector('[data-map-list]');
  }

  function statusEl() {
    return document.querySelector('[data-map-status]');
  }

  function searchBtn() {
    return document.querySelector('[data-search-here]');
  }

  function countEl() {
    return document.querySelector('[data-map-count]');
  }

  function setStatus(text) {
    var el = statusEl();
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  function currentNiche() {
    var on = document.querySelector('[data-shop-filters] [data-filter-niche].is-on');
    return on ? (on.getAttribute('data-filter-niche') || '') : '';
  }

  function safeHref(url) {
    var v = String(url || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    return 'https://' + v.replace(/^\/+/, '');
  }

  function igParts(raw) {
    var v = String(raw || '').trim();
    if (!v) return null;
    var handle = v;
    var m = v.match(/instagram\.com\/([^/?#]+)/i);
    if (m) handle = m[1];
    handle = handle.replace(/^@/, '').replace(/\/+$/, '');
    if (!handle) return null;
    return { href: 'https://www.instagram.com/' + encodeURIComponent(handle), tip: '@' + handle };
  }

  function actBtn(kind, tip, extra, svg) {
    return '<button type="button" class="lead-act" draggable="false" data-lead-act="' + kind + '" data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '"' + extra + '>' + svg + '</button>';
  }

  function cardActs(shop) {
    var phone = String(shop.phone || '').trim();
    var email = String(shop.email || '').trim();
    var web = String(shop.website || '').trim();
    var ig = igParts(shop.socials && shop.socials.instagram);
    var bits = [];
    if (web) bits.push(actBtn('web', web, ' data-href="' + esc(safeHref(web)) + '"', ICON_WEB));
    if (phone) bits.push(actBtn('copy', phone, ' data-copy="' + esc(phone) + '"', ICON_PHONE));
    if (email) bits.push(actBtn('copy', email, ' data-copy="' + esc(email) + '"', ICON_MAIL));
    if (ig) bits.push(actBtn('ig', ig.tip, ' data-href="' + esc(ig.href) + '"', ICON_IG));
    return bits.length ? '<div class="lead-acts">' + bits.join('') + '</div>' : '';
  }

  function listingHtml(shop) {
    var type = TYPE_LABELS[shop.category] || 'Local';
    var rating = shop.rating ? Number(shop.rating).toFixed(1) : '';
    var cat = [type, shop.city, rating ? rating + '★' : ''].filter(Boolean).join(' · ');
    var hours = Array.isArray(shop.hours) ? shop.hours.join(' | ') : '';
    var phone = String(shop.phone || '').trim();
    var email = String(shop.email || '').trim();
    var web = String(shop.website || '').trim();
    var phoneLine = phone
      ? '<p class="lead-phone" data-lead-act="copy" data-copy="' + esc(phone) + '" data-tip="' + esc(phone) + '">' + esc(phone) + '</p>'
      : '<p class="lead-phone lead-phone-empty">No phone</p>';
    var key = shop.placeId || shop.slug;
    return (
      '<div class="card-wrap" data-card-slug="' + esc(shop.slug) + '" data-map-card="' + esc(key) + '"'
      + ' data-shop-name="' + esc(shop.name) + '"'
      + ' data-shop-city="' + esc(shop.city || '') + '"'
      + ' data-shop-region="' + esc(shop.region || '') + '"'
      + ' data-shop-type="' + esc(shop.category || '') + '"'
      + ' data-shop-type-label="' + esc(type) + '"'
      + ' data-has-email="' + (email ? '1' : '0') + '"'
      + ' data-has-phone="' + (phone ? '1' : '0') + '"'
      + ' data-has-website="' + (web ? '1' : '0') + '"'
      + ' data-shop-address="' + esc(shop.address || '') + '"'
      + ' data-shop-phone="' + esc(phone) + '"'
      + ' data-shop-website="' + esc(web) + '"'
      + ' data-shop-email="' + esc(email) + '"'
      + ' data-shop-owner="' + esc(shop.ownerName || '') + '"'
      + ' data-shop-ig="' + esc(shop.socials && shop.socials.instagram ? shop.socials.instagram : '') + '"'
      + ' data-shop-place-id="' + esc(shop.placeId || '') + '"'
      + ' data-shop-rating="' + esc(rating) + '"'
      + ' data-shop-maps="' + esc(shop.mapsUrl || '') + '"'
      + ' data-shop-hours="' + esc(hours) + '"'
      + ' data-shop-lat="' + esc(shop.lat || '') + '"'
      + ' data-shop-lng="' + esc(shop.lng || '') + '">'
      + '<div class="card hover-lift">'
      + '<span class="card-cat">' + esc(cat) + '</span>'
      + '<h3>' + esc(shop.name) + '</h3>'
      + phoneLine
      + cardActs(shop)
      + '</div>'
      + '<button type="button" class="add-lead-btn" data-add-lead="' + esc(shop.slug) + '" aria-label="Add ' + esc(shop.name) + ' to leads" aria-pressed="false">'
      + '<svg class="add-lead-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>'
      + '<svg class="add-lead-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 12 4 4 8-8"></path></svg>'
      + '</button></div>'
    );
  }

  function pinIcon(on) {
    return window.L.divIcon({
      className: on ? 'map-pin is-on' : 'map-pin',
      iconSize: on ? [18, 18] : [14, 14],
      iconAnchor: on ? [9, 9] : [7, 7],
    });
  }

  function radiusMeters() {
    if (!map) return 4000;
    var b = map.getBounds();
    var meters = map.distance(b.getSouthWest(), b.getNorthEast()) / 2;
    return Math.max(600, Math.min(meters, 25000));
  }

  function showSearchHere(on) {
    var btn = searchBtn();
    if (btn) btn.hidden = !on;
    moved = on;
  }

  function highlight(key) {
    Object.keys(markers).forEach(function (id) {
      markers[id].setIcon(pinIcon(id === key));
    });
    document.querySelectorAll('[data-map-card]').forEach(function (el) {
      el.classList.toggle('is-on', el.getAttribute('data-map-card') === key);
    });
  }

  function paintList() {
    var rail = listEl();
    if (!rail) return;
    if (!shops.length) {
      rail.innerHTML = '<p class="listings-empty">No listings in view. Move the map, then search this area.</p>';
    } else {
      rail.innerHTML = shops.map(listingHtml).join('');
    }
    var count = countEl();
    if (count) count.textContent = shops.length ? String(shops.length) : '0';
    if (typeof window.__dirPaintAddLeads === 'function') window.__dirPaintAddLeads();
  }

  function paintPins() {
    if (!map || !window.L) return;
    if (layer) layer.clearLayers();
    else {
      layer = window.L.layerGroup().addTo(map);
    }
    markers = {};
    shops.forEach(function (shop) {
      var lat = Number(shop.lat);
      var lng = Number(shop.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      var key = shop.placeId || shop.slug;
      var marker = window.L.marker([lat, lng], { icon: pinIcon(false), title: shop.name });
      marker.on('click', function () {
        highlight(key);
        var card = document.querySelector('[data-map-card="' + key + '"]');
        if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      marker.addTo(layer);
      markers[key] = marker;
    });
  }

  async function loadShops(query, fly) {
    if (loading) return;
    loading = true;
    setStatus('Scanning this area…');
    showSearchHere(false);
    try {
      var res = await fetch('/api/places?' + query, { credentials: 'same-origin' });
      var data = await res.json();
      shops = (data && data.shops) || [];
      lastSearch = {
        lat: Number(data.lat) || (map && map.getCenter().lat),
        lng: Number(data.lng) || (map && map.getCenter().lng),
      };
      paintList();
      paintPins();
      if (fly && Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng)) && map) {
        map.setView([Number(data.lat), Number(data.lng)], Math.max(map.getZoom(), 13), { animate: true });
      }
      setStatus(shops.length ? '' : 'No Google Business listings in this view.');
    } catch (err) {
      setStatus('Could not load listings.');
    }
    loading = false;
    if (map) map.invalidateSize();
  }

  function searchView() {
    if (!map) return;
    var c = map.getCenter();
    var niche = currentNiche();
    var q = 'lat=' + encodeURIComponent(c.lat) + '&lng=' + encodeURIComponent(c.lng) + '&radius=' + encodeURIComponent(Math.round(radiusMeters()));
    if (niche) q += '&category=' + encodeURIComponent(niche);
    loadShops(q, false);
  }

  function searchCity(detail) {
    var city = (detail && detail.city) || '';
    var niche = currentNiche();
    if (!city) {
      searchView();
      return;
    }
    var q = 'city=' + encodeURIComponent(city);
    if (detail.region) q += '&region=' + encodeURIComponent(detail.region);
    if (detail.country) q += '&country=' + encodeURIComponent(detail.country);
    if (niche) q += '&category=' + encodeURIComponent(niche);
    loadShops(q, true);
  }

  function ensureMap() {
    if (map || !window.L) return map;
    var el = canvas();
    if (!el) return null;
    map = window.L.map(el, {
      zoomControl: true,
      attributionControl: true,
    }).setView([43.5081, -79.8829], 13);
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);
    map.on('moveend', function () {
      if (!lastSearch) {
        showSearchHere(true);
        return;
      }
      var c = map.getCenter();
      var dist = map.distance([lastSearch.lat, lastSearch.lng], c);
      showSearchHere(dist > 280 || Math.abs((map.getZoom() || 13) - 13) > 1);
    });
    return map;
  }

  function syncMode() {
    if (isLeads()) return;
    ensureMap();
    if (map) setTimeout(function () { map.invalidateSize(); }, 80);
    if (!shops.length && isApp()) searchView();
  }

  document.addEventListener('click', function (event) {
    var here = event.target && event.target.closest && event.target.closest('[data-search-here]');
    if (here) {
      event.preventDefault();
      searchView();
      return;
    }
    var card = event.target && event.target.closest && event.target.closest('[data-map-card]');
    if (card && !(event.target.closest && event.target.closest('[data-lead-act], [data-add-lead]'))) {
      var key = card.getAttribute('data-map-card');
      highlight(key);
      var marker = markers[key];
      if (marker && map) {
        map.panTo(marker.getLatLng(), { animate: true });
      }
    }
  });

  window.addEventListener('callsal:city-applied', function (event) {
    searchCity((event && event.detail) || {});
  });

  window.addEventListener('callsal:page-applied', function () {
    syncMode();
  });
  window.addEventListener('callsal:map-locked', function () {
    syncMode();
  });

  document.addEventListener('click', function (event) {
    var niche = event.target && event.target.closest && event.target.closest('[data-shop-filters] [data-filter-niche], [data-sidebar] [data-type]');
    if (!niche) return;
    setTimeout(function () {
      if (lastSearch) searchView();
    }, 0);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { syncMode(); });
  } else {
    syncMode();
  }

  var tries = 0;
  var wait = setInterval(function () {
    tries += 1;
    if (window.L || tries > 40) {
      clearInterval(wait);
      syncMode();
    }
  }, 150);
})();
