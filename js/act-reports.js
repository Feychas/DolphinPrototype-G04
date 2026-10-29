/* js/act-reports.js — actions for S19 Reports and commission.

   The report reads the shared state only; nothing here changes a receipt, a
   payment or a job. The only records this file creates are the in-memory
   demo commission payouts. */
(function (global) {
  'use strict';

  const Actions = global.Actions;
  const PERIODS = ['Per job', 'Weekly', 'Monthly'];

  function isDay(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  /* Same validation pattern as js/actions.js — errors next to the fields,
     a warning toast, and no state change when something is invalid. */
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
    App.toast(message || 'Check the highlighted fields.', 'warn');
    return { ok: false, errors: errors };
  }

  function ok(message) {
    App.toast(message, 'info');
    App.render();
    return { ok: true };
  }

  function currentRange() {
    const p = Store.params || {};
    const demoDay = Store.today();
    return {
      from: isDay(p.from) ? p.from : demoDay,
      to: isDay(p.to) ? p.to : demoDay
    };
  }

  function dayCount(from, to) {
    if (!isDay(from) || !isDay(to)) return 0;
    const a = Date.parse(from + 'T00:00:00Z');
    const b = Date.parse(to + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.round((b - a) / 86400000) + 1;
  }

  /* =======================================================================
     Report period
     ======================================================================= */

  Actions.submit['reports.range'] = function (form) {
    const v = Actions.values(form);
    const from = String(v.from || '').trim();
    const to = String(v.to || '').trim();
    const errors = {};
    if (!isDay(from)) errors.from = 'Enter a valid start date.';
    if (!isDay(to)) errors.to = 'Enter a valid end date.';
    if (!errors.from && !errors.to && from > to) errors.to = 'The end date must not be before the start date.';
    if (Object.keys(errors).length) { fail(form, errors, 'Check the report dates.'); return; }
    const params = {};
    Object.keys(Store.params || {}).forEach(function (k) { params[k] = Store.params[k]; });
    params.from = from;
    params.to = to;
    App.go('S19', params, { force: true });
    App.toast('Report period set to ' + from + ' – ' + to + '.', 'info');
  };

  /* Live hint while the dates are being typed — no re-render, no focus steal. */
  Actions.live['reports.range'] = function (el) {
    const form = el.closest('form[data-form="reports.range"]');
    if (!form) return;
    const v = Actions.values(form);
    const from = String(v.from || '').trim();
    const to = String(v.to || '').trim();
    const hint = Util.el('#report-range-hint');
    if (!hint) return;
    let text;
    if (!isDay(from) || !isDay(to)) text = 'Enter a start and an end date.';
    else if (from > to) text = 'The end date must not be before the start date.';
    else {
      const days = dayCount(from, to);
      text = days + (days === 1 ? ' day' : ' days') + ' selected — apply the range to update the report.';
    }
    hint.textContent = text;
    hint.classList.toggle('note-warn', isDay(from) && isDay(to) && from > to);
  };

  /* =======================================================================
     Illustrative commission rule (Owner only)
     ======================================================================= */

  Actions.submit['reports.commissionRule'] = function (form) {
    if (!Store.isOwner()) {
      App.toast('Only the Owner can change the illustrative commission rule.', 'warn');
      return;
    }
    const v = Actions.values(form);
    const errors = {};
    const type = v.type === 'fixedPerService' ? 'fixedPerService' : 'percent';
    const value = Util.parseIntStrict(v.value);
    if (!isFinite(value) || value < 0) errors.value = 'Enter a whole number, 0 or more.';
    const basis = v.basis === 'regularLabour' ? 'regularLabour' : 'finalLabour';
    const payoutPeriod = PERIODS.indexOf(v.payoutPeriod) >= 0 ? v.payoutPeriod : 'Monthly';
    const eligibleRoles = Object.keys(v).filter(function (k) {
      return k.indexOf('role-') === 0 && v[k];
    }).map(function (k) { return k.slice(5); });
    const eligibleServiceIds = Object.keys(v).filter(function (k) {
      return k.indexOf('svc-') === 0 && v[k];
    }).map(function (k) { return k.slice(4); });
    if (!eligibleRoles.length) errors['role-Mechanic'] = 'Choose at least one eligible role.';
    if (!eligibleServiceIds.length) {
      const first = (Store.state.services || [])[0];
      errors['svc-' + (first ? first.id : 'none')] = 'Choose at least one eligible service.';
    }
    if (Object.keys(errors).length) { fail(form, errors, 'Check the commission rule.'); return; }

    const previous = Store.state.commissionRule;
    Store.state.commissionRule = {
      id: (previous && previous.id) || 'COMM-DEMO',
      illustrative: true,
      type: type,
      value: value,
      basis: basis,
      eligibleRoles: eligibleRoles,
      eligibleServiceIds: eligibleServiceIds,
      payoutPeriod: payoutPeriod
    };
    Store.log('Commission', 'Illustrative commission rule updated — ' + type + ' ' + value +
      (type === 'percent' ? '%' : ' MMK per service line') + ' of ' + basis + ' labour.');
    ok('Illustrative commission rule saved. No receipt, payment or job was changed.');
  };

  /* =======================================================================
     Demo commission payouts
     ======================================================================= */

  function payoutsFor(staffId, jobId, ruleId) {
    return (Store.state.commissionPayouts || []).filter(function (p) {
      return p.staffId === staffId && p.jobId === jobId && p.ruleId === ruleId;
    });
  }

  function earnedShare(staffId, jobId) {
    const view = global.DolphinViews && global.DolphinViews.S19;
    if (!view || !view.commissionRows) return null;
    const r = currentRange();
    const rows = view.commissionRows(r.from, r.to);
    let total = 0;
    let found = false;
    rows.forEach(function (row) {
      if (row.jobId !== jobId || row.needsReview) return;
      row.split.forEach(function (s) {
        if (s.staffId !== staffId) return;
        total += s.amountMMK;
        found = true;
      });
    });
    return found ? total : null;
  }

  function recordPayout(rec) {
    if (!Store.state.commissionPayouts) Store.state.commissionPayouts = [];
    Store.state.commissionPayouts.push({
      id: Store.nextId('commissionPayout'),
      staffId: rec.staffId,
      jobId: rec.jobId,
      amountMMK: rec.amountMMK,
      at: Store.now(),
      ruleId: rec.ruleId,
      note: rec.note,
      period: rec.period
    });
    Store.log('Commission', 'Demo payout recorded: ' + Util.mmk(rec.amountMMK) + ' MMK to ' +
      Store.staffName(rec.staffId) + ' for ' + rec.jobId + ' (' + rec.note + '). Receipt revenue is unchanged.');
    ok('Demo payout recorded (' + Util.mmk(rec.amountMMK) + ' MMK). It is an in-memory note only — receipt revenue is unchanged.');
  }

  Actions.click['reports.payout'] = function (el) {
    if (!Store.isManagerial()) {
      App.toast('Only Owner or Manager can record a demo payout.', 'warn');
      return;
    }
    const staffId = el.getAttribute('data-staff-id');
    const jobId = el.getAttribute('data-job-id');
    const ruleId = el.getAttribute('data-rule-id');
    const rule = Store.state.commissionRule;
    if (!rule || rule.id !== ruleId) {
      App.toast('The commission rule changed. Reopen the report and try again.', 'warn');
      return;
    }
    if (payoutsFor(staffId, jobId, ruleId).length) {
      App.toast('A payout is already recorded for this staff member and job. Use “Record adjustment” if the rule changed.', 'warn');
      return;
    }
    const amount = earnedShare(staffId, jobId);
    if (!Util.isNum(amount) || amount <= 0) {
      App.toast('Nothing is earned for this staff member and job in the selected range.', 'warn');
      return;
    }
    recordPayout({
      staffId: staffId,
      jobId: jobId,
      amountMMK: amount,
      ruleId: ruleId,
      note: 'Demo payout — ' + (rule.payoutPeriod || 'Per job'),
      period: rule.payoutPeriod || 'Per job'
    });
  };

  Actions.click['reports.adjustment'] = function (el) {
    if (!Store.isManagerial()) {
      App.toast('Only Owner or Manager can record a demo payout.', 'warn');
      return;
    }
    const staffId = el.getAttribute('data-staff-id');
    const jobId = el.getAttribute('data-job-id');
    const ruleId = el.getAttribute('data-rule-id');
    const rule = Store.state.commissionRule;
    if (!rule || rule.id !== ruleId) {
      App.toast('The commission rule changed. Reopen the report and try again.', 'warn');
      return;
    }
    const existing = payoutsFor(staffId, jobId, ruleId);
    if (existing.some(function (p) { return String(p.note || '').indexOf('Adjustment') === 0; })) {
      App.toast('An adjustment is already recorded for this staff member and job.', 'warn');
      return;
    }
    const paid = Util.sum(existing, function (p) { return p.amountMMK || 0; });
    const earned = earnedShare(staffId, jobId);
    if (!Util.isNum(earned)) {
      App.toast('Nothing is earned for this staff member and job in the selected range.', 'warn');
      return;
    }
    const diff = earned - paid;
    if (!diff) {
      App.toast('The recorded payout already matches the earned commission.', 'warn');
      return;
    }
    recordPayout({
      staffId: staffId,
      jobId: jobId,
      amountMMK: diff,
      ruleId: ruleId,
      note: 'Adjustment after rule change',
      period: rule.payoutPeriod || 'Per job'
    });
  };
})(window);
