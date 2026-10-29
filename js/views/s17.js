/* js/views/s17.js — S17 daily closing and payment corrections.

   Two tabs:
     • Daily closing      — Owner, Manager and Cashier.
     • Payment corrections — Owner and Manager only.

   The pure helpers are published on window.DolphinS17 so that
   js/act-closing.js reuses exactly the same numbers for the live preview. */
(function (global) {
  'use strict';

  const E = Util.esc;
  const METHODS = ['Cash', 'KBZPay', 'WavePay'];

  /* =======================================================================
     Shared helpers (also used by js/act-closing.js)
     ======================================================================= */

  /** The workshop day the fixed demo clock points at (28 Oct 2026). */
  function demoDay() { return Util.dayKey(Store.now()); }

  /** Expected money for one workshop day.
      Sales cash comes from the NET payment entries of that day; the opening
      float and the signed non-sales cash movement are added on top. Customer
      tendered cash is never counted without subtracting change — the net
      applied amount is what reaches the drawer. */
  function expectedFor(dateKey, floatMMK, nonSalesMMK) {
    const col = Rules.collections(dateKey, dateKey);
    const byMethod = col.byMethod || {};
    return {
      Cash: (byMethod.Cash || 0) + (floatMMK || 0) + (nonSalesMMK || 0),
      KBZPay: byMethod.KBZPay || 0,
      WavePay: byMethod.WavePay || 0
    };
  }

  function differenceFor(expected, counted) {
    const out = {};
    METHODS.forEach(function (m) { out[m] = (counted[m] || 0) - (expected[m] || 0); });
    return out;
  }

  function hasDifference(difference) {
    return METHODS.some(function (m) { return (difference[m] || 0) !== 0; });
  }

  /** Money of this job that was actually collected (net of earlier corrections). */
  function collectedFor(job) { return Rules.netPayment(job); }

  /** Jobs that already have a receipt — the only jobs a correction may touch. */
  function correctionCandidates() {
    const list = (Store.state.jobs || []).filter(function (j) { return !!Store.jobReceipt(j.id); });
    return list.sort(function (a, b) {
      const ra = Store.jobReceipt(a.id), rb = Store.jobReceipt(b.id);
      return String(rb.issuedAt).localeCompare(String(ra.issuedAt));
    });
  }

  function defaultCorrectionJob(ctx) {
    const wanted = (ctx && ctx.params && ctx.params.jobId) || null;
    const cands = correctionCandidates();
    if (wanted) {
      const hit = cands.filter(function (j) { return j.id === wanted; })[0];
      if (hit) return hit;
    }
    const selected = Store.state.selectedJobId;
    if (selected) {
      const hit = cands.filter(function (j) { return j.id === selected; })[0];
      if (hit) return hit;
    }
    return cands[0] || null;
  }

  /** Build the correction object (and its validation errors) from form values.
      The field names are exactly the ones js/rules.js reads. */
  function buildCorrection(values, job) {
    const errors = {};
    const correction = {
      type: values.type === 'method' ? 'method' : 'charge',
      chargeDeltaMMK: 0,
      refundDeltaMMK: 0,
      refundMethod: null,
      reverseMethod: null,
      reverseDeltaMMK: 0,
      newMethod: null,
      newDeltaMMK: 0
    };

    if (!job) {
      errors.jobId = 'Choose a job that already has a receipt.';
      return { correction: correction, errors: errors };
    }
    if (!values.reason || !String(values.reason).trim()) {
      errors.reason = 'A reason is required for every correction.';
    }

    if (correction.type === 'charge') {
      const delta = Util.parseIntStrict(values.chargeDeltaMMK);
      const refund = Util.parseIntStrict(values.refundAmountMMK);
      if (!isFinite(delta)) errors.chargeDeltaMMK = 'Enter the charge adjustment as a whole number of MMK.';
      if (!isFinite(refund) || refund < 0) errors.refundAmountMMK = 'Enter the refund as a whole number of MMK (0 for none).';
      correction.chargeDeltaMMK = isFinite(delta) ? delta : 0;
      correction.refundDeltaMMK = isFinite(refund) && refund > 0 ? -Math.abs(refund) : 0;
      correction.refundMethod = values.refundMethod || 'Cash';
      if (isFinite(delta) && delta === 0 && correction.refundDeltaMMK === 0) {
        errors.chargeDeltaMMK = 'Enter at least one adjustment — a correction with no change is not saved.';
      }
      const effective = Rules.effectiveCharge(job) + correction.chargeDeltaMMK;
      if (effective < 0) {
        errors.chargeDeltaMMK = 'This would make the effective charge negative (' +
          Util.mmk(effective) + ' MMK). It is rejected.';
      }
      if (correction.refundDeltaMMK && Math.abs(correction.refundDeltaMMK) > collectedFor(job)) {
        errors.refundAmountMMK = 'The refund cannot exceed the money actually collected (' +
          Util.mmk(collectedFor(job)) + ' MMK). It is rejected.';
      }
    } else {
      const reverse = Util.parseIntStrict(values.reverseAmountMMK);
      const added = Util.parseIntStrict(values.newAmountMMK);
      if (!isFinite(reverse) || reverse < 0) errors.reverseAmountMMK = 'Enter the reversed amount as a whole number of MMK.';
      if (!isFinite(added) || added < 0) errors.newAmountMMK = 'Enter the re-entered amount as a whole number of MMK.';
      correction.reverseMethod = values.reverseMethod || 'Cash';
      correction.newMethod = values.newMethod || 'KBZPay';
      correction.reverseDeltaMMK = isFinite(reverse) && reverse > 0 ? -Math.abs(reverse) : 0;
      correction.newDeltaMMK = isFinite(added) && added > 0 ? Math.abs(added) : 0;
      if (!values.walletReference || !String(values.walletReference).trim()) {
        errors.walletReference = 'Enter the sample wallet reference for the new entry.';
      }
      if (!values.walletVerified) {
        errors.walletVerified = 'Tick “Verified (demo)” before confirming a method change.';
      }
      if (correction.reverseDeltaMMK && Math.abs(correction.reverseDeltaMMK) > collectedFor(job)) {
        errors.reverseAmountMMK = 'The reversal cannot exceed the money actually collected (' +
          Util.mmk(collectedFor(job)) + ' MMK). It is rejected.';
      }
      if (correction.reverseDeltaMMK === 0 && correction.newDeltaMMK === 0) {
        errors.reverseAmountMMK = 'Enter the reversed and the re-entered amount.';
      }
    }
    return { correction: correction, errors: errors };
  }

  /** Human readable list of the signed changes of a correction. */
  function changeRows(correction) {
    const rows = [];
    if (!correction) return rows;
    if (correction.type === 'charge') {
      if (correction.chargeDeltaMMK) {
        rows.push({ label: 'Charge adjustment on the original receipt', amountMMK: correction.chargeDeltaMMK, method: null });
      }
      if (correction.refundDeltaMMK) {
        rows.push({ label: 'Refund paid to the customer', amountMMK: correction.refundDeltaMMK, method: correction.refundMethod });
      }
    } else {
      if (correction.reverseDeltaMMK) {
        rows.push({ label: 'Reversal of the original entry', amountMMK: correction.reverseDeltaMMK, method: correction.reverseMethod });
      }
      if (correction.newDeltaMMK) {
        rows.push({ label: 'New entry recorded as', amountMMK: correction.newDeltaMMK, method: correction.newMethod });
      }
    }
    return rows;
  }

  /* =======================================================================
     Small building blocks
     ======================================================================= */

  function tabs(active) {
    const list = [{ id: 'closing', label: 'Daily closing' }];
    if (Store.isManagerial()) list.push({ id: 'corrections', label: 'Payment corrections' });
    return UI.tabs(list, active, 'closing');
  }

  function diffCell(value) {
    if (!value) return '<span class="muted">0</span>';
    return UI.badge(Util.mmkSigned(value), 'orange');
  }

  function moneyTriple(values) {
    return METHODS.map(function (m) { return Util.mmk(values[m] || 0); }).join(' / ');
  }

  /** Wrap a shared field so the shell can bind data-live / data-change to it. */
  function liveField(attrs, html) {
    return '<div ' + attrs + '>' + html + '</div>';
  }

  /* =======================================================================
     Closing tab
     ======================================================================= */

  /* The counted amounts of a day, keyed by payment method. */
  function closingDefaults(dateKey) {
    const saved = (Store.state.cashClosings || []).filter(function (c) { return c.date === dateKey; });
    const last = saved.length ? saved[saved.length - 1] : null;
    if (last) {
      return {
        Cash: last.counted ? last.counted.Cash : 0,
        KBZPay: last.counted ? last.counted.KBZPay : 0,
        WavePay: last.counted ? last.counted.WavePay : 0
      };
    }
    const sample = (global.DOLPHIN_FIXTURES.sampleInputs.closing || {});
    /* The sample counted amounts only belong to the demo day whose net
       collections are the sample expected amounts. Any other day starts at 0. */
    if (dateKey === demoDay()) {
      const expected = expectedFor(dateKey, 0, 0);
      const wanted = sample.expectedMMK || {};
      const same = METHODS.every(function (m) {
        return (wanted[m] === undefined || wanted[m] === expected[m]);
      });
      if (same) {
        const counted = sample.countedMMK || {};
        return {
          Cash: counted.Cash || 0,
          KBZPay: counted.KBZPay || 0,
          WavePay: counted.WavePay || 0
        };
      }
    }
    return { Cash: 0, KBZPay: 0, WavePay: 0 };
  }

  function closingTableHtml(dateKey, floatMMK, nonSalesMMK, counted) {
    const expected = expectedFor(dateKey, floatMMK, nonSalesMMK);
    const difference = differenceFor(expected, counted);
    const names = { Cash: 'countedCash', KBZPay: 'countedKBZPay', WavePay: 'countedWavePay' };
    const rows = METHODS.map(function (m) {
      const id = 'closing-count-' + m;
      return {
        cells: [
          { html: '<strong>' + E(m) + '</strong>' },
          { html: '<span id="closing-exp-' + E(m) + '">' + E(Util.mmk(expected[m])) + '</span>', className: 'num' },
          {
            html: '<label class="sr-only" for="' + id + '">Counted ' + E(m) + ' (MMK)</label>' +
              '<input id="' + id + '" name="' + names[m] + '" type="number" min="0" step="1" inputmode="numeric" ' +
              'value="' + E(counted[m] || 0) + '" data-live="closing.calc">'
          },
          { html: '<span id="closing-diff-' + E(m) + '">' + diffCell(difference[m]) + '</span>', className: 'num' }
        ]
      };
    });
    return UI.table({
      label: 'Expected and counted amounts for ' + dateKey,
      head: [{ label: 'Method' }, { label: 'Expected (MMK)' }, { label: 'Counted (MMK)' }, { label: 'Difference (MMK)' }],
      rows: rows
    });
  }

  function closingsHistory() {
    const list = (Store.state.cashClosings || []).slice().reverse();
    if (!list.length) {
      return UI.empty('No closing has been saved for this workshop yet.');
    }
    return UI.table({
      label: 'Saved daily closings',
      head: [
        { label: 'Date' }, { label: 'Expected (Cash / KBZPay / WavePay)' }, { label: 'Counted' },
        { label: 'Difference' }, { label: 'Explanation' }, { label: 'Saved by' }, { label: 'Status' }, { label: '' }
      ],
      rows: list.map(function (c) {
        const diff = c.difference || {};
        const off = METHODS.map(function (m) { return diff[m] || 0; }).filter(function (n) { return n !== 0; });
        const review = c.reviewRequired || hasDifference(diff);
        return {
          cells: [
            {
              html: '<strong>' + E(c.date) + '</strong>' +
                (c.amendsClosingId ? UI.badge('Amendment', 'orange') : '')
            },
            { html: E(moneyTriple(c.expected || {})) },
            { html: E(moneyTriple(c.counted || {})) },
            { html: off.length ? off.map(diffCell).join(' ') : '<span class="muted">0</span>' },
            { html: E(c.reason || '—') },
            { html: E(Store.staffName(c.actor)) + '<br><span class="muted small">' + E(Util.fmtDateTime(c.at)) + '</span>' },
            { html: review ? UI.badge('Manager review', 'orange') : UI.badge('Balanced', 'green') },
            { html: UI.btn('Amend', { variant: 'secondary', action: 'closing.amend', attrs: { closingId: c.id } }) }
          ]
        };
      })
    });
  }

  function closingTab(ctx) {
    const dateKey = (ctx.params && ctx.params.date) || demoDay();
    const opening = Store.state.openingBalances || { cashFloatMMK: 0, nonSalesCashMovementsMMK: 0 };
    const onOpeningDay = opening.date === dateKey;
    const floatMMK = onOpeningDay ? (opening.cashFloatMMK || 0) : 0;
    const nonSalesMMK = onOpeningDay ? (opening.nonSalesCashMovementsMMK || 0) : 0;
    const counted = closingDefaults(dateKey);
    const expected = expectedFor(dateKey, floatMMK, nonSalesMMK);
    const difference = differenceFor(expected, counted);
    const reviewOpen = (Store.state.cashClosings || []).some(function (c) { return c.reviewRequired; });
    const col = Rules.collections(dateKey, dateKey);
    const off = METHODS.map(function (m) { return difference[m] || 0; }).filter(function (n) { return n !== 0; });

    return UI.pageHeader({
      title: 'Daily closing',
      subtitle: 'Reconcile cash and e-wallet payments with actual amounts.',
      actions: reviewOpen ? UI.badge('Manager review required', 'orange') : ''
    }) +
      tabs('closing') +
      (reviewOpen ? UI.banner('warn', 'Manager review required',
        '<p>A saved closing has a difference that is not zero. A Manager has to review it. ' +
        'The closing never rewrites a receipt to make the totals match.</p>') : '') +
      '<form data-form="closing.save">' +
      UI.card({
        title: 'Business date and cash inputs',
        subtitle: 'The workshop date decides which net payment entries are reconciled.',
        body: '<div class="form-grid form-grid-3">' +
          liveField('data-change="closing.date"', UI.field({
            id: 'closing-date', name: 'date', label: 'Business date', type: 'date', value: dateKey,
            hint: 'Default: the demo workshop date, ' + Util.fmtDate(Store.now()) + '.'
          })) +
          liveField('data-live="closing.calc"', UI.field({
            id: 'closing-float', name: 'cashFloatMMK', label: 'Opening cash float (MMK)', type: 'number',
            min: 0, step: 1, inputmode: 'numeric', value: floatMMK,
            hint: 'Demo input — the float the drawer started the day with.'
          })) +
          liveField('data-live="closing.calc"', UI.field({
            id: 'closing-nonsales', name: 'nonSalesCashMovementsMMK', label: 'Non-sales cash movement (MMK)', type: 'number',
            step: 1, inputmode: 'numeric', value: nonSalesMMK,
            hint: 'Signed — a negative value is cash paid out of the drawer.'
          })) +
          '</div>' +
          '<p class="note">Expected cash = net sales cash + opening float + signed non-sales cash. ' +
          'Customer tendered cash is never counted without subtracting change.</p>'
      }) +
      UI.card({
        title: 'Expected against counted',
        subtitle: 'Counted amounts are what the drawer and the e-wallet statements actually show.',
        body: '<div id="closing-totals">' + closingTableHtml(dateKey, floatMMK, nonSalesMMK, counted) + '</div>' +
          '<div id="closing-diff-slot">' +
          (off.length
            ? UI.banner('warn', 'Difference: ' + Util.mmkSigned(off[0]) + ' MMK',
              '<p>An explanation is required before this closing can be saved.</p>')
            : '') +
          '</div>' +
          '<p class="note">Net payment entries for ' + E(dateKey) + ': ' + E(Util.mmk(col.totalMMK)) +
          ' MMK in total across ' + E(col.rows.length) + ' entries. Collections include signed refunds and method ' +
          'corrections — a difference never rewrites a receipt.</p>'
      }) +
      UI.card({
        title: 'Explanation',
        subtitle: 'Required whenever any difference is not zero.',
        body: UI.field({
          id: 'closing-reason', name: 'reason', label: 'Explanation for the difference', type: 'textarea', rows: 3,
          hint: 'Sample reason from the demo pack: “Sample discrepancy for review”.'
        }) +
          '<div class="form-actions">' +
          UI.btn('Save demo closing', { variant: 'primary', type: 'submit' }) +
          '<span class="note">All money in this prototype is simulated. Nothing is paid, banked or stored.</span>' +
          '</div>'
      }) +
      '</form>' +
      UI.card({
        title: 'Saved closings for this workshop',
        subtitle: 'An amendment keeps the earlier record and adds a new explanation.',
        body: closingsHistory()
      });
  }

  /* =======================================================================
     Corrections tab
     ======================================================================= */

  function originalEntriesHtml(job) {
    if (!job) return UI.empty('Select a job that already has a receipt.');
    const rc = Store.jobReceipt(job.id);
    const payments = (Store.state.payments || []).filter(function (p) { return p.jobId === job.id; });
    const receiptRows = (rc.lines || []).map(function (l) {
      return {
        cells: [
          { html: E(l.label) },
          { html: E(Util.qty(l.quantity)), className: 'num' },
          { html: E(Util.mmk(l.totalMMK)), className: 'num' }
        ]
      };
    });
    const paymentRows = payments.map(function (p) {
      return {
        cells: [
          { html: '<strong>' + E(p.method) + '</strong>' },
          {
            html: p.cashTenderedMMK
              ? E(Util.mmk(p.cashTenderedMMK)) + ' tendered · ' + E(Util.mmk(p.changeMMK)) + ' change'
              : 'Wallet transfer' + (p.reference ? ' · ' + E(p.reference) : '')
          },
          { html: E(Util.mmk(p.amountAppliedMMK)), className: 'num' }
        ]
      };
    });
    return '<div class="grid-2-even">' +
      '<div><h3 class="card-sub">Original receipt — kept exactly as issued</h3>' +
      UI.table({
        label: 'Original receipt lines for ' + job.id,
        head: [{ label: 'Line' }, { label: 'Qty' }, { label: 'Amount (MMK)' }],
        rows: receiptRows,
        empty: 'This receipt has no lines.'
      }) +
      '<p class="note">Receipt <strong>' + E(rc.id) + '</strong> · total ' + E(Util.mmk(rc.totalMMK)) +
      ' MMK · issued ' + E(Util.fmtDateTime(rc.issuedAt)) + '. The original receipt is never rewritten — ' +
      'the correction is shown as separate adjustment rows.</p></div>' +
      '<div><h3 class="card-sub">Original payment entries</h3>' +
      UI.table({
        label: 'Original payments for ' + job.id,
        head: [{ label: 'Method' }, { label: 'Detail' }, { label: 'Applied (MMK)' }],
        rows: paymentRows,
        empty: 'No payment has been posted for this job.'
      }) +
      '<p class="note">The net applied amount is what was collected — tendered cash is counted after change.</p></div>' +
      '</div>';
  }

  function previewHtml(job, correction) {
    if (!job) return UI.empty('Select a job that already has a receipt.');
    if (!correction) return UI.empty('Enter the adjustment to see the preview.');
    const prev = Rules.previewCorrectionBalance(job, correction);
    const changes = changeRows(correction);
    const balanced = prev.balanceMMK === 0;
    const closeCheck = Rules.canClose(job);

    const changeTable = UI.table({
      label: 'Signed changes of this correction',
      head: [{ label: 'Change' }, { label: 'Method' }, { label: 'Amount (MMK)' }],
      rows: changes.map(function (c) {
        return {
          cells: [
            { html: E(c.label) },
            { html: E(c.method || '—') },
            { html: E(Util.mmkSigned(c.amountMMK)), className: 'num' }
          ]
        };
      }),
      empty: 'No change entered yet.'
    });

    const effective = UI.table({
      label: 'Effective balance after the correction',
      head: [{ label: 'Measure' }, { label: 'Before (MMK)' }, { label: 'After (MMK)' }],
      rows: [
        {
          cells: [
            { html: '<strong>Effective charge</strong>' },
            { html: E(Util.mmk(Rules.effectiveCharge(job))), className: 'num' },
            { html: E(Util.mmk(prev.chargeMMK)), className: 'num' }
          ]
        },
        {
          cells: [
            { html: '<strong>Net payment collected</strong>' },
            { html: E(Util.mmk(Rules.netPayment(job))), className: 'num' },
            { html: E(Util.mmk(prev.paidMMK)), className: 'num' }
          ]
        },
        {
          cells: [
            { html: '<strong>Effective balance</strong>' },
            { html: E(Util.mmk(Rules.effectiveBalance(job))), className: 'num' },
            {
              html: balanced ? UI.badge('0 — balanced', 'green') : UI.badge(Util.mmkSigned(prev.balanceMMK), 'orange'),
              className: 'num'
            }
          ]
        }
      ]
    });

    const closure = closeCheck.ok
      ? UI.banner('info', 'Closure is still possible',
        '<p>Completed, settled and collected — the job can still be closed after this correction.</p>')
      : UI.banner('warn', 'Closure is blocked',
        closeCheck.reasons.map(function (r) { return E(r); }).join('<br>'));

    return '<h3 class="card-sub">Signed changes</h3>' + changeTable +
      '<h3 class="card-sub" style="margin-top:16px">Effective balance before you confirm</h3>' + effective +
      (balanced
        ? '<p class="note">The effective balance stays at zero, so the job remains settled after this correction.</p>'
        : '<p class="note note-warn">This correction leaves an effective balance of ' + E(Util.mmkSigned(prev.balanceMMK)) +
          ' MMK. Once it is applied the job moves to <strong>Review required</strong> and cannot be closed ' +
          'until the balance is settled again.</p>') +
      closure;
  }

  function correctionsList(job) {
    const all = (Store.state.corrections || []).filter(function (c) {
      return !job || c.jobId === job.id || (job && Store.jobReceipt(job.id) && c.receiptId === Store.jobReceipt(job.id).id);
    });
    if (!all.length) {
      return UI.empty('No correction has been recorded for this job yet. The original receipt is always kept.');
    }
    return UI.table({
      label: 'Recorded payment corrections',
      head: [
        { label: 'Correction' }, { label: 'Job / receipt' }, { label: 'Change' },
        { label: 'Effective balance' }, { label: 'Reason' }, { label: 'Recorded by' }
      ],
      rows: all.slice().reverse().map(function (c) {
        const changes = changeRows(c).map(function (r) {
          return E(r.label) + ' ' + E(Util.mmkSigned(r.amountMMK)) + ' MMK' + (r.method ? ' (' + E(r.method) + ')' : '');
        }).join('<br>');
        const cjob = Store.job(c.jobId);
        const balance = cjob ? Rules.effectiveBalance(cjob) : null;
        return {
          cells: [
            {
              html: '<strong>' + E(c.id) + '</strong><br>' +
                UI.badge(c.type === 'method' ? 'Method change' : 'Charge / refund', c.type === 'method' ? 'blue' : 'orange')
            },
            { html: E(c.jobId) + '<br><span class="muted small">' + E(c.receiptId || '—') + '</span>' },
            { html: changes || '—' },
            { html: balance === null ? '—' : (balance === 0 ? UI.badge('Balanced', 'green') : UI.badge(Util.mmkSigned(balance), 'orange')) },
            { html: E(c.reason || '—') },
            { html: E(Store.staffName(c.actor)) + '<br><span class="muted small">' + E(Util.fmtDateTime(c.at)) + '</span>' }
          ]
        };
      })
    });
  }

  function correctionsTab(ctx) {
    const job = defaultCorrectionJob(ctx);
    const rc = job ? Store.jobReceipt(job.id) : null;
    const payments = job ? (Store.state.payments || []).filter(function (p) { return p.jobId === job.id; }) : [];
    const originalMethod = payments.length ? payments[0].method : 'Cash';
    const total = rc ? rc.totalMMK : 0;
    const fixture = global.DOLPHIN_FIXTURES.sampleInputs || {};

    const jobOptions = correctionCandidates().map(function (j) {
      const r = Store.jobReceipt(j.id);
      return { value: j.id, label: Rules.jobTitle(j) + ' · ' + Util.mmk(r.totalMMK) + ' MMK' };
    });
    if (job && !jobOptions.some(function (o) { return o.value === job.id; })) {
      jobOptions.unshift({ value: job.id, label: Rules.jobTitle(job) });
    }

    return UI.pageHeader({
      title: 'Payment corrections',
      subtitle: 'Correct a paid receipt with a reasoned adjustment — never by rewriting it.',
      actions: UI.badge('Owner / Manager only', 'grey')
    }) +
      tabs('corrections') +
      UI.banner('plain', 'Two separate samples',
        '<p>Sample A is a paired charge and refund correction. Sample B is a payment method change. ' +
        'They are <strong>not</strong> meant to be applied together — reset scenario <strong>P07</strong> ' +
        '(Demo controls → Reset scenario) between them so each one is tested on its own.</p>') +
      '<form data-form="correction.save" data-job-id="' + E(job ? job.id : '') + '">' +
      UI.card({
        title: '1 — Choose the receipt to correct',
        subtitle: 'Only jobs that already have a receipt can be corrected.',
        body: '<div class="form-grid">' +
          liveField('data-change="correction.job"', UI.field({
            id: 'correction-job', name: 'jobId', label: 'Job with a receipt', type: 'select',
            value: job ? job.id : '', options: jobOptions, required: true
          })) +
          '</div>' +
          '<p class="note">Paid price lines are locked. The original receipt stays retained and the correction is ' +
          'recorded as separate adjustment rows.</p>'
      }) +
      UI.card({
        title: '2 — Original entries',
        subtitle: 'What was charged and what was collected, before any correction.',
        body: '<div id="correction-original">' + originalEntriesHtml(job) + '</div>'
      }) +
      UI.card({
        title: '3 — Describe the correction',
        subtitle: 'A reason is always required. A method change also needs a sample wallet reference and the verified tick.',
        body: '<div class="form-grid">' +
          liveField('data-live="correction.preview" data-change="correction.preview"', UI.field({
            id: 'correction-type', name: 'type', label: 'Kind of correction', type: 'select', value: 'charge',
            options: [
              { value: 'charge', label: 'Charge adjustment and refund (paired)' },
              { value: 'method', label: 'Payment method change (reverse and re-enter)' }
            ]
          })) +
          liveField('data-live="correction.preview" data-change="correction.preview"', UI.field({
            id: 'correction-reason', name: 'reason', label: 'Reason (required)', type: 'textarea', rows: 2,
            required: true, hint: 'The reason is stored on the correction and shown in the activity log.'
          })) +
          '</div>' +
          '<div class="action-bar">' +
          UI.btn('Sample A — paired −5,000 charge and refund', {
            variant: 'secondary', action: 'correction.sampleCharge', attrs: { jobId: job ? job.id : '' }
          }) +
          UI.btn('Sample B — reverse Cash and record KBZPay', {
            variant: 'secondary', action: 'correction.sampleMethod', attrs: { jobId: job ? job.id : '' }
          }) +
          '</div>' +
          '<div class="form-grid form-grid-3">' +
          liveField('data-live="correction.preview"', UI.field({
            id: 'correction-charge-delta', name: 'chargeDeltaMMK', label: 'Charge adjustment (MMK)', type: 'number',
            step: 1, inputmode: 'numeric', value: -5000,
            hint: 'Signed. Sample A uses −5,000 on a 60,000 MMK receipt.'
          })) +
          liveField('data-live="correction.preview"', UI.field({
            id: 'correction-refund', name: 'refundAmountMMK', label: 'Refund to the customer (MMK)', type: 'number',
            min: 0, step: 1, inputmode: 'numeric', value: 5000,
            hint: 'Entered positive, stored as a negative change. Sample A refunds 5,000.'
          })) +
          liveField('data-live="correction.preview"', UI.field({
            id: 'correction-refund-method', name: 'refundMethod', label: 'Refund paid by', type: 'select',
            value: 'Cash', options: METHODS
          })) +
          '</div>' +
          '<div class="form-grid form-grid-3">' +
          liveField('data-live="correction.preview"', UI.field({
            id: 'correction-reverse-method', name: 'reverseMethod', label: 'Reverse the entry paid by', type: 'select',
            value: originalMethod, options: METHODS
          }) +
          UI.field({
            id: 'correction-reverse', name: 'reverseAmountMMK', label: 'Reverse amount (MMK)', type: 'number',
            min: 0, step: 1, inputmode: 'numeric', value: total,
            hint: 'Sample B reverses the original 60,000 MMK Cash entry.'
          })) +
          liveField('data-live="correction.preview"', UI.field({
            id: 'correction-new-method', name: 'newMethod', label: 'Record the new entry as', type: 'select',
            value: originalMethod === 'KBZPay' ? 'Cash' : 'KBZPay', options: METHODS
          })) +
          '</div>' +
          '<div class="form-grid">' +
          liveField('data-live="correction.preview"', UI.field({
            id: 'correction-new-amount', name: 'newAmountMMK', label: 'New entry amount (MMK)', type: 'number',
            min: 0, step: 1, inputmode: 'numeric', value: total,
            hint: 'Sample B records 60,000 MMK as KBZPay — revenue is unchanged.'
          })) +
          liveField('data-live="correction.preview"', UI.field({
            id: 'correction-reference', name: 'walletReference', label: 'Sample wallet reference (required for a method change)',
            type: 'text', value: '',
            hint: 'A simulated transfer reference only. No wallet is contacted and no money moves.'
          })) +
          '</div>' +
          liveField('data-live="correction.preview" data-change="correction.preview"', UI.field({
            id: 'correction-verified', name: 'walletVerified', label: 'Verified (demo)', type: 'checkbox',
            checkLabel: 'Verified (demo) — the sample wallet entry was checked',
            hint: 'Required before a method change can be confirmed.'
          })) +
          '<div class="form-actions">' +
          UI.btn('Confirm correction', { variant: 'primary', type: 'submit' }) +
          '<span class="note">All money is simulated. The original receipt is kept.</span>' +
          '</div>'
      }) +
      UI.card({
        title: '4 — Preview before you confirm',
        subtitle: 'Original entries, signed changes and the effective balance.',
        body: '<div id="correction-preview">' + previewHtml(job, buildCorrection({
          type: 'charge', chargeDeltaMMK: -5000, refundAmountMMK: 5000, refundMethod: 'Cash',
          reason: (fixture.refund && fixture.refund.reason) || '', walletReference: '', walletVerified: false
        }, job).correction) + '</div>'
      }) +
      '</form>' +
      UI.card({
        title: '5 — Corrections recorded for this job',
        subtitle: 'Reason, actor and time of every adjustment.',
        body: '<div id="correction-history">' + correctionsList(job) + '</div>'
      });
  }

  /* =======================================================================
     Public surface
     ======================================================================= */

  global.DolphinViews = global.DolphinViews || {};
  global.DolphinViews.S17 = {
    render: function (ctx) {
      const tab = (ctx.params && ctx.params.tab) === 'corrections' && Store.isManagerial() ? 'corrections' : 'closing';
      return tab === 'corrections' ? correctionsTab(ctx) : closingTab(ctx);
    }
  };

  global.DolphinS17 = {
    demoDay: demoDay,
    expectedFor: expectedFor,
    differenceFor: differenceFor,
    hasDifference: hasDifference,
    diffCell: diffCell,
    collectedFor: collectedFor,
    correctionCandidates: correctionCandidates,
    defaultCorrectionJob: defaultCorrectionJob,
    buildCorrection: buildCorrection,
    changeRows: changeRows,
    originalEntriesHtml: originalEntriesHtml,
    previewHtml: previewHtml,
    correctionsList: correctionsList,
    METHODS: METHODS
  };
})(window);
