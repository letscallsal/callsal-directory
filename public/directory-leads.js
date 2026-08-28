(function () {
  const STAGES = ['New', 'Contacted', 'Responded', 'Meeting Scheduled', 'Proposal Sent', 'Won'];
  const STAGE_LABELS = {
    New: 'NEW',
    Contacted: 'CONTACTED',
    Responded: 'RESPONDED',
    'Meeting Scheduled': 'MEETING',
    'Proposal Sent': 'PROPOSAL',
    Won: 'WON',
  };
  const LEGACY_STAGE = {
    new: 'New',
    contacted: 'Contacted',
    replied: 'Responded',
    responded: 'Responded',
    booked: 'Meeting Scheduled',
    meeting: 'Meeting Scheduled',
    'meeting scheduled': 'Meeting Scheduled',
    proposal: 'Proposal Sent',
    'proposal sent': 'Proposal Sent',
    won: 'Won',
  };

  let currentUser = null;
  let leadSlugs = new Set();
  let lastLeads = { plan: 'free', leads: [], usage: null, oracle: null };
  let draggedSlug = null;
  let didDrag = false;

  function isLeadsPath() {
    try {
      const p = location.pathname.replace(/\/$/, '') || '/';
      return p === '/leads';
    } catch {
      return false;
    }
  }

  function setLeadsMenu(open) {
    document.body.classList.toggle('leads-drawer-open', open);
    document.querySelectorAll('[data-leads-pill]').forEach((el) => {
      el.setAttribute('aria-expanded', String(open));
    });
    if (open) {
      document.body.classList.remove('drawer-open');
      const menu = document.querySelector('[data-menu]');
      if (menu) {
        menu.setAttribute('aria-expanded', 'false');
        menu.setAttribute('aria-label', 'DIRECTORY');
      }
    }
    const scrim = document.querySelector('[data-scrim]');
    const dirOpen = document.body.classList.contains('drawer-open');
    if (scrim) scrim.hidden = !open && !dirOpen;
  }

  function toggleLeadsMenu() {
    setLeadsMenu(!document.body.classList.contains('leads-drawer-open'));
  }


  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function normalizeStage(value) {
    const raw = String(value || '').trim();
    if (STAGES.indexOf(raw) !== -1) return raw;
    return LEGACY_STAGE[raw.toLowerCase()] || 'New';
  }

  function openAuth(mode) {
    const join = document.querySelector('[data-join]');
    const login = document.querySelector('[data-login]');
    if (mode === 'login' && login) login.click();
    else if (join) join.click();
  }

  function openPremium(message) {
    const modal = document.getElementById('premium-modal');
    const copy = document.querySelector('[data-premium-copy]');
    if (copy && message) copy.textContent = message;
    if (modal) modal.hidden = false;
  }

  function closePremium() {
    const modal = document.getElementById('premium-modal');
    if (modal) modal.hidden = true;
  }

  function closeShopInfo() {
    const modal = document.getElementById('shop-info-modal');
    if (modal) modal.hidden = true;
  }

  function safeHref(url) {
    const v = String(url || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    return 'https://' + v.replace(/^\/+/, '');
  }

  function shopInfoFields(data) {
    const rows = [];
    if (data.address) rows.push('<li><span>Address</span> <span>' + esc(data.address) + '</span></li>');
    if (data.phone) rows.push('<li><span>Phone</span> <span>' + esc(data.phone) + '</span></li>');
    if (data.website) {
      rows.push('<li><span>Website</span> <span><a href="' + esc(safeHref(data.website)) + '" target="_blank" rel="noopener noreferrer">' + esc(data.website) + '</a></span></li>');
    }
    if (data.email) rows.push('<li><span>Email</span> <span>' + esc(data.email) + '</span></li>');
    if (data.owner) rows.push('<li><span>Owner</span> <span>' + esc(data.owner) + '</span></li>');
    if (data.ig) rows.push('<li><span>Instagram</span> <span>' + esc(data.ig) + '</span></li>');
    return rows.length ? '<ul class="shop-info-fields">' + rows.join('') + '</ul>' : '';
  }

  function formatLogTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('en-CA', {
        timeZone: 'America/Toronto',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  function renderLog(log) {
    const items = (log || []).slice().reverse();
    if (!items.length) return '<p class="shop-info-meta">No activity yet.</p>';
    return '<p class="shop-info-meta">Timeline</p><ul class="lead-log">' + items.map((item) => {
      const when = formatLogTime(item.at);
      let line = '';
      if (item.type === 'added') line = 'Added · ' + (STAGE_LABELS[normalizeStage(item.to)] || 'NEW');
      else if (item.type === 'stage') {
        line = (STAGE_LABELS[normalizeStage(item.from)] || '') + ' → ' + (STAGE_LABELS[normalizeStage(item.to)] || '');
      } else {
        line = String(item.type || '');
      }
      return '<li><span>' + esc(when) + '</span> <span>' + esc(line) + '</span></li>';
    }).join('') + '</ul>';
  }

  function renderBoardDrawer(lead) {
    const stage = normalizeStage(lead.stage);
    const stages = STAGES.map((key) => {
      const on = stage === key ? ' is-on' : '';
      return '<button type="button" class="soft-pill' + on + '" data-stage="' + esc(key) + '" data-lead-slug="' + esc(lead.slug) + '">' + esc(STAGE_LABELS[key]) + '</button>';
    }).join('');
    const draft = lead.oracleDraft
      ? '<p class="oracle-draft">' + esc(lead.oracleDraft) + '</p><button type="button" class="soft-pill" data-copy-draft>Copy draft</button>'
      : '';
    return '<div class="lead-stages" style="margin:0 1.25rem 1rem">' + stages + '</div>' + draft + renderLog(lead.log);
  }

  function openShopInfo(data, lead) {
    const modal = document.getElementById('shop-info-modal');
    const title = document.querySelector('[data-shop-info-title]');
    const body = document.querySelector('[data-shop-info-body]');
    if (!modal || !body) return;
    const name = data.name || 'Shop';
    if (title) title.textContent = name;
    const photo = data.photo
      ? '<img class="card-preview shop-info-photo" src="' + esc(data.photo) + '" alt="' + esc(name) + ' listing photo" width="640" height="400" />'
      : '<div class="card-preview card-preview-missing shop-info-photo" aria-label="Photo missing"><span>Photo missing</span></div>';
    const meta = [data.typeLabel, data.city].filter(Boolean).join(' · ');
    const slug = data.slug || '';
    const addBtn = lead ? '' : (
      '<button type="button" class="add-lead-btn" data-add-lead="' + esc(slug) + '" aria-label="Add ' + esc(name) + ' to leads" aria-pressed="false">'
      + '<svg class="add-lead-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">'
      + '<path d="M12 5v14"></path><path d="M5 12h14"></path></svg>'
      + '<svg class="add-lead-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="m6 12 4 4 8-8"></path></svg></button>'
    );
    body.innerHTML = '<div class="shop-info-media">' + photo + addBtn + '</div>'
      + (meta ? '<p class="shop-info-meta">' + esc(meta) + '</p>' : '')
      + shopInfoFields(data)
      + (lead ? renderBoardDrawer(lead) : '');
    modal.hidden = false;
    paintAddLeads();
  }

  function openShopInfoFromCard(card) {
    openShopInfo({
      slug: card.getAttribute('data-card-slug') || '',
      name: card.getAttribute('data-shop-name') || '',
      typeLabel: card.getAttribute('data-shop-type-label') || '',
      city: card.getAttribute('data-shop-city') || '',
      address: card.getAttribute('data-shop-address') || '',
      phone: card.getAttribute('data-shop-phone') || '',
      website: card.getAttribute('data-shop-website') || '',
      email: card.getAttribute('data-shop-email') || '',
      owner: card.getAttribute('data-shop-owner') || '',
      ig: card.getAttribute('data-shop-ig') || '',
      photo: card.getAttribute('data-shop-photo') || '',
    });
  }

  function openShopInfoFromLead(el) {
    const slug = el.getAttribute('data-lead-slug') || '';
    const lead = (lastLeads.leads || []).find((item) => item.slug === slug);
    if (!lead) return;
    const v = lead.verified || {};
    openShopInfo({
      slug: lead.slug,
      name: lead.name || '',
      typeLabel: lead.type || '',
      city: lead.city || '',
      address: v.address && lead.address ? lead.address : '',
      phone: v.phone && lead.phone ? lead.phone : '',
      website: v.website && lead.website ? lead.website : '',
      email: v.email && lead.email ? lead.email : '',
      owner: v.ownerName && lead.ownerName ? lead.ownerName : '',
      ig: v.socials && lead.socials && lead.socials.instagram ? lead.socials.instagram : '',
      photo: v.photo && lead.photo ? lead.photo : '',
    }, lead);
  }

  function paintAddLeads() {
    document.querySelectorAll('[data-add-lead]').forEach((btn) => {
      const slug = btn.getAttribute('data-add-lead') || '';
      const on = leadSlugs.has(slug);
      const card = btn.closest('[data-card-slug]');
      const infoTitle = document.querySelector('#shop-info-modal [data-shop-info-title]');
      const name = card && card.getAttribute('data-shop-name')
        ? card.getAttribute('data-shop-name')
        : (btn.closest('#shop-info-modal') && infoTitle && infoTitle.textContent ? infoTitle.textContent : 'this shop');
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? name + ' is on your board' : 'Add ' + name + ' to leads');
    });
  }

  function selectedCity() {
    const on = document.querySelector('[data-filter-city].is-on');
    return on ? (on.getAttribute('data-filter-city') || '') : '';
  }

  function selectedNiche() {
    const on = document.querySelector('[data-filter-niche].is-on');
    return on ? (on.getAttribute('data-filter-niche') || '') : '';
  }

  function selectedHas() {
    return [...document.querySelectorAll('[data-filter-has].is-on')].map((btn) => btn.getAttribute('data-filter-has') || '');
  }

  function searchQuery() {
    const input = document.querySelector('[data-filter-q]');
    return input ? String(input.value || '').trim().toLowerCase() : '';
  }

  function paintFilterNow() {
    const bar = document.querySelector('[data-shop-filters]');
    if (!bar) return;
    const cityBtn = bar.querySelector('[data-filter-city].is-on');
    const nicheBtn = bar.querySelector('[data-filter-niche].is-on');
    const hasOn = [...bar.querySelectorAll('[data-filter-has].is-on')];
    const cityNow = bar.querySelector('[data-filter-now="city"]');
    const nicheNow = bar.querySelector('[data-filter-now="niche"]');
    const readyNow = bar.querySelector('[data-filter-now="ready"]');
    if (cityNow) cityNow.textContent = cityBtn && cityBtn.textContent ? cityBtn.textContent.trim() : 'All cities';
    if (nicheNow) nicheNow.textContent = nicheBtn && nicheBtn.textContent ? nicheBtn.textContent.trim() : 'All niches';
    if (readyNow) {
      readyNow.textContent = hasOn.length
        ? hasOn.map((btn) => (btn.textContent || '').trim()).join(' · ')
        : 'Any';
    }
  }

  function syncGuestCity(city) {
    const want = (city || '').toLowerCase();
    document.querySelectorAll('[data-city-pick]').forEach((el) => {
      const val = (el.getAttribute('data-city-pick') || '').toLowerCase();
      el.classList.toggle('is-on', val === want);
    });
    const input = document.querySelector('[data-city-input]');
    if (input && document.activeElement !== input) {
      const on = document.querySelector('[data-filter-city].is-on');
      input.value = city && on ? String(on.textContent || '').trim() : '';
    }
    try {
      if (city) sessionStorage.setItem('directory:guest-city', city);
      else sessionStorage.removeItem('directory:guest-city');
    } catch (err) { /* private mode */ }
  }

  function closeOtherAccords(openOne) {
    document.querySelectorAll('[data-filter-accord]').forEach((el) => {
      if (el !== openOne) el.removeAttribute('open');
    });
  }

  function applyShopFilters() {
    const bar = document.querySelector('[data-shop-filters]');
    if (!bar) return;
    const city = selectedCity();
    const niche = selectedNiche();
    const needs = selectedHas();
    const q = searchQuery();
    const cards = [...document.querySelectorAll('[data-card-slug][data-shop-type]')];
    let shown = 0;
    cards.forEach((card) => {
      const okCity = !city || (card.getAttribute('data-shop-city') || '').toLowerCase() === city;
      const okNiche = !niche || (card.getAttribute('data-shop-type') || '') === niche;
      const okEmail = needs.indexOf('email') === -1 || card.getAttribute('data-has-email') === '1';
      const okPhone = needs.indexOf('phone') === -1 || card.getAttribute('data-has-phone') === '1';
      const okSite = needs.indexOf('website') === -1 || card.getAttribute('data-has-website') === '1';
      const name = (card.getAttribute('data-shop-name') || '').toLowerCase();
      const okSearch = !q || name.indexOf(q) !== -1;
      const show = okCity && okNiche && okEmail && okPhone && okSite && okSearch;
      card.hidden = !show;
      if (show) shown += 1;
    });
    document.querySelectorAll('[data-shop-row]').forEach((row) => {
      const visible = [...row.querySelectorAll('[data-card-slug]')].some((card) => !card.hidden);
      row.hidden = !visible;
    });
    document.querySelectorAll('[data-shop-grid]').forEach((grid) => {
      const hasCards = grid.querySelector('[data-card-slug]');
      if (!hasCards) return;
      const visible = [...grid.querySelectorAll('[data-card-slug]')].some((card) => !card.hidden);
      grid.hidden = !visible;
    });
    const count = document.querySelector('[data-filter-count]');
    if (count) {
      const active = Boolean(city || niche || needs.length || q);
      count.hidden = !active;
      count.textContent = shown === 1 ? '1 shop' : shown + ' shops';
    }
    paintFilterNow();
    syncGuestCity(city);
  }

  window.__dirApplyShopFilters = applyShopFilters;

  function bindShopFilters() {
    if (window.__dirShopFilterBound) {
      applyShopFilters();
      return;
    }
    window.__dirShopFilterBound = true;
    document.addEventListener('toggle', (event) => {
      const accord = event.target;
      if (!accord || !accord.closest || !accord.closest('[data-filter-accord]')) return;
      if (accord.open) closeOtherAccords(accord);
    }, true);
    document.addEventListener('click', (event) => {
      const hit = event.target && event.target.closest ? event.target : null;
      const bar = hit ? hit.closest('[data-shop-filters]') : null;
      if (!bar) return;
      const cityBtn = hit.closest('[data-filter-city]');
      if (cityBtn) {
        bar.querySelectorAll('[data-filter-city]').forEach((btn) => btn.classList.toggle('is-on', btn === cityBtn));
        applyShopFilters();
        const wrap = cityBtn.closest('[data-filter-accord]');
        if (wrap) wrap.removeAttribute('open');
        window.dispatchEvent(new Event('callsal:close-directory'));
        return;
      }
      const nicheBtn = hit.closest('[data-filter-niche]');
      if (nicheBtn) {
        bar.querySelectorAll('[data-filter-niche]').forEach((btn) => btn.classList.toggle('is-on', btn === nicheBtn));
        applyShopFilters();
        const wrap = nicheBtn.closest('[data-filter-accord]');
        if (wrap) wrap.removeAttribute('open');
        window.dispatchEvent(new Event('callsal:close-directory'));
        return;
      }
      const hasBtn = hit.closest('[data-filter-has]');
      if (hasBtn) {
        hasBtn.classList.toggle('is-on');
        hasBtn.setAttribute('aria-pressed', hasBtn.classList.contains('is-on') ? 'true' : 'false');
        applyShopFilters();
      }
    });
    document.addEventListener('input', (event) => {
      if (event.target && event.target.closest && event.target.closest('[data-filter-q]')) {
        applyShopFilters();
      }
    });
    applyShopFilters();
  }

  function boardCity() {
    const on = document.querySelector('[data-leads-filter-city].is-on');
    return on ? (on.getAttribute('data-leads-filter-city') || '') : '';
  }

  function boardNiche() {
    const on = document.querySelector('[data-leads-filter-niche].is-on');
    return on ? (on.getAttribute('data-leads-filter-niche') || '') : '';
  }

  function boardHas() {
    return [...document.querySelectorAll('[data-leads-filter-has].is-on')].map((btn) => btn.getAttribute('data-leads-filter-has') || '');
  }

  function boardQuery() {
    const input = document.querySelector('[data-leads-filter-q]');
    return input ? String(input.value || '').trim().toLowerCase() : '';
  }

  function paintBoardFilterNow() {
    const bar = document.querySelector('[data-leads-filters]');
    if (!bar) return;
    const cityBtn = bar.querySelector('[data-leads-filter-city].is-on');
    const nicheBtn = bar.querySelector('[data-leads-filter-niche].is-on');
    const hasOn = [...bar.querySelectorAll('[data-leads-filter-has].is-on')];
    const cityNow = bar.querySelector('[data-leads-filter-now="city"]');
    const nicheNow = bar.querySelector('[data-leads-filter-now="niche"]');
    const readyNow = bar.querySelector('[data-leads-filter-now="ready"]');
    if (cityNow) cityNow.textContent = cityBtn && cityBtn.textContent ? cityBtn.textContent.trim() : 'All cities';
    if (nicheNow) nicheNow.textContent = nicheBtn && nicheBtn.textContent ? nicheBtn.textContent.trim() : 'All niches';
    if (readyNow) {
      readyNow.textContent = hasOn.length
        ? hasOn.map((btn) => (btn.textContent || '').trim()).join(' · ')
        : 'Any';
    }
  }

  function applyBoardFilters() {
    const bar = document.querySelector('[data-leads-filters]');
    if (!bar) return;
    const city = boardCity();
    const niche = boardNiche();
    const needs = boardHas();
    const q = boardQuery();
    const cards = [...document.querySelectorAll('[data-leads-board] [data-lead-slug]')];
    let shown = 0;
    cards.forEach((card) => {
      const okCity = !city || (card.getAttribute('data-lead-city') || '').toLowerCase() === city;
      const okNiche = !niche || (card.getAttribute('data-lead-niche') || '') === niche;
      const okEmail = needs.indexOf('email') === -1 || card.getAttribute('data-has-email') === '1';
      const okPhone = needs.indexOf('phone') === -1 || card.getAttribute('data-has-phone') === '1';
      const okSite = needs.indexOf('website') === -1 || card.getAttribute('data-has-website') === '1';
      const name = (card.getAttribute('data-lead-name') || '').toLowerCase();
      const okSearch = !q || name.indexOf(q) !== -1;
      const show = okCity && okNiche && okEmail && okPhone && okSite && okSearch;
      card.hidden = !show;
      if (show) shown += 1;
    });
    const count = document.querySelector('[data-leads-filter-count]');
    if (count) {
      const active = Boolean(city || niche || needs.length || q);
      count.hidden = !active;
      count.textContent = shown === 1 ? '1 shop' : shown + ' shops';
    }
    paintBoardFilterNow();
  }

  function bindBoardFilters() {
    const bar = document.querySelector('[data-leads-filters]');
    if (!bar || bar.getAttribute('data-bound') === '1') return;
    bar.setAttribute('data-bound', '1');
    bar.querySelectorAll('[data-leads-filter-accord]').forEach((accord) => {
      accord.addEventListener('toggle', () => {
        if (!accord.open) return;
        bar.querySelectorAll('[data-leads-filter-accord]').forEach((el) => {
          if (el !== accord) el.removeAttribute('open');
        });
      });
    });
    bar.addEventListener('click', (event) => {
      const cityBtn = event.target && event.target.closest ? event.target.closest('[data-leads-filter-city]') : null;
      if (cityBtn) {
        bar.querySelectorAll('[data-leads-filter-city]').forEach((btn) => btn.classList.toggle('is-on', btn === cityBtn));
        applyBoardFilters();
        const wrap = cityBtn.closest('[data-leads-filter-accord]');
        if (wrap) wrap.removeAttribute('open');
        return;
      }
      const nicheBtn = event.target && event.target.closest ? event.target.closest('[data-leads-filter-niche]') : null;
      if (nicheBtn) {
        bar.querySelectorAll('[data-leads-filter-niche]').forEach((btn) => btn.classList.toggle('is-on', btn === nicheBtn));
        applyBoardFilters();
        const wrap = nicheBtn.closest('[data-leads-filter-accord]');
        if (wrap) wrap.removeAttribute('open');
        return;
      }
      const hasBtn = event.target && event.target.closest ? event.target.closest('[data-leads-filter-has]') : null;
      if (hasBtn) {
        hasBtn.classList.toggle('is-on');
        hasBtn.setAttribute('aria-pressed', hasBtn.classList.contains('is-on') ? 'true' : 'false');
        applyBoardFilters();
      }
    });
    const input = bar.querySelector('[data-leads-filter-q]');
    if (input) input.addEventListener('input', applyBoardFilters);
    applyBoardFilters();
  }

  function renderLeadCard(lead) {
    const stage = normalizeStage(lead.stage);
    const v = lead.verified || {};
    return '<article class="lead-card" draggable="true" data-lead-slug="' + esc(lead.slug) + '"'
      + ' data-lead-name="' + esc(lead.name || '') + '"'
      + ' data-lead-city="' + esc((lead.city || '').toLowerCase()) + '"'
      + ' data-lead-niche="' + esc(lead.category || '') + '"'
      + ' data-has-email="' + (v.email && lead.email ? '1' : '0') + '"'
      + ' data-has-phone="' + (v.phone && lead.phone ? '1' : '0') + '"'
      + ' data-has-website="' + (v.website && lead.website ? '1' : '0') + '"'
      + ' data-lead-stage="' + esc(stage) + '">'
      + '<h3>' + esc(lead.name) + '</h3>'
      + '<p class="lead-type">' + esc(lead.type || '') + (lead.city ? ' · ' + esc(lead.city) : '') + '</p>'
      + '</article>';
  }

  function bindDrag(col) {
    col.addEventListener('dragover', (event) => {
      event.preventDefault();
      col.classList.add('is-drop');
    });
    col.addEventListener('dragleave', () => {
      col.classList.remove('is-drop');
    });
    col.addEventListener('drop', (event) => {
      event.preventDefault();
      col.classList.remove('is-drop');
      const stage = col.getAttribute('data-col');
      const slug = draggedSlug || (event.dataTransfer && event.dataTransfer.getData('text/plain'));
      draggedSlug = null;
      if (slug && stage) void postLeads({ slug, stage });
    });
  }

  function paintLeadsBoard() {
    const guest = document.querySelector('[data-leads-guest]');
    const app = document.querySelector('[data-leads-app]');
    if (!guest && !app) return;
    if (!currentUser) {
      if (guest) guest.hidden = false;
      if (app) app.hidden = true;
      return;
    }
    if (guest) guest.hidden = true;
    if (app) app.hidden = false;
    const usage = lastLeads.usage;
    const usageEl = document.querySelector('[data-leads-usage]');
    if (usageEl && usage) {
      usageEl.textContent = lastLeads.plan === 'paid'
        ? 'Paid sandbox. ' + usage.leadCount + ' of ' + usage.leadCap + ' leads.'
        : 'Free account. ' + usage.leadCount + ' of 25 leads.';
    }
    const leads = lastLeads.leads || [];
    STAGES.forEach((stage) => {
      const col = document.querySelector('[data-col-cards="' + stage + '"]');
      const wrap = document.querySelector('[data-col="' + stage + '"]');
      const count = document.querySelector('[data-col-count="' + stage + '"]');
      const items = leads.filter((lead) => normalizeStage(lead.stage) === stage);
      if (col) col.innerHTML = items.map(renderLeadCard).join('');
      if (count) count.textContent = String(items.length);
      if (wrap && wrap.getAttribute('data-drop-bound') !== '1') {
        wrap.setAttribute('data-drop-bound', '1');
        bindDrag(wrap);
      }
    });
    applyBoardFilters();
    const panel = document.querySelector('[data-oracle-panel]');
    if (panel) {
      const oracle = lastLeads.oracle;
      if (!oracle) {
        panel.hidden = true;
        panel.innerHTML = '';
      } else {
        panel.hidden = false;
        const flags = (oracle.flags || []).map((flag) => '<li>' + esc(flag) + '</li>').join('');
        panel.innerHTML = '<p class="page-kicker">ORACLE</p>'
          + '<p>' + esc(oracle.note || '') + '</p>'
          + '<p>' + esc(oracle.stageHint || '') + '</p>'
          + (flags ? '<ul>' + flags + '</ul>' : '')
          + (oracle.draft ? '<p class="oracle-draft">' + esc(oracle.draft) + '</p><button type="button" class="soft-pill" data-copy-draft>Copy draft</button>' : '')
          + '<p class="seed-note">Oracle does not send email, post, or call.</p>';
      }
    }
  }

  async function applyLeadsPayload(data) {
    lastLeads = {
      plan: data.plan || 'free',
      leads: data.leads || [],
      usage: data.usage || null,
      oracle: data.oracle || lastLeads.oracle || null,
    };
    leadSlugs = new Set((lastLeads.leads || []).flatMap((lead) => [lead.slug, lead.catalogSlug].filter(Boolean)));
    paintAddLeads();
    paintLeadsBoard();
  }

  async function postLeads(body) {
    const res = await fetch('/api/leads', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (data.upgrade) {
      openPremium(data.message || 'Paid Directory is $999 a month.');
      return data;
    }
    if (res.ok) await applyLeadsPayload(data);
    else if (data.message) {
      const usageEl = document.querySelector('[data-leads-usage]');
      if (usageEl) usageEl.textContent = data.message;
    }
    return data;
  }

  async function maybePaidUpgrade() {
    try {
      if (sessionStorage.getItem('directory:leads-pick') !== 'paid') return;
      sessionStorage.removeItem('directory:leads-pick');
      if (lastLeads.plan === 'paid') return;
      await postLeads({ action: 'sandbox-upgrade' });
    } catch {
      /* keep free board */
    }
  }

  async function refreshLeads() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      currentUser = res.ok && data.user ? data.user : null;
    } catch {
      currentUser = null;
    }
    leadSlugs = new Set();
    lastLeads = { plan: 'free', leads: [], usage: null, oracle: null };
    if (currentUser) {
      try {
        const res = await fetch('/api/leads', { credentials: 'include' });
        const data = await res.json();
        if (res.ok) await applyLeadsPayload(data);
      } catch {
        leadSlugs = new Set();
      }
      await maybePaidUpgrade();
    }
    paintAddLeads();
    paintLeadsBoard();
    bindShopFilters();
    bindBoardFilters();
  }

  document.addEventListener('dragstart', (event) => {
    const card = event.target && event.target.closest ? event.target.closest('[data-leads-board] [data-lead-slug]') : null;
    if (!card) return;
    draggedSlug = card.getAttribute('data-lead-slug') || '';
    didDrag = true;
    card.classList.add('is-drag');
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', draggedSlug);
      event.dataTransfer.effectAllowed = 'move';
    }
  });

  document.addEventListener('dragend', (event) => {
    const card = event.target && event.target.closest ? event.target.closest('.lead-card') : null;
    if (card) card.classList.remove('is-drag');
    document.querySelectorAll('.kanban-col.is-drop').forEach((col) => col.classList.remove('is-drop'));
    window.setTimeout(() => { didDrag = false; }, 40);
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    const pick = target && target.closest ? target.closest('[data-leads-pick]') : null;
    if (pick) {
      event.preventDefault();
      const choice = pick.getAttribute('data-leads-pick') || 'free';
      try { sessionStorage.setItem('directory:leads-pick', choice); } catch { /* ignore */ }
      openAuth('register');
      return;
    }
    if (target && target.closest && target.closest('[data-shop-info-close]')) {
      closeShopInfo();
      return;
    }
    if (target && target.closest && target.closest('[data-premium-close]')) {
      closePremium();
      return;
    }
    if (target && target.closest && target.closest('[data-sandbox-upgrade]')) {
      event.preventDefault();
      void postLeads({ action: 'sandbox-upgrade' }).then(() => closePremium());
      return;
    }
    const addLead = target && target.closest ? target.closest('[data-add-lead]') : null;
    if (addLead) {
      event.preventDefault();
      event.stopPropagation();
      if (!currentUser) {
        openAuth('register');
        return;
      }
      const slug = addLead.getAttribute('data-add-lead');
      if (slug && !leadSlugs.has(slug)) void postLeads({ action: 'add', slug });
      return;
    }
    if (target && target.closest && target.closest('[data-scan-leads]')) {
      event.preventDefault();
      if (!currentUser) {
        openAuth('register');
        return;
      }
      void postLeads({ action: 'scan', city: 'milton' });
      return;
    }
    if (target && target.closest && target.closest('[data-ask-oracle]')) {
      event.preventDefault();
      if (!currentUser) {
        openAuth('register');
        return;
      }
      void postLeads({ action: 'oracle' });
      return;
    }
    const stageBtn = target && target.closest ? target.closest('[data-stage]') : null;
    if (stageBtn) {
      event.preventDefault();
      const slug = stageBtn.getAttribute('data-lead-slug') || (stageBtn.closest('[data-lead-slug]') && stageBtn.closest('[data-lead-slug]').getAttribute('data-lead-slug'));
      const stage = stageBtn.getAttribute('data-stage');
      if (slug && stage) void postLeads({ slug, stage });
      return;
    }
    if (target && target.closest && target.closest('[data-copy-draft]')) {
      event.preventDefault();
      const box = target.closest('[data-oracle-panel], #shop-info-modal, .lead-card');
      const draft = box && box.querySelector('.oracle-draft') ? box.querySelector('.oracle-draft').textContent : '';
      if (draft && navigator.clipboard) void navigator.clipboard.writeText(draft);
      return;
    }
    const shopWrap = target && target.closest ? target.closest('[data-card-slug][data-shop-type]') : null;
    if (shopWrap) {
      event.preventDefault();
      openShopInfoFromCard(shopWrap);
      return;
    }
    const leadCard = target && target.closest ? target.closest('[data-leads-board] .lead-card') : null;
    if (leadCard) {
      event.preventDefault();
      if (didDrag) return;
      openShopInfoFromLead(leadCard);
    }
  });


  document.addEventListener('click', (event) => {
    const target = event.target;
    const pill = target && target.closest ? target.closest('[data-leads-pill]') : null;
    if (pill && isLeadsPath()) {
      event.preventDefault();
      event.stopPropagation();
      if (currentUser) toggleLeadsMenu();
      else setLeadsMenu(false);
      return;
    }
    if (target && target.closest && target.closest('[data-menu]')) {
      setLeadsMenu(false);
    }
    if (target && target.closest && target.closest('[data-scrim]')) {
      setLeadsMenu(false);
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!document.body.classList.contains('leads-drawer-open')) return;
    setLeadsMenu(false);
    event.stopPropagation();
  }, true);

  window.addEventListener('callsal:boot-hidden', refreshLeads);
  window.addEventListener('callsal:page-applied', () => {
    applyShopFilters();
    paintAddLeads();
    paintLeadsBoard();
    bindBoardFilters();
    if (!isLeadsPath()) setLeadsMenu(false);
  });
  void refreshLeads();
  window.setTimeout(refreshLeads, 800);
})();
