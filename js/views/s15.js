/* Dolphin AutoTrack prototype — S15 Catalogue, promotions and discount requests.
   Prices, promotions and discounts are simulated demo values. Nothing is
   charged and no customer is contacted. */
(function (global) {
  'use strict';

  const E = Util.esc;

  const TYPE_LABEL = {
    fixed: 'Fixed subtraction',
    percent: 'Percentage subtraction',
    setPrice: 'Set final price'
  };

  function priceText(service) {
    if (service.priceBySizeMMK) {
      const p = service.priceBySizeMMK;
      return 'S ' + Util.mmk(p.S) + ' · M ' + Util.mmk(p.M) + ' · L ' + Util.mmk(p.L);
    }
    return Util.mmk(service.fixedPriceMMK) + ' (fixed price)';
  }

  function serviceNames(ids) {
    return (ids || []).map(function (id) {
      const s = Store.service(id);
      return s ? s.nameEN : id;
    }).join(', ');
  }

  function servicesCard(ctx) {
    const managerial = ctx.role === 'Owner' || ctx.role === 'Manager';
    const services = ctx.state.services || [];
    const rows = services.map(function (s) {
      const archived = s.active === false;
      const actions = managerial
        ? (archived
          ? UI.btn('Restore', { variant: 'secondary', action: 'catalogue.restoreService', attrs: { serviceId: s.id } })
          : UI.btn('Edit', { variant: 'secondary', action: 'catalogue.editService', attrs: { serviceId: s.id } }) +
          ' ' + UI.btn('Archive', { variant: 'danger', action: 'catalogue.archiveService', attrs: { serviceId: s.id } }))
        : '<span class="muted">View only</span>';
      return {
        cells: [
          { html: E(s.nameEN) },
          { html: '<span class="muted">' + E(s.nameMM || '—') + '</span>' },
          { html: s.priceBySizeMMK ? 'By size (S, M, L)' : 'Fixed' },
          { html: '<span class="mono">' + E(priceText(s)) + '</span>' },
          { html: '<span class="tag">v' + E(s.priceVersion || 1) + '</span>' },
          { html: archived ? UI.badge('Archived', 'grey') : UI.badge('Active', 'green') },
          { html: actions }
        ]
      };
    });

    const body = UI.table({
      label: 'Service catalogue',
      head: ['Service', 'Myanmar name', 'Pricing', 'Price (MMK)', 'Price version', 'Status', 'Actions'],
      empty: 'No services in the demo catalogue yet.',
      rows: rows
    }) +
      '<p class="note">Updating a price increments that service\'s demo price version. Existing job and receipt ' +
      'snapshots keep the price they were created with; new jobs use the new value. Archived services stay visible ' +
      'with an Archived marker and are not offered for new bookings.</p>' +
      '<p class="note">All prices are fictional demo values from the working source examples. They are not verified ' +
      'live workshop pricing.</p>';

    return UI.card({
      title: 'Services',
      subtitle: services.length + ' service(s) in the demo catalogue.',
      actions: managerial ? UI.btn('Add service', { variant: 'primary', action: 'catalogue.addService' }) : '',
      body: body
    });
  }

  /* ---------------- promotion preview ---------------- */
  function promotionPreviewCard(ctx) {
    const sample = (ctx.fixture.sampleInputs || {}).promotionAlternatives || [];
    const rowsA = sample.map(function (alt) {
      const finalMMK = Rules.promotionFinal({ type: alt.type, value: alt.value }, alt.regularMMK);
      const rounded = Rules.roundReceipt(finalMMK);
      return {
        cells: [
          E(TYPE_LABEL[alt.type] || alt.type),
          { html: '<span class="mono">' + E(Util.mmk(alt.value)) + (alt.type === 'percent' ? '%' : ' MMK') + '</span>' },
          E(alt.size),
          { html: '<span class="mono">' + E(Util.mmk(alt.regularMMK)) + '</span>' },
          { html: '<span class="mono">' + E(Util.mmk(finalMMK)) + '</span>' },
          { html: '<span class="mono">' + E(Util.mmk(rounded.payableMMK)) + '</span>' +
            (rounded.roundingMMK ? ' <span class="muted small">(' + E(Util.mmkSigned(rounded.roundingMMK)) + ')</span>' : '') },
          { html: '<span class="muted small">receipt rounds once to the nearest 100 MMK</span>' }
        ]
      };
    });

    /* the guide's own example: an active promotion applied to a catalogue service */
    const dayKey = Util.dayKey(Store.now());
    const rowsB = [];
    (ctx.state.promotions || []).forEach(function (promo) {
      if (promo.active === false) return;
      (promo.serviceIds || []).forEach(function (serviceId) {
        const service = Store.service(serviceId);
        if (!service) return;
        const sizes = (promo.sizes && promo.sizes.length) ? promo.sizes : ['S', 'M', 'L'];
        sizes.forEach(function (size) {
          if (!Rules.promotionApplies(promo, serviceId, size, dayKey)) return;
          const regular = service.priceBySizeMMK ? service.priceBySizeMMK[size] : service.fixedPriceMMK;
          if (!Util.isNum(regular)) return;
          const finalMMK = Rules.promotionFinal(promo, regular);
          const rounded = Rules.roundReceipt(finalMMK);
          rowsB.push({
            cells: [
              { html: E(promo.id) + ' <span class="muted small">(' + E(promo.nameEN) + ')</span>' },
              E(service.nameEN),
              E(size),
              { html: '<span class="mono">' + E(Util.mmk(regular)) + '</span>' },
              { html: '<span class="mono">−' + E(Util.mmk(regular - finalMMK)) + '</span>' },
              { html: '<span class="mono">' + E(Util.mmk(finalMMK)) + '</span>' },
              { html: '<span class="mono">' + E(Util.mmk(rounded.payableMMK)) + '</span>' }
            ]
          });
        });
      });
    });

    /* The guide's worked example, recomputed from the catalogue prices and the
       published promotion values: 18,500 - 6,500 = 12,000 (S), 22,500 - 6,500 =
       16,000 (M), 25,500 - 6,500 = 19,000 (L); 10% of 18,500 = 16,650 which the
       receipt rounds once to 16,700; set price 12,000. */
    const fixedAlt = sample.filter(function (a) { return a.type === 'fixed'; })[0];
    const pctAlt = sample.filter(function (a) { return a.type === 'percent'; })[0];
    const setAlt = sample.filter(function (a) { return a.type === 'setPrice'; })[0];
    const sizeService = (ctx.state.services || []).filter(function (s) {
      return s.priceBySizeMMK && s.priceBySizeMMK.S === 18500;
    })[0];
    const rowsC = [];
    if (sizeService && fixedAlt) {
      ['S', 'M', 'L'].forEach(function (size) {
        const regular = sizeService.priceBySizeMMK[size];
        if (!Util.isNum(regular)) return;
        const finalMMK = Rules.promotionFinal({ type: 'fixed', value: fixedAlt.value }, regular);
        const rounded = Rules.roundReceipt(finalMMK);
        rowsC.push({
          cells: [
            E(size),
            { html: '<span class="mono">' + E(Util.mmk(regular)) + '</span>' },
            { html: '<span class="mono">−' + E(Util.mmk(fixedAlt.value)) + '</span>' },
            { html: '<span class="mono">' + E(Util.mmk(finalMMK)) + '</span>' },
            { html: '<span class="mono">' + E(Util.mmk(rounded.payableMMK)) + '</span>' },
            { html: '<span class="muted small">fixed subtraction of ' + E(Util.mmk(fixedAlt.value)) + ' MMK</span>' }
          ]
        });
      });
    }
    if (sizeService && pctAlt) {
      const regular = sizeService.priceBySizeMMK.S;
      const finalMMK = Rules.promotionFinal({ type: 'percent', value: pctAlt.value }, regular);
      const rounded = Rules.roundReceipt(finalMMK);
      rowsC.push({
        cells: [
          E('S'),
          { html: '<span class="mono">' + E(Util.mmk(regular)) + '</span>' },
          { html: '<span class="mono">' + E(pctAlt.value) + '%</span>' },
          { html: '<span class="mono">' + E(Util.mmk(finalMMK)) + '</span>' },
          { html: '<span class="mono">' + E(Util.mmk(rounded.payableMMK)) + '</span>' },
          { html: '<span class="muted small">percentage subtraction, rounded once on the receipt</span>' }
        ]
      });
    }
    if (sizeService && setAlt) {
      const regular = sizeService.priceBySizeMMK.S;
      const finalMMK = Rules.promotionFinal({ type: 'setPrice', value: setAlt.value }, regular);
      const rounded = Rules.roundReceipt(finalMMK);
      rowsC.push({
        cells: [
          E('S'),
          { html: '<span class="mono">' + E(Util.mmk(regular)) + '</span>' },
          { html: '<span class="mono">set ' + E(Util.mmk(setAlt.value)) + '</span>' },
          { html: '<span class="mono">' + E(Util.mmk(finalMMK)) + '</span>' },
          { html: '<span class="mono">' + E(Util.mmk(rounded.payableMMK)) + '</span>' },
          { html: '<span class="muted small">final set price</span>' }
        ]
      });
    }

    const body =
      '<h3 class="card-title">All three promotion types (published demo sample)</h3>' +
      UI.table({
        label: 'Promotion type preview',
        head: ['Type', 'Value', 'Size', 'Regular price (MMK)', 'Final service price (MMK)', 'Rounded receipt (MMK)', 'Note'],
        empty: 'No promotion sample is available in the fixture.',
        rows: rowsA
      }) +
      '<h3 class="card-title">Worked example — ' +
      E(sizeService ? sizeService.nameEN + ' (' + sizeService.nameMM + ')' : 'catalogue size prices') + '</h3>' +
      UI.table({
        label: 'Worked promotion example',
        head: ['Size', 'Regular price (MMK)', 'Promotion', 'Final service price (MMK)', 'Rounded receipt (MMK)', 'Note'],
        empty: 'The catalogue has no size-priced service matching the published example.',
        rows: rowsC
      }) +
      '<h3 class="card-title">Active promotions on the catalogue (' + E(Util.fmtDate(Store.now())) + ')</h3>' +
      UI.table({
        label: 'Active promotion preview',
        head: ['Promotion', 'Service', 'Size', 'Regular price (MMK)', 'Promotion (MMK)', 'Final price (MMK)', 'Rounded receipt (MMK)'],
        empty: 'No active promotion matches a catalogue service on the demo date.',
        rows: rowsB
      }) +
      '<p class="note">One automatic promotion applies per service line: the lowest final price wins, and a tie is ' +
      'broken by the earliest promotion id. A manual discount never stacks on a line that already carries a promotion.</p>';

    return UI.card({
      title: 'Promotion preview (demo)',
      subtitle: 'Computed from the published sample values and the active promotions — no number is typed in by hand.',
      body: body
    });
  }
  function promotionsCard(ctx) {
    const managerial = ctx.role === 'Owner' || ctx.role === 'Manager';
    const promos = ctx.state.promotions || [];
    const rows = promos.map(function (p) {
      const ended = p.active === false;
      const actions = managerial
        ? (ended
          ? '<span class="muted">Ended</span>'
          : UI.btn('Edit', { variant: 'secondary', action: 'catalogue.editPromotion', attrs: { promotionId: p.id } }) +
          ' ' + UI.btn('End', { variant: 'danger', action: 'catalogue.endPromotion', attrs: { promotionId: p.id } }))
        : '<span class="muted">View only</span>';
      return {
        cells: [
          { html: E(p.id) + ' — ' + E(p.nameEN) + (p.nameMM ? '<br><span class="muted small">' + E(p.nameMM) + '</span>' : '') },
          E(TYPE_LABEL[p.type] || p.type),
          { html: '<span class="mono">' + E(Util.mmk(p.value)) + (p.type === 'percent' ? '%' : ' MMK') + '</span>' },
          E(serviceNames(p.serviceIds)),
          E((p.sizes && p.sizes.length) ? p.sizes.join(', ') : 'All sizes'),
          { html: E(Util.fmtDate(p.startDate + 'T00:00:00+06:30')) + ' – ' + E(Util.fmtDate(p.endDate + 'T00:00:00+06:30')) },
          { html: ended ? UI.badge('Ended', 'grey') : UI.badge('Active', 'green') },
          { html: actions }
        ]
      };
    });

    const body = UI.table({
      label: 'Promotions',
      head: ['Promotion', 'Type', 'Value', 'Services', 'Sizes', 'Dates (inclusive)', 'Status', 'Actions'],
      empty: 'No promotions in the demo catalogue yet.',
      rows: rows
    }) +
      '<p class="note">A promotion matches on service, vehicle size and job date, and its start and end dates are ' +
      'inclusive. Ending a promotion stops it applying to new jobs and never changes a receipt that was already ' +
      'issued.</p>';

    return UI.card({
      title: 'Promotions',
      subtitle: promos.length + ' promotion(s) in the demo catalogue.',
      actions: managerial ? UI.btn('Add promotion', { variant: 'primary', action: 'catalogue.addPromotion' }) : '',
      body: body
    });
  }

  /* ---------------- discount requests ---------------- */
  function discountRequestForm(ctx) {
    const H = global.DolphinCatalogue;
    if (!H) {
      return UI.card({
        title: 'New discount request',
        body: '<p class="note">The catalogue actions have not been loaded.</p>'
      });
    }
    const state = ctx.state;
    const draft = H.discountDraft(state);
    const jobs = H.discountJobs(state);
    const cands = H.discountCandidates(state, draft.jobId);
    const jobOptions = jobs.length ? jobs.map(function (j) {
      const v = Store.vehicle(j.vehicleId);
      return { value: j.id, label: j.id + ' — ' + (v ? v.plate : j.vehicleId) + ' (' + j.workStatus + ')' };
    }) : [{ value: '', label: 'No open unpaid job' }];
    const lineOptions = cands.length ? cands.map(function (c) {
      const suffix = c.note ? ' — ' + c.note : '';
      return { value: H.lineKey(c), label: c.label + ' — ' + Util.mmk(c.regularMMK) + ' MMK' + suffix };
    }) : [{ value: '', label: 'No labour line available' }];

    const body =
      '<form id="discount-request-form" data-form="catalogue.discountRequest" novalidate>' +
      '<div class="form-grid">' +
      '<div class="field"><label for="dr-job">Unpaid job <span class="req" aria-hidden="true">*</span></label>' +
      '<select id="dr-job" name="jobId" required data-change="catalogue.discountJobChanged">' +
      jobOptions.map(function (op) {
        return '<option value="' + E(op.value) + '"' + (String(op.value) === String(draft.jobId) ? ' selected' : '') + '>' +
          E(op.label) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label for="dr-line">Labour line <span class="req" aria-hidden="true">*</span></label>' +
      '<select id="dr-line" name="lineKey" required data-change="catalogue.discountChanged">' +
      lineOptions.map(function (op) {
        return '<option value="' + E(op.value) + '"' + (String(op.value) === String(draft.lineKey) ? ' selected' : '') + '>' +
          E(op.label) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label for="dr-percent">Requested discount (%) <span class="req" aria-hidden="true">*</span></label>' +
      '<input type="number" id="dr-percent" name="percent" min="1" max="100" step="1" value="' + E(draft.percent) + '" ' +
      'required data-live="catalogue.discountChanged"></div>' +
      '<div class="field"><label for="dr-reason">Reason <span class="req" aria-hidden="true">*</span></label>' +
      '<textarea id="dr-reason" name="reason" required data-live="catalogue.discountChanged">' + E(draft.reason || '') +
      '</textarea></div>' +
      '</div>' +
      '<p class="note" id="dr-preview">Choose a labour line to see the amounts.</p>' +
      '<div class="form-actions"><button type="submit" class="btn btn-primary">Submit discount request</button></div>' +
      '</form>' +
      '<p class="note">A manual discount applies to labour only. A Manager may approve 10% or less; anything above ' +
      '10% needs the Owner. A manual discount never stacks on a line that already carries an automatic promotion, ' +
      'and it never applies to parts or oil.</p>' +
      '<p class="note">Everything on this screen is a simulated decision. No money moves and no customer is contacted.</p>';

    return UI.card({
      title: 'New discount request',
      subtitle: 'Request a labour discount against an open, unpaid quote.',
      body: body
    });
  }

  function discountRequestsCard(ctx) {
    const managerial = ctx.role === 'Owner' || ctx.role === 'Manager';
    const owner = ctx.role === 'Owner';
    const requests = ctx.state.discountRequests || [];
    const rows = requests.map(function (r) {
      const job = Store.job(r.jobId);
      let actions = '<span class="muted">—</span>';
      if (r.status === 'Pending') {
        if (managerial) {
          /* A Manager may not self-approve above 10% — only the Owner can. */
          const approve = (r.percent > 10 && !owner)
            ? '<span class="muted">Owner approval required above 10%</span> '
            : UI.btn('Approve', { variant: 'primary', action: 'catalogue.approveDiscount', attrs: { requestId: r.id } }) + ' ';
          actions = approve + UI.btn('Reject', { variant: 'secondary', action: 'catalogue.rejectDiscount', attrs: { requestId: r.id } });
        } else {
          actions = '<span class="muted">Waiting for a Manager</span>';
        }
      } else if (r.status === 'Approved') {
        if (managerial && !r.appliedQuoteVersion) {
          actions = UI.btn('Apply to quote', { variant: 'primary', action: 'catalogue.applyDiscount', attrs: { requestId: r.id } });
        } else if (r.appliedQuoteVersion) {
          actions = '<span class="muted">Applied as quote v' + E(r.appliedQuoteVersion) + '</span>';
        } else {
          actions = '<span class="muted">Awaiting a Manager to apply it</span>';
        }
      }
      return {
        cells: [
          { html: '<span class="mono">' + E(r.id) + '</span>' },
          { html: E(r.jobId) + (job ? '<br><span class="muted small">' + E((Store.vehicle(job.vehicleId) || {}).plate || '') + '</span>' : '') },
          { html: E(r.label) + '<br><span class="muted small">quote v' + E(r.quoteVersion === null || r.quoteVersion === undefined ? '—' : r.quoteVersion) + '</span>' },
          { html: '<span class="mono">' + E(Util.mmk(r.regularMMK)) + '</span>' },
          { html: '<span class="mono">' + E(r.percent) + '%</span>' },
          { html: '<span class="mono">' + E(Util.mmk(r.discountMMK)) + '</span>' },
          { html: '<span class="mono">' + E(Util.mmk(r.finalMMK)) + '</span>' },
          { html: E(Store.staffName(r.requestedBy)) + '<br><span class="muted small">' + E(Util.fmtDateTime(r.requestedAt)) + '</span>' },
          { html: UI.badge(r.status, r.status === 'Rejected' ? 'red' : UI.toneFor(r.status)) },
          { html: r.approver ? E(Store.staffName(r.approver)) + '<br><span class="muted small">' + E(Util.fmtDateTime(r.approvedAt)) + '</span>' : '—' },
          { html: r.decisionReason ? E(r.decisionReason) + '<br><span class="muted small">' + E(r.reason) + '</span>' : E(r.reason) },
          { html: actions }
        ]
      };
    });

    const body = UI.table({
      label: 'Discount requests',
      head: ['Request', 'Job', 'Labour line', 'Regular (MMK)', 'Percent', 'Discount (MMK)', 'Final (MMK)',
        'Requested by', 'Status', 'Approver', 'Reason', 'Actions'],
      empty: 'No discount requests yet. Submit one above to see the approval flow.',
      rows: rows
    }) +
      '<p class="note">Applying an approved discount to an already approved quote creates a new quote version for ' +
      'review — the authorised price is never edited silently. A new version above the 50,000 MMK repair basis waits ' +
      'for customer approval on S08.</p>';

    return UI.card({
      title: 'Discount requests',
      subtitle: requests.length + ' request(s) recorded.',
      body: body
    });
  }
    /* ---------------- tabs ---------------- */
  function tabsFor(ctx) {
    const managerial = ctx.role === 'Owner' || ctx.role === 'Manager';
    return managerial
      ? [
        { id: 'services', label: 'Services' },
        { id: 'promotions', label: 'Promotions' },
        { id: 'requests', label: 'Discount requests' }
      ]
      : [{ id: 'requests', label: 'Discount requests' }];
  }

  function activeTab(ctx) {
    const allowed = tabsFor(ctx).map(function (t) { return t.id; });
    const wanted = String((ctx.params && ctx.params.tab) || ctx.state.catalogueTab || '');
    const active = allowed.indexOf(wanted) >= 0 ? wanted : allowed[0];
    if (ctx.state.catalogueTab !== active) ctx.state.catalogueTab = active;
    return active;
  }

  global.DolphinViews = global.DolphinViews || {};
  global.DolphinViews.S15 = {
    render: function (ctx) {
      const managerial = ctx.role === 'Owner' || ctx.role === 'Manager';
      const active = activeTab(ctx);

      let body;
      if (active === 'services') {
        body = servicesCard(ctx);
      } else if (active === 'promotions') {
        body = promotionsCard(ctx) + promotionPreviewCard(ctx);
      } else {
        body = discountRequestForm(ctx) + discountRequestsCard(ctx);
      }

      const head = UI.pageHeader({
        title: 'Catalogue, promotions and discount requests',
        subtitle: 'Service prices, promotions and manual labour discounts for the workshop. The demo clock is ' +
          'fixed at ' + Util.fmtDateTime(Store.now()) + '.',
        actions: managerial ? '' : '<span class="muted small">Cashier view — requests only</span>'
      });

      const banner = UI.banner('plain', 'Simulated demo data',
        'Catalogue prices, promotions and discount decisions are fictional demo records held in memory only. ' +
        'No money is charged, no customer is contacted and no supplier is involved.');

      return head + banner + UI.tabs(tabsFor(ctx), active, 'catalogue') + body;
    },
    mount: function (root, ctx) {
      /* The amounts preview is written into the DOM by the action helper so the
         numbers always come from the rules, never from a typed-in figure. */
      if (global.DolphinCatalogue && global.DolphinCatalogue.updateDiscountPreview) {
        global.DolphinCatalogue.updateDiscountPreview();
      }
    }
  };
})(window);
