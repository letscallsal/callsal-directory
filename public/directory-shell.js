const withRoom = window.__DIRECTORY_WITH_ROOM;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      let dismissed = false;
      function finishBoot() {
        document.getElementById('boot-loader')?.remove();
      }
      function waitAnim(el, name, fallbackMs) {
        return new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };
          if (!el) {
            finish();
            return;
          }
          const anims = typeof el.getAnimations === 'function' ? el.getAnimations() : [];
          const match = anims.find((a) => !name || a.animationName === name);
          if (match) {
            if (match.playState === 'finished') {
              finish();
              return;
            }
            match.finished.then(finish).catch(finish);
            window.setTimeout(finish, fallbackMs);
            return;
          }
          el.addEventListener('animationend', (e) => {
            if (!name || e.animationName === name) finish();
          });
          window.setTimeout(finish, fallbackMs);
        });
      }
      function ackAndFade() {
        document.documentElement.classList.add('intro-ready');
        window.dispatchEvent(new Event('callsal:boot-hidden'));
        const loader = document.getElementById('boot-loader');
        if (!loader) return;
        if (reduceMotion) {
          document.documentElement.classList.add('intro-done', 'intro-settled');
          document.body.classList.remove('drawer-open');
          finishBoot();
          return;
        }
        loader.classList.add('is-ack');
        window.setTimeout(finishBoot, 560);
      }
      function startBootOut() {
        if (dismissed) return;
        dismissed = true;
        ackAndFade();
      }
      function waitForCanvas(ms) {
        return new Promise((resolve) => {
          if (document.querySelector('canvas.room-canvas')) {
            resolve();
            return;
          }
          const mo = new MutationObserver(() => {
            if (document.querySelector('canvas.room-canvas')) {
              mo.disconnect();
              resolve();
            }
          });
          mo.observe(document.documentElement, { childList: true, subtree: true });
          if (ms) {
            window.setTimeout(() => {
              mo.disconnect();
              resolve();
            }, ms);
          }
        });
      }
      async function playBootPill() {
        const fill = document.getElementById('boot-pill-fill');
        if (reduceMotion) {
          startBootOut();
          return;
        }
        await waitAnim(fill, 'boot-fill-rise', 1500);
        if (withRoom) await waitForCanvas(3200);
        startBootOut();
      }
      if (reduceMotion) {
        document.documentElement.classList.add('intro-done');
        document.body.classList.remove('drawer-open');
        startBootOut();
      } else if (!withRoom) {
        document.documentElement.classList.add('intro-done');
        document.body.classList.remove('drawer-open');
        playBootPill();
      } else {
        playBootPill();
        window.setTimeout(startBootOut, 4800);
        window.addEventListener('callsal:intro-complete', () => {
          document.documentElement.classList.add('intro-done');
          document.body.classList.remove('drawer-open');
          window.setTimeout(() => document.documentElement.classList.add('intro-settled'), 560);
        }, { once: true });
        window.setTimeout(() => {
          if (document.documentElement.classList.contains('intro-done')) return;
          document.documentElement.classList.add('intro-done');
          document.body.classList.remove('drawer-open');
          window.dispatchEvent(new Event('callsal:intro-complete'));
        }, 7200);
      }

      const menu = document.querySelector('[data-menu]');
      const scrim = document.querySelector('[data-scrim]');
      const viewport = document.querySelector('[data-viewport]');
      const main = document.querySelector('[data-main]');

      function setOpen(open) {
        document.body.classList.toggle('drawer-open', open);
        menu?.setAttribute('aria-expanded', String(open));
        if (scrim) scrim.hidden = !open;
      }

      window.addEventListener('callsal:intro-complete', () => setOpen(false));

      menu?.addEventListener('click', () => {
        setOpen(!document.body.classList.contains('drawer-open'));
      });
      scrim?.addEventListener('click', () => setOpen(false));
      function closeShopInfo() {
        const modal = document.getElementById('shop-info-modal');
        if (modal) modal.hidden = true;
      }
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          const shopInfo = document.getElementById('shop-info-modal');
          if (shopInfo && !shopInfo.hidden) {
            closeShopInfo();
            return;
          }
          setOpen(false);
          closeAuth();
        }
      });

      function bindEst(el, yearEl) {
        el?.addEventListener('mouseenter', () => {
          if (yearEl) yearEl.textContent = '2026';
        });
        el?.addEventListener('mouseleave', () => {
          if (yearEl) yearEl.textContent = 'MMXXVI';
        });
      }
      bindEst(document.querySelector('[data-est]'), document.querySelector('[data-est-year]'));
      bindEst(document.querySelector('[data-est-foot]'), document.querySelector('[data-est-year-foot]'));
      bindEst(document.querySelector('[data-est-hero]'), document.querySelector('[data-est-year-hero]'));
      bindEst(document.querySelector('[data-est-nav]'), document.querySelector('[data-est-year-nav]'));

      function normalize(path) {
        try {
          const url = new URL(path, location.origin);
          let p = url.pathname;
          if (p.length > 1) p = p.replace(/\/$/, '');
          return p || '/';
        } catch {
          return path;
        }
      }

      const cache = new Map();
      const scrollMap = new Map();
      let navToken = 0;

      if (main) {
        cache.set(normalize(location.pathname), { html: main.innerHTML, title: document.title });
      }

      function updateSidebar(path) {
        const listing = path.match(/\/directory\/([^/]+)/)?.[1] ?? '';
        const category = path.match(/\/category\/([^/]+)/)?.[1] ?? '';
        const saved = normalize(path) === '/saved';

        document.querySelectorAll('[data-saved-link]').forEach((el) => {
          if (saved) el.setAttribute('aria-current', 'page');
          else el.removeAttribute('aria-current');
        });

        document.querySelectorAll('[data-listing]').forEach((el) => {
          const href = el.getAttribute('href') ?? '';
          const slug = href.match(/\/directory\/([^/]+)/)?.[1] ?? '';
          if (listing && slug === listing) el.setAttribute('aria-current', 'page');
          else el.removeAttribute('aria-current');
        });

        document.querySelectorAll('[data-category]').forEach((el) => {
          const slug = el.dataset.category ?? '';
          const isCat = slug === category;
          const hasListing = [...el.querySelectorAll('[data-listing]')].some(
            (a) => a.getAttribute('aria-current') === 'page',
          );
          el.classList.toggle('is-active', isCat);
          if (isCat || hasListing) el.open = true;
        });
      }

      async function load(path) {
        const key = normalize(path);
        const hit = cache.get(key);
        if (hit) return hit;
        const res = await fetch(path, { headers: { Accept: 'text/html' } });
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const html = doc.querySelector('[data-main]')?.innerHTML ?? '';
        const title = doc.title;
        const payload = { html, title };
        cache.set(key, payload);
        return payload;
      }

      function apply(payload, path) {
        if (!main || !viewport) return;
        main.innerHTML = payload.html;
        document.title = payload.title;
        const key = normalize(path);
        viewport.scrollTop = scrollMap.get(key) ?? 0;
        updateSidebar(path);
        paintBookmarks();
        paintSaved();
        window.dispatchEvent(new Event('callsal:page-applied'));
      }

      async function go(path, push) {
        if (!main || !viewport) return;
        const token = ++navToken;
        scrollMap.set(normalize(location.pathname), viewport.scrollTop);

        const nextUrl = new URL(path, location.origin);
        if (push && normalize(nextUrl.pathname) !== normalize(location.pathname)) {
          history.pushState({}, '', nextUrl.pathname + nextUrl.search);
        }

        const payload = await load(nextUrl.pathname + nextUrl.search);
        if (token !== navToken) return;

        const run = () => apply(payload, nextUrl.pathname);

        if (!reduceMotion && 'startViewTransition' in document) {
          const vt = document.startViewTransition(run);
          try {
            await vt.finished;
          } catch {
            /* interrupted */
          }
        } else if (!reduceMotion) {
          main.classList.add('is-leave');
          await new Promise((resolve) => window.setTimeout(resolve, 120));
          if (token !== navToken) return;
          run();
          main.classList.remove('is-leave');
        } else {
          run();
        }

        setOpen(false);
      }

      function snapToDirectory() {
        const stage = document.getElementById('stage-scroll');
        const hero = document.getElementById('hero-stage');
        if (!stage || !hero) return;
        stage.scrollTo({ top: hero.offsetHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
      }

      let currentUser = null;
      let bookmarks = new Set();
      let authMode = 'register';
      const authModal = document.getElementById('auth-modal');
      const authForm = document.querySelector('[data-auth-form]');
      const authError = document.querySelector('[data-auth-error]');
      const authTitle = document.querySelector('[data-auth-title]');
      const authSubmit = document.querySelector('[data-auth-submit]');
      const authSwitch = document.querySelector('[data-auth-switch]');

      function guestButtons() {
        return `<button type="button" class="auth-text-btn" data-join>JOIN</button><button type="button" class="auth-text-btn" data-login>LOGIN</button>`;
      }

      function userButtons() {
        const name = currentUser?.name || 'SAVED';
        return `<a class="auth-text-btn" href="/leads/" data-leads-link>LEADS</a><span class="auth-user">${name}</span><button type="button" class="auth-logout" data-logout aria-label="Logout">×</button>`;
      }

      function paintAuth() {
        document.querySelectorAll('[data-auth-slot]').forEach((slot) => {
          slot.innerHTML = currentUser ? userButtons() : guestButtons(slot.getAttribute('data-auth-slot'));
        });
      }

      function paintBookmarks() {
        document.querySelectorAll('[data-bookmark]').forEach((btn) => {
          const slug = btn.getAttribute('data-bookmark') || '';
          const on = bookmarks.has(slug);
          btn.classList.toggle('is-on', on);
          const label = btn.querySelector('[data-bookmark-label]');
          if (label) label.textContent = on ? 'Saved' : 'Save';
        });
      }

      function paintSaved() {
        const grid = document.querySelector('[data-saved-grid]');
        if (!grid) return;
        const guest = document.querySelector('[data-saved-guest]');
        const empty = document.querySelector('[data-saved-empty]');
        const cards = [...grid.querySelectorAll('[data-card-slug]')];
        if (!currentUser) {
          if (guest) guest.hidden = false;
          if (empty) empty.hidden = true;
          cards.forEach((card) => { card.hidden = true; });
          return;
        }
        if (guest) guest.hidden = true;
        let shown = 0;
        cards.forEach((card) => {
          const slug = card.getAttribute('data-card-slug') || '';
          const keep = bookmarks.has(slug);
          card.hidden = !keep;
          if (keep) shown += 1;
        });
        if (empty) empty.hidden = shown > 0;
      }

      function setAuthMode(mode) {
        authMode = mode;
        if (authTitle) authTitle.textContent = mode === 'register' ? 'JOIN' : 'LOGIN';
        if (authSubmit) authSubmit.textContent = mode === 'register' ? 'CREATE ACCOUNT' : 'LOG IN';
        if (authSwitch) {
          authSwitch.textContent = mode === 'register'
            ? 'ALREADY HAVE AN ACCOUNT? LOG IN'
            : 'NEED AN ACCOUNT? JOIN';
        }
        if (authError) {
          authError.hidden = true;
          authError.textContent = '';
        }
        const pass = authForm?.querySelector('input[name="password"]');
        if (pass) pass.setAttribute('autocomplete', mode === 'register' ? 'new-password' : 'current-password');
      }

      function openAuth(mode) {
        setAuthMode(mode || 'register');
        if (authModal) authModal.hidden = false;
      }

      function closeAuth() {
        if (authModal) authModal.hidden = true;
      }

      async function refreshAuth() {
        try {
          const res = await fetch('/api/auth/me', { credentials: 'include' });
          const data = await res.json();
          currentUser = res.ok && data.user ? data.user : null;
        } catch {
          currentUser = null;
        }
        bookmarks = new Set();
        if (currentUser) {
          try {
            const res = await fetch('/api/bookmarks', { credentials: 'include' });
            const data = await res.json();
            if (res.ok) bookmarks = new Set(data.slugs || []);
          } catch {
            bookmarks = new Set();
          }
        }
        paintAuth();
        paintBookmarks();
        paintSaved();
      }

      async function toggleBookmark(slug) {
        if (!currentUser) {
          openAuth('register');
          return;
        }
        const on = bookmarks.has(slug);
        const res = await fetch(on ? `/api/bookmarks?slug=${encodeURIComponent(slug)}` : '/api/bookmarks', {
          method: on ? 'DELETE' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: on ? undefined : JSON.stringify({ slug }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          bookmarks = new Set(data.slugs || []);
          paintBookmarks();
          paintSaved();
        }
      }

      document.addEventListener('click', (event) => {
        const target = event.target;
        if (target?.closest?.('[data-browse]')) {
          event.preventDefault();
          snapToDirectory();
          return;
        }
        if (target?.closest?.('[data-join]')) {
          event.preventDefault();
          openAuth('register');
          return;
        }
        if (target?.closest?.('[data-login]')) {
          event.preventDefault();
          openAuth('login');
          return;
        }
        if (target?.closest?.('[data-logout]')) {
          event.preventDefault();
          fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => {
            currentUser = null;
            bookmarks = new Set();
            paintAuth();
            paintBookmarks();
            paintSaved();
          });
          return;
        }
        if (target?.closest?.('[data-auth-close]')) {
          closeAuth();
          return;
        }
        if (target?.closest?.('[data-auth-switch]')) {
          setAuthMode(authMode === 'register' ? 'login' : 'register');
          return;
        }
        const mark = target?.closest?.('[data-bookmark]');
        if (mark) {
          event.preventDefault();
          event.stopPropagation();
          const slug = mark.getAttribute('data-bookmark');
          if (slug) void toggleBookmark(slug);
          return;
        }
        const link = target?.closest?.('a');
        if (!link || !(link instanceof HTMLAnchorElement)) return;
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (link.target === '_blank' || link.hasAttribute('download')) return;
        const url = new URL(link.href, location.origin);
        if (url.origin !== location.origin) return;
        if (/\.[a-z0-9]+$/i.test(url.pathname)) return;
        event.preventDefault();
        void go(url.pathname + url.search, true);
      });

      authForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const email = form.email.value;
        const password = form.password.value;
        if (authError) {
          authError.hidden = true;
          authError.textContent = '';
        }
        if (authSubmit) authSubmit.disabled = true;
        try {
          const res = await fetch(authMode === 'register' ? '/api/auth/register' : '/api/auth/login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          const data = await res.json();
          if (!res.ok || !data.user) {
            if (authError) {
              authError.textContent = data.error || 'TRY AGAIN';
              authError.hidden = false;
            }
            return;
          }
          currentUser = data.user;
          closeAuth();
          form.reset();
          await refreshAuth();
          void go('/leads/', true);
        } catch {
          if (authError) {
            authError.textContent = 'TRY AGAIN';
            authError.hidden = false;
          }
        } finally {
          if (authSubmit) authSubmit.disabled = false;
        }
      });

      window.addEventListener('popstate', () => {
        void go(location.pathname + location.search, false);
      });

      if (withRoom) {
        const stage = document.getElementById('stage-scroll');
        const hero = document.getElementById('hero-stage');
        const slot = document.getElementById('chrome-slot');
        const chrome = document.getElementById('app-chrome');
        const fadeTargets = hero
          ? [...hero.querySelectorAll('.hero-landing, .hero-glass-header, .hero-glass-nav, .scroll-hint')]
          : [];
        let stuck = false;
        let lastFade = -1;
        const applyLandingFade = () => {
          if (!hero || !stage) return;
          if (!document.documentElement.classList.contains('intro-done')) return;
          const h = Math.max(1, hero.offsetHeight);
          const t = Math.min(1, Math.max(0, stage.scrollTop / h));
          let fade;
          if (reduceMotion) {
            fade = t > 0.35 ? 0 : 1;
          } else {
            const start = 0.04;
            const end = 0.52;
            fade = t <= start ? 1 : t >= end ? 0 : 1 - (t - start) / (end - start);
          }
          const opacity = Math.round(fade * 200) / 200;
          if (opacity === lastFade) return;
          lastFade = opacity;
          if (opacity >= 1) {
            for (const el of fadeTargets) el.style.removeProperty('opacity');
            const canvas = document.querySelector('.room-canvas');
            if (canvas) canvas.style.removeProperty('opacity');
            hero.classList.remove('is-faded');
            return;
          }
          for (const el of fadeTargets) el.style.opacity = String(opacity);
          const canvas = document.querySelector('.room-canvas');
          if (canvas) canvas.style.opacity = String(opacity);
          hero.classList.toggle('is-faded', opacity < 0.06);
        };
        const applySticky = () => {
          if (!slot || !chrome) return;
          const top = slot.getBoundingClientRect().top;
          const next = stuck ? top <= 1 : top <= 0;
          if (next === stuck) return;
          stuck = next;
          chrome.classList.toggle('is-stuck', stuck);
        };
        const onStageScroll = () => {
          applyLandingFade();
          applySticky();
        };
        if (stage && hero) {
          stage.addEventListener('scroll', onStageScroll, { passive: true });
          onStageScroll();
          window.addEventListener('callsal:intro-complete', applyLandingFade);
        }
      }

      paintAuth();
      void refreshAuth();
