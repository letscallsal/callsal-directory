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
  var markers = {};
  var shops = [];
  var lastSearch = null;
  var loading = false;
  var moved = false;
  var engine = 'none';
  var mapsBoot = null;
  var WORLD = { lat: 20, lng: 0, zoom: 2 };
  var MILTON = { lat: 43.5081, lng: -79.8829, zoom: 14 };
  var MIN_HITS = 5;
  var RADII = [900, 1800, 3500, 7000, 12000, 20000];

  function esc(value) {
    var map = Object.create(null);
    map['&'] = '&amp;';
    map['<'] = '&lt;';
    map['>'] = '&gt;';
    map['"'] = '&quot;';
    map["'"] = '&#39;';
    return String(value || '').replace(/[&<>"']/g, function (ch) { return map[ch]; });
  }

  function isLeads() {
    return document.documentElement.classList.contains('is-leads');
  }

  function isApp() {
    return document.documentElement.classList.contains('is-app');
  }

  function saleMode() {
    return !isApp() && Boolean(document.querySelector('[data-sale-map]'));
  }

  function canvas() {
    return saleMode()
      ? document.querySelector('[data-sale-map]')
      : document.querySelector('[data-map]');
  }

  function listEl() {
    return saleMode()
      ? document.querySelector('[data-sale-list]')
      : document.querySelector('[data-map-list]');
  }

  function statusEl() {
    return document.querySelector('[data-map-status]');
  }

  function searchBtn() {
    if (saleMode()) return document.querySelector('[data-sale-window] [data-search-here]');
    return document.querySelector('[data-map-stage] [data-search-here]');
  }

  function countEl() {
    return saleMode()
      ? document.querySelector('[data-sale-count]')
      : document.querySelector('[data-map-count]');
  }

  function setStatus(text) {
    var el = statusEl();
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  function currentNiche() {
    var side = document.querySelector('[data-sidebar] [data-filter-niche].is-on, [data-sidebar] [data-type][aria-pressed="true"]');
    if (side) return side.getAttribute('data-filter-niche') || side.getAttribute('data-type') || '';
    var on = document.querySelector('[data-shop-filters] [data-filter-niche].is-on');
    var value = on ? (on.getAttribute('data-filter-niche') || '') : '';
    return value;
  }

  function setNiche(slug) {
    var want = String(slug || '');
    document.querySelectorAll('[data-shop-filters] [data-filter-niche]').forEach(function (btn) {
      btn.classList.toggle('is-on', (btn.getAttribute('data-filter-niche') || '') === want);
    });
    document.querySelectorAll('[data-sidebar] [data-filter-niche], [data-sidebar] [data-type]').forEach(function (btn) {
      var val = btn.getAttribute('data-filter-niche') || btn.getAttribute('data-type') || '';
      var on = Boolean(want) && val === want;
      btn.classList.toggle('is-on', on);
      if (btn.hasAttribute('aria-pressed')) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
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
    var type = shop.primaryType || TYPE_LABELS[shop.category] || 'Local';
    var rating = shop.rating ? Number(shop.rating).toFixed(1) : '';
    var open = shop.openNow === true ? 'Open' : shop.openNow === false ? 'Closed' : '';
    var cat = [type, shop.city, rating ? rating + '★' : '', open].filter(Boolean).join(' · ');
    var hours = Array.isArray(shop.hours) ? shop.hours.join(' | ') : (shop.hours || '');
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
      + ' data-shop-status="' + esc(shop.status || '') + '"'
      + ' data-shop-open="' + esc(open) + '"'
      + ' data-shop-summary="' + esc(shop.summary || '') + '"'
      + ' data-shop-price="' + esc(shop.priceLevel || '') + '"'
      + ' data-shop-lat="' + esc(shop.lat || '') + '"'
      + ' data-shop-lng="' + esc(shop.lng || '') + '">'
      + '<div class="lead-card">'
      + '<p class="lead-type">' + esc(cat) + '</p>'
      + '<div class="lead-main">'
      + '<div class="lead-copy">'
      + '<h3>' + esc(shop.name) + '</h3>'
      + phoneLine
      + '</div>'
      + cardActs(shop)
      + '</div>'
      + '</div>'
      + '<button type="button" class="add-lead-btn" data-add-lead="' + esc(shop.slug) + '" aria-label="Add ' + esc(shop.name) + ' to leads" aria-pressed="false">'
      + '<svg class="add-lead-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>'
      + '<svg class="add-lead-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 12 4 4 8-8"></path></svg>'
      + '</button></div>'
    );
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function loadCss(href) {
    if (document.querySelector('link[data-map-css="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-map-css', href);
    document.head.appendChild(link);
  }

  function haversine(a, b) {
    var R = 6371000;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180)
      * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function getCenter() {
    if (engine === 'google' && map) {
      var gc = map.getCenter();
      return { lat: gc.lat(), lng: gc.lng() };
    }
    if (engine === 'leaflet' && map) {
      var lc = map.getCenter();
      return { lat: lc.lat, lng: lc.lng };
    }
    return { lat: WORLD.lat, lng: WORLD.lng };
  }

  function getZoom() {
    if (!map) return 14;
    return map.getZoom();
  }

  function setCenter(lat, lng, zoom) {
    if (!map) return;
    if (engine === 'google') {
      map.setCenter({ lat: lat, lng: lng });
      if (zoom) map.setZoom(zoom);
      return;
    }
    if (engine === 'leaflet') map.setView([lat, lng], zoom || map.getZoom());
  }

  function panTo(lat, lng) {
    if (!map) return;
    if (engine === 'google') map.panTo({ lat: lat, lng: lng });
    else if (engine === 'leaflet') map.panTo([lat, lng]);
  }

  function radiusMeters() {
    if (!map) return 4000;
    var b = map.getBounds ? map.getBounds() : null;
    if (!b) return 4000;
    var sw = engine === 'google'
      ? { lat: b.getSouthWest().lat(), lng: b.getSouthWest().lng() }
      : { lat: b.getSouthWest().lat, lng: b.getSouthWest().lng };
    var ne = engine === 'google'
      ? { lat: b.getNorthEast().lat(), lng: b.getNorthEast().lng() }
      : { lat: b.getNorthEast().lat, lng: b.getNorthEast().lng };
    return Math.max(600, Math.min(haversine(sw, ne) / 2, 25000));
  }

  function showSearchHere(on) {
    var btn = searchBtn();
    if (btn) btn.hidden = !(on && getZoom() >= 11);
    moved = on;
  }

  function leafletPin(on) {
    return window.L.divIcon({
      className: on ? 'map-pin is-on' : 'map-pin',
      iconSize: on ? [18, 18] : [14, 14],
      iconAnchor: on ? [9, 9] : [7, 7],
    });
  }

  function googlePin(on) {
    return {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: on ? 9 : 6,
      fillColor: on ? '#ffffff' : '#CCFF00',
      fillOpacity: 1,
      strokeColor: on ? '#CCFF00' : '#111111',
      strokeWeight: on ? 3 : 2,
    };
  }

  function highlight(key) {
    Object.keys(markers).forEach(function (id) {
      if (engine === 'google') {
        markers[id].setIcon(googlePin(id === key));
        markers[id].setZIndex(id === key ? 200 : 1);
      } else if (engine === 'leaflet') {
        markers[id].setIcon(leafletPin(id === key));
      }
    });
    document.querySelectorAll('[data-map-card]').forEach(function (el) {
      el.classList.toggle('is-on', el.getAttribute('data-map-card') === key);
    });
  }

  function revealCard(card) {
    var rail = listEl();
    if (!card || !rail) return;
    var top = rail.scrollTop + card.getBoundingClientRect().top - rail.getBoundingClientRect().top;
    if (typeof rail.scrollTo === 'function') rail.scrollTo({ top: top, behavior: 'smooth' });
    else rail.scrollTop = top;
  }

  function paintList() {
    var rail = listEl();
    if (!rail) return;
    if (!shops.length) {
      rail.innerHTML = saleMode()
        ? '<p class="listings-empty">No listings in this view.</p>'
        : '<p class="listings-empty">Search a city, street, or address. The map will drop you close enough to start calling.</p>';
    } else {
      rail.innerHTML = shops.map(listingHtml).join('');
    }
    var count = countEl();
    if (count) count.textContent = shops.length ? String(shops.length) : '0';
    if (typeof window.__dirPaintAddLeads === 'function') window.__dirPaintAddLeads();
    if (typeof window.__dirApplyShopFilters === 'function') window.__dirApplyShopFilters();
  }

  function markerLatLng(marker) {
    if (engine === 'google') {
      var p = marker.getPosition();
      return { lat: p.lat(), lng: p.lng() };
    }
    var ll = marker.getLatLng();
    return { lat: ll.lat, lng: ll.lng };
  }

  function clearPins() {
    Object.keys(markers).forEach(function (id) {
      if (engine === 'google') markers[id].setMap(null);
      else if (engine === 'leaflet') map.removeLayer(markers[id]);
    });
    markers = {};
  }

  function paintPins() {
    if (!map || engine === 'none') return;
    clearPins();
    shops.forEach(function (shop) {
      var lat = Number(shop.lat);
      var lng = Number(shop.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      var key = shop.placeId || shop.slug;
      var marker;
      if (engine === 'google') {
        marker = new window.google.maps.Marker({
          position: { lat: lat, lng: lng },
          map: map,
          title: shop.name,
          icon: googlePin(false),
          clickable: true,
        });
        marker.addListener('click', function () {
          highlight(key);
          revealCard(document.querySelector('[data-map-card="' + key.replace(/"/g, '') + '"]'));
        });
      } else {
        marker = window.L.marker([lat, lng], { icon: leafletPin(false), title: shop.name });
        marker.on('click', function () {
          highlight(key);
          revealCard(document.querySelector('[data-map-card="' + key.replace(/"/g, '') + '"]'));
        });
        marker.addTo(map);
      }
      markers[key] = marker;
    });
  }

  function bindMove() {
    if (!map) return;
    var onMove = function () {
      if (!lastSearch) {
        showSearchHere(true);
        return;
      }
      var c = getCenter();
      var dist = haversine(lastSearch, c);
      showSearchHere(dist > 220);
    };
    if (engine === 'google') map.addListener('idle', onMove);
    else map.on('moveend', onMove);
  }

  function resizeMap() {
    if (!map) return;
    if (engine === 'google' && window.google) window.google.maps.event.trigger(map, 'resize');
    if (engine === 'leaflet') map.invalidateSize();
  }

  function ensureGoogle() {
    if (map) return map;
    var el = canvas();
    if (!el) return null;
    map = new window.google.maps.Map(el, {
      center: saleMode() ? { lat: MILTON.lat, lng: MILTON.lng } : { lat: WORLD.lat, lng: WORLD.lng },
      zoom: saleMode() ? MILTON.zoom : WORLD.zoom,
      minZoom: 2,
      disableDefaultUI: true,
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: saleMode() ? 'cooperative' : 'greedy',
      backgroundColor: '#111111',
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#111111' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#111111' }] },
        { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
        { featureType: 'landscape', stylers: [{ color: '#111111' }] },
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
        { featureType: 'poi.park', stylers: [{ visibility: 'off' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c1c1c' }] },
        { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        { featureType: 'water', stylers: [{ color: '#0a0a0a' }] },
      ],
    });
    bindMove();
    return map;
  }

  function ensureLeaflet() {
    if (map) return map;
    var el = canvas();
    if (!el || !window.L) return null;
    map = window.L.map(el, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: !saleMode(),
      dragging: true,
      tap: !saleMode(),
      minZoom: 2,
    }).setView(
      saleMode() ? [MILTON.lat, MILTON.lng] : [WORLD.lat, WORLD.lng],
      saleMode() ? MILTON.zoom : WORLD.zoom,
    );
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);
    bindMove();
    return map;
  }

  function startGoogle(key) {
    return loadScript('https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly').then(function () {
      if (!window.google || !window.google.maps) throw new Error('no maps');
      engine = 'google';
      ensureGoogle();
    });
  }

  function bootMap() {
    if (mapsBoot) return mapsBoot;
    mapsBoot = fetch('/api/maps-config', { credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data || !data.key) throw new Error((data && data.error) || 'Google Maps is not configured');
          return startGoogle(data.key);
        });
      });
    return mapsBoot;
  }

  async function loadShops(query, fly) {
    if (loading) {
      await waitIdle();
      return loadShops(query, fly);
    }
    loading = true;
    setStatus('Scanning this area…');
    showSearchHere(false);
    try {
      var res = await fetch('/api/places?' + query, { credentials: 'same-origin' });
      var data = await res.json();
      shops = (data && data.shops) || [];
      var here = getCenter();
      lastSearch = {
        lat: Number(data.lat) || here.lat,
        lng: Number(data.lng) || here.lng,
      };
      paintList();
      paintPins();
      if (fly && Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng))) {
        setCenter(Number(data.lat), Number(data.lng), Math.max(getZoom(), 13));
      }
      setStatus(shops.length ? '' : 'No listings in this view.');
    } catch (err) {
      setStatus('Could not load listings.');
    }
    loading = false;
    resizeMap();
  }

  function idleList() {
    shops = [];
    lastSearch = null;
    clearPins();
    paintList();
    setStatus('');
    showSearchHere(false);
  }

  function zoomForRadius(radius) {
    if (radius <= 1000) return 16;
    if (radius <= 2000) return 15;
    if (radius <= 4000) return 14;
    if (radius <= 8000) return 13;
    if (radius <= 14000) return 12;
    return 11;
  }

  function fitShops(fallbackZoom) {
    var pts = shops.filter(function (shop) {
      return Number.isFinite(Number(shop.lat)) && Number.isFinite(Number(shop.lng));
    });
    if (pts.length >= 2 && map) {
      if (engine === 'google' && window.google) {
        var bounds = new window.google.maps.LatLngBounds();
        pts.forEach(function (shop) {
          bounds.extend({ lat: Number(shop.lat), lng: Number(shop.lng) });
        });
        map.fitBounds(bounds, 56);
        if (getZoom() > 16) map.setZoom(16);
        if (getZoom() < 11) map.setZoom(11);
        return;
      }
      if (engine === 'leaflet') {
        map.fitBounds(pts.map(function (shop) {
          return [Number(shop.lat), Number(shop.lng)];
        }), { padding: [40, 40], maxZoom: 16 });
        return;
      }
    }
    var here = getCenter();
    setCenter(here.lat, here.lng, fallbackZoom || 14);
  }

  function waitIdle() {
    return new Promise(function (resolve) {
      (function tick() {
        if (!loading) resolve();
        else window.setTimeout(tick, 40);
      })();
    });
  }

  function searchView() {
    if (getZoom() < 11) return;
    var c = getCenter();
    var niche = currentNiche();
    var q = 'lat=' + encodeURIComponent(c.lat) + '&lng=' + encodeURIComponent(c.lng) + '&radius=' + encodeURIComponent(Math.round(radiusMeters()));
    if (niche) q += '&category=' + encodeURIComponent(niche);
    loadShops(q, false);
  }

  async function searchAround(lat, lng) {
    setCenter(lat, lng, 15);
    await waitIdle();
    var used = RADII[0];
    var i;
    for (i = 0; i < RADII.length; i += 1) {
      used = RADII[i];
      var niche = currentNiche();
      var q = 'lat=' + encodeURIComponent(lat) + '&lng=' + encodeURIComponent(lng) + '&radius=' + encodeURIComponent(used);
      if (niche) q += '&category=' + encodeURIComponent(niche);
      await loadShops(q, false);
      if (shops.length >= MIN_HITS) break;
    }
    fitShops(zoomForRadius(used));
  }

  function searchCity(detail) {
    var lat = Number(detail && detail.lat);
    var lng = Number(detail && detail.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      searchAround(lat, lng);
      return;
    }
    var city = (detail && detail.city) || '';
    var niche = currentNiche();
    if (!city) {
      idleList();
      setCenter(WORLD.lat, WORLD.lng, WORLD.zoom);
      return;
    }
    var q = 'city=' + encodeURIComponent(city);
    if (detail.region) q += '&region=' + encodeURIComponent(detail.region);
    if (detail.country) q += '&country=' + encodeURIComponent(detail.country);
    if (niche) q += '&category=' + encodeURIComponent(niche);
    loadShops(q, true);
  }

  function canvasReady() {
    var el = canvas();
    return Boolean(el && el.offsetWidth >= 24 && el.offsetHeight >= 24);
  }

  function mapHost() {
    if (engine === 'google' && map && typeof map.getDiv === 'function') return map.getDiv();
    if (engine === 'leaflet' && map && typeof map.getContainer === 'function') return map.getContainer();
    return null;
  }

  function mapShouldLive() {
    if (isLeads()) return false;
    if (isApp()) return true;
    return saleMode();
  }

  function syncMode() {
    if (isLeads()) return;
    if (!mapShouldLive()) return;
    var el = canvas();
    if (map && el && mapHost() && mapHost() !== el) {
      map = null;
      mapsBoot = null;
      markers = {};
      engine = 'none';
      shops = [];
      lastSearch = null;
    }
    if (!canvasReady()) {
      window.setTimeout(syncMode, 80);
      return;
    }
    bootMap().then(function () {
      resizeMap();
      if (!shops.length) {
        if (saleMode()) searchCity({ city: 'Milton', region: 'ON', country: 'CA' });
        else {
          setCenter(WORLD.lat, WORLD.lng, WORLD.zoom);
          idleList();
        }
      }
    }).catch(function (err) {
      setStatus((err && err.message) || 'Google Maps could not load.');
    });
  }

  function bumpZoom(delta) {
    if (!map) return;
    var next = getZoom() + delta;
    if (engine === 'google') map.setZoom(next);
    else if (engine === 'leaflet') map.setZoom(next);
  }

  document.addEventListener('click', function (event) {
    var here = event.target && event.target.closest && event.target.closest('[data-search-here]');
    if (here) {
      event.preventDefault();
      searchView();
      return;
    }
    var zoomIn = event.target && event.target.closest && event.target.closest('[data-map-zoom-in]');
    if (zoomIn) {
      event.preventDefault();
      bumpZoom(1);
      return;
    }
    var zoomOut = event.target && event.target.closest && event.target.closest('[data-map-zoom-out]');
    if (zoomOut) {
      event.preventDefault();
      bumpZoom(-1);
      return;
    }
    var card = event.target && event.target.closest && event.target.closest('[data-map-card]');
    if (card && !(event.target.closest && event.target.closest('[data-lead-act], [data-add-lead]'))) {
      var key = card.getAttribute('data-map-card');
      highlight(key);
      var marker = markers[key];
      if (marker) {
        var pos = markerLatLng(marker);
        panTo(pos.lat, pos.lng);
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
    var niche = event.target && event.target.closest && event.target.closest('[data-shop-filters] [data-filter-niche], [data-sidebar] [data-filter-niche], [data-sidebar] [data-type]');
    if (!niche) return;
    var slug = niche.getAttribute('data-filter-niche') || niche.getAttribute('data-type') || '';
    if (slug && slug === currentNiche()) slug = '';
    setNiche(slug);
    setTimeout(function () {
      if (lastSearch || isApp() || document.documentElement.classList.contains('is-map-locked') || canvasReady()) searchView();
    }, 0);
  });

  window.addEventListener('callsal:niche-applied', function (event) {
    var slug = event && event.detail ? event.detail.niche : '';
    setNiche(slug || '');
    if (lastSearch || isApp() || canvasReady()) searchView();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { syncMode(); });
  } else {
    syncMode();
  }

  var saleMap = document.querySelector('[data-sale-map]');
  if (saleMap && typeof IntersectionObserver === 'function') {
    var seen = false;
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0] || !entries[0].isIntersecting) return;
      if (!seen) {
        seen = true;
        syncMode();
      }
      resizeMap();
    }, { threshold: 0.2 });
    io.observe(saleMap);
  }
})();
