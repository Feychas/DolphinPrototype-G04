/* S07 — Inspection and quotation */
(function (global) {
  'use strict';
  const E = Util.esc;
  global.DolphinViews = global.DolphinViews || {};

  function servicePrice(service, size) {
    if (service.fixedPriceMMK !== null && service.fixedPriceMMK !== undefined) return service.fixedPriceMMK;
    return (service.priceBySizeMMK && service.priceBySizeMMK[size] !== undefined) ? service.priceBySizeMMK[size] : 0;
  }

  function seedLines(job) {
    const vehicle = Store.vehicle(job.vehicleId);
    const size = job.size || (vehicle ? vehicle.size : 'M');
    const lines = [];
    (job.requestedServiceIds || []).forEach(function (sid) {
      const s = Store.service(sid);
      if (!s) return;
      const regular = servicePrice(s, size);
      const promo = Rules.bestPromotion(Store.state.promotions || [], s.id, size, Util.dayKey(Store.state.demoNow), regular);
      const price = promo ? Rules.promotionFinal(promo, regular) : regular;
      lines.push({
        id: 'Q1-L' + (lines.length + 1), kind: 'service', label: s.nameEN, serviceId: s.id,
        quantity: 1, unitPriceMMK: price, discountMMK: 0, totalMMK: price, repair: !!s.isRepairForDemo,
        regularPriceMMK: regular,
        promotionId: promo ? promo.id : null,
        promotionType: promo ? promo.type : null,
        promotionValue: promo ? promo.value : null
      });
    });
    return lines;
  }

  /* Create the temporary draft when the job has no quote yet. Never merge presets:
     the draft lives only in this browser session and is discarded on Cancel/Reset. */
  function ensureDraft(job) {
    const d = global.__dolphinDraft;
    if (d && d.jobId === job.id) return d;
    if ((job.quotes || []).length) return null;
    if (Rules.isPricedRedo(job)) return null;   /* the Manager already set the price */
    const draft = {
      jobId: job.id, version: 1, isExtraWork: false,
      vehicleId: job.vehicleId, size: job.size,
      lines: seedLines(job), inspectionNotes: '', draftSaved: false
    };
    global.__dolphinDraft = draft;
    return draft;
  }

  global.DolphinViews.S07 = {
    render: function (ctx) {
      const job = Store.job(ctx.params.jobId);
      if (!job) {
        return UI.pageHeader({ title: 'Inspection and quotation' }) +
          UI.card({ title: 'No job selected', body: '<div class="empty-state"><p>Open a job first.</p>' +
            UI.btn('Go to jobs', { action: 'nav', variant: 'primary', attrs: { nav: 'S06' } }) + '</div>' });
      }
      const vehicle = Store.vehicle(job.vehicleId);
      const customer = vehicle ? Store.customer(vehicle.customerId) : null;
      const draft = ensureDraft(job);
      const latest = Store.latestQuote(job);

      let out = UI.pageHeader({
        title: 'Inspection and quotation',
        subtitle: job.id + ' · ' + (vehicle ? vehicle.plate : '') + ' · ' + (customer ? customer.name : ''),
        actions: UI.btn('Back to job', { action: 'nav', variant: 'secondary', attrs: { nav: 'S06', params: JSON.stringify({ jobId: job.id }) } })
      });

      if (job.lifecycleStatus === 'Cancelled') {
        out += UI.banner('danger', 'This job is cancelled', 'A cancelled job cannot be quoted. The original records are kept.');
        return out;
      }

      if (!draft) {
        if (Rules.isPricedRedo(job)) {
          /* a Redo has an explicit Manager price — there is nothing to quote */
          out += UI.banner('plain', 'This Redo has a Manager-set price',
            'The price of a Redo is set by the Manager when the comeback job is created. ' +
            'No customer quote is prepared for it.');
          out += UI.card({
            title: 'Redo price',
            body: UI.dl([
              ['Linked original', job.redoOfJobId],
              ['Manager-set price', Util.mmk(job.managerSetRedoChargeMMK) + ' MMK'],
              ['Work status', job.workStatus],
              ['Payment', job.paymentStatus]
            ]) + '<p class="note">The work, the bay and the checklist follow the normal job flow. ' +
              'The Redo settles separately from the original job and never earns commission.</p>'
          });
          return out;
        }
        out += bannerFor(job, latest);
        out += UI.card({
          title: 'Submitted versions',
          subtitle: 'Submitted versions are frozen. An edit creates a new version that has to be approved again.',
          body: UI.table({
            label: 'Quote versions',
            head: ['Version', 'Type', 'Status', 'Total', 'Approval basis', 'Decision', 'Submitted'],
            rows: (job.quotes || []).map(function (q) {
              const t = Rules.quoteTotals(q);
              return [
                'v' + q.version,
                q.isExtraWork ? 'Extra work' : 'Initial',
                { html: UI.statusBadge(q.status) },
                { html: Util.mmk(t.totalMMK), className: 'num' },
                { html: Util.mmk(t.repairApprovalBasisMMK), className: 'num' },
                q.approval ? E(q.approval.decision) + '<br><span class="muted small">' + E(q.approval.channel || '') + '</span>' : 'Not recorded',
                E(Util.fmtDateTime(q.submittedAt))
              ];
            })
          })
        });
        if (latest) {
          out += UI.card({
            title: 'Version v' + latest.version + ' detail',
            body: quoteBody(latest, job)
          });
        }
        if (job.paymentStatus === 'Paid' || job.paymentStatus === 'No charge') {
          out += UI.banner('plain', 'The price of this job is settled',
            'The charged lines are locked. A change needs a reasoned correction on ' +
            UI.link('Daily closing → Corrections', 'S17', { tab: 'corrections' }) +
            ' so the original receipt and payment stay in the record.');
        } else {
          out += '<div class="action-bar">' +
            UI.btn('Prepare a new version', { action: 'quote.newVersion', variant: 'primary', icon: 'plus', attrs: { jobId: job.id } }) +
            '</div>';
        }
        return out;
      }

      /* ---------------- draft editor ---------------- */
      out += '<div class="grid-2">';
      out += '<div>';

      out += UI.card({
        title: 'Quote draft v' + draft.version + (draft.isExtraWork ? ' (extra work)' : ''),
        subtitle: draft.baseVersion
          ? 'Prepared on top of v' + draft.baseVersion + '. The earlier scope stays visible and usable.'
          : 'Add or remove lines before submitting. Quoting never reduces stock.',
        body: '<form id="quote-form" data-form="quote.submit">' +
          '<div class="field"><label for="q-notes">Inspection notes <span class="req" aria-hidden="true">*</span></label>' +
          '<textarea id="q-notes" name="inspectionNotes" rows="3" data-live="quote.notes">' + E(draft.inspectionNotes || '') + '</textarea>' +
          '<p class="field-hint">Describe what was found. The notes are saved with the version.</p></div>' +
          '</form>' +
          linesTable(draft, job)
      });

      out += UI.card({
        title: 'Add a service line',
        subtitle: 'Catalogue prices come from the demo catalogue. One automatic promotion may apply per service line.',
        body: UI.table({
          label: 'Catalogue services',
          head: ['Service', 'Size price', 'Promotion', ''],
          rows: (Store.state.services || []).filter(s => s.active).map(function (s) {
            const regular = servicePrice(s, job.size);
            const promo = Rules.bestPromotion(Store.state.promotions || [], s.id, job.size, Util.dayKey(Store.state.demoNow), regular);
            return [
              E(Store.state.language === 'MM' && s.nameMM ? s.nameMM : s.nameEN),
              { html: Util.mmk(regular), className: 'num' },
              promo ? E(promo.id + ' → ' + Util.mmk(Rules.promotionFinal(promo, regular))) : '<span class="muted">None</span>',
              { html: UI.btn('Add', { action: 'quote.addService', variant: 'secondary', attrs: { serviceId: s.id } }) }
            ];
          })
        })
      });

      out += UI.card({
        title: 'Add shop material',
        subtitle: 'A quoted material is not stock movement. Stock only moves on an explicit issue in Job materials.',
        body: UI.table({
          label: 'Shop items',
          head: ['Item', 'On hand', 'Unit', 'Sell price', ''],
          rows: (Store.state.items || []).map(function (i) {
            return [
              E(i.name),
              { html: E(String(i.onHand)), className: 'num' },
              E(i.unit),
              { html: i.sellPriceMMK === null || i.sellPriceMMK === undefined ? 'No sale price' : Util.mmk(i.sellPriceMMK), className: 'num' },
              { html: UI.btn('Add', { action: 'quote.addShopMaterial', variant: 'secondary', attrs: { itemId: i.id } }) }
            ];
          })
        })
      });

      out += UI.card({
        title: 'Add customer-supplied material',
        subtitle: 'Customer-supplied material is described but never charged and never reduces shop stock.',
        body: '<p class="note">Example: oil-change labour 15,000 MMK plus a zero-charge customer-oil description of four liters. ' +
          'The four liters are not a shop sale and create no stock movement.</p>' +
          '<div class="action-bar">' +
          UI.btn('Add customer-supplied oil (4 liters, no charge)', { action: 'quote.addCustomerMaterial', variant: 'secondary', icon: 'plus' }) +
          '</div>'
      });

      out += UI.card({
        title: 'Add other labour',
        subtitle: 'Use a free description for work that is not in the catalogue, such as additional repair labour.',
        body: '<form data-form="quote.addCustomLine">' +
          '<div class="form-grid">' +
          UI.field({ id: 'q-cl-desc', name: 'label', label: 'Description', required: true, value: 'Additional brake labour' }) +
          UI.field({ id: 'q-cl-price', name: 'unitPriceMMK', label: 'Unit price (MMK)', type: 'number', min: 0, step: 1, required: true, value: 1000 }) +
          UI.field({ id: 'q-cl-qty', name: 'quantity', label: 'Quantity', type: 'number', min: 1, step: 1, required: true, value: 1 }) +
          '</div>' +
          '<div class="form-actions">' + UI.btn('Add labour line', { variant: 'primary', icon: 'plus', type: 'submit' }) + '</div>' +
          '</form>'
      });

      out += '</div>';

      /* right column */
      out += '<div>';
      const totals = Rules.totals(draft.lines, 0);
      const basis = Rules.approvalBasis(draft.lines);
      const needs = Rules.approvalRequired(basis);

      out += UI.card({
        title: 'Totals',
        body: UI.dl([
          ['Subtotal', Util.mmk(totals.subtotalMMK) + ' MMK'],
          ['Manual discount', Util.mmk(totals.discountMMK) + ' MMK'],
          ['Rounding to nearest 100', Util.mmk(totals.roundingMMK) + ' MMK'],
          ['Final payable', '<strong>' + Util.mmk(totals.totalMMK) + ' MMK</strong>', true],
          ['Approval basis (repair labour + related parts)', Util.mmk(basis) + ' MMK']
        ]) +
          (needs
            ? '<div class="banner banner-warn" style="margin-top:12px">' + UI.icon('info', 18) +
              '<div><strong>Approval required.</strong> The repair subtotal of ' + Util.mmk(basis) +
              ' MMK is above the 50,000 MMK threshold. Submitting freezes this version as Pending and the Cashier records the customer decision.</div></div>'
            : '<div class="banner banner-plain" style="margin-top:12px">' + UI.icon('info', 18) +
              '<div><strong>Approval not required.</strong> The repair subtotal of ' + Util.mmk(basis) +
              ' MMK is at or below 50,000 MMK, so the version is approved automatically when it is submitted.</div></div>')
      });

      if (draft.baseVersion) {
        const prev = job.quotes.filter(q => q.version === draft.baseVersion)[0];
        if (prev) {
          out += UI.card({
            title: 'Prior scope',
            subtitle: 'The earlier version stays valid until a new version is approved.',
            body: UI.dl([
              ['Prior version', 'v' + prev.version + ' · ' + prev.status],
              ['Prior total', Util.mmk(prev.totalMMK) + ' MMK'],
              ['Revised total', Util.mmk(totals.totalMMK) + ' MMK'],
              ['Difference', Util.mmk(totals.totalMMK - prev.totalMMK) + ' MMK']
            ]) + '<p class="note">Material already issued under the earlier version stays issued. Accepting this version does not issue it again.</p>'
          });
        }
      }

      out += UI.card({
        title: 'Already issued material',
        subtitle: 'Issued material is not re-issued by a new quote version.',
        body: UI.table({
          label: 'Issued material for this job',
          head: ['Item', 'Qty', 'Unit price'],
          rows: (job.materialIssues || []).map(function (iss) {
            const item = Store.item(iss.itemId);
            return [
              E(item ? item.name : iss.itemId),
              E(iss.quantity + ' ' + iss.unit),
              { html: Util.mmk(iss.unitPriceMMK), className: 'num' }
            ];
          }),
          empty: 'Nothing has been issued to this job yet.'
        })
      });

      out += UI.card({
        title: 'Actions',
        body: '<p class="note">' + (draft.draftSaved ? 'A draft was saved in this session. It is temporary and disappears on Reset.' : 'Nothing has been saved yet.') + '</p>' +
          '<div class="stack-sm">' +
          UI.btn('Save draft', { action: 'quote.saveDraft', variant: 'secondary', icon: 'save' }) +
          UI.btn('Submit quote v' + draft.version, { variant: 'primary', icon: 'check', type: 'submit', form: 'quote-form' }) +
          UI.btn('Cancel', { action: 'quote.cancel', variant: 'quiet', attrs: { jobId: job.id } }) +
          '</div>' +
          '<p class="note">Submitting freezes version ' + draft.version + '. It cannot be edited afterwards — a change needs a new version.</p>'
      });

      out += '</div></div>';
      return out;
    }
  };

  function bannerFor(job, latest) {
    if (!latest) return '';
    if (latest.status === 'Pending') {
      return UI.banner('warn', 'Version v' + latest.version + ' is waiting for the customer decision',
        'The Cashier or a Manager records the decision on the Customer approval screen. ' +
        UI.link('Open customer approval', 'S08', { jobId: job.id }) + '.');
    }
    if (latest.status === 'Declined') {
      return UI.banner('danger', 'Version v' + latest.version + ' was declined',
        'A declined version cannot start work. A new proposal is needed as a further version.');
    }
    return UI.banner('plain', 'Version v' + latest.version + ' is ' + latest.status.toLowerCase(),
      'Submitting a new version creates v' + (latest.version + 1) + ' and keeps the approved scope until the new version is approved.');
  }

  function linesTable(draft, job) {
    if (!draft.lines.length) {
      return '<div class="empty-state"><p>No lines yet. Add a service, shop material or other labour below.</p></div>';
    }
    return '<div class="table-scroll"><table class="data-table"><caption class="sr-only">Quote lines</caption>' +
      '<thead><tr><th scope="col">Description</th><th scope="col">Source</th><th scope="col">Qty</th>' +
      '<th scope="col">Unit price</th><th scope="col">Amount</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead><tbody>' +
      draft.lines.map(function (l, i) {
        const src = l.kind === 'customerMaterial' || l.source === 'Customer' ? 'Customer-supplied'
          : l.kind === 'part' || l.kind === 'oil' ? 'Shop stock' : 'Labour / service';
        const promo = l.promotionId ? '<br><span class="muted small">Promotion ' + E(l.promotionId) + ' applied (' + E(String(l.promotionType)) + ')</span>' : '';
        return '<tr>' +
          '<td><label class="sr-only" for="ql-' + i + '">Description of line ' + (i + 1) + '</label>' +
          '<span id="ql-' + i + '">' + E(Store.serviceLabel(l)) + '</span>' + promo + '</td>' +
          '<td>' + E(src) + '</td>' +
          '<td><label class="sr-only" for="qq-' + i + '">Quantity for ' + E(Store.serviceLabel(l)) + '</label>' +
          '<input id="qq-' + i + '" class="input-mini" type="number" min="0.01" step="' + (l.kind === 'oil' || l.unit === 'liter' ? '0.01' : '1') + '" value="' + E(String(l.quantity)) + '" data-live="quote.lineQty" data-index="' + i + '"></td>' +
          '<td><label class="sr-only" for="qp-' + i + '">Unit price for ' + E(Store.serviceLabel(l)) + '</label>' +
          '<input id="qp-' + i + '" class="input-mini" type="number" min="0" step="1" value="' + E(String(l.unitPriceMMK)) + '" data-live="quote.linePrice" data-index="' + i + '"></td>' +
          '<td class="num">' + Util.mmk(Rules.lineGross(l)) + '</td>' +
          '<td>' + UI.btn('Remove', { action: 'quote.removeLine', variant: 'quiet', attrs: { index: i } }) + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function quoteBody(q, job) {
    const t = Rules.quoteTotals(q);
    return UI.table({
      label: 'Quote lines of version ' + q.version,
      head: ['Description', 'Kind', 'Qty', 'Unit price', 'Amount'],
      rows: (q.lines || []).map(function (l) {
        return [
          E(Store.serviceLabel(l)),
          E(l.kind),
          E(l.quantity),
          { html: Util.mmk(l.unitPriceMMK), className: 'num' },
          { html: Util.mmk(Rules.lineGross(l)), className: 'num' }
        ];
      })
    }) +
      '<div class="detail-list">' +
      '<div class="detail-row"><span>Subtotal</span><span>' + Util.mmk(t.subtotalMMK) + ' MMK</span></div>' +
      '<div class="detail-row"><span>Rounding</span><span>' + Util.mmk(t.roundingMMK) + ' MMK</span></div>' +
      '<div class="detail-row"><span>Total</span><span><strong>' + Util.mmk(t.totalMMK) + ' MMK</strong></span></div>' +
      '</div>' +
      (q.inspectionNotes ? '<p class="note">Inspection notes: ' + E(q.inspectionNotes) + '</p>' : '');
  }
})(window);
