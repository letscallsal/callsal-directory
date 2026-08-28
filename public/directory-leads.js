(function () {
  let currentUser = null;
  let leadSlugs = new Set();
  let lastLeads = { plan: 'free', leads: [], usage: null, oracle: null };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
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

  function paintAddLeads() {
    document.querySelectorAll('[data-add-lead]').forEach((btn) => {
      const slug = btn.getAttribute('data-add-lead') || '';
      const on = leadSlugs.has(slug);
      const card = btn.closest('[data-card-slug]');
      const name = card && card.getAttribute('data-shop-name') ? card.getAttribute('data-shop-name') : 'this shop';
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

  function applyShopFilters() {
    const bar = document.querySelector('[data-shop-filters]');
    if (!bar) return;
    const city = selectedCity();
    const niche = selectedNiche();
    const needs = selectedHas();
    const q = searchQuery();
    const cards = [...document.querySelectorAll('[data-card-slug]')];
    let shown = 0;
    cards.forEach((card) => {
      const okCity = !city || (card.getAttribute('data-shop-city') || '') === city;
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
    const count = document.querySelector('[data-filter-count]');
    if (count) {
      const active = Boolean(city || niche || needs.length || q);
      count.hidden = !active;
      count.textContent = shown === 1 ? '1 shop' : shown + ' shops';
    }
  }

  function bindShopFilters() {
    const bar = document.querySelector('[data-shop-filters]');
    if (!bar || bar.getAttribute('data-bound') === '1') return;
    bar.setAttribute('data-bound', '1');
    bar.addEventListener('click', (event) => {
      const cityBtn = event.target && event.target.closest ? event.target.closest('[data-filter-city]') : null;
      if (cityBtn) {
        bar.querySelectorAll('[data-filter-city]').forEach((btn) => btn.classList.toggle('is-on', btn === cityBtn));
        applyShopFilters();
        return;
      }
      const nicheBtn = event.target && event.target.closest ? event.target.closest('[data-filter-niche]') : null;
      if (nicheBtn) {
        bar.querySelectorAll('[data-filter-niche]').forEach((btn) => btn.classList.toggle('is-on', btn === nicheBtn));
        applyShopFilters();
        return;
      }
      const hasBtn = event.target && event.target.closest ? event.target.closest('[data-filter-has]') : null;
      if (hasBtn) {
        hasBtn.classList.toggle('is-on');
        hasBtn.setAttribute('aria-pressed', hasBtn.classList.contains('is-on') ? 'true' : 'false');
        applyShopFilters();
      }
    });
    const input = bar.querySelector('[data-filter-q]');
    if (input) input.addEventListener('input', applyShopFilters);
    applyShopFilters();
  }

  function fieldMark(ok) {
    return ok
      ? '<span class="field-mark is-on">verified</span>'
      : '<span class="field-mark">missing</span>';
  }

  function leadField(label, value, ok) {
    const shown = ok && value ? esc(value) : 'Not published';
    return `<li><span>${label}</span> <span>${shown}</span> ${fieldMark(Boolean(ok && value))}</li>`;
  }

  function renderLeadCard(lead) {
    const owner = lead.verified && lead.verified.ownerName && lead.ownerName
      ? leadField('Owner', lead.ownerName, true)
      : leadField('Owner', '', false);
    const social = lead.verified && lead.verified.socials && lead.socials && lead.socials.instagram
      ? leadField('Social', lead.socials.instagram, true)
      : leadField('Social', '', false);
    const draft = lead.oracleDraft
      ? `<p class="oracle-draft">${esc(lead.oracleDraft)}</p><button type="button" class="soft-pill" data-copy-draft>Copy draft</button>`
      : '';
    const stages = ['new', 'contacted', 'replied', 'booked'].map((stage) => {
      const on = lead.stage === stage ? ' is-on' : '';
      return `<button type="button" class="soft-pill${on}" data-stage="${stage}" data-lead-slug="${esc(lead.slug)}">${stage}</button>`;
    }).join('');
    return `<article class="lead-card" data-lead-slug="${esc(lead.slug)}">
      <h3>${esc(lead.name)}</h3>
      <p class="lead-type">${esc(lead.type)} · ${esc(lead.city)}</p>
      <ul class="lead-fields">
        ${leadField('Phone', lead.phone, lead.verified && lead.verified.phone)}
        ${leadField('Website', lead.website, lead.verified && lead.verified.website)}
        ${leadField('Email', lead.email, lead.verified && lead.verified.email)}
        ${leadField('Address', lead.address, lead.verified && lead.verified.address)}
        ${owner}
        ${social}
      </ul>
      <div class="lead-stages">${stages}</div>
      ${draft}
    </article>`;
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
        ? `Paid sandbox. ${usage.leadCount} of ${usage.leadCap} leads.`
        : `Free account. ${usage.leadCount} of 25 leads.`;
    }
    const empty = document.querySelector('[data-leads-empty]');
    const leads = lastLeads.leads || [];
    if (empty) empty.hidden = leads.length > 0;
    ['new', 'contacted', 'replied', 'booked'].forEach((stage) => {
      const col = document.querySelector('[data-col-cards="' + stage + '"]');
      if (!col) return;
      col.innerHTML = leads.filter((lead) => lead.stage === stage).map(renderLeadCard).join('');
    });
    const panel = document.querySelector('[data-oracle-panel]');
    if (panel) {
      const oracle = lastLeads.oracle;
      if (!oracle) {
        panel.hidden = true;
        panel.innerHTML = '';
      } else {
        panel.hidden = false;
        const flags = (oracle.flags || []).map((flag) => `<li>${esc(flag)}</li>`).join('');
        panel.innerHTML = `<p class="page-kicker">ORACLE</p>
          <p>${esc(oracle.note || '')}</p>
          <p>${esc(oracle.stageHint || '')}</p>
          ${flags ? `<ul>${flags}</ul>` : ''}
          ${oracle.draft ? `<p class="oracle-draft">${esc(oracle.draft)}</p><button type="button" class="soft-pill" data-copy-draft>Copy draft</button>` : ''}
          <p class="seed-note">Oracle does not send email, post, or call.</p>`;
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
    leadSlugs = new Set((lastLeads.leads || []).map((lead) => lead.slug));
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
    }
    paintAddLeads();
    paintLeadsBoard();
    bindShopFilters();
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
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
      const box = target.closest('[data-oracle-panel], .lead-card');
      const draft = box && box.querySelector('.oracle-draft') ? box.querySelector('.oracle-draft').textContent : '';
      if (draft && navigator.clipboard) void navigator.clipboard.writeText(draft);
    }
  });

  window.addEventListener('callsal:boot-hidden', refreshLeads);
  void refreshLeads();
  window.setTimeout(refreshLeads, 800);
})();
