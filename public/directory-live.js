(function () {
  if (window.__dirLiveBound) return;
  window.__dirLiveBound = true;

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

  var liveRequest = 0;
  var loadedKey = '';

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  function statusEl() {
    return document.querySelector('[data-city-status]');
  }

  function setStatus(text) {
    var el = statusEl();
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  function currentNiche() {
    var on = document.querySelector('[data-filter-niche].is-on');
    return on ? (on.getAttribute('data-filter-niche') || '') : '';
  }

  function typeFromPath() {
    var match = location.pathname.match(/^\/type\/([^/]+)/);
    return match ? match[1] : '';
  }

  function ensureCityPill(city) {
    if (!city) return;
    var group = document.querySelector('[data-shop-filters] [data-filter-group="city"]');
    if (!group) return;
    var key = city.toLowerCase();
    var existing = group.querySelector('[data-filter-city="' + key + '"]');
    var btn = existing;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'soft-pill';
      btn.setAttribute('data-filter-city', key);
      btn.textContent = city;
      group.appendChild(btn);
    }
    group.querySelectorAll('[data-filter-city]').forEach(function (el) {
      el.classList.toggle('is-on', el === btn);
    });
  }

  function cardHtml(shop) {
    var type = TYPE_LABELS[shop.category] || 'Local';
    var photo = shop.photo || (shop.placeId && String(shop.placeId).indexOf('osm:') !== 0
      ? '/api/photo?placeId=' + encodeURIComponent(shop.placeId)
      : '');
    var rating = shop.rating ? Number(shop.rating).toFixed(1) : '';
    var cat = [type, shop.city, rating ? rating + '★' : ''].filter(Boolean).join(' · ');
    var hours = Array.isArray(shop.hours) ? shop.hours.join(' | ') : '';
    var maps = shop.mapsUrl || '';
    var media = photo
      ? '<img class="card-preview" src="' + esc(photo) + '" alt="' + esc(shop.name) + ' listing photo" width="640" height="400" loading="lazy" />'
      : '<div class="card-preview card-preview-missing" aria-label="Photo missing"><span>Photo missing</span></div>';
    return (
      '<div class="card-wrap" data-card-slug="' + esc(shop.slug) + '" data-live-card="1"'
      + ' data-shop-name="' + esc(shop.name) + '"'
      + ' data-shop-city="' + esc(shop.city) + '"'
      + ' data-shop-type="' + esc(shop.category) + '"'
      + ' data-shop-type-label="' + esc(type) + '"'
      + ' data-has-email="' + (shop.verified && shop.verified.email ? '1' : '0') + '"'
      + ' data-has-phone="' + (shop.verified && shop.verified.phone ? '1' : '0') + '"'
      + ' data-has-website="' + (shop.verified && shop.verified.website ? '1' : '0') + '"'
      + ' data-shop-address="' + esc(shop.address || '') + '"'
      + ' data-shop-phone="' + esc(shop.phone || '') + '"'
      + ' data-shop-website="' + esc(shop.website || '') + '"'
      + ' data-shop-email="' + esc(shop.email || '') + '"'
      + ' data-shop-owner="' + esc(shop.ownerName || '') + '"'
      + ' data-shop-ig="' + esc(shop.socials && shop.socials.instagram ? shop.socials.instagram : '') + '"'
      + ' data-shop-photo="' + esc(photo) + '"'
      + ' data-shop-place-id="' + esc(shop.placeId || '') + '"'
      + ' data-shop-rating="' + esc(rating) + '"'
      + ' data-shop-maps="' + esc(maps) + '"'
      + ' data-shop-hours="' + esc(hours) + '">'
      + '<div class="card hover-lift">' + media
      + '<span class="card-cat">' + esc(cat) + '</span>'
      + '<h3>' + esc(shop.name) + '</h3>'
      + '<p>' + esc([shop.city, shop.region].filter(Boolean).join(', ')) + '</p>'
      + '</div>'
      + '<button type="button" class="add-lead-btn" data-add-lead="' + esc(shop.slug) + '" aria-label="Add ' + esc(shop.name) + ' to leads" aria-pressed="false">'
      + '<svg class="add-lead-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>'
      + '<svg class="add-lead-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 12 4 4 8-8"></path></svg>'
      + '</button></div>'
    );
  }

  function rowTemplate(title, href, slug) {
    var link = href ? '<h2><a href="' + esc(href) + '">' + esc(title) + '</a></h2>' : '<h2>' + esc(title) + '</h2>';
    return (
      '<section class="row" data-carousel data-shop-row data-live-row="' + esc(slug) + '">'
      + '<div class="row-head">' + link
      + '<div class="row-nav">'
      + '<button type="button" data-prev aria-label="Previous ' + esc(title) + '">‹</button>'
      + '<button type="button" data-next aria-label="Next ' + esc(title) + '">›</button>'
      + '</div></div>'
      + '<div class="track sleek-scroll" data-track></div>'
      + '</section>'
    );
  }

  function clearLive() {
    document.querySelectorAll('[data-live-card]').forEach(function (card) {
      card.remove();
    });
    var liveRows = document.querySelector('[data-live-rows]');
    if (liveRows) {
      liveRows.innerHTML = '';
      liveRows.hidden = true;
    }
    loadedKey = '';
  }

  function trackFor(category, label) {
    var liveRows = document.querySelector('[data-live-rows]');
    var existing = document.querySelector('[data-live-row="' + category + '"] [data-track]');
    if (existing) return existing;
    var seedRows = document.querySelectorAll('[data-seed-rows] [data-shop-row]');
    for (var i = 0; i < seedRows.length; i += 1) {
      var heading = seedRows[i].querySelector('h2');
      if (heading && heading.textContent.trim().toLowerCase() === label.toLowerCase()) {
        return seedRows[i].querySelector('[data-track]');
      }
    }
    var grid = document.querySelector('[data-shop-grid]');
    if (grid) return grid;
    if (!liveRows) return null;
    liveRows.hidden = false;
    liveRows.insertAdjacentHTML('beforeend', rowTemplate(label, category === 'featured' ? '' : '/type/' + category + '/', category));
    return liveRows.querySelector('[data-live-row="' + category + '"] [data-track]');
  }

  function paintShops(payload) {
    clearLive();
    var shops = payload.shops || [];
    if (!shops.length) {
      setStatus('No live listings yet for ' + (payload.city || 'that city') + '.');
      if (typeof window.__dirApplyShopFilters === 'function') window.__dirApplyShopFilters();
      return;
    }
    var typePage = typeFromPath();
    var grouped = {};
    shops.forEach(function (shop) {
      if (typePage && shop.category !== typePage) return;
      var key = shop.category || 'other';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(shop);
    });
    var featured = shops.slice().sort(function (a, b) {
      return (b.rating || 0) - (a.rating || 0);
    }).slice(0, 8);
    if (!typePage && featured.length) {
      var featuredTrack = trackFor('featured', 'In ' + payload.city);
      if (featuredTrack) {
        featuredTrack.insertAdjacentHTML('beforeend', featured.map(cardHtml).join(''));
      }
    }
    Object.keys(TYPE_LABELS).forEach(function (slug) {
      var list = grouped[slug];
      if (!list || !list.length) return;
      var track = trackFor(slug, TYPE_LABELS[slug]);
      if (!track) return;
      track.insertAdjacentHTML('beforeend', list.map(cardHtml).join(''));
    });
    var liveRows = document.querySelector('[data-live-rows]');
    if (liveRows && liveRows.querySelector('[data-shop-row]')) liveRows.hidden = false;
    var source = payload.source === 'places' ? 'Google Business' : 'live listings';
    setStatus(shops.length + ' ' + source + ' in ' + payload.city + (payload.region ? ', ' + payload.region : '') + '.');
    if (typeof window.__dirApplyShopFilters === 'function') window.__dirApplyShopFilters();
    if (typeof window.__dirPaintAddLeads === 'function') window.__dirPaintAddLeads();
  }

  async function loadCity(detail) {
    var city = (detail && detail.city) || '';
    if (!city) {
      clearLive();
      setStatus('');
      if (typeof window.__dirApplyShopFilters === 'function') window.__dirApplyShopFilters();
      return;
    }
    var region = (detail && detail.region) || '';
    var country = (detail && detail.country) || '';
    var niche = currentNiche() || typeFromPath();
    var key = [city, region, country, niche].join('|').toLowerCase();
    if (key === loadedKey) return;
    var request = ++liveRequest;
    ensureCityPill(city);
    setStatus('Loading listings in ' + city + '…');
    try {
      var params = new URLSearchParams({ city: city });
      if (region) params.set('region', region);
      if (country) params.set('country', country);
      if (niche) params.set('category', niche);
      var res = await fetch('/api/places?' + params.toString(), { credentials: 'include' });
      var data = await res.json();
      if (request !== liveRequest) return;
      loadedKey = key;
      paintShops(data);
    } catch (err) {
      if (request !== liveRequest) return;
      setStatus('Could not load listings for ' + city + '.');
    }
  }

  window.addEventListener('callsal:city-applied', function (event) {
    void loadCity(event.detail || {});
  });

  window.addEventListener('callsal:page-applied', function () {
    loadedKey = '';
  });
})();
