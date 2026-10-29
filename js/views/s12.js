/* S12 — Receipts, payment, collection and closure */
(function (global) {
  'use strict';
  const E = Util.esc;
  global.DolphinViews = global.DolphinViews || {};

  global.DolphinViews.S12 = {
    render: function (ctx) {
      const jobId = ctx.params.jobId;
      if (jobId && Store.job(jobId)) return jobView(ctx, Store.job(jobId));
      return listView(ctx);
    }
  };

  /* ---------------- list ---------------- */
  function listView(ctx) {
    const state = ctx.state;
    const tab = ctx.params.tab || 'unpaid';
    const receipts = state.receipts || [];
    const previews = state.jobs.filter(function (j) {
      return j.workStatus === 'Completed' && !Store.jobReceipt(j.id) && j.lifecycleStatus === 'Open';
    });

    let out = UI.pageHeader({
      title: 'Receipts and payment',
      subtitle: 'Every amount is a demo amount. No real bank, wallet or QR integration is connected.'
    });

    out += UI.tabs([
      { id: 'unpaid', label: 'Unpaid previews' },
      { id: 'issued', label: 'Issued receipts' }
    ], tab, 'receipts');

    if (tab === 'issued') {
      out += UI.card({
        title: 'Issued receipts',
        subtitle: 'A receipt number is issued once. A reprint is a COPY of the same number.',
        body: receipts.length ? UI.table({
          label: 'Issued receipts',
          head: ['Receipt', 'Job', 'Vehicle', 'Total', 'Issued', ''],
          rows: receipts.map(function (r) {
            const job = Store.job(r.jobId);
            const vehicle = job ? Store.vehicle(job.vehicleId) : null;
            return [
              { html: UI.link(r.id, 'S12', { jobId: r.jobId }) },
              E(r.jobId),
              E(vehicle ? vehicle.plate : '—'),
              { html: Util.mmk(r.totalMMK), className: 'num' },
              E(Util.fmtDateTime(r.issuedAt)),
              {
                html: UI.btn('Print', { action: 'receipt.print', variant: 'quiet' }) +
                  UI.btn('Reprint COPY', { action: 'receipt.reprint', variant: 'quiet', attrs: { receiptId: r.id } }) +
                  UI.btn('Share', { action: 'receipt.share', variant: 'quiet', attrs: { receiptId: r.id } })
              }
            ];
          })
        }) : '<div class="empty-state"><p>No receipt has been issued in this session.</p></div>'
      });
      return out;
    }

    out += UI.card({
      title: 'Unpaid previews',
      subtitle: 'A completed job with no receipt yet. The preview is unnumbered until the payment is posted.',
      body: previews.length ? UI.table({
        label: 'Unpaid receipt previews',
        head: ['Job', 'Vehicle', 'Customer', 'Payable', 'Bay', ''],
        rows: previews.map(function (j) {
          const vehicle = Store.vehicle(j.vehicleId);
          const customer = vehicle ? Store.customer(vehicle.customerId) : null;
          const t = Rules.jobTotals(j);
          return [
            { html: UI.link(j.id, 'S06', { jobId: j.id }) },
            E(vehicle ? vehicle.plate : '—'),
            E(customer ? customer.name : '—'),
            { html: Util.mmk(t.totalMMK), className: 'num' },
            'Released',
            { html: UI.btn('Settle', { action: 'receipt.pay', variant: 'primary', attrs: { jobId: j.id } }) }
          ];
        })
      }) : '<div class="empty-state"><p>No completed job is waiting for a payment.</p></div>'
    });

    out += UI.card({
      title: 'Payments posted',
      body: UI.table({
        label: 'Payments',
        head: ['Payment', 'Receipt', 'Job', 'Method', 'Applied', 'Tendered', 'Change', 'Reference', 'Posted'],
        rows: (state.payments || []).map(function (p) {
          return [
            E(p.id),
            E(p.receiptId),
            E(p.jobId),
            E(p.method),
            { html: Util.mmk(p.amountAppliedMMK), className: 'num' },
            { html: p.cashTenderedMMK === null || p.cashTenderedMMK === undefined ? '—' : Util.mmk(p.cashTenderedMMK), className: 'num' },
            { html: p.changeMMK ? Util.mmk(p.changeMMK) : '—', className: 'num' },
            E(p.reference || '—'),
            E(Util.fmtDateTime(p.at))
          ];
        }),
        empty: 'No payment has been posted in this session.'
      })
    });

    return out;
  }

  /* ---------------- one job ---------------- */
  function jobView(ctx, job) {
    const state = ctx.state;
    const vehicle = Store.vehicle(job.vehicleId);
    const customer = vehicle ? Store.customer(vehicle.customerId) : null;
    const receipt = Store.jobReceipt(job.id);
    const payment = Store.jobPayment(job.id);
    const manager = ctx.role === 'Owner' || ctx.role === 'Manager';
    const totals = Rules.jobTotals(job);

    let out = UI.pageHeader({
      title: 'Receipt and settlement',
      subtitle: job.id + ' · ' + (vehicle ? vehicle.plate : '') + ' · ' + (customer ? customer.name : ''),
      actions: UI.btn('Back to receipts', { action: 'nav', variant: 'secondary', attrs: { nav: 'S12' } })
    });

    out += UI.chips([
      { label: 'Work', value: job.workStatus, tone: job.workStatus === 'Completed' ? 'green' : 'orange' },
      { label: 'Payment', value: job.paymentStatus, tone: job.paymentStatus === 'Paid' ? 'green' : job.paymentStatus === 'No charge' ? 'green' : 'orange' },
      { label: 'Collection', value: job.collectionStatus, tone: job.collectionStatus === 'Collected' ? 'green' : 'orange' }
    ]);

    if (job.workStatus !== 'Completed') {
      out += UI.banner('plain', 'The repair is not completed yet',
        'A receipt can only be issued for a completed job. The bay is released the moment the repair is completed, even while the payment is still open.');
    }

    out += '<div class="grid-2">';
    out += '<div>';

    if (receipt) {
      out += UI.card({
        title: 'Receipt ' + receipt.id,
        subtitle: 'Issued ' + Util.fmtDateTime(receipt.issuedAt) + ' · Demo receipt, not a tax invoice',
        body: receiptPaper(receipt, job)
      });
    } else {
      out += UI.card({
        title: 'Draft receipt (not yet numbered)',
        subtitle: 'The number is issued only when the payment is posted.',
        body: receiptPaper({
          id: null, issuedAt: null,
          lines: totals.lines, subtotalMMK: totals.subtotalMMK,
          discountMMK: totals.discountMMK, roundingMMK: totals.roundingMMK, totalMMK: totals.totalMMK
        }, job)
      });
    }

    if (payment) {
      out += UI.card({
        title: 'Payment',
        body: UI.dl([
          ['Payment', payment.id],
          ['Method', payment.method],
          ['Applied', Util.mmk(payment.amountAppliedMMK) + ' MMK'],
          ['Cash tendered', payment.cashTenderedMMK === null || payment.cashTenderedMMK === undefined ? '—' : Util.mmk(payment.cashTenderedMMK) + ' MMK'],
          ['Change given', payment.changeMMK ? Util.mmk(payment.changeMMK) + ' MMK' : '—'],
          ['Wallet reference', payment.reference || '—'],
          ['Verified (demo)', payment.verified ? 'Yes' : 'No'],
          ['Posted', Util.fmtDateTime(payment.at)]
        ])
      });
    }

    out += '</div><div>';

    /* settlement panel */
    if (!receipt) {
      if (job.workStatus === 'Completed') {
        if (totals.totalMMK > 0) {
          out += UI.card({
            title: 'Record the full payment',
            subtitle: 'Only a full payment is accepted. A part payment is refused and nothing is posted.',
            body: '<form data-form="payment.record" data-job-id="' + E(job.id) + '" data-payable="' + totals.totalMMK + '">' +
              '<div class="field"><label for="pay-method">Method <span class="req" aria-hidden="true">*</span></label>' +
              '<select id="pay-method" name="method" required data-change="payment.method">' +
              '<option value="">Choose a method</option>' +
              '<option value="Cash">Cash</option>' +
              '<option value="KBZPay">KBZPay (simulated)</option>' +
              '<option value="WavePay">WavePay (simulated)</option>' +
              '</select></div>' +
              '<div class="field" id="pay-cash-block"><label for="pay-tendered">Cash tendered (MMK) <span class="req" aria-hidden="true">*</span></label>' +
              '<input type="number" id="pay-tendered" name="tenderedMMK" min="0" step="1" value="' +
              (totals.totalMMK) + '" data-live="payment.preview">' +
              '<p class="field-hint">The tendered amount has to cover the full payable of ' + Util.mmk(totals.totalMMK) + ' MMK.</p></div>' +
              '<div class="field" id="pay-wallet-block" hidden><label for="pay-ref">Transfer reference <span class="req" aria-hidden="true">*</span></label>' +
              '<input type="text" id="pay-ref" name="reference" placeholder="DEMO-KBZ-002">' +
              '<p class="field-hint">A demo reference only. No transfer is performed.</p></div>' +
              '<div class="field" id="pay-verify-block" hidden><label class="check">' +
              '<input type="checkbox" name="verified"> <span>Verified (demo)</span></label></div>' +
              '<div id="pay-preview" class="banner banner-plain"></div>' +
              '<div class="form-actions">' + UI.btn('Post payment', { variant: 'primary', icon: 'check', type: 'submit' }) + '</div>' +
              '</form>'
          });
        } else {
          out += UI.card({
            title: 'Zero-charge job',
            subtitle: 'A Redo with a Manager-set price of zero settles without a cash transfer.',
            body: '<p>The payable amount is 0 MMK. A zero receipt is created and no payment row is manufactured.</p>' +
              '<div class="action-bar">' +
              UI.btn('Settle as no charge', { action: 'receipt.settleNoCharge', variant: 'primary', attrs: { jobId: job.id } }) +
              '</div>'
          });
        }
      }
    } else {
      out += UI.card({
        title: 'Receipt actions',
        body: '<p class="note">The price lines of an issued receipt are locked. A change needs a Manager correction in Daily closing.</p>' +
          '<div class="stack-sm">' +
          UI.btn('Print', { action: 'receipt.print', variant: 'secondary', icon: 'print' }) +
          UI.btn('Reprint COPY', { action: 'receipt.reprint', variant: 'secondary', attrs: { receiptId: receipt.id } }) +
          UI.btn('Share preview', { action: 'receipt.share', variant: 'quiet', attrs: { receiptId: receipt.id } }) +
          (manager ? UI.link('Corrections', 'S17', { tab: 'corrections', jobId: job.id }) : '') +
          '</div>'
      });
    }

    /* collection + closure */
    const canCollect = Rules.jobIsSettled(job) && job.collectionStatus !== 'Collected';
    const closeCheck = Rules.canClose(job);
    out += UI.card({
      title: 'Collection and closure',
      body: UI.dl([
        ['Collection', job.collectionStatus + (job.collectedAt ? ' · ' + Util.fmtDateTime(job.collectedAt) : '')],
        ['Job state', job.lifecycleStatus],
        ['Closed at', job.closedAt ? Util.fmtDateTime(job.closedAt) : '—'],
        ['Next service plan', job.nextServiceDueDate || job.nextServiceDueMileageKm
          ? (job.nextServiceDueDate ? job.nextServiceDueDate : '') + (job.nextServiceDueMileageKm ? ' · ' + job.nextServiceDueMileageKm + ' km' : '')
          : 'Not set']
      ]) +
        '<div class="stack-sm" style="margin-top:12px">' +
        (canCollect
          ? UI.btn('Mark collected', { action: 'receipt.collect', variant: 'primary', icon: 'checkCircle', attrs: { jobId: job.id } })
          : '<p class="note">' + (job.collectionStatus === 'Collected'
            ? 'The vehicle was handed over.'
            : 'The vehicle can be collected only after the balance is settled.') + '</p>') +
        (job.lifecycleStatus === 'Open'
          ? UI.btn('Close job', { action: 'receipt.close', variant: 'secondary', attrs: { jobId: job.id } })
          : '') +
        '</div>' +
        (!closeCheck.ok && job.lifecycleStatus === 'Open'
          ? '<p class="note">Not closable yet: ' + E(closeCheck.reasons.join('; ')) + '.</p>'
          : '')
    });

    out += UI.card({
      title: 'How settlement works here',
      body: '<ul class="stack-sm">' +
        '<li>• Only a full payment is accepted; the change is the difference between the tendered and the applied amount.</li>' +
        '<li>• A wallet payment needs a demo reference and the “Verified (demo)” tick.</li>' +
        '<li>• A zero-charge job gets a zero receipt and no payment row.</li>' +
        '<li>• The vehicle is collected after settlement and the job is closed after completion, settlement and collection.</li>' +
        '<li>• An issued receipt keeps its prices; a change is a correction, not an edit.</li>' +
        '</ul>'
    });

    out += '</div></div>';
    return out;
  }

  function receiptPaper(rc, job) {
    const vehicle = Store.vehicle(job.vehicleId);
    const customer = vehicle ? Store.customer(vehicle.customerId) : null;
    let out = '<div class="receipt-paper">' +
      '<div class="rp-head"><strong>Dolphin AutoTrack</strong> — Receipt <span class="copy-label">DEMO</span><br>' +
      '<span class="muted small">' + (rc.id ? E(rc.id) : 'Draft — no number yet') +
      (rc.issuedAt ? ' · ' + E(Util.fmtDateTime(rc.issuedAt)) : '') + '</span></div>' +
      '<div class="muted small">' + E(job.id) + (vehicle ? ' · ' + E(vehicle.plate) : '') +
      (customer ? ' · ' + E(customer.name) : '') + '</div>';

    out += rc.lines.map(function (l) {
      const src = l.kind === 'part' || l.kind === 'oil' ? ' (shop material)' : (l.source === 'Customer' ? ' (customer-supplied)' : '');
      return '<div class="preview-row"><span>' + E(Store.serviceLabel(l)) + src + ' × ' + E(String(l.quantity)) + '</span>' +
        '<span>' + E(Util.mmk(l.totalMMK)) + '</span></div>';
    }).join('');

    out += '<div class="preview-row"><span>Subtotal</span><span>' + Util.mmk(rc.subtotalMMK) + '</span></div>';
    if (rc.discountMMK) out += '<div class="preview-row"><span>Discount</span><span>−' + Util.mmk(rc.discountMMK) + '</span></div>';
    out += '<div class="preview-row"><span>Rounding to nearest 100</span><span>' + Util.mmk(rc.roundingMMK) + '</span></div>';
    out += '<div class="preview-row total"><span>Total</span><span>' + Util.mmk(rc.totalMMK) + ' MMK</span></div>';
    out += '</div>';
    return out;
  }
})(window);
