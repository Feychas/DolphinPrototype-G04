/* Dolphin AutoTrack prototype — application shell, navigation and event wiring.
   The shell renders the sidebar, top bar and one content view at a time.
   Views are plain functions that return HTML; actions live in js/actions.js. */
(function (global) {
  'use strict';

  const E = Util.esc;

  const NAV = {
    Owner: [
      { id: 'S01', label: 'Dashboard', icon: 'home' },
      { id: 'S02', label: 'Customers', icon: 'users' },
      { id: 'S06', label: 'Jobs', icon: 'clipboard' },
      { id: 'S05', label: 'Bay board', icon: 'car' },
      { id: 'S14', label: 'Bookings', icon: 'calendar' },
      { id: 'S10', label: 'Inventory', icon: 'box' },
      { id: 'S15', label: 'Catalogue', icon: 'book' },
      { id: 'S12', label: 'Receipts', icon: 'receipt' },
      { id: 'S19', label: 'Reports', icon: 'chart' },
      { id: 'more', label: 'More', icon: 'dots', more: true },
      { id: 'S20', label: 'Settings', icon: 'settings' }
    ],
    Manager: [
      { id: 'S01', label: 'Dashboard', icon: 'home' },
      { id: 'S02', label: 'Customers', icon: 'users' },
      { id: 'S06', label: 'Jobs', icon: 'clipboard' },
      { id: 'S05', label: 'Bay board', icon: 'car' },
      { id: 'S14', label: 'Bookings', icon: 'calendar' },
      { id: 'S10', label: 'Inventory', icon: 'box' },
      { id: 'S15', label: 'Catalogue', icon: 'book' },
      { id: 'S12', label: 'Receipts', icon: 'receipt' },
      { id: 'S19', label: 'Reports', icon: 'chart' },
      { id: 'more', label: 'More', icon: 'dots', more: true }
    ],
    Cashier: [
      { id: 'S01', label: 'Dashboard', icon: 'home' },
      { id: 'S02', label: 'Customers', icon: 'users' },
      { id: 'S06', label: 'Jobs', icon: 'clipboard' },
      { id: 'S05', label: 'Bay board', icon: 'car' },
      { id: 'S14', label: 'Bookings', icon: 'calendar' },
      { id: 'S12', label: 'Receipts', icon: 'receipt' },
      { id: 'S15', label: 'Discount request', icon: 'book', params: { tab: 'requests' } },
      { id: 'S13', label: 'Reminders', icon: 'bell' },
      { id: 'S17', label: 'Daily closing', icon: 'wallet' }
    ],
    Mechanic: [
      { id: 'S06', label: 'My jobs', icon: 'clipboard' },
      { id: 'S06', label: 'Current job', icon: 'car', params: { view: 'current' } },
      { id: 'S07', label: 'Inspection', icon: 'receipt' },
      { id: 'S08', label: 'Approval', icon: 'checkCircle', params: { view: 'read' } },
      { id: 'S09', label: 'Materials', icon: 'package' },
      { id: 'S06', label: 'Progress', icon: 'chart', params: { view: 'progress' } }
    ]
  };

  const MORE_ITEMS = {
    Manager: [
      { id: 'S13', label: 'Reminders', icon: 'bell' },
      { id: 'S17', label: 'Daily closing', icon: 'wallet' },
      { id: 'S17', label: 'Corrections', icon: 'edit', params: { tab: 'corrections' } },
      { id: 'S18', label: 'Import preview', icon: 'upload' }
    ],
    Owner: [
      { id: 'S13', label: 'Reminders', icon: 'bell' },
      { id: 'S17', label: 'Daily closing', icon: 'wallet' },
      { id: 'S17', label: 'Corrections', icon: 'edit', params: { tab: 'corrections' } },
      { id: 'S18', label: 'Import preview', icon: 'upload' }
    ]
  };

  /* Screens each role may open. Mechanic access is limited to assigned jobs
     inside the view; a stale selection shows an access notice. */
  const ACCESS = {
    S01: ['Owner', 'Manager', 'Cashier', 'Mechanic'],
    S02: ['Owner', 'Manager', 'Cashier'],
    S03: ['Owner', 'Manager', 'Cashier'],
    S04: ['Owner', 'Manager', 'Cashier'],
    S05: ['Owner', 'Manager', 'Cashier', 'Mechanic'],
    S06: ['Owner', 'Manager', 'Cashier', 'Mechanic'],
    S07: ['Owner', 'Manager', 'Mechanic'],
    S08: ['Owner', 'Manager', 'Cashier', 'Mechanic'],
    S09: ['Owner', 'Manager', 'Mechanic'],
    S10: ['Owner', 'Manager'],
    S11: ['Owner', 'Manager'],
    S12: ['Owner', 'Manager', 'Cashier'],
    S13: ['Owner', 'Manager', 'Cashier'],
    S14: ['Owner', 'Manager', 'Cashier'],
    S15: ['Owner', 'Manager', 'Cashier'],
    S16: ['Owner', 'Manager'],
    S17: ['Owner', 'Manager', 'Cashier'],
    S18: ['Owner', 'Manager'],
    S19: ['Owner', 'Manager'],
    S20: ['Owner']
  };

  const BREADCRUMB = {
    S01: 'Dashboard', S02: 'Customers', S03: 'Register vehicle', S04: 'Vehicle check-in',
    S05: 'Bay board', S06: 'Jobs', S07: 'Inspection', S08: 'Customer approval',
    S09: 'Job materials', S10: 'Inventory', S11: 'Receive stock', S12: 'Receipts',
    S13: 'Reminders', S14: 'Bookings', S15: 'Catalogue', S16: 'Stock adjustment',
    S17: 'Daily closing', S18: 'Import preview', S19: 'Reports', S20: 'Demo settings'
  };

  const App = {
    views: global.DolphinViews || {},
    lastFocus: null,

    /* ---------------- bootstrap ---------------- */
    init: function () {
      Store.init();
      this.bindShell();
      this.render();
      this.fillRoleSelect();
    },

    fillRoleSelect: function () {
      const sel = Util.el('#role-select');
      if (!sel) return;
      sel.innerHTML = Store.users().map(function (u) {
        return '<option value="' + E(u.id) + '">' + E(u.name) + ' — ' + E(u.role) + '</option>';
      }).join('');
      sel.value = Store.userId;
    },

    landing: function () {
      return Store.isMechanic() ? 'S06' : 'S01';
    },

    canAccess: function (screen) {
      const allowed = ACCESS[screen];
      if (!allowed) return true;
      return allowed.indexOf(Store.role) >= 0;
    },

    /* ---------------- navigation ---------------- */
    go: function (screen, params, opts) {
      opts = opts || {};
      if (!this.canAccess(screen)) {
        this.accessNotice(screen);
        return;
      }
      if (Store.dirty && !opts.force) {
        this.confirmDialog({
          title: 'Discard unsaved changes?',
          message: 'This screen has unsaved input. Leaving now discards it.',
          confirmLabel: 'Discard and continue',
          cancelLabel: 'Stay on this screen',
          onConfirm: function () { Store.dirty = false; App.go(screen, params, { force: true }); }
        });
        return;
      }
      Store.screen = screen;
      Store.params = params || {};
      Store.dirty = false;
      this.render();
      const main = Util.el('#content');
      if (main) main.focus();
    },

    accessNotice: function (screen) {
      this.modal({
        title: 'Not available for this role',
        body: '<p>The <strong>' + E(BREADCRUMB[screen] || screen) + '</strong> screen is not part of the ' +
          E(Store.role) + ' demo view. You have been returned to the ' +
          E(Store.role === 'Mechanic' ? 'My jobs' : 'Dashboard') + ' screen.</p>',
        actions: [{ label: 'Continue', variant: 'primary', onClick: function () { App.go(App.landing(), {}, { force: true }); } }]
      });
      Store.dirty = false;
      Store.screen = this.landing();
      Store.params = {};
      this.render();
    },

    /* ---------------- rendering ---------------- */
    render: function () {
      const role = Store.role;
      const nav = NAV[role] || NAV.Cashier;
      const screen = Store.screen;

      const rsel = Util.el('#role-select');
      if (rsel) {
        if (!rsel.options.length) this.fillRoleSelect();
        rsel.value = Store.userId;
      }
      Util.el('#lang-en').classList.toggle('lang-active', Store.state.language !== 'MM');
      Util.el('#lang-mm').classList.toggle('lang-active', Store.state.language === 'MM');

      /* sidebar */
      let html = '<div class="brand"><span class="brand-mark">D</span>' +
        '<span class="brand-text"><strong>Dolphin</strong><span>AutoTrack</span></span></div>' +
        '<nav class="nav" aria-label="Main navigation">' +
        nav.map(function (item) {
          const active = item.more ? false : (screen === item.id && (item.id !== 'S06' || true));
          const params = item.params ? JSON.stringify(item.params) : '';
          return '<a href="#" class="nav-item' + (active ? ' nav-active' : '') + '" data-nav="' + E(item.id) + '"' +
            (params ? ' data-params=\'' + E(params) + '\'' : '') +
            ' aria-current="' + (active ? 'page' : 'false') + '">' +
            UI.icon(item.icon, 20) + '<span>' + E(item.label) + '</span></a>';
        }).join('') + '</nav>' +
        '<div class="sidebar-foot">Prototype • Dummy data</div>';
      if (Store.isManagerial() && MORE_ITEMS[role]) {
        html += '<div class="more-menu" id="more-menu" hidden>' + MORE_ITEMS[role].map(function (item) {
          const params = item.params ? JSON.stringify(item.params) : '';
          return '<a href="#" class="nav-item nav-sub" data-nav="' + E(item.id) + '"' +
            (params ? ' data-params=\'' + E(params) + '\'' : '') + '>' + UI.icon(item.icon, 18) +
            '<span>' + E(item.label) + '</span></a>';
        }).join('') + '</div>';
      }
      Util.el('#sidebar').innerHTML = html;

      /* breadcrumb */
      const crumbs = ['Workshop'];
      if (Store.isMechanic()) crumbs.push('My jobs'); else crumbs.push(BREADCRUMB[screen] || screen);
      const jobId = Store.params.jobId || Store.state.selectedJobId;
      if (jobId && ['S06', 'S07', 'S08', 'S09', 'S12'].indexOf(screen) >= 0) crumbs.push(jobId);
      Util.el('#breadcrumb').innerHTML = crumbs.map(function (c, i) {
        return (i ? '<span class="crumb-sep">›</span>' : '') + '<span>' + E(c) + '</span>';
      }).join('');

      /* content */
      const ctx = this.context();
      const main = Util.el('#content');
      const view = this.views[screen];
      if (!view) {
        main.innerHTML = UI.card({ title: 'Screen not available', body: '<p>This screen has not been implemented.</p>' });
      } else {
        main.innerHTML = view.render(ctx);
        if (view.mount) view.mount(main, ctx);
      }
      const scenarioLabel = Util.el('#demo-scenario-label');
      if (scenarioLabel) scenarioLabel.textContent = Store.scenario().id + ' — ' + Store.scenario().label;
      const roleLabel = Util.el('#demo-role-label');
      if (roleLabel) roleLabel.textContent = Store.user().name + ' · ' + Store.role;
    },

    context: function () {
      return {
        state: Store.state,
        role: Store.role,
        user: Store.user(),
        screen: Store.screen,
        params: Store.params,
        scenario: Store.scenario(),
        fixture: global.DOLPHIN_FIXTURES
      };
    },

    /* ---------------- events ---------------- */
    bindShell: function () {
      const self = this;

      document.addEventListener('click', function (ev) {
        const nav = ev.target.closest('[data-nav]');
        if (nav) {
          ev.preventDefault();
          const screen = nav.getAttribute('data-nav');
          let params = {};
          const raw = nav.getAttribute('data-params');
          if (raw) { try { params = JSON.parse(raw); } catch (e) { params = {}; } }
          self.go(screen, params);
          return;
        }
        const tabBtn = ev.target.closest('[data-tab]');
        if (tabBtn) {
          ev.preventDefault();
          const params = {};
          Object.keys(Store.params || {}).forEach(function (k) { params[k] = Store.params[k]; });
          params.tab = tabBtn.getAttribute('data-tab');
          self.go(Store.screen, params);
          return;
        }
        const scenario = ev.target.closest('[data-scenario]');
        if (scenario) {
          ev.preventDefault();
          self.loadScenario(scenario.getAttribute('data-scenario'));
          return;
        }
        const act = ev.target.closest('[data-action]');
        if (act) {
          const name = act.getAttribute('data-action');
          ev.preventDefault();
          const handler = global.Actions && global.Actions.click && global.Actions.click[name];
          if (handler) {
            self.lastFocus = act;
            handler(act, ev);
          } else {
            self.toast('This action is not part of the prototype demo.', 'warn');
          }
        }
      });

      document.addEventListener('submit', function (ev) {
        const form = ev.target.closest('form[data-form]');
        if (!form) return;
        ev.preventDefault();
        const name = form.getAttribute('data-form');
        const handler = global.Actions && global.Actions.submit && global.Actions.submit[name];
        Store.dirty = false;
        if (handler) handler(form, ev);
        else self.toast('This form is not part of the prototype demo.', 'warn');
      });

      document.addEventListener('input', function (ev) {
        const t = ev.target;
        if (t && t.closest && t.closest('form[data-form]')) Store.dirty = true;
        const live = t.closest ? t.closest('[data-live]') : null;
        if (live) {
          const name = live.getAttribute('data-live');
          const handler = global.Actions && global.Actions.live && global.Actions.live[name];
          if (handler) handler(live, ev);
        }
      });

      document.addEventListener('change', function (ev) {
        const t = ev.target;
        if (t && t.id === 'role-select') {
          self.switchRole(t.value);
          return;
        }
        const live = t.closest ? t.closest('[data-change]') : null;
        if (live) {
          const name = live.getAttribute('data-change');
          const handler = global.Actions && global.Actions.live && global.Actions.live[name];
          if (handler) handler(live, ev);
        }
      });

      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
          const modal = Util.el('#modal-root .modal');
          if (modal) { ev.preventDefault(); self.closeModal(); }
          const more = Util.el('#more-menu');
          if (more && !more.hidden) { more.hidden = true; }
        }
      });

      /* language preview */
      Util.el('#lang-en').addEventListener('click', function () {
        Store.state.language = 'EN';
        self.render();
      });
      Util.el('#lang-mm').addEventListener('click', function () {
        Store.state.language = 'MM';
        self.render();
      });

      /* mobile navigation drawer */
      const menuBtn = Util.el('#menu-btn');
      if (menuBtn) {
        menuBtn.addEventListener('click', function () {
          const side = Util.el('#sidebar');
          const open = side.classList.toggle('open');
          menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      }

      /* demo controls */
      Util.el('#demo-controls-btn').addEventListener('click', function (ev) {
        ev.stopPropagation();
        self.toggleDemoPanel();
      });
      document.addEventListener('click', function (ev) {
        const panel = Util.el('#demo-panel');
        if (panel && !panel.hidden && !ev.target.closest('#demo-panel') && !ev.target.closest('#demo-controls-btn')) {
          panel.hidden = true;
        }
        const moreBtn = ev.target.closest('[data-more-toggle]');
        if (moreBtn) {
          ev.preventDefault();
          const menu = Util.el('#more-menu');
          if (menu) menu.hidden = !menu.hidden;
          return;
        }
      });
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
          const panel = Util.el('#demo-panel');
          if (panel && !panel.hidden) panel.hidden = true;
        }
      });
    },

    /* ---------------- role / scenario switching ---------------- */
    switchRole: function (userId) {
      const u = Util.byId(Store.state.users, userId);
      if (!u) return;
      const apply = function () {
        Store.setRole(userId);
        Store.dirty = false;
        const screen = Store.screen;
        if (!App.canAccess(screen)) {
          Store.screen = App.landing();
          Store.params = {};
        } else if (Store.isMechanic()) {
          /* mechanic view starts on the assigned job list */
          Store.params = {};
        }
        App.toast('Now previewing as ' + u.name + ' (' + u.role + '). State kept.', 'info');
        App.render();
      };
      if (Store.dirty) {
        this.confirmDialog({
          title: 'Discard unsaved changes?',
          message: 'You have unsaved input on this screen. Switching role keeps saved data but clears the form.',
          confirmLabel: 'Discard and switch',
          cancelLabel: 'Stay',
          onConfirm: function () { Store.dirty = false; apply(); }
        });
        return;
      }
      apply();
    },

    loadScenario: function (id) {
      const apply = function () {
        Store.loadScenario(id);
        App.closePanel && App.closePanel();
        App.toast('Loaded scenario ' + id + ' — ' + Store.scenario().label + '.', 'info');
        App.render();
      };
      if (Store.dirty) {
        this.confirmDialog({
          title: 'Discard unsaved changes?',
          message: 'Switching scenario replaces the whole demo state.',
          confirmLabel: 'Discard and switch',
          cancelLabel: 'Stay',
          onConfirm: function () { Store.dirty = false; apply(); }
        });
        return;
      }
      apply();
    },

    resetScenario: function () {
      const apply = function () {
        Store.resetScenario();
        App.toast('Scenario ' + Store.scenarioId + ' reset to its starting snapshot.', 'info');
        App.render();
      };
      if (Store.dirty) {
        this.confirmDialog({
          title: 'Discard unsaved changes?',
          message: 'Resetting restores the scenario snapshot and clears unsaved input.',
          confirmLabel: 'Reset',
          cancelLabel: 'Cancel',
          onConfirm: function () { Store.dirty = false; apply(); }
        });
        return;
      }
      apply();
    },

    resetAll: function () {
      Store.resetAll();
      App.closePanel();
      App.toast('Everything reset. P01 loaded with the Cashier role.', 'info');
      App.render();
    },

    /* ---------------- demo controls panel ---------------- */
    toggleDemoPanel: function () {
      const panel = Util.el('#demo-panel');
      if (!panel) return;
      if (!panel.hidden) { panel.hidden = true; return; }
      panel.innerHTML = this.demoPanelHtml();
      panel.hidden = false;
      const scenarioLabel = panel.querySelector('#demo-scenario-label');
      if (scenarioLabel) scenarioLabel.innerHTML = 'Current: <b>' + E(Store.scenario().id) + ' — ' + E(Store.scenario().label) + '</b>';
      const roleLabel = panel.querySelector('#demo-role-label');
      if (roleLabel) roleLabel.innerHTML = 'Role: <b>' + E(Store.user().name) + ' · ' + E(Store.role) + '</b>';
      const first = panel.querySelector('button, select');
      if (first) first.focus();
    },
    closePanel: function () {
      const panel = Util.el('#demo-panel');
      if (panel) panel.hidden = true;
    },
    demoPanelHtml: function () {
      const sc = Store.scenarios().map(function (s) {
        const on = s.id === Store.scenarioId;
        return '<button type="button" class="scenario-btn' + (on ? ' scenario-active' : '') + '" data-scenario="' + E(s.id) + '">' +
          '<span class="scenario-id">' + E(s.id) + '</span>' +
          '<span class="scenario-label">' + E(s.label) + '</span>' +
          '<span class="scenario-start">Starts at ' + E(s.startScreen) + '</span></button>';
      }).join('');
      return '<div class="panel-head"><strong>Demo controls</strong>' +
        '<span class="panel-sub">Presentation only — not authentication</span>' +
        '<span class="panel-meta" id="demo-scenario-label"></span>' +
        '<span class="panel-meta" id="demo-role-label"></span></div>' +
        '<div class="panel-section panel-presets"><span class="panel-label">Scenario presets (16)</span>' +
        '<div class="scenario-list">' + sc + '</div></div>' +
        '<div class="panel-foot">' +
        '<div class="panel-row">' +
        '<button type="button" class="btn btn-secondary" data-action="demo.resetScenario">Reset scenario</button>' +
        '<button type="button" class="btn btn-secondary" data-action="demo.resetAll">Reset all</button>' +
        '</div>' +
        '<p class="panel-note">Reset scenario restores a deep copy of this preset. Reset all loads P01 with the Cashier role. ' +
        'Refreshing the page also starts again at P01. Nothing is saved to a database or to browser storage.</p></div>';
    },

    onStateReplaced: function () { this.render(); },

    /* ---------------- toasts & dialogs ---------------- */
    toast: function (message, tone) {
      const root = Util.el('#toast-root');
      if (!root) return;
      const t = document.createElement('div');
      t.className = 'toast toast-' + (tone || 'info');
      t.setAttribute('role', 'status');
      t.innerHTML = UI.icon(tone === 'warn' ? 'alert' : tone === 'error' ? 'alert' : 'checkCircle', 18) +
        '<span>' + E(message) + '</span>';
      root.appendChild(t);
      setTimeout(function () {
        t.classList.add('toast-out');
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
      }, 4200);
    },

    modal: function (o) {
      const root = Util.el('#modal-root');
      this.lastFocus = document.activeElement;
      const body = o.body || '';
      const actions = (o.actions || [{ label: 'Close', variant: 'primary' }]).map(function (a, i) {
        return '<button type="button" class="btn ' + (a.variant === 'secondary' ? 'btn-secondary' : 'btn-primary') +
          '" data-modal-action="' + i + '">' + E(a.label) + '</button>';
      }).join('');
      root.innerHTML = '<div class="modal-backdrop"></div>' +
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
        '<div class="modal-head"><h2 id="modal-title">' + E(o.title || '') + '</h2>' +
        '<button type="button" class="icon-btn" data-modal-close aria-label="Close dialog">' + UI.icon('check', 18) + '</button></div>' +
        '<div class="modal-body">' + body + '</div>' +
        '<div class="modal-actions">' + actions + '</div></div>';
      root.hidden = false;
      const modal = Util.el('#modal-root .modal');
      const buttons = Util.els('#modal-root .modal-actions .btn');
      (buttons[0] || Util.el('#modal-root .modal')).focus();
      Util.els('#modal-root [data-modal-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          const a = o.actions[parseInt(b.getAttribute('data-modal-action'), 10)];
          let result;
          if (a && a.onClick) result = a.onClick();
          if (a && a.keepOpen === true) return;
          /* A field error inside the dialog keeps it open so that the reason
             stays visible next to the field instead of vanishing with the DOM. */
          if (result && result.ok === false) return;
          if (modal && modal.querySelector('.field-error-text')) return;
          App.closeModal();
        });
      });
      const close = Util.el('#modal-root [data-modal-close]');
      if (close) close.addEventListener('click', function () { App.closeModal(); });
      const backdrop = Util.el('#modal-root .modal-backdrop');
      if (backdrop) backdrop.addEventListener('click', function () { App.closeModal(); });
      if (modal) modal.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Tab') return;
        const focusables = Util.els('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modal)
          .filter(function (x) { return !x.disabled && x.offsetParent !== null; });
        if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      });
    },

    closeModal: function () {
      const root = Util.el('#modal-root');
      root.hidden = true;
      root.innerHTML = '';
      if (this.lastFocus && document.contains(this.lastFocus)) this.lastFocus.focus();
      this.lastFocus = null;
    },

    confirmDialog: function (o) {
      this.modal({
        title: o.title,
        body: '<p>' + (o.html || E(o.message || '')) + '</p>' +
          (o.detail ? '<p class="modal-detail">' + E(o.detail) + '</p>' : ''),
        actions: [
          { label: o.cancelLabel || 'Cancel', variant: 'secondary' },
          { label: o.confirmLabel || 'Confirm', variant: 'primary', onClick: o.onConfirm }
        ]
      });
    }
  };

  global.App = App;

  document.addEventListener('DOMContentLoaded', function () {
    App.init();
  });
})(window);
