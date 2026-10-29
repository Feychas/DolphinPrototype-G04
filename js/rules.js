/* Dolphin AutoTrack prototype — business rules.
   Every calculation in the prototype goes through this file so the numbers
   stay consistent between screens. All amounts are whole MMK unless a rule
   explicitly allows fractions (litres). */
(function (global) {
  'use strict';

  const R = {};

  /* =======================================================================
     Pricing
     ===================================================================== */

  R.APPROVAL_THRESHOLD_MMK = 50000;   /* strictly above needs approval */

  R.lineGross = function (line) {
    const q = Util.isNum(line.quantity) ? line.quantity : 1;
    const p = Util.isNum(line.unitPriceMMK) ? line.unitPriceMMK : 0;
    const d = Util.isNum(line.discountMMK) ? line.discountMMK : 0;
    return q * p - d;
  };

  R.lineIsPartLike = function (line) {
    return line.kind === 'part' || line.kind === 'oil';
  };

  R.lineIsCustomerSupplied = function (line) {
    return line.source === 'Customer' || line.kind === 'customerMaterial';
  };

  /** Gross of a line before its own discount. */
  R.lineGrossBeforeDiscount = function (line) {
    const q = Util.isNum(line.quantity) ? line.quantity : 1;
    const p = Util.isNum(line.unitPriceMMK) ? line.unitPriceMMK : 0;
    return q * p;
  };

  /** Approval basis = repair labour + related shop parts/oil, before discount and rounding. */
  R.approvalBasis = function (lines) {
    return Util.sum(lines || [], function (l) {
      if (!l.repair) return 0;
      return R.lineGrossBeforeDiscount(l);
    });
  };

  R.approvalRequired = function (basis) {
    return basis > R.APPROVAL_THRESHOLD_MMK;
  };

  /** Round the receipt total once to the nearest 100 MMK, half upward. */
  R.roundReceipt = function (total) {
    const rounded = Math.floor((total + 50) / 100) * 100;
    return { payableMMK: rounded, roundingMMK: rounded - total };
  };

  /** Totals for a set of quote/receipt lines: subtotal before discount, then one rounding. */
  R.totals = function (lines, extraDiscountMMK) {
    const subtotal = Util.sum(lines || [], function (l) { return R.lineGrossBeforeDiscount(l); });
    const discount = Util.sum(lines || [], function (l) { return l.discountMMK || 0; }) + (extraDiscountMMK || 0);
    const net = subtotal - discount;
    const r = R.roundReceipt(net);
    return {
      subtotalMMK: subtotal,
      discountMMK: discount,
      roundingMMK: r.roundingMMK,
      totalMMK: r.payableMMK
    };
  };

  /* =======================================================================
     Promotions — one automatic promotion per eligible service line
     ===================================================================== */

  R.promoIdOrder = function (promo) {
    const m = /(\d+)\s*$/.exec(promo.id || '');
    return m ? parseInt(m[1], 10) : 0;
  };

  R.promotionApplies = function (promo, serviceId, size, dayKey) {
    if (!promo || promo.active === false) return false;
    if (!promo.serviceIds || promo.serviceIds.indexOf(serviceId) < 0) return false;
    if (promo.sizes && promo.sizes.length && promo.sizes.indexOf(size) < 0) return false;
    if (promo.startDate && dayKey < promo.startDate) return false;
    if (promo.endDate && dayKey > promo.endDate) return false;
    return true;
  };

  R.promotionFinal = function (promo, regularMMK) {
    if (promo.type === 'fixed') return Math.max(0, regularMMK - promo.value);
    if (promo.type === 'percent') return Math.max(0, Util.roundHalfUp(regularMMK * (1 - promo.value / 100)));
    if (promo.type === 'setPrice') return Math.max(0, promo.value);
    return regularMMK;
  };

  /** Lowest final price wins; a tie is broken by the earliest promotion ID.
      Returns the promotion itself (or null) so callers can read its id,
      type and value directly. */
  R.bestPromotion = function (promotions, serviceId, size, dayKey, regularMMK) {
    const list = (promotions || []).filter(p => R.promotionApplies(p, serviceId, size, dayKey));
    if (!list.length) return null;
    const scored = list.map(p => ({ promo: p, finalMMK: R.promotionFinal(p, regularMMK) }));
    scored.sort(function (a, b) {
      if (a.finalMMK !== b.finalMMK) return a.finalMMK - b.finalMMK;
      const d = R.promoIdOrder(a.promo) - R.promoIdOrder(b.promo);
      if (d !== 0) return d;
      return String(a.promo.id).localeCompare(String(b.promo.id));
    });
    return scored[0].promo;
  };

  /* =======================================================================
     Quotes
     ===================================================================== */

  R.quoteTotals = function (quote) {
    if (!quote) return { subtotalMMK: 0, discountMMK: 0, roundingMMK: 0, totalMMK: 0, repairApprovalBasisMMK: 0 };
    const lines = quote.lines || [];
    const t = R.totals(lines, 0);
    return {
      subtotalMMK: t.subtotalMMK,
      discountMMK: t.discountMMK,
      roundingMMK: t.roundingMMK,
      totalMMK: t.totalMMK,
      repairApprovalBasisMMK: quote.repairApprovalBasisMMK !== undefined && quote.repairApprovalBasisMMK !== null
        ? quote.repairApprovalBasisMMK
        : R.approvalBasis(lines)
    };
  };

  /** Lines committed to a job when authorised scope is accepted. */
  R.commitLinesFromQuote = function (quote) {
    return (quote.lines || []).filter(function (l) {
      return !R.lineIsPartLike(l);
    }).map(function (l) { return Util.deepCopy(l); });
  };

  /** A Redo carries an explicit Manager-set price. It needs no customer quote. */
  R.isPricedRedo = function (job) {
    return !!(job && job.redoOfJobId && Util.isNum(job.managerSetRedoChargeMMK));
  };

  /** Billable lines for a job: committed labour/zero-charge lines + issued shop material. */
  R.receiptLines = function (job) {
    const lines = [];
    (job.committedServiceLines || []).forEach(function (l) {
      lines.push(Util.deepCopy(l));
    });
    /* The Manager-set price of a Redo is its charge. It is not a customer quote,
       so it is added once here even when the Redo has no committed line. */
    if (R.isPricedRedo(job) && !lines.some(function (l) { return l.redoCharge; })) {
      lines.unshift({
        id: 'R-' + job.id + '-L1', kind: 'service', label: 'Redo work (Manager-set price)',
        quantity: 1, unitPriceMMK: job.managerSetRedoChargeMMK, discountMMK: 0,
        totalMMK: job.managerSetRedoChargeMMK, serviceId: null, redoCharge: true
      });
    }
    (job.materialIssues || []).forEach(function (iss) {
      if (!iss.disposition || iss.disposition === 'Consumed' || iss.disposition === 'Used') {
        if (iss.returnedQuantity && iss.returnedQuantity >= iss.quantity) return;
      }
      if (iss.disposition === 'Returned') return;
      lines.push({
        id: iss.id,
        kind: iss.kind || 'part',
        label: iss.label,
        quantity: iss.quantity - (iss.returnedQuantity || 0),
        unitPriceMMK: iss.unitPriceMMK,
        discountMMK: 0,
        totalMMK: (iss.quantity - (iss.returnedQuantity || 0)) * iss.unitPriceMMK,
        itemId: iss.itemId,
        unit: iss.unit,
        source: 'Shop'
      });
    });
    return lines;
  };

  /** What a customer would pay now for this job (draft receipt). */
  R.jobTotals = function (job) {
    const lines = R.receiptLines(job);
    const t = R.totals(lines, 0);
    t.lines = lines;
    return t;
  };

  R.jobIsSettled = function (job) {
    if (job.paymentStatus === 'Paid' || job.paymentStatus === 'No charge') {
      /* a later correction may move it back to review */
      return R.effectiveBalance(job) === 0;
    }
    return false;
  };

  /* =======================================================================
     Corrections — append only, original entries are retained
     ===================================================================== */

  R.jobCorrections = function (jobId) {
    return (Store.state.corrections || []).filter(c => c.jobId === jobId);
  };

  R.effectiveCharge = function (job) {
    const rc = Store.jobReceipt(job.id);
    if (!rc) return 0;
    let total = rc.totalMMK;
    R.jobCorrections(job.id).forEach(function (c) {
      total += c.chargeDeltaMMK || 0;
    });
    return total;
  };

  R.netPayment = function (job) {
    let total = 0;
    (Store.state.payments || []).forEach(function (p) {
      if (p.jobId === job.id) total += p.amountAppliedMMK || 0;
    });
    R.jobCorrections(job.id).forEach(function (c) {
      if (c.type === 'charge') total += (c.refundDeltaMMK || 0);
      if (c.type === 'method') total += (c.reverseDeltaMMK || 0) + (c.newDeltaMMK || 0);
    });
    return total;
  };

  R.effectiveBalance = function (job) {
    return R.effectiveCharge(job) - R.netPayment(job);
  };

  /** Balance implied by a correction before it is applied. */
  R.previewCorrectionBalance = function (job, correction) {
    const rc = Store.jobReceipt(job.id);
    let charge = rc ? rc.totalMMK : 0;
    let paid = 0;
    (Store.state.payments || []).forEach(function (p) {
      if (p.jobId === job.id) paid += p.amountAppliedMMK || 0;
    });
    R.jobCorrections(job.id).forEach(function (c) {
      charge += c.chargeDeltaMMK || 0;
      if (c.type === 'charge') paid += (c.refundDeltaMMK || 0);
      if (c.type === 'method') paid += (c.reverseDeltaMMK || 0) + (c.newDeltaMMK || 0);
    });
    charge += correction.chargeDeltaMMK || 0;
    if (correction.type === 'charge') paid += (correction.refundDeltaMMK || 0);
    if (correction.type === 'method') paid += (correction.reverseDeltaMMK || 0) + (correction.newDeltaMMK || 0);
    return { chargeMMK: charge, paidMMK: paid, balanceMMK: charge - paid };
  };

  /* =======================================================================
     Work status guards
     ===================================================================== */

  R.approvalSatisfied = function (job) {
    if (job.approvalStatus === 'Approved') return true;
    if (job.approvalStatus === 'Not required') return true;
    return false;
  };

  R.hasPendingExtra = function (job) {
    return (job.quotes || []).some(function (q) { return q.isExtraWork && q.status === 'Pending'; });
  };

  R.hasDeclinedExtra = function (job) {
    return (job.quotes || []).some(function (q) { return q.isExtraWork && q.status === 'Declined'; });
  };

  /** Material lines still to issue for the authorised quote. */
  R.pendingMaterialLines = function (job) {
    const q = Store.quote(job);
    if (!q || q.status !== 'Approved') return [];
    const out = [];
    (q.lines || []).forEach(function (line) {
      if (!R.lineIsPartLike(line)) return;
      if (R.lineIsCustomerSupplied(line)) return;
      const issued = Util.sum(job.materialIssues || [], function (iss) {
        if (iss.quoteLineId !== line.id) return 0;
        if (iss.disposition === 'Returned') return 0;
        return iss.quantity - (iss.returnedQuantity || 0);
      });
      const required = (line.quantity || 0);
      if (issued < required) out.push({ line: line, issued: issued, remaining: required - issued });
    });
    return out;
  };

  R.shortages = function (job) {
    return R.pendingMaterialLines(job).filter(function (p) {
      const item = Store.item(p.line.itemId);
      if (!item) return false;
      return item.onHand < p.remaining;
    });
  };

  R.canStartWork = function (job) {
    const reasons = [];
    if (!job.bayId) reasons.push('Assign a bay before starting work.');
    if (!(job.assignedStaffIds || []).length) reasons.push('Assign at least one mechanic before starting work.');
    if (!R.approvalSatisfied(job)) {
      reasons.push(job.approvalStatus === 'Declined'
        ? 'The customer declined this quote. A new proposal is required.'
        : 'Customer approval is still pending.');
    }
    if (job.lifecycleStatus === 'Cancelled') reasons.push('This job was cancelled.');
    return { ok: reasons.length === 0, reasons: reasons };
  };

  R.canComplete = function (job) {
    const reasons = [];
    const checklist = job.requiredChecklist || [];
    if (!checklist.length) reasons.push('Add a required checklist before completing.');
    checklist.forEach(function (c) { if (!c.done) reasons.push('Checklist item not done: ' + c.text); });
    const short = R.shortages(job);
    if (short.length) {
      reasons.push('Shortage unresolved: ' + short.map(function (s) {
        const item = Store.item(s.line.itemId);
        return (item ? item.name : s.line.label) + ' (need ' + s.remaining + ', on hand ' + (item ? item.onHand : 0) + ')';
      }).join('; '));
    }
    if (R.hasPendingExtra(job)) reasons.push('Extra work is still waiting for a customer decision.');
    if (R.hasDeclinedExtra(job) && !job.extraWorkWithdrawn) {
      reasons.push('Withdraw the declined extra work before completing the original scope.');
    }
    return { ok: reasons.length === 0, reasons: reasons };
  };

  R.canClose = function (job) {
    const reasons = [];
    if (job.workStatus !== 'Completed') reasons.push('Work is not completed.');
    if (!R.jobIsSettled(job)) reasons.push('The effective balance is not settled.');
    if (job.collectionStatus !== 'Collected') reasons.push('The vehicle has not been collected.');
    return { ok: reasons.length === 0, reasons: reasons };
  };

  /* =======================================================================
     Stock
     ===================================================================== */

  R.lowStock = function (item) { return item.onHand <= item.reorderLevel; };

  R.itemMovements = function (itemId) {
    return (Store.state.stockMovements || []).filter(m => m.itemId === itemId);
  };

  R.issueRemaining = function (job, quoteLine) {
    const issued = Util.sum(job.materialIssues || [], function (iss) {
      if (iss.quoteLineId !== quoteLine.id) return 0;
      if (iss.disposition === 'Returned') return 0;
      return iss.quantity - (iss.returnedQuantity || 0);
    });
    return (quoteLine.quantity || 0) - issued;
  };

  /* =======================================================================
     Bays
     ===================================================================== */

  R.bayOccupant = function (bayId, excludeJobId) {
    return (Store.state.jobs || []).find(function (j) {
      return j.bayId === bayId && j.id !== excludeJobId
        && j.lifecycleStatus === 'Open' && j.workStatus !== 'Completed' && j.workStatus !== 'Cancelled';
    }) || null;
  };

  R.availableBays = function () {
    return Store.state.bays.filter(function (b) {
      return b.enabled && !R.bayOccupant(b.id);
    });
  };

  R.completedUncollected = function () {
    return (Store.state.jobs || []).filter(function (j) {
      return j.lifecycleStatus === 'Open' && j.workStatus === 'Completed' && j.collectionStatus !== 'Collected';
    });
  };

  R.openJobs = function () {
    return (Store.state.jobs || []).filter(function (j) { return j.lifecycleStatus === 'Open'; });
  };

  R.lowStockItems = function () {
    return (Store.state.items || []).filter(R.lowStock);
  };

  /* =======================================================================
     Bookings — [start, end) overlap, no-show at start + 30 minutes
     ===================================================================== */

  R.bookingOverlap = function (bayId, startAt, endAt, excludeId) {
    const s = Util.parseDate(startAt), e = Util.parseDate(endAt);
    if (!s || !e) return null;
    return (Store.state.bookings || []).find(function (b) {
      if (b.id === excludeId) return false;
      if (b.bayId !== bayId) return false;
      if (b.status === 'Cancelled') return false;
      const bs = Util.parseDate(b.startAt), be = Util.parseDate(b.endAt);
      if (!bs || !be) return false;
      return s.getTime() < be.getTime() && bs.getTime() < e.getTime();
    }) || null;
  };

  R.noShowDue = function (booking, nowIso) {
    if (!booking || booking.arrivedAt) return false;
    if (booking.status === 'Cancelled' || booking.status === 'Arrived' || booking.status === 'Checked in') return false;
    const deadline = Util.msBetween(booking.startAt, nowIso);
    return deadline >= 30 * 60000;
  };

  /* =======================================================================
     Reminders
     ===================================================================== */

  /** Collection reminder: completed more than three days ago and not collected. */
  R.collectionEligible = function (job, nowIso) {
    if (!job || !job.completedAt) return false;
    if (job.collectionStatus === 'Collected') return false;
    if (job.lifecycleStatus === 'Cancelled') return false;
    return Util.msBetween(job.completedAt, nowIso) > 3 * 86400000;
  };

  /** Latest known mileage for a vehicle (highest recorded visit). */
  R.latestMileage = function (vehicleId) {
    const jobs = (Store.state.jobs || []).filter(j => j.vehicleId === vehicleId && Util.isNum(j.mileageKm));
    if (!jobs.length) return null;
    return Math.max.apply(null, jobs.map(j => j.mileageKm));
  };

  R.serviceDue = function (job, nowIso) {
    if (!job) return null;
    const today = Util.dayKey(nowIso);
    if (job.nextServiceDueDate && job.nextServiceDueDate <= today) {
      return { reason: 'Due date reached', dueDate: job.nextServiceDueDate };
    }
    if (job.nextServiceDueMileageKm && Util.isNum(job.nextServiceDueMileageKm)) {
      const latest = R.latestMileage(job.vehicleId);
      if (latest !== null && latest >= job.nextServiceDueMileageKm) {
        return { reason: 'Mileage reached', dueMileageKm: job.nextServiceDueMileageKm, latestMileageKm: latest };
      }
    }
    return null;
  };

  /* =======================================================================
     Reporting
     ===================================================================== */

  R.inRange = function (iso, fromDay, toDay) {
    const k = Util.dayKey(iso);
    if (!k) return false;
    return k >= fromDay && k <= toDay;
  };

  /** Receipt revenue = finalised receipt charges + charge corrections. */
  R.revenue = function (fromDay, toDay) {
    let total = 0;
    const rows = [];
    (Store.state.receipts || []).forEach(function (r) {
      if (!R.inRange(r.issuedAt, fromDay, toDay)) return;
      total += r.totalMMK;
      rows.push({ kind: 'Receipt', id: r.id, at: r.issuedAt, jobId: r.jobId, amountMMK: r.totalMMK });
    });
    (Store.state.corrections || []).forEach(function (c) {
      if (!c.chargeDeltaMMK) return;
      if (!R.inRange(c.at, fromDay, toDay)) return;
      total += c.chargeDeltaMMK;
      rows.push({ kind: 'Charge correction', id: c.id, at: c.at, jobId: c.jobId, amountMMK: c.chargeDeltaMMK });
    });
    return { totalMMK: total, rows: rows };
  };

  /** Collections = signed payments, refunds and method corrections. */
  R.collections = function (fromDay, toDay) {
    const byMethod = { Cash: 0, KBZPay: 0, WavePay: 0 };
    let total = 0;
    const rows = [];
    (Store.state.payments || []).forEach(function (p) {
      if (!R.inRange(p.at, fromDay, toDay)) return;
      const amt = p.amountAppliedMMK || 0;
      total += amt;
      byMethod[p.method] = (byMethod[p.method] || 0) + amt;
      rows.push({ kind: 'Payment', id: p.id, at: p.at, jobId: p.jobId, method: p.method, amountMMK: amt });
    });
    (Store.state.corrections || []).forEach(function (c) {
      if (!R.inRange(c.at, fromDay, toDay)) return;
      if (c.type === 'charge' && c.refundDeltaMMK) {
        total += c.refundDeltaMMK;
        byMethod[c.refundMethod || 'Cash'] = (byMethod[c.refundMethod || 'Cash'] || 0) + c.refundDeltaMMK;
        rows.push({ kind: 'Refund correction', id: c.id, at: c.at, jobId: c.jobId, method: c.refundMethod || 'Cash', amountMMK: c.refundDeltaMMK });
      }
      if (c.type === 'method') {
        if (c.reverseDeltaMMK) {
          total += c.reverseDeltaMMK;
          byMethod[c.reverseMethod] = (byMethod[c.reverseMethod] || 0) + c.reverseDeltaMMK;
          rows.push({ kind: 'Method reversal', id: c.id, at: c.at, jobId: c.jobId, method: c.reverseMethod, amountMMK: c.reverseDeltaMMK });
        }
        if (c.newDeltaMMK) {
          total += c.newDeltaMMK;
          byMethod[c.newMethod] = (byMethod[c.newMethod] || 0) + c.newDeltaMMK;
          rows.push({ kind: 'Method re-entry', id: c.id, at: c.at, jobId: c.jobId, method: c.newMethod, amountMMK: c.newDeltaMMK });
        }
      }
    });
    return { totalMMK: total, byMethod: byMethod, rows: rows };
  };

  /** Snapshotted material cost for a job (null when a cost was never captured). */
  R.materialCost = function (job) {
    let total = 0;
    let missing = false;
    (job.materialIssues || []).forEach(function (iss) {
      if (iss.disposition === 'Returned') return;
      if (iss.unitCostSnapshotMMK === null || iss.unitCostSnapshotMMK === undefined) { missing = true; return; }
      total += (iss.quantity - (iss.returnedQuantity || 0)) * iss.unitCostSnapshotMMK;
    });
    return { costMMK: total, missing: missing };
  };

  /** Jobs that count for commission: paid, not a Redo. */
  R.commissionEligibleJobs = function (fromDay, toDay) {
    return (Store.state.jobs || []).filter(function (j) {
      if (j.redoOfJobId) return false;
      if (j.paymentStatus !== 'Paid') return false;
      const rc = Store.jobReceipt(j.id);
      if (!rc) return false;
      if (!R.inRange(rc.issuedAt, fromDay, toDay)) return false;
      return true;
    });
  };

  /** Commission preview for a rule. Illustrative only — never a real rate. */
  R.commissionPreview = function (rule, fromDay, toDay) {
    if (!rule) return { configured: false, totalMMK: null, perStaff: [], jobs: [] };
    const jobs = R.commissionEligibleJobs(fromDay, toDay);
    const perStaff = {};
    const detail = [];
    let total = 0;
    jobs.forEach(function (job) {
      const rc = Store.jobReceipt(job.id);
      const labourLines = (rc.lines || []).filter(function (l) {
        if (l.kind !== 'service') return false;
        if (!l.serviceId) return false;
        if ((rule.eligibleServiceIds || []).indexOf(l.serviceId) < 0) return false;
        return true;
      });
      if (!labourLines.length) return;
      const base = Util.sum(labourLines, function (l) {
        if (rule.basis === 'regularLabour') return (l.unitPriceMMK || 0) * (l.quantity || 1);
        return l.totalMMK || 0;
      });
      let amount = 0;
      if (rule.type === 'percent') amount = Util.roundHalfUp(base * rule.value / 100);
      else if (rule.type === 'fixedPerService') amount = rule.value * labourLines.length;
      if (!amount) return;
      const staff = (job.assignedStaffIds || []).filter(function (sid) {
        const u = Util.byId(Store.state.users, sid);
        if (!u) return false;
        if ((rule.eligibleRoles || []).length && (rule.eligibleRoles || []).indexOf(u.role) < 0) return false;
        return true;
      }).sort();
      if (!staff.length) return;
      total += amount;
      detail.push({ jobId: job.id, baseMMK: base, amountMMK: amount, staffIds: staff });
      const each = Math.floor(amount / staff.length);
      let leftover = amount - each * staff.length;
      staff.forEach(function (sid) {
        perStaff[sid] = (perStaff[sid] || 0) + each;
      });
      /* leftover whole MMK allocated by sorted staff ID */
      const sorted = staff.slice().sort();
      for (let i = 0; i < leftover; i += 1) perStaff[sorted[i % sorted.length]] += 1;
    });
    const rows = Object.keys(perStaff).sort().map(function (sid) {
      return { staffId: sid, name: Store.staffName(sid), amountMMK: perStaff[sid] };
    });
    return { configured: true, totalMMK: total, perStaff: rows, jobs: detail };
  };

  /* =======================================================================
     Convenience formatting used by several views
     ===================================================================== */

  R.jobTitle = function (job) {
    if (!job) return '';
    const v = Store.vehicle(job.vehicleId);
    return job.id + (v ? ' · ' + v.plate : '');
  };

  R.jobServiceLabel = function (job) {
    const names = (job.requestedServiceIds || []).map(function (id) {
      const s = Store.service(id);
      return s ? s.nameEN : id;
    });
    return names.length ? names.join(', ') : 'Workshop visit';
  };

  global.Rules = R;
})(window);
