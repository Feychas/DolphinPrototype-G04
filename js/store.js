/* Dolphin AutoTrack prototype — the single shared in-memory state.
   One snapshot is live at a time. Scenario switches replace the whole state
   with a deep copy; presets are never merged and seeded movements/payments are
   never replayed. Nothing is written to storage. */
(function (global) {
  'use strict';

  const FIX = global.DOLPHIN_FIXTURES;

  const Store = {
    state: null,
    scenarioId: null,
    screen: 'S01',
    params: {},
    role: 'Cashier',
    userId: null,
    dirty: false,          /* a view has unsaved form input */
    pendingScreen: null,   /* navigation held back by an unsaved-form guard */
    lastLanding: {},       /* per-role landing screen */

    /* ---------- bootstrap ---------- */
    init: function () {
      const id = FIX.meta.defaultScenarioId || 'P01';
      this.loadScenario(id, { silent: true });
      this.userId = this.state.activeUserId || 'U-CASHIER';
      this.role = this.user().role;
      this.screen = this.scenario().startScreen;
      this.params = {};
    },

    scenario: function (id) {
      id = id || this.scenarioId;
      for (let i = 0; i < FIX.scenarios.length; i += 1) {
        if (FIX.scenarios[i].id === id) return FIX.scenarios[i];
      }
      return FIX.scenarios[0];
    },

    scenarios: function () { return FIX.scenarios; },

    /* ---------- state lifecycle ---------- */
    loadScenario: function (id, opts) {
      opts = opts || {};
      const sc = this.scenario(id);
      if (!sc) return false;
      this.state = Util.deepCopy(sc.state);
      this.scenarioId = sc.id;
      this.userId = this.state.activeUserId || 'U-CASHIER';
      this.role = this.user().role;
      this.screen = sc.startScreen;
      this.params = {};
      this.dirty = false;
      if (!opts.silent) global.App && global.App.onStateReplaced && global.App.onStateReplaced();
      return true;
    },

    /** Reset the current scenario back to its starting snapshot (deep copy). */
    resetScenario: function () {
      const sc = this.scenario(this.scenarioId);
      this.state = Util.deepCopy(sc.state);
      this.screen = sc.startScreen;
      this.params = {};
      this.dirty = false;
      return true;
    },

    /** Reset everything: P01 fixture and the Cashier role. */
    resetAll: function () {
      this.loadScenario(FIX.meta.defaultScenarioId || 'P01');
      this.userId = 'U-CASHIER';
      this.role = 'Cashier';
      this.state.activeUserId = 'U-CASHIER';
      this.screen = this.scenario().startScreen;
      this.params = {};
      this.dirty = false;
      return true;
    },

    /* ---------- users & roles ---------- */
    user: function (id) { return Util.byId(this.state.users, id || this.userId) || this.state.users[0]; },
    users: function () { return this.state.users; },
    roleUsers: function (role) { return this.state.users.filter(u => u.role === role); },

    setRole: function (userId) {
      const u = Util.byId(this.state.users, userId);
      if (!u) return false;
      this.userId = u.id;
      this.role = u.role;
      this.state.activeUserId = u.id;
      return true;
    },

    is: function (role) { return this.role === role; },
    isOwner: function () { return this.role === 'Owner'; },
    isManager: function () { return this.role === 'Manager'; },
    isCashier: function () { return this.role === 'Cashier'; },
    isMechanic: function () { return this.role === 'Mechanic'; },
    /** Owner or Manager — management capabilities. */
    isManagerial: function () { return this.role === 'Owner' || this.role === 'Manager'; },

    /* ---------- lookups ---------- */
    job: function (id) { return Util.byId(this.state.jobs, id); },
    vehicle: function (id) { return Util.byId(this.state.vehicles, id); },
    customer: function (id) { return Util.byId(this.state.customers, id); },
    item: function (id) { return Util.byId(this.state.items, id); },
    service: function (id) { return Util.byId(this.state.services, id); },
    /**
     * The label for a service line.
     * In the Myanmar preview the supplied services[].nameMM string is shown
     * verbatim. Every other label falls back to English, because the
     * translation is only partial.
     */
    serviceLabel: function (line) {
      if (!line) return '';
      const svc = line.serviceId ? this.service(line.serviceId) : null;
      if (svc && this.state.language === 'MM' && svc.nameMM) return svc.nameMM;
      return line.label || (svc ? svc.nameEN : '');
    },
    bay: function (id) { return Util.byId(this.state.bays, id); },
    supplier: function (id) { return Util.byId(this.state.suppliers, id); },
    receipt: function (id) { return Util.byId(this.state.receipts, id); },
    jobReceipt: function (jobId) {
      const list = this.state.receipts.filter(r => r.jobId === jobId);
      return list.length ? list[list.length - 1] : null;
    },
    jobPayment: function (jobId) {
      const list = this.state.payments.filter(p => p.jobId === jobId);
      return list.length ? list[list.length - 1] : null;
    },
    quote: function (job, version) {
      if (!job) return null;
      const v = version || job.activeQuoteVersion;
      if (!v) return null;
      return job.quotes.find(q => q.version === v) || null;
    },
    latestQuote: function (job) {
      if (!job || !job.quotes.length) return null;
      return job.quotes[job.quotes.length - 1];
    },
    activeQuote: function (job) {
      if (!job) return null;
      const q = this.quote(job);
      return q && q.status !== 'Declined' ? q : this.latestQuote(job);
    },
    vehiclesOfCustomer: function (customerId) {
      return this.state.vehicles.filter(v => v.customerId === customerId);
    },
    jobsOfVehicle: function (vehicleId) {
      return this.state.jobs.filter(j => j.vehicleId === vehicleId);
    },
    staffName: function (id) {
      const u = Util.byId(this.state.users, id);
      return u ? u.name : id || '—';
    },
    /** Jobs a mechanic may see (assigned only). */
    visibleJobs: function () {
      if (!this.isMechanic()) return this.state.jobs.slice();
      return this.state.jobs.filter(j => (j.assignedStaffIds || []).indexOf(this.userId) >= 0);
    },

    /* ---------- counters ---------- */
    nextId: function (kind) {
      const c = this.state.counters;
      let n;
      if (kind === 'job') { n = c.nextJob; c.nextJob += 1; return 'JOB-2026-' + Util.pad4(n); }
      if (kind === 'receipt') { n = c.nextReceipt; c.nextReceipt += 1; return 'RC-2026-' + Util.pad4(n); }
      if (kind === 'payment') { n = c.nextPayment; c.nextPayment += 1; return 'PAY-' + Util.pad4(n); }
      if (kind === 'vehicle') { n = c.nextVehicle; c.nextVehicle += 1; return 'VEH-' + Util.pad4(n); }
      if (kind === 'customer') { n = c.nextCustomer; c.nextCustomer += 1; return 'CUS-' + Util.pad4(n); }
      if (kind === 'movement') { n = c.nextMovement; c.nextMovement += 1; return 'MOV-' + Util.pad4(n); }
      n = (c['next' + kind.charAt(0).toUpperCase() + kind.slice(1)] || 1);
      c['next' + kind.charAt(0).toUpperCase() + kind.slice(1)] = n + 1;
      return kind.toUpperCase() + '-' + Util.pad4(n);
    },

    /* ---------- activity log (in memory only) ---------- */
    log: function (type, message, meta) {
      this.state.activity.unshift({
        id: Util.uid('ACT'),
        type: type,
        message: message,
        actor: this.userId,
        actorName: this.user().name,
        at: this.state.demoNow,
        meta: meta || null
      });
    },

    /* ---------- demo clock ---------- */
    now: function () { return this.state.demoNow; },
    today: function () { return Util.dayKey(this.state.demoNow); }
  };

  global.Store = Store;
})(window);
