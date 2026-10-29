/* js/views/s19.js — S19 Reports and commission (Owner and Manager).

   Every figure on this screen is computed from the live in-memory demo state
   through the shared Rules helpers (Rules.revenue, Rules.collections,
   Rules.materialCost, Rules.commissionPreview, Rules.lowStockItems).
   Nothing here is a real business record — all money is simulated. */
(function (global) {
  'use strict';

  const E = Util.esc;

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'services', label: 'Services' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'commission', label: 'Commission' },
    { id: 'promotions', label: 'Promotions' },
    { id: 'redo', label: 'Redo' }
  ];
  const ROLES = ['Owner', 'Manager', 'Cashier', 'Mechanic'];
  const PERIODS = ['Per job', 'Weekly', 'Monthly'];
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MAX_DAILY_ROWS = 92;

  /* ------------------------------------------------------------------ */
  /* small helpers                                                       */
  /* ------------------------------------------------------------------ */

  function isDay(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function dayList(from, to) {
    const out = [];
    let d = from;
    let guard = 0;
    while (d <= to && guard < 400) {
      out.push(d);
      d = Util.addDaysToKey(d, 1);
      guard += 1;
    }
    return out;
  }

  function dayLabel(day) {
    if (!isDay(day)) return '—';
    return parseInt(day.slice(8, 10), 10) + ' ' + MONTH_NAMES[parseInt(day.slice(5, 7), 10) - 1] + ' ' + day.slice(0, 4);
  }

  function monthKeyOf(day) { return String(day).slice(0, 7); }

  function monthLabel(key) {
    return MONTH_NAMES[parseInt(String(key).slice(5, 7), 10) - 1] + ' ' + String(key).slice(0, 4);
  }

  function lastDayOfMonth(key) {
    const y = parseInt(String(key).slice(0, 4), 10);
    const m = parseInt(String(key).slice(5, 7), 10);
    const d = new Date(Date.UTC(y, m, 0));
    return String(key).slice(0, 7) + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  function rangeOf(ctx) {
    const p = (ctx && ctx.params) || {};
    const demoDay = Store.today();
    const from = isDay(p.from) ? p.from : demoDay;
    const to = isDay(p.to) ? p.to : demoDay;
    return { from: from, to: to, ok: from <= to };
  }

  function num(n) {
    if (!Util.isNum(n)) return { html: '—', className: 'num' };
    return { html: E(Util.mmk(n)), className: 'num' };
  }

  function numSigned(n) {
    if (!Util.isNum(n)) return { html: '—', className: 'num' };
    return { html: E(Util.mmkSigned(n)), className: 'num' };
  }

  function pickNum(obj, names) {
    if (!obj) return null;
    for (let i = 0; i < names.length; i += 1) {
      if (Util.isNum(obj[names[i]])) return obj[names[i]];
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* state readers                                                       */
  /* ------------------------------------------------------------------ */

  function jobsWithReceiptsIn(from, to) {
    return (Store.state.jobs || []).filter(function (j) {
      const rc = Store.jobReceipt(j.id);
      return !!rc && Rules.inRange(rc.issuedAt, from, to);
    });
  }

  function materialCostIn(from, to) {
    let total = 0;
    let missing = false;
    jobsWithReceiptsIn(from, to).forEach(function (j) {
      const m = Rules.materialCost(j);
      if (m.missing) missing = true;
      total += m.costMMK;
    });
    return { costMMK: total, missing: missing };
  }

  function grossProfit(revenueMMK, material) {
    if (material.missing) return { complete: false, valueMMK: null };
    return { complete: true, valueMMK: revenueMMK - material.costMMK };
  }

  function discountsIn(from, to) {
    let total = 0;
    (Store.state.receipts || []).forEach(function (r) {
      if (!Rules.inRange(r.issuedAt, from, to)) return;
      total += r.discountMMK || 0;
      (r.lines || []).forEach(function (l) { total += l.discountMMK || 0; });
    });
    return total;
  }

  function checkedInOn(day) {
    return (Store.state.jobs || []).filter(function (j) {
      return Util.dayKey(j.createdAt) === day;
    });
  }

  function completedJobsIn(from, to) {
    return (Store.state.jobs || []).filter(function (j) {
      if (j.workStatus !== 'Completed') return false;
      if (!j.completedAt) return false;
      return Rules.inRange(j.completedAt, from, to);
    });
  }

  function redoJobsIn(from, to) {
    return (Store.state.jobs || []).filter(function (j) {
      if (!j.redoOfJobId) return false;
      return Rules.inRange(j.createdAt, from, to);
    });
  }

  function correctionsSignedOn(day) {
    let total = 0;
    (Store.state.corrections || []).forEach(function (c) {
      if (!Util.dayKey(c.at) || Util.dayKey(c.at) !== day) return;
      total += c.chargeDeltaMMK || 0;
    });
    return total;
  }

  /* Daily closing differences. The closing record is written by the daily
     closing screen; the shape is read defensively so a missing or renamed
     field never invents a number. */
  function closingDay(c) {
    if (!c) return null;
    if (c.day) return c.day;
    if (c.date) return c.date;
    const iso = c.at || c.closedAt || c.closedOn;
    return iso ? Util.dayKey(iso) : null;
  }

  function closingDifference(c) {
    if (!c) return null;
    const raw = c.differenceMMK !== undefined ? c.differenceMMK
      : (c.totalDifferenceMMK !== undefined ? c.totalDifferenceMMK : null);
    if (raw !== null && raw !== undefined) {
      if (Util.isNum(raw)) return raw;
      if (typeof raw === 'object') {
        let sum = 0;
        let found = false;
        Object.keys(raw).forEach(function (k) {
          if (Util.isNum(raw[k])) { sum += raw[k]; found = true; }
        });
        return found ? sum : null;
      }
    }
    const counted = c.countedMMK !== undefined ? c.countedMMK : c.countedCashMMK;
    const expected = c.expectedMMK !== undefined ? c.expectedMMK : c.expectedCashMMK;
    if (Util.isNum(counted) && Util.isNum(expected)) return counted - expected;
    if (counted && expected && typeof counted === 'object' && typeof expected === 'object') {
      let sum = 0;
      let found = false;
      Object.keys(expected).forEach(function (k) {
        if (Util.isNum(counted[k]) && Util.isNum(expected[k])) { sum += counted[k] - expected[k]; found = true; }
      });
      return found ? sum : null;
    }
    return null;
  }

  function closingDifferenceFor(day) {
    const list = (Store.state.cashClosings || []).filter(function (c) { return closingDay(c) === day; });
    if (!list.length) return null;
    let total = 0;
    let found = false;
    list.forEach(function (c) {
      const d = closingDifference(c);
      if (d === null) return;
      total += d;
      found = true;
    });
    return found ? total : null;
  }

  /* ------------------------------------------------------------------ */
  /* commission                                                          */
  /* ------------------------------------------------------------------ */

  /* Mirrors the split done inside Rules.commissionPreview (equal shares,
     leftover whole MMK to the sorted staff ID) so a payout can be recorded
     for one staff member and one job. Rules exposes the staff totals only. */
  function splitStaff(amountMMK, staffIds) {
    const staff = (staffIds || []).slice().sort();
    if (!staff.length) return [];
    const each = Math.floor(amountMMK / staff.length);
    const out = staff.map(function (sid) { return { staffId: sid, amountMMK: each }; });
    const leftover = amountMMK - each * staff.length;
    for (let i = 0; i < leftover; i += 1) out[i % out.length].amountMMK += 1;
    return out;
  }

  /* A charge correction only recalculates commission when it says how the
     change splits between labour and material. */
  function correctionAllocation(c) {
    return {
      labour: pickNum(c, ['labourDeltaMMK', 'labourAllocationMMK', 'labourShareMMK', 'labourMMK']),
      material: pickNum(c, ['materialDeltaMMK', 'materialAllocationMMK', 'materialShareMMK', 'materialMMK'])
    };
  }

  function eligibleLabourLines(jobId, rule) {
    const job = Store.job(jobId);
    const rc = job ? Store.jobReceipt(job.id) : null;
    if (!rc) return [];
    return (rc.lines || []).filter(function (l) {
      if (l.kind !== 'service') return false;
      if (!l.serviceId) return false;
      if ((rule.eligibleServiceIds || []).indexOf(l.serviceId) < 0) return false;
      return true;
    });
  }

  function commissionJobs(rule, from, to) {
    const preview = Rules.commissionPreview(rule, from, to);
    if (!preview.configured) return { preview: preview, rows: [], adjusted: false };
    const rows = [];
    let adjusted = false;
    preview.jobs.forEach(function (j) {
      const job = Store.job(j.jobId);
      const rc = job ? Store.jobReceipt(job.id) : null;
      const corrections = (Store.state.corrections || []).filter(function (c) {
        if (c.jobId !== j.jobId) return false;
        if (!Util.isNum(c.chargeDeltaMMK) || c.chargeDeltaMMK === 0) return false;
        return Rules.inRange(c.at, from, to);
      });
      let base = j.baseMMK;
      let amount = j.amountMMK;
      let needsReview = false;
      let note = '';
      if (corrections.length) {
        const alloc = corrections.map(correctionAllocation);
        const allAllocated = alloc.every(function (a) { return a.labour !== null; });
        if (!allAllocated) {
          needsReview = true;
          note = 'A charge correction changed this job without a labour/material allocation.';
        } else {
          const delta = alloc.reduce(function (sum, a) { return sum + a.labour; }, 0);
          base = j.baseMMK + delta;
          if (rule.type === 'percent') amount = Util.roundHalfUp(base * rule.value / 100);
          else if (rule.type === 'fixedPerService') amount = rule.value * eligibleLabourLines(j.jobId, rule).length;
          adjusted = true;
          note = 'Recalculated from the corrected labour allocation.';
        }
      }
      const vehicle = job ? Store.vehicle(job.vehicleId) : null;
      const serviceId = rc ? ((rc.lines || []).filter(function (l) { return l.kind === 'service' && l.serviceId; })[0] || {}).serviceId : null;
      const svc = serviceId ? Store.service(serviceId) : null;
      rows.push({
        jobId: j.jobId,
        vehiclePlate: vehicle ? vehicle.plate : '—',
        serviceLabel: svc ? svc.nameEN : '—',
        baseMMK: base,
        amountMMK: needsReview ? null : amount,
        staffIds: j.staffIds,
        split: needsReview ? [] : splitStaff(amount, j.staffIds),
        needsReview: needsReview,
        note: note,
        receiptId: rc ? rc.id : '—'
      });
    });
    return { preview: preview, rows: rows, adjusted: adjusted };
  }

  function commissionStaff(rows) {
    const map = {};
    rows.forEach(function (r) {
      if (r.needsReview) return;
      r.split.forEach(function (s) {
        if (!map[s.staffId]) map[s.staffId] = { staffId: s.staffId, name: Store.staffName(s.staffId), earnedMMK: 0, jobs: 0 };
        map[s.staffId].earnedMMK += s.amountMMK;
        map[s.staffId].jobs += 1;
      });
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }

  function payoutsOf(staffId, jobId, ruleId) {
    return (Store.state.commissionPayouts || []).filter(function (p) {
      if (p.staffId !== staffId) return false;
      if (jobId && p.jobId !== jobId) return false;
      if (ruleId && p.ruleId !== ruleId) return false;
      return true;
    });
  }

  function paidFor(staffId, jobId, ruleId) {
    return Util.sum(payoutsOf(staffId, jobId, ruleId), function (p) { return p.amountMMK || 0; });
  }

  /* ------------------------------------------------------------------ */
  /* derived report data                                                 */
  /* ------------------------------------------------------------------ */

  function dailyRows(from, to) {
    const days = dayList(from, to);
    const shown = days.slice(0, MAX_DAILY_ROWS);
    return {
      rows: shown.map(function (day) {
        const rev = Rules.revenue(day, day);
        const col = Rules.collections(day, day);
        const jobs = checkedInOn(day);
        const vehicles = {};
        jobs.forEach(function (j) { vehicles[j.vehicleId] = true; });
        return {
          day: day,
          revenueMMK: rev.totalMMK,
          collectionsMMK: col.totalMMK,
          byMethod: col.byMethod || {},
          jobs: jobs.length,
          vehicles: Object.keys(vehicles).length,
          closing: closingDifferenceFor(day),
          correctionsMMK: correctionsSignedOn(day)
        };
      }),
      truncated: days.length > shown.length,
      totalDays: days.length
    };
  }

  function monthlyRows(from, to) {
    const keys = [];
    const days = dayList(from, to);
    days.forEach(function (d) {
      const k = monthKeyOf(d);
      if (keys.indexOf(k) < 0) keys.push(k);
    });
    return keys.map(function (k) {
      const mFrom = from > (k + '-01') ? from : (k + '-01');
      const mTo = to < lastDayOfMonth(k) ? to : lastDayOfMonth(k);
      const rev = Rules.revenue(mFrom, mTo);
      const col = Rules.collections(mFrom, mTo);
      const material = materialCostIn(mFrom, mTo);
      const gp = grossProfit(rev.totalMMK, material);
      const rule = Store.state.commissionRule;
      const preview = rule ? Rules.commissionPreview(rule, mFrom, mTo) : { configured: false, totalMMK: null };
      return {
        key: k,
        label: monthLabel(k),
        from: mFrom,
        to: mTo,
        revenueMMK: rev.totalMMK,
        collectionsMMK: col.totalMMK,
        materialMMK: material.costMMK,
        materialMissing: material.missing,
        grossProfit: gp,
        commissionMMK: preview.configured ? preview.totalMMK : null,
        discountMMK: discountsIn(mFrom, mTo),
        redoCount: redoJobsIn(mFrom, mTo).length,
        completedCount: completedJobsIn(mFrom, mTo).length
      };
    });
  }

  function servicePerformance(from, to) {
    const map = {};
    (Store.state.receipts || []).forEach(function (r) {
      if (!Rules.inRange(r.issuedAt, from, to)) return;
      (r.lines || []).forEach(function (l) {
        if (l.kind !== 'service') return;
        const key = l.serviceId || ('label:' + l.label);
        if (!map[key]) map[key] = { key: key, serviceId: l.serviceId || null, label: l.label, jobs: {}, lines: 0, amountMMK: 0 };
        map[key].jobs[r.jobId] = true;
        map[key].lines += 1;
        map[key].amountMMK += l.totalMMK || 0;
      });
    });
    const list = Object.keys(map).map(function (k) {
      const row = map[k];
      row.jobCount = Object.keys(row.jobs).length;
      delete row.jobs;
      return row;
    });
    list.sort(function (a, b) { return b.amountMMK - a.amountMMK; });
    return list;
  }

  function popularServices(jobs) {
    const map = {};
    jobs.forEach(function (j) {
      (j.committedServiceLines || []).forEach(function (l) {
        if (!l.serviceId) return;
        if (!map[l.serviceId]) map[l.serviceId] = { serviceId: l.serviceId, jobs: {}, count: 0, amountMMK: 0 };
        map[l.serviceId].jobs[j.id] = true;
        map[l.serviceId].count += 1;
        map[l.serviceId].amountMMK += l.totalMMK || 0;
      });
    });
    const list = Object.keys(map).map(function (k) {
      const row = map[k];
      row.jobCount = Object.keys(row.jobs).length;
      delete row.jobs;
      return row;
    });
    list.sort(function (a, b) { return b.jobCount - a.jobCount || b.amountMMK - a.amountMMK; });
    return list;
  }

  function stockPosition() {
    const items = (Store.state.items || []).map(function (it) {
      const cost = Util.isNum(it.latestPurchaseCostMMK) ? it.latestPurchaseCostMMK : 0;
      return {
        id: it.id,
        name: it.name,
        type: it.type,
        unit: it.unit,
        onHand: it.onHand,
        reorderLevel: it.reorderLevel,
        costMMK: cost,
        valueMMK: (it.onHand || 0) * cost,
        low: Rules.lowStock(it)
      };
    });
    return {
      items: items,
      totalValueMMK: Util.sum(items, function (i) { return i.valueMMK; }),
      lowStock: Rules.lowStockItems()
    };
  }

  function movementsIn(from, to) {
    return (Store.state.stockMovements || []).filter(function (m) {
      return Rules.inRange(m.at, from, to);
    });
  }

  function usageIn(from, to) {
    const map = {};
    movementsIn(from, to).forEach(function (m) {
      if (m.type !== 'Job issue') return;
      const item = Store.item(m.itemId);
      const qty = Math.abs(m.delta || 0);
      const key = m.itemId;
      if (!map[key]) map[key] = { itemId: m.itemId, name: item ? item.name : m.itemId, type: item ? item.type : '—', unit: m.unit, quantity: 0, costMMK: 0 };
      map[key].quantity += qty;
      map[key].costMMK += qty * (Util.isNum(m.unitCostMMK) ? m.unitCostMMK : 0);
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }

  function promotionPricePreview(from, to) {
    const out = [];
    const promos = Store.state.promotions || [];
    (Store.state.services || []).forEach(function (svc) {
      const sizes = svc.priceBySizeMMK ? Object.keys(svc.priceBySizeMMK) : (svc.fixedPriceMMK !== null && svc.fixedPriceMMK !== undefined ? ['Fixed'] : []);
      sizes.forEach(function (size) {
        const regular = svc.priceBySizeMMK ? svc.priceBySizeMMK[size] : svc.fixedPriceMMK;
        if (!Util.isNum(regular)) return;
        const best = Rules.bestPromotion(promos, svc.id, size === 'Fixed' ? null : size, from, regular);
        out.push({
          serviceId: svc.id,
          serviceName: svc.nameEN,
          size: size === 'Fixed' ? 'Any size' : size,
          regularMMK: regular,
          promoId: best ? best.id : null,
          promoName: best ? (best.nameEN || best.id) : null,
          finalMMK: best ? Rules.promotionFinal(best, regular) : regular
        });
      });
    });
    return out;
  }

  function rangeHasActivity(r) {
    if (!r.ok) return false;
    const rev = Rules.revenue(r.from, r.to);
    const col = Rules.collections(r.from, r.to);
    if (rev.rows.length || col.rows.length) return true;
    if (checkedInOn(r.from).length) return true;
    if (movementsIn(r.from, r.to).length) return true;
    if (completedJobsIn(r.from, r.to).length) return true;
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* fragments                                                           */
  /* ------------------------------------------------------------------ */

  function dateBasis(r) {
    return '<p class="note">Date basis: the demo workshop date in Asia/Yangon. The demo clock is fixed at ' +
      E(Util.fmtDateTime(Store.now())) + '. All money and every record on this screen are simulated.</p>';
  }

  function dateField(id, label, name, value) {
    return '<div class="field">' +
      '<label for="' + E(id) + '">' + E(label) + ' <span class="req" aria-hidden="true">*</span></label>' +
      '<input type="date" id="' + E(id) + '" name="' + E(name) + '" value="' + E(value) + '" required' +
      ' data-live="reports.range" aria-describedby="report-range-hint">' +
      '</div>';
  }

  function filterCard(r) {
    const body = '<form id="report-range" data-form="reports.range">' +
      '<div class="form-grid-3">' +
      dateField('report-from', 'From date', 'from', r.from) +
      dateField('report-to', 'To date', 'to', r.to) +
      '<div class="field"><p class="field-hint" id="report-range-hint">' + E(rangeHint(r.from, r.to)) + '</p></div>' +
      '</div></form>' +
      '<p class="note">The report only counts days inside this range. History outside it is never added in.</p>';
    return UI.card({
      title: 'Report period',
      subtitle: 'Pick the days to report on.',
      body: body,
      actions: UI.btn('Apply range', { type: 'submit', form: 'report-range', variant: 'primary' })
    });
  }

  function rangeHint(from, to) {
    if (!isDay(from) || !isDay(to)) return 'Enter a start and an end date.';
    if (from > to) return 'The end date must not be before the start date.';
    const days = dayList(from, to).length;
    return days + (days === 1 ? ' day' : ' days') + ' selected — ' + dayLabel(from) + ' to ' + dayLabel(to);
  }

  function emptyRange(r) {
    if (!r.ok) {
      return UI.banner('warn', 'The end date is before the start date',
        'Nothing can be reported for that range. Set the end date to the same day or later than the start date and apply the range again.');
    }
    return UI.empty('No receipts, payments, corrections, check-ins or stock movements fall between ' +
      dayLabel(r.from) + ' and ' + dayLabel(r.to) + '. Widen the range if you want to include earlier history — ' +
      'figures are never shown for an empty range.');
  }

  function presetCard(ctx) {
    const expected = (ctx.fixture && ctx.fixture.expectedReports && ctx.fixture.expectedReports[ctx.scenario.id]) || null;
    if (!expected) return '';
    const pairs = [];
    if (expected.dateFrom) pairs.push(['Preset period', expected.dateFrom + ' to ' + expected.dateTo]);
    if (expected.receiptRevenueMMK !== undefined) pairs.push(['Preset receipt revenue', Util.mmk(expected.receiptRevenueMMK) + ' MMK']);
    if (expected.collectionsMMK !== undefined) pairs.push(['Preset collections', Util.mmk(expected.collectionsMMK) + ' MMK']);
    if (expected.materialCostMMK !== undefined) pairs.push(['Preset material cost', Util.mmk(expected.materialCostMMK) + ' MMK']);
    if (expected.estimatedGrossProfitMMK !== undefined) pairs.push(['Preset gross profit', Util.mmk(expected.estimatedGrossProfitMMK) + ' MMK']);
    if (expected.estimatedGrossProfit !== undefined) pairs.push(['Preset gross profit', String(expected.estimatedGrossProfit)]);
    if (expected.commissionTotalMMK !== undefined) pairs.push(['Preset commission', Util.mmk(expected.commissionTotalMMK) + ' MMK']);
    if (expected.commissionPerStaffMMK !== undefined) pairs.push(['Preset commission per staff', Util.mmk(expected.commissionPerStaffMMK) + ' MMK']);
    if (expected.contributionAfterCommissionMMK !== undefined) pairs.push(['Preset contribution after commission', Util.mmk(expected.contributionAfterCommissionMMK) + ' MMK']);
    if (expected.commission !== undefined) pairs.push(['Preset commission', String(expected.commission)]);
    if (expected.totalClosingDifferenceMMK !== undefined) pairs.push(['Preset closing difference', Util.mmkSigned(expected.totalClosingDifferenceMMK) + ' MMK']);
    if (expected.redoCount !== undefined) pairs.push(['Preset Redo jobs', String(expected.redoCount)]);
    if (!pairs.length) return '';
    return UI.card({
      title: 'Preset expectations for this scenario',
      subtitle: 'Fixed values shipped with the handoff fixture — a preset, not a live figure.',
      body: UI.dl(pairs) +
        '<p class="note">These preset numbers never change with the demo state. The live figures above are recalculated from the current state every time the screen is drawn.</p>'
    });
  }

  /* ------------------------------------------------------------------ */
  /* tabs                                                                */
  /* ------------------------------------------------------------------ */

  function overviewTab(r, ctx) {
    if (!r.ok) return emptyRange(r);
    if (!rangeHasActivity(r)) {
      return UI.card({ title: 'Nothing to report for this period', body: emptyRange(r) }) +
        presetCard(ctx);
    }
    const rev = Rules.revenue(r.from, r.to);
    const col = Rules.collections(r.from, r.to);
    const material = materialCostIn(r.from, r.to);
    const gp = grossProfit(rev.totalMMK, material);
    const rule = Store.state.commissionRule;
    const preview = rule ? Rules.commissionPreview(rule, r.from, r.to) : { configured: false, totalMMK: null };

    const kpis = '<div class="grid-4">' +
      UI.kpi({
        label: 'Receipt revenue', value: Util.mmk(rev.totalMMK) + ' MMK', tone: 'blue', icon: 'receipt',
        sub: 'Finalised receipts plus charge corrections in the range'
      }) +
      UI.kpi({
        label: 'Collections', value: Util.mmk(col.totalMMK) + ' MMK', tone: 'green', icon: 'wallet',
        sub: 'Signed payments, refunds and method corrections'
      }) +
      UI.kpi({
        label: 'Estimated gross profit', value: gp.complete ? (Util.mmk(gp.valueMMK) + ' MMK') : 'Incomplete',
        tone: gp.complete ? 'green' : 'amber', icon: 'chart',
        sub: gp.complete
          ? 'Receipt revenue minus snapshotted material cost ' + Util.mmk(material.costMMK) + ' MMK'
          : 'Missing material cost snapshot — not estimated as zero'
      }) +
      UI.kpi({
        label: 'Commission (separate)', value: preview.configured ? (Util.mmk(preview.totalMMK) + ' MMK') : 'Not configured',
        tone: preview.configured ? 'grey' : 'amber', icon: 'users',
        sub: preview.configured ? 'Illustrative rule — shown separately from revenue' : 'No commission rule is set'
      }) +
      '</div>';

    const daily = dailyRows(r.from, r.to);
    const dailyTable = UI.table({
      label: 'Daily summary',
      head: ['Day', 'Receipt revenue', 'Collections', 'Cash', 'KBZPay', 'WavePay', 'Jobs checked in', 'Vehicles', 'Closing difference', 'Charge corrections (signed)'],
      rows: daily.rows.map(function (d) {
        return [
          { html: E(dayLabel(d.day)), head: true },
          num(d.revenueMMK), num(d.collectionsMMK),
          num(d.byMethod.Cash || 0), num(d.byMethod.KBZPay || 0), num(d.byMethod.WavePay || 0),
          { html: E(String(d.jobs)), className: 'num' },
          { html: E(String(d.vehicles)), className: 'num' },
          d.closing === null ? { html: '—' } : numSigned(d.closing),
          numSigned(d.correctionsMMK)
        ];
      }),
      empty: 'No activity on any day of this range.'
    });

    const months = monthlyRows(r.from, r.to);
    const monthlyTable = UI.table({
      label: 'Monthly summary',
      head: ['Month', 'Days counted', 'Receipt revenue', 'Collections', 'Material cost', 'Estimated gross profit', 'Commission', 'Discounts', 'Redo jobs', 'Jobs completed'],
      rows: months.map(function (m) {
        return [
          { html: E(m.label), head: true },
          { html: E(m.from + ' to ' + m.to) },
          num(m.revenueMMK), num(m.collectionsMMK),
          m.materialMissing ? { html: 'Incomplete' } : num(m.materialMMK),
          m.grossProfit.complete ? num(m.grossProfit.valueMMK) : { html: 'Incomplete' },
          m.commissionMMK === null ? { html: 'Not configured' } : num(m.commissionMMK),
          num(m.discountMMK),
          { html: E(String(m.redoCount)), className: 'num' },
          { html: E(String(m.completedCount)), className: 'num' }
        ];
      }),
      empty: 'No months in this range.'
    });

    const popular = popularServices(completedJobsIn(r.from, r.to));
    const popularTable = UI.table({
      label: 'Popular completed services',
      head: ['Service', 'Completed jobs', 'Service lines', 'Labour charged'],
      rows: popular.map(function (p) {
        const svc = Store.service(p.serviceId);
        return [
          { html: E(svc ? svc.nameEN : p.serviceId), head: true },
          { html: E(String(p.jobCount)), className: 'num' },
          { html: E(String(p.count)), className: 'num' },
          num(p.amountMMK)
        ];
      }),
      empty: 'No jobs were completed inside this range.'
    });

    const usage = usageIn(r.from, r.to);
    const usageTable = UI.table({
      label: 'Parts and oil used',
      head: ['Item', 'Type', 'Quantity', 'Unit', 'Cost at issue snapshot'],
      rows: usage.map(function (u) {
        return [
          { html: E(u.name), head: true },
          { html: E(u.type) },
          { html: E(Util.qty(u.quantity)), className: 'num' },
          { html: E(u.unit) },
          num(u.costMMK)
        ];
      }),
      empty: 'No parts or oil were issued inside this range.'
    });

    const stock = stockPosition();
    const stockTable = UI.table({
      label: 'Stock position now',
      head: ['Item', 'Type', 'On hand', 'Unit', 'Reorder level', 'Latest purchase cost', 'Estimated value'],
      rows: stock.items.map(function (i) {
        return [
          { html: E(i.name) + (i.low ? ' ' + UI.badge('Low stock', 'orange') : ''), head: true },
          { html: E(i.type) },
          { html: E(Util.qty(i.onHand)), className: 'num' },
          { html: E(i.unit) },
          { html: E(Util.qty(i.reorderLevel)), className: 'num' },
          num(i.costMMK),
          num(i.valueMMK)
        ];
      }),
      empty: 'No stock items are configured.'
    });

    return kpis +
      UI.card({
        title: 'Daily summary',
        subtitle: 'One row per day inside the selected range.',
        body: dailyTable +
          '<p class="note">Collections are broken out by method. A closing difference is only shown when a daily closing was recorded for that day. Charge corrections are signed — a negative figure lowers the charged amount.</p>' +
          (daily.truncated ? '<p class="note note-warn">Only the first ' + MAX_DAILY_ROWS + ' days of ' + daily.totalDays + ' are listed. Narrow the range to see every day.</p>' : '')
      }) +
      UI.card({
        title: 'Monthly summary',
        subtitle: 'Calendar months inside the selected range only — history outside the range is excluded.',
        body: monthlyTable +
          '<p class="note">Gross profit is an estimate: receipt revenue minus the snapshotted material cost. It is not a net profit and overhead is not modelled. Commission is shown separately and is never added to revenue.</p>'
      }) +
      '<div class="grid-2-even">' +
      UI.card({ title: 'Popular completed services', body: popularTable }) +
      UI.card({ title: 'Parts and oil used in the range', body: usageTable }) +
      '</div>' +
      UI.card({
        title: 'Stock position now',
        subtitle: 'Estimated stock value is on hand multiplied by the latest purchase cost. It is an estimate, not a valuation.',
        body: '<div class="grid-3">' +
          UI.kpi({ label: 'Estimated stock value', value: Util.mmk(stock.totalValueMMK) + ' MMK', tone: 'blue', icon: 'box' }) +
          UI.kpi({ label: 'Low stock items', value: String(stock.lowStock.length), tone: stock.lowStock.length ? 'amber' : 'green', icon: 'package' }) +
          UI.kpi({ label: 'Items tracked', value: String(stock.items.length), tone: 'grey', icon: 'archive' }) +
          '</div>' + stockTable
      }) +
      presetCard(ctx);
  }

  function servicesTab(r) {
    if (!r.ok) return emptyRange(r);
    const perf = servicePerformance(r.from, r.to);
    const popular = popularServices(completedJobsIn(r.from, r.to));
    const rev = Rules.revenue(r.from, r.to);
    return UI.card({
      title: 'Service performance in the range',
      subtitle: 'Service lines on receipts issued inside the selected range.',
      body: UI.table({
        label: 'Service performance',
        head: ['Service', 'Jobs', 'Service lines', 'Charged', 'Share of receipt revenue'],
        rows: perf.map(function (p) {
          const svc = p.serviceId ? Store.service(p.serviceId) : null;
          const share = rev.totalMMK ? (p.amountMMK / rev.totalMMK * 100) : 0;
          return [
            { html: E(svc ? svc.nameEN : p.label), head: true },
            { html: E(String(p.jobCount)), className: 'num' },
            { html: E(String(p.lines)), className: 'num' },
            num(p.amountMMK),
            { html: E(Util.qty(share)) + '%', className: 'num' }
          ];
        }),
        empty: 'No service lines were billed inside this range.'
      }) + '<p class="note">Parts and oil are billed on the same receipts but are not labour and are not shown here. They never qualify for commission.</p>'
    }) +
      UI.card({
        title: 'Popular completed services',
        subtitle: 'Committed service lines on jobs completed inside the range.',
        body: UI.table({
          label: 'Popular completed services',
          head: ['Service', 'Completed jobs', 'Service lines', 'Labour charged'],
          rows: popular.map(function (p) {
            const svc = Store.service(p.serviceId);
            return [
              { html: E(svc ? svc.nameEN : p.serviceId), head: true },
              { html: E(String(p.jobCount)), className: 'num' },
              { html: E(String(p.count)), className: 'num' },
              num(p.amountMMK)
            ];
          }),
          empty: 'No jobs were completed inside this range.'
        })
      });
  }

  function inventoryTab(r) {
    if (!r.ok) return emptyRange(r);
    const stock = stockPosition();
    const usage = usageIn(r.from, r.to);
    const movements = movementsIn(r.from, r.to);
    return UI.card({
      title: 'Stock position now',
      subtitle: 'On hand multiplied by the latest purchase cost is an estimate of the stock value.',
      body: '<div class="grid-3">' +
        UI.kpi({ label: 'Estimated stock value', value: Util.mmk(stock.totalValueMMK) + ' MMK', tone: 'blue', icon: 'box' }) +
        UI.kpi({ label: 'Low stock items', value: String(stock.lowStock.length), tone: stock.lowStock.length ? 'amber' : 'green', icon: 'package' }) +
        UI.kpi({ label: 'Movements in range', value: String(movements.length), tone: 'grey', icon: 'archive' }) +
        '</div>' +
        UI.table({
          label: 'Stock position',
          head: ['Item', 'Type', 'On hand', 'Unit', 'Reorder level', 'Latest purchase cost', 'Estimated value', 'Status'],
          rows: stock.items.map(function (i) {
            return [
              { html: E(i.name), head: true },
              { html: E(i.type) },
              { html: E(Util.qty(i.onHand)), className: 'num' },
              { html: E(i.unit) },
              { html: E(Util.qty(i.reorderLevel)), className: 'num' },
              num(i.costMMK),
              num(i.valueMMK),
              { html: i.low ? UI.badge('Low stock', 'orange') : UI.badge('In stock', 'green') }
            ];
          }),
          empty: 'No stock items are configured.'
        })
    }) +
      UI.card({
        title: 'Parts and oil used in the range',
        subtitle: 'Stock movements of type "Job issue" inside the selected range.',
        body: UI.table({
          label: 'Parts and oil used',
          head: ['Item', 'Type', 'Quantity', 'Unit', 'Cost at issue snapshot'],
          rows: usage.map(function (u) {
            return [
              { html: E(u.name), head: true },
              { html: E(u.type) },
              { html: E(Util.qty(u.quantity)), className: 'num' },
              { html: E(u.unit) },
              num(u.costMMK)
            ];
          }),
          empty: 'No parts or oil were issued inside this range.'
        }) +
        '<p class="note">The cost shown is the unit cost snapshotted when the material was issued. The same snapshot is used for the gross profit estimate.</p>'
      }) +
      UI.card({
        title: 'Stock movements in the range',
        body: UI.table({
          label: 'Stock movements',
          head: ['When', 'Item', 'Movement', 'Quantity', 'Unit cost', 'Job'],
          rows: movements.map(function (m) {
            const item = Store.item(m.itemId);
            return [
              { html: E(Util.fmtDateTime(m.at)), head: true },
              { html: E(item ? item.name : m.itemId) },
              { html: E(m.type) },
              { html: E(Util.qty(m.delta)), className: 'num' },
              num(m.unitCostMMK),
              { html: E(m.jobId || '—') }
            ];
          }),
          empty: 'No stock movements were recorded inside this range.'
        })
      });
  }

  function commissionTab(r, ctx) {
    const rule = Store.state.commissionRule;
    const isOwner = Store.isOwner();
    const data = commissionJobs(rule, r.from, r.to);
    const rev = Rules.revenue(r.from, r.to);
    const material = materialCostIn(r.from, r.to);
    const gp = grossProfit(rev.totalMMK, material);
    const staff = commissionStaff(data.rows);
    const earnedTotal = Util.sum(staff, function (s) { return s.earnedMMK; });
    const payouts = Store.state.commissionPayouts || [];
    const reviewCount = data.rows.filter(function (row) { return row.needsReview; }).length;

    let contribution = { complete: false, valueMMK: null };
    if (gp.complete && data.preview.configured) {
      contribution = { complete: true, valueMMK: rev.totalMMK - material.costMMK - earnedTotal };
    }

    const kpis = '<div class="grid-4">' +
      UI.kpi({ label: 'Receipt revenue', value: Util.mmk(rev.totalMMK) + ' MMK', tone: 'blue', icon: 'receipt', sub: 'Excludes commission' }) +
      UI.kpi({ label: 'Material cost (snapshot)', value: material.missing ? 'Incomplete' : (Util.mmk(material.costMMK) + ' MMK'), tone: material.missing ? 'amber' : 'grey', icon: 'package', sub: 'Snapshotted when the material was issued' }) +
      UI.kpi({ label: 'Commission earned', value: data.preview.configured ? (Util.mmk(earnedTotal) + ' MMK') : 'Not configured', tone: data.preview.configured ? 'orange' : 'amber', icon: 'users', sub: data.preview.configured ? 'Earned only — not yet paid out' : 'No commission rule is set' }) +
      UI.kpi({ label: 'Contribution after commission', value: contribution.complete ? (Util.mmk(contribution.valueMMK) + ' MMK') : 'Incomplete', tone: contribution.complete ? 'green' : 'amber', icon: 'chart', sub: 'Revenue − material cost − commission' }) +
      '</div>';

    const ruleBody = rule ? ruleSummary(rule) : UI.empty('Not configured. No commission rule is set for this scenario, so no commission is earned and no payout can be recorded.');
    const ruleForm = isOwner ? commissionRuleForm(rule) :
      '<p class="note">Only the Owner can change the illustrative commission rule. This rule is a demonstrator for the prototype, not a real workshop rate.</p>';

    const jobRows = [];
    data.rows.forEach(function (row) {
      const head = [
        { html: E(row.jobId), head: true },
        { html: E(row.vehiclePlate) },
        { html: E(row.serviceLabel) }
      ];
      if (row.needsReview) {
        jobRows.push(head.concat([
          num(row.baseMMK),
          { html: 'Needs review' },
          { html: E((row.staffIds || []).map(function (s) { return Store.staffName(s); }).join(', ') || '—') },
          { html: '—' },
          { html: '—' },
          { html: UI.badge('Needs review', 'orange') },
          { html: '<span class="note">' + E(row.note) + '</span>' }
        ]));
        return;
      }
      row.split.forEach(function (s, i) {
        const paid = paidFor(s.staffId, row.jobId, rule.id);
        let status, action;
        if (paid === 0) {
          status = UI.badge('Earned — not paid out', 'orange');
          action = UI.btn('Mark demo payout', { variant: 'secondary', action: 'reports.payout', attrs: { 'staff-id': s.staffId, 'job-id': row.jobId, 'rule-id': rule.id } });
        } else if (paid === s.amountMMK) {
          status = UI.badge('Paid out', 'green');
          action = '<span class="note">Recorded</span>';
        } else {
          status = UI.badge('Adjustment due', 'orange');
          action = UI.btn('Record adjustment', { variant: 'secondary', action: 'reports.adjustment', attrs: { 'staff-id': s.staffId, 'job-id': row.jobId, 'rule-id': rule.id } });
        }
        jobRows.push(head.concat([
          i === 0 ? num(row.baseMMK) : { html: '↑' },
          i === 0 ? num(row.amountMMK) : { html: '↑' },
          { html: E(Store.staffName(s.staffId)) },
          num(s.amountMMK),
          num(paid),
          { html: status },
          { html: action }
        ]));
      });
    });

    const previewTable = data.preview.configured ? UI.table({
      label: 'Commission earned by job and staff',
      head: ['Job', 'Vehicle', 'Service', 'Labour base', 'Commission for job', 'Staff', 'Staff share', 'Paid out', 'Status', 'Action'],
      rows: jobRows,
      empty: 'No paid job in this range qualifies for commission under the current rule.'
    }) : UI.empty('Not configured. Set an illustrative rule to preview commission.');

    const staffTable = data.preview.configured ? UI.table({
      label: 'Commission per staff member',
      head: ['Staff', 'Jobs counted', 'Earned', 'Paid out', 'Outstanding'],
      rows: staff.map(function (s) {
        const paid = paidFor(s.staffId, null, rule.id);
        return [
          { html: E(s.name) + ' <span class="muted">' + E(s.staffId) + '</span>', head: true },
          { html: E(String(s.jobs)), className: 'num' },
          num(s.earnedMMK),
          num(paid),
          num(s.earnedMMK - paid)
        ];
      }),
      empty: 'No staff member earned commission in this range.'
    }) : UI.empty('Not configured.');

    const payoutTable = UI.table({
      label: 'Recorded demo payouts',
      head: ['Payout', 'Staff', 'Job', 'Amount', 'Recorded at', 'Rule', 'Period', 'Note'],
      rows: payouts.map(function (p) {
        return [
          { html: E(p.id), head: true },
          { html: E(Store.staffName(p.staffId)) },
          { html: E(p.jobId) },
          num(p.amountMMK),
          { html: E(Util.fmtDateTime(p.at)) },
          { html: E(p.ruleId) },
          { html: E(p.period) },
          { html: E(p.note) }
        ];
      }),
      empty: 'No demo payout has been recorded yet.'
    });

    return kpis +
      UI.card({
        title: 'Commission rule',
        subtitle: 'An illustrative demonstrator for this prototype — not a real workshop rate.',
        body: ruleBody +
          '<p class="note">The rule is stored in the demo state only. Resetting the scenario restores the fixture rule.</p>' +
          ruleForm
      }) +
      UI.card({
        title: 'Commission earned',
        subtitle: 'Earned commission is separate from paid-out commission. Recording a payout never changes receipt revenue.',
        body: previewTable +
          (reviewCount ? '<p class="note note-warn">' + reviewCount + ' job' + (reviewCount === 1 ? '' : 's') + ' need review: a charge correction changed the job without a labour/material allocation, so the commission for it is not recalculated.</p>' : '') +
          '<p class="note">Only paid jobs that are not Redo work qualify. Parts and oil never qualify. A job with no eligible mechanic earns nothing.</p>'
      }) +
      UI.card({
        title: 'Commission per staff member',
        body: staffTable +
          '<p class="note">A job’s commission is split equally across its eligible staff. Any leftover whole MMK goes to the lowest sorted staff ID, so the shares always add up to the job total.</p>'
      }) +
      UI.card({
        title: 'Recorded demo payouts',
        subtitle: 'In-memory records only. They are not payments and they do not touch receipts or the bank.',
        body: payoutTable +
          '<p class="note">A demo payout records what was handed over in the demonstration. If the rule changes afterwards the screen shows the difference as an adjustment instead of paying the same amount twice.</p>'
      }) +
      UI.card({
        title: 'How these figures are built',
        body: UI.dl([
          ['Receipt revenue', 'Finalised receipt charges plus charge corrections — from Rules.revenue.'],
          ['Collections', 'Signed payments, refunds and method corrections — from Rules.collections. Payments are never counted as extra sales.'],
          ['Estimated gross profit', 'Receipt revenue minus the snapshotted material cost. If a cost was never captured the figure is Incomplete, never zero.'],
          ['Commission', 'From Rules.commissionPreview for the current illustrative rule.'],
          ['Contribution after commission', 'Receipt revenue minus material cost minus commission. It is not net profit — overhead is not modelled.']
        ])
      });
  }

  function ruleSummary(rule) {
    const roles = (rule.eligibleRoles || []).join(', ') || '—';
    const services = (rule.eligibleServiceIds || []).map(function (id) {
      const s = Store.service(id);
      return s ? s.nameEN : id;
    }).join(', ') || '—';
    return UI.dl([
      ['Type', rule.type === 'fixedPerService' ? 'Fixed amount per eligible service line' : 'Percentage of eligible labour'],
      ['Value', rule.type === 'fixedPerService' ? (Util.mmk(rule.value) + ' MMK per service line') : (rule.value + '%')],
      ['Labour basis', rule.basis === 'regularLabour' ? 'Regular labour (before discounts)' : 'Final labour (after discounts)'],
      ['Eligible roles', roles],
      ['Eligible services', services],
      ['Payout period', rule.payoutPeriod || '—'],
      ['Status', rule.illustrative ? 'Illustrative demonstrator — not a real rate' : 'Demo rule']
    ]);
  }

  function commissionRuleForm(rule) {
    const r = rule || { type: 'percent', value: 10, basis: 'finalLabour', eligibleRoles: ['Mechanic'], eligibleServiceIds: [], payoutPeriod: 'Monthly' };
    const roleBoxes = ROLES.map(function (role) {
      const on = (r.eligibleRoles || []).indexOf(role) >= 0;
      return '<label class="check"><input type="checkbox" id="rule-role-' + E(role) + '" name="role-' + E(role) + '"' +
        (on ? ' checked' : '') + '> <span>' + E(role) + '</span></label>';
    }).join('');
    const serviceBoxes = (Store.state.services || []).map(function (s) {
      const on = (r.eligibleServiceIds || []).indexOf(s.id) >= 0;
      return '<label class="check"><input type="checkbox" id="rule-svc-' + E(s.id) + '" name="svc-' + E(s.id) + '"' +
        (on ? ' checked' : '') + '> <span>' + E(s.nameEN) + '</span></label>';
    }).join('');
    return '<form id="commission-rule-form" data-form="reports.commissionRule">' +
      '<div class="form-grid-3">' +
      UI.field({
        id: 'rule-type', label: 'Commission type', name: 'type', type: 'select', value: r.type || 'percent',
        options: [{ value: 'percent', label: 'Percentage of eligible labour' }, { value: 'fixedPerService', label: 'Fixed MMK per eligible service line' }]
      }) +
      UI.field({
        id: 'rule-value', label: 'Value', name: 'value', type: 'number', value: r.value, min: 0, step: 1, required: true,
        hint: 'Whole MMK, or a whole percentage.'
      }) +
      UI.field({
        id: 'rule-basis', label: 'Labour basis', name: 'basis', type: 'select', value: r.basis || 'finalLabour',
        options: [{ value: 'finalLabour', label: 'Final labour (after discounts)' }, { value: 'regularLabour', label: 'Regular labour (before discounts)' }]
      }) +
      '</div>' +
      '<div class="field">' +
      '<p class="field-hint"><strong>Eligible roles</strong> — only staff with one of these roles earn commission.</p>' +
      '<div class="radio-row" role="group" aria-label="Eligible roles">' + roleBoxes + '</div>' +
      '</div>' +
      '<div class="field">' +
      '<p class="field-hint"><strong>Eligible services</strong> — labour on these services counts towards the commission. Parts and oil never count.</p>' +
      '<div class="radio-row" role="group" aria-label="Eligible services">' + serviceBoxes + '</div>' +
      '</div>' +
      UI.field({
        id: 'rule-period', label: 'Payout period', name: 'payoutPeriod', type: 'select', value: r.payoutPeriod || 'Monthly',
        options: PERIODS.map(function (p) { return { value: p, label: p }; })
      }) +
      '<div class="form-actions">' +
      UI.btn('Save illustrative rule', { type: 'submit', variant: 'primary' }) +
      '</div>' +
      '</form>' +
      '<p class="note">This rule is stored in the demo state so the commission screen can show a worked example. It is not a rate offered to staff and it changes no receipt, payment or job.</p>';
  }

  function promotionsTab(r) {
    if (!r.ok) return emptyRange(r);
    const promos = (Store.state.promotions || []).map(function (p) {
      let state = 'Not started';
      if (p.active === false) state = 'Switched off';
      else if (p.startDate && p.startDate > r.to) state = 'Not started';
      else if (p.endDate && p.endDate < r.from) state = 'Ended';
      else state = 'Running in the range';
      return { promo: p, state: state };
    });
    const promoTable = UI.table({
      label: 'Promotions',
      head: ['Promotion', 'Name', 'Type', 'Value', 'Services', 'Sizes', 'Window', 'Status in range'],
      rows: promos.map(function (p) {
        const promo = p.promo;
        const services = (promo.serviceIds || []).map(function (id) {
          const s = Store.service(id);
          return s ? s.nameEN : id;
        }).join(', ');
        const value = promo.type === 'percent' ? (promo.value + '%')
          : (promo.type === 'fixed' ? (Util.mmk(promo.value) + ' MMK off') : (Util.mmk(promo.value) + ' MMK'));
        return [
          { html: E(promo.id), head: true },
          { html: E(promo.nameEN || promo.id) },
          { html: E(promo.type) },
          { html: E(value) },
          { html: E(services) },
          { html: E((promo.sizes || []).join(', ') || 'All sizes') },
          { html: E((promo.startDate || '—') + ' to ' + (promo.endDate || '—')) },
          { html: UI.badge(p.state, p.state === 'Running in the range' ? 'green' : 'grey') }
        ];
      }),
      empty: 'No promotions are configured.'
    });
    const preview = promotionPricePreview(r.from, r.to);
    const previewTable = UI.table({
      label: 'Promoted price preview',
      head: ['Service', 'Size', 'Regular price', 'Promotion applied', 'Final price'],
      rows: preview.map(function (p) {
        return [
          { html: E(p.serviceName), head: true },
          { html: E(p.size) },
          num(p.regularMMK),
          { html: p.promoId ? E(p.promoId + ' — ' + p.promoName) : '—' },
          num(p.finalMMK)
        ];
      }),
      empty: 'No services have a price to preview.'
    });
    return UI.card({
      title: 'Promotions',
      subtitle: 'One automatic promotion applies per eligible service line.',
      body: promoTable +
        '<p class="note">The lowest final price wins. The catalogue prices behind these figures are working demo values, not verified live pricing.</p>'
    }) +
      UI.card({
        title: 'Promoted price preview',
        subtitle: 'Regular catalogue price compared with the promotion that applies from ' + dayLabel(r.from) + '.',
        body: previewTable
      });
  }

  function redoTab(r) {
    if (!r.ok) return emptyRange(r);
    const inRange = redoJobsIn(r.from, r.to);
    const all = (Store.state.jobs || []).filter(function (j) { return !!j.redoOfJobId; });
    const rows = inRange.map(function (j) {
      const vehicle = Store.vehicle(j.vehicleId);
      const rc = Store.jobReceipt(j.id);
      const original = Store.job(j.redoOfJobId);
      return [
        { html: E(j.id), head: true },
        { html: E(j.redoOfJobId) + (original ? '' : ' (missing)') },
        { html: E(vehicle ? vehicle.plate : '—') },
        { html: E(Util.fmtDateTime(j.createdAt)) },
        { html: UI.statusBadge(j.workStatus) },
        { html: UI.statusBadge(j.paymentStatus) },
        { html: E(Util.isNum(j.managerSetRedoChargeMMK) ? (Util.mmk(j.managerSetRedoChargeMMK) + ' MMK') : 'Not set') },
        { html: E(rc ? rc.id : 'No receipt') },
        { html: UI.statusBadge(j.collectionStatus) }
      ];
    });
    return UI.card({
      title: 'Redo jobs in the range',
      subtitle: 'A Redo is a separate comeback job for work that has to be done again.',
      body: UI.table({
        label: 'Redo jobs',
        head: ['Redo job', 'Original job', 'Vehicle', 'Created', 'Work status', 'Payment', 'Manager-set charge', 'Receipt', 'Collection'],
        rows: rows,
        empty: 'No Redo job was created inside this range.'
      }) +
        '<p class="note">Redo jobs never earn commission and are excluded from the commission preview. A Manager may set a Redo charge of zero when the rework is free.</p>' +
        (all.length > inRange.length
          ? '<p class="note">' + (all.length - inRange.length) + ' Redo job' + (all.length - inRange.length === 1 ? '' : 's') + ' sit outside the selected range and are not counted here.</p>'
          : '')
    });
  }

  /* ------------------------------------------------------------------ */
  /* view                                                                */
  /* ------------------------------------------------------------------ */

  function tabBody(tab, r, ctx) {
    if (tab === 'services') return servicesTab(r);
    if (tab === 'inventory') return inventoryTab(r);
    if (tab === 'commission') return commissionTab(r, ctx);
    if (tab === 'promotions') return promotionsTab(r);
    if (tab === 'redo') return redoTab(r);
    return overviewTab(r, ctx);
  }

  global.DolphinViews = global.DolphinViews || {};
  global.DolphinViews.S19 = {
    render: function (ctx) {
      if (!Store.isManagerial()) {
        return UI.pageHeader({ title: 'Reports and commission', subtitle: 'Owner and Manager only.' }) +
          UI.card({
            title: 'Not available for this role',
            body: UI.empty('The reports screen is part of the Owner and Manager demo view. Use the role preview in the top bar to look at it.')
          });
      }
      const r = rangeOf(ctx);
      const p = (ctx.params || {});
      const tab = TABS.some(function (t) { return t.id === p.tab; }) ? p.tab : 'overview';
      return UI.pageHeader({
        title: 'Reports and commission',
        subtitle: 'Simulated figures for the demo workshop state. Nothing on this screen is a real business record.'
      }) +
        dateBasis(r) +
        UI.tabs(TABS, tab, 'reports') +
        filterCard(r) +
        '<div role="tabpanel" aria-label="Report section">' + tabBody(tab, r, ctx) + '</div>';
    },
    mount: function () { /* the shell already handles the tab buttons */ },
    /* Small read-only helpers used by js/act-reports.js so the payout
       action always uses the same calculation as the screen. */
    rangeOf: rangeOf,
    commissionRows: function (from, to) {
      return commissionJobs(Store.state.commissionRule, from, to).rows;
    }
  };
})(window);
