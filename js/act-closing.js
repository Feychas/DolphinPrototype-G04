/* js/act-closing.js — actions for S17 daily closing and payment corrections.

   The shared calculations live in js/views/s17.js (window.DolphinS17) so the
   preview on screen and the numbers that are stored always come from the same
   place. Nothing here touches a receipt: a correction is always an extra row. */
(function (global) {
  'use strict';

  const E = Util.esc;
  const METHODS = ['Cash', 'KBZPay', 'WavePay'];

  /* The calculation helpers of js/views/s17.js are read when an action runs,
     so the order of the script tags in index.html does not matter. */
  const S = new Proxy({}, {
    get: function (target, key) {
      const value = global.DolphinS17[key];
      return typeof value === 'function' ? value.bind(global.DolphinS17) : value;
    }
  });

  /* Same value reader as js/actions.js — name → value, checkboxes as booleans. */
  function values(form) { return global.Actions.values(form); }

  function fail(form, errors, message) {
    if (form) {
      Object.keys(errors || {}).forEach(function (name) {
        const el = form.querySelector('[name="' + name + '"]');
        if (!el) return;
        const holder = el.closest('.field') || el.parentElement;
        if (!holder) return;
        let msg = holder.querySelector('.field-error-text');
        if (!msg) {
          msg = document.createElement('p');
          msg.className = 'field-error-text';
          holder.appendChild(msg);
        }
        msg.textContent = errors[name];
        holder.classList.add('field-error');
      });
      const firstKey = Object.keys(errors || {})[0];
      if (firstKey) {
        const el = form.querySelector('[name="' + firstKey + '"]');
        if (el) el.focus();
      }
    }
    global.App.toast(message || 'Check the highlighted fields.', 'warn');
    return { ok: false, errors: errors };
  }

  function ok(message) {
    global.Store.dirty = false;
    global.App.toast(message, 'info');
    global.App.render();
    return { ok: true };
  }

  function intOrNull(v) {
    const n = global.Util.parseIntStrict(v);
    return isFinite(n) ? n : null;
  }

  /** The shell hands over the nearest [data-change] / [data-live] ancestor,
      so the control itself has to be looked up inside it. */
  function inputOf(el) {
    if (!el) return null;
    if (el.tagName && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return el;
    return el.querySelector('input, select, textarea');
  }

  /* =======================================================================
     Daily closing
     ======================================================================= */

  /** Recompute the expected / difference cells in place — no full re-render,
      so the field that is being typed into keeps its focus. */
  function refreshClosingCells() {
    const form = global.Util.el('form[data-form="closing.save"]');
    if (!form) return;
    const v = values(form);
    const dateKey = v.date || S.demoDay();
    const floatMMK = intOrNull(v.cashFloatMMK);
    const nonSalesMMK = intOrNull(v.nonSalesCashMovementsMMK);
    if (floatMMK === null || nonSalesMMK === null) return;
    const expected = S.expectedFor(dateKey, floatMMK, nonSalesMMK);
    const counted = {
      Cash: intOrNull(v.countedCash),
      KBZPay: intOrNull(v.countedKBZPay),
      WavePay: intOrNull(v.countedWavePay)
    };
    METHODS.forEach(function (m) {
      const expEl = global.Util.el('#closing-exp-' + m);
      if (expEl) expEl.textContent = global.Util.mmk(expected[m]);
      const diffEl = global.Util.el('#closing-diff-' + m);
      if (!diffEl) return;
      const c = counted[m];
      const diff = c === null ? null : c - expected[m];
      diffEl.innerHTML = diff === null
        ? '<span class="muted">—</span>'
        : S.diffCell(diff);
    });
    const slot = global.Util.el('#closing-diff-slot');
    if (!slot) return;
    const off = METHODS.map(function (m) {
      return counted[m] === null ? null : counted[m] - expected[m];
    }).filter(function (n) { return n !== null && n !== 0; });
    slot.innerHTML = off.length
      ? global.UI.banner('warn', 'Difference: ' + global.Util.mmkSigned(off[0]) + ' MMK',
        '<p>An explanation is required before this closing can be saved.</p>')
      : '';
  }

  global.Actions.live['closing.calc'] = function () {
    refreshClosingCells();
  };

  global.Actions.live['closing.date'] = function (el) {
    const input = inputOf(el);
    const v = input ? input.value : '';
    if (!v) return;
    global.Store.params = global.Store.params || {};
    global.Store.params.date = v;
    global.App.render();
  };

  global.Actions.submit['closing.save'] = function (form) {
    const v = values(form);
    const errors = {};
    const dateKey = v.date;
    if (!dateKey) errors.date = 'Choose the workshop date to close.';

    const floatMMK = intOrNull(v.cashFloatMMK);
    const nonSalesMMK = intOrNull(v.nonSalesCashMovementsMMK);
    if (floatMMK === null || floatMMK < 0) errors.cashFloatMMK = 'Enter the opening float as a whole number of MMK (0 or more).';
    if (nonSalesMMK === null) errors.nonSalesCashMovementsMMK = 'Enter the non-sales cash movement as a whole number of MMK (it may be negative).';

    const counted = {};
    const countedFields = { Cash: 'countedCash', KBZPay: 'countedKBZPay', WavePay: 'countedWavePay' };
    METHODS.forEach(function (m) {
      const n = intOrNull(v[countedFields[m]]);
      if (n === null || n < 0) errors[countedFields[m]] = 'Enter the counted ' + m + ' as a whole number of MMK (0 or more).';
      counted[m] = n === null ? 0 : n;
    });

    const reason = (v.reason || '').trim();
    if (Object.keys(errors).length) return fail(form, errors, 'The closing was not saved.');

    const expected = S.expectedFor(dateKey, floatMMK, nonSalesMMK);
    const difference = S.differenceFor(expected, counted);
    if (S.hasDifference(difference) && !reason) {
      errors.reason = 'An explanation is required because a difference is not zero.';
      return fail(form, errors, 'The closing was not saved — an explanation is required.');
    }

    const record = {
      id: global.Store.nextId('closing'),
      date: dateKey,
      expected: { Cash: expected.Cash, KBZPay: expected.KBZPay, WavePay: expected.WavePay },
      counted: { Cash: counted.Cash, KBZPay: counted.KBZPay, WavePay: counted.WavePay },
      difference: { Cash: difference.Cash, KBZPay: difference.KBZPay, WavePay: difference.WavePay },
      cashFloatMMK: floatMMK,
      nonSalesCashMovementsMMK: nonSalesMMK,
      reason: reason || 'Balanced — no difference.',
      at: global.Store.now(),
      actor: global.Store.userId,
      reviewRequired: S.hasDifference(difference)
    };
    global.Store.state.cashClosings = global.Store.state.cashClosings || [];
    global.Store.state.cashClosings.push(record);
    global.Store.log('Closing', 'Closing saved for ' + dateKey + ' — expected ' +
      global.Util.mmk(expected.Cash) + '/' + global.Util.mmk(expected.KBZPay) + '/' + global.Util.mmk(expected.WavePay) +
      ' MMK, counted ' + global.Util.mmk(counted.Cash) + '/' + global.Util.mmk(counted.KBZPay) + '/' +
      global.Util.mmk(counted.WavePay) + ' MMK.' + (record.reviewRequired ? ' A difference needs a Manager review.' : ''));

    return ok('Closing saved for ' + dateKey + '. ' + (record.reviewRequired
      ? 'A difference is open — a Manager has to review it.' : 'Everything is balanced.'));
  };

  /* ---------------------------------------------------------------------
     Amendment — the earlier closing is kept, a new record is appended.
     --------------------------------------------------------------------- */
  global.Actions.click['closing.amend'] = function (el) {
    const id = el.getAttribute('data-closing-id');
    const list = global.Store.state.cashClosings || [];
    const closing = list.filter(function (c) { return c.id === id; })[0];
    if (!closing) { global.App.toast('That closing is no longer in the list.', 'warn'); return; }

    global.App.modal({
      title: 'Amend the closing for ' + closing.date,
      body: '<p>The saved closing stays in the list. This amendment is appended as a new record with a new ' +
        'reason — nothing is overwritten.</p>' +
        '<p class="note">Expected on that date: ' +
        E(METHODS.map(function (m) { return m + ' ' + global.Util.mmk(closing.expected[m] || 0); }).join(' · ')) +
        ' MMK.</p>' +
        '<div class="form-grid form-grid-3">' +
        global.UI.field({ id: 'amend-cash', name: 'countedCash', label: 'Counted Cash (MMK)', type: 'number', min: 0, step: 1, value: closing.counted ? closing.counted.Cash : 0 }) +
        global.UI.field({ id: 'amend-kbz', name: 'countedKBZPay', label: 'Counted KBZPay (MMK)', type: 'number', min: 0, step: 1, value: closing.counted ? closing.counted.KBZPay : 0 }) +
        global.UI.field({ id: 'amend-wave', name: 'countedWavePay', label: 'Counted WavePay (MMK)', type: 'number', min: 0, step: 1, value: closing.counted ? closing.counted.WavePay : 0 }) +
        '</div>' +
        global.UI.field({ id: 'amend-reason', name: 'reason', label: 'Reason for the amendment (required)', type: 'textarea', rows: 2 }) +
        '<p class="note">All money is simulated.</p>',
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Save amendment', variant: 'primary', onClick: function () {
            const cash = intOrNull((global.Util.el('#amend-cash') || {}).value);
            const kbz = intOrNull((global.Util.el('#amend-kbz') || {}).value);
            const wave = intOrNull((global.Util.el('#amend-wave') || {}).value);
            const reason = ((global.Util.el('#amend-reason') || {}).value || '').trim();
            if (cash === null || kbz === null || wave === null || cash < 0 || kbz < 0 || wave < 0) {
              global.App.toast('Enter the counted amounts as whole numbers of MMK.', 'warn');
              return;
            }
            if (!reason) { global.App.toast('A reason is required for an amendment.', 'warn'); return; }
            const counted = { Cash: cash, KBZPay: kbz, WavePay: wave };
            const expected = {
              Cash: closing.expected.Cash, KBZPay: closing.expected.KBZPay, WavePay: closing.expected.WavePay
            };
            const difference = S.differenceFor(expected, counted);
            const record = {
              id: global.Store.nextId('closing'),
              date: closing.date,
              expected: expected,
              counted: counted,
              difference: difference,
              cashFloatMMK: closing.cashFloatMMK,
              nonSalesCashMovementsMMK: closing.nonSalesCashMovementsMMK,
              reason: reason,
              at: global.Store.now(),
              actor: global.Store.userId,
              reviewRequired: S.hasDifference(difference),
              amendsClosingId: closing.id
            };
            global.Store.state.cashClosings.push(record);
            global.Store.log('Closing', 'Closing for ' + closing.date + ' amended. The earlier record ' +
              closing.id + ' is kept unchanged.');
            global.App.closeModal();
            ok('Amendment saved. The earlier closing (' + closing.id + ') is still in the list.');
          }
        }
      ]
    });
  };

  /* =======================================================================
     Payment corrections
     ======================================================================= */

  function correctionJob() {
    const form = global.Util.el('form[data-form="correction.save"]');
    const v = form ? values(form) : {};
    return global.Store.job(v.jobId) || S.defaultCorrectionJob({ params: global.Store.params });
  }

  function refreshCorrectionPreview() {
    const form = global.Util.el('form[data-form="correction.save"]');
    if (!form) return;
    const job = correctionJob();
    const v = values(form);
    const built = S.buildCorrection(v, job);
    const preview = global.Util.el('#correction-preview');
    if (!preview) return;
    const problems = Object.keys(built.errors || {}).map(function (k) {
      return '• ' + E(built.errors[k]);
    }).join('<br>');
    preview.innerHTML = (problems
      ? global.UI.banner('warn', 'This correction cannot be confirmed yet', problems)
      : '') + S.previewHtml(job, built.correction);
  }

  global.Actions.live['correction.preview'] = function () {
    refreshCorrectionPreview();
  };

  global.Actions.live['correction.job'] = function (el) {
    const input = inputOf(el);
    const id = input ? input.value : '';
    if (!id) return;
    global.Store.params = global.Store.params || {};
    global.Store.params.jobId = id;
    global.App.render();
  };

  /** Fill the form with one of the two documented P07 samples. */
  function fillSample(kind) {
    const form = global.Util.el('form[data-form="correction.save"]');
    if (!form) return;
    const fixture = global.DOLPHIN_FIXTURES.sampleInputs || {};
    const job = correctionJob();
    const rc = job ? global.Store.jobReceipt(job.id) : null;
    const total = rc ? rc.totalMMK : 0;

    function set(id, value) {
      const el = global.Util.el('#' + id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!value;
      else el.value = value;
    }

    if (kind === 'charge') {
      const s = fixture.refund || {};
      set('correction-type', 'charge');
      set('correction-charge-delta', s.chargeAdjustmentMMK === undefined ? -5000 : s.chargeAdjustmentMMK);
      set('correction-refund', s.paymentAdjustmentMMK === undefined ? 5000 : Math.abs(s.paymentAdjustmentMMK));
      set('correction-refund-method', s.method || 'Cash');
      set('correction-reason', s.reason || '');
    } else {
      const s = fixture.methodCorrection || {};
      set('correction-type', 'method');
      set('correction-reverse-method', s.reverseMethod || 'Cash');
      set('correction-reverse', s.reverseMMK === undefined ? total : Math.abs(s.reverseMMK));
      set('correction-new-method', s.newMethod || 'KBZPay');
      set('correction-new-amount', s.newMMK === undefined ? total : Math.abs(s.newMMK));
      set('correction-reference', s.reference || '');
      set('correction-reason', s.reason || '');
    }
    refreshCorrectionPreview();
    global.App.toast(kind === 'charge'
      ? 'Sample A loaded — check the preview, then confirm the correction.'
      : 'Sample B loaded — tick “Verified (demo)” before you confirm.', 'info');
  }

  global.Actions.click['correction.sampleCharge'] = function () { fillSample('charge'); };
  global.Actions.click['correction.sampleMethod'] = function () { fillSample('method'); };

  global.Actions.submit['correction.save'] = function (form) {
    const v = values(form);
    const job = global.Store.job(v.jobId) || correctionJob();
    if (!job) return fail(form, { jobId: 'Choose a job that already has a receipt.' }, 'The correction was not applied.');
    const rc = global.Store.jobReceipt(job.id);
    if (!rc) {
      return fail(form, { jobId: 'This job has no receipt yet, so there is nothing to correct.' },
        'The correction was not applied.');
    }

    const built = S.buildCorrection(v, job);
    if (Object.keys(built.errors).length) {
      return fail(form, built.errors, 'The correction was not applied.');
    }
    const correction = built.correction;

    const record = {
      id: global.Store.nextId('correction'),
      type: correction.type,
      chargeDeltaMMK: correction.chargeDeltaMMK,
      refundDeltaMMK: correction.refundDeltaMMK,
      refundMethod: correction.refundMethod,
      reverseMethod: correction.reverseMethod,
      reverseDeltaMMK: correction.reverseDeltaMMK,
      newMethod: correction.newMethod,
      newDeltaMMK: correction.newDeltaMMK,
      receiptId: rc.id,
      jobId: job.id,
      at: global.Store.now(),
      reason: (v.reason || '').trim(),
      actor: global.Store.userId
    };
    if (correction.type === 'method') {
      record.walletReference = (v.walletReference || '').trim();
      record.walletVerified = !!v.walletVerified;
    }

    global.Store.state.corrections = global.Store.state.corrections || [];
    global.Store.state.corrections.push(record);

    /* The original receipt is untouched. The job status follows the effective
       balance that Rules.effectiveBalance now reports. */
    const balance = global.Rules.effectiveBalance(job);
    if (balance !== 0) {
      job.paymentStatus = 'Review required';
    } else if (job.paymentStatus === 'Review required') {
      job.paymentStatus = 'Paid';
    }

    global.Store.log('Correction', 'Correction ' + record.id + ' on ' + job.id + ' (' + rc.id + '): ' +
      S.changeRows(correction).map(function (r) {
        return r.label + ' ' + global.Util.mmkSigned(r.amountMMK) + ' MMK' + (r.method ? ' (' + r.method + ')' : '');
      }).join(', ') + '. Reason: ' + record.reason + '. Effective balance ' +
      global.Util.mmkSigned(balance) + ' MMK.');

    const closeCheck = global.Rules.canClose(job);
    return ok('Correction ' + record.id + ' applied. Receipt ' + rc.id + ' is kept as issued. ' +
      (balance !== 0
        ? 'The effective balance is ' + global.Util.mmkSigned(balance) + ' MMK — the job is now Review required and cannot be closed.'
        : 'The effective balance stays at zero. ' +
          (closeCheck.ok ? 'The job can still be closed.' : 'Closure is still blocked for the other reasons listed.')));
  };
})(window);
