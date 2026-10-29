/* S06 — Job list and job card */
(function (global) {
  'use strict';
  const E = Util.esc;
  global.DolphinViews = global.DolphinViews || {};

  function filterJobs(jobs, filter) {
    switch (filter) {
      case 'open': return jobs.filter(j => j.lifecycleStatus === 'Open');
      case 'waiting': return jobs.filter(j => j.workStatus === 'Waiting for Parts');
      case 'awaiting': return jobs.filter(j => j.lifecycleStatus === 'Open' && j.workStatus === 'Completed' && j.collectionStatus !== 'Collected');
      case 'closed': return jobs.filter(j => j.lifecycleStatus === 'Closed');
      case 'cancelled': return jobs.filter(j => j.lifecycleStatus === 'Cancelled');
      case 'redo': return jobs.filter(j => j.redoOfJobId);
      default: return jobs;
    }
  }

  global.DolphinViews.S06 = {
    render: function (ctx) {
      const jobId = ctx.params.jobId || ctx.state.selectedJobId;
      const job = jobId ? Store.job(jobId) : null;
      if (job && ctx.params.jobId) return detail(ctx, job);
      return list(ctx);
    }
  };

  /* ---------------- list ---------------- */
  function list(ctx) {
    const state = ctx.state;
    const filter = ctx.params.tab || 'open';
    const jobs = filterJobs(Store.visibleJobs(), filter);
    const filters = [
      { id: 'open', label: 'Open' }, { id: 'waiting', label: 'Waiting for parts' },
      { id: 'awaiting', label: 'Completed, not collected' }, { id: 'closed', label: 'Closed' },
      { id: 'cancelled', label: 'Cancelled' }, { id: 'redo', label: 'Redo' }, { id: 'all', label: 'All' }
    ];

    let out = UI.pageHeader({
      title: ctx.role === 'Mechanic' ? 'My jobs' : 'Jobs',
      subtitle: ctx.role === 'Mechanic'
        ? 'Only the jobs assigned to you are listed.'
        : 'Every workshop job with its work, approval, payment and collection state.'
    });

    out += UI.tabs(filters.map(f => ({ id: f.id, label: f.label })), filter, 'jobs');
    out += '<div class="action-bar">' +
      UI.btn('New check-in', { action: 'dashboard.newCheckIn', variant: 'primary', icon: 'plus' }) +
      '</div>';

    out += UI.card({
      title: filters.filter(f => f.id === filter)[0].label + ' jobs',
      subtitle: jobs.length + ' job' + (jobs.length === 1 ? '' : 's'),
      body: UI.table({
        label: 'Job list',
        head: ['Job', 'Vehicle', 'Service', 'Work', 'Approval', 'Payment', 'Collection', 'Bay', 'Mechanic'],
        rows: jobs.map(function (j) {
          const v = Store.vehicle(j.vehicleId);
          const bay = j.bayId ? Store.bay(j.bayId) : null;
          return [
            { html: UI.link(j.id, 'S06', { jobId: j.id }) },
            E(v ? v.plate : '—'),
            E(Rules.jobServiceLabel(j)),
            { html: UI.statusBadge(j.workStatus) },
            { html: UI.statusBadge(j.approvalStatus) },
            { html: UI.statusBadge(j.paymentStatus) },
            { html: UI.statusBadge(j.collectionStatus) },
            E(bay ? bay.name : '—'),
            E((j.assignedStaffIds || []).map(function (id) { return Store.staffName(id); }).join(', ') || '—')
          ];
        }),
        empty: 'No job matches this filter in the current scenario.'
      })
    });

    return out;
  }

  /* ---------------- detail ---------------- */
  function detail(ctx, job) {
    const state = ctx.state;
    const vehicle = Store.vehicle(job.vehicleId);
    const customer = vehicle ? Store.customer(vehicle.customerId) : null;
    const manager = ctx.role === 'Owner' || ctx.role === 'Manager';
    const mechanic = ctx.role === 'Mechanic';
    const mine = (job.assignedStaffIds || []).indexOf(ctx.user.id) >= 0;
    const quotes = job.quotes || [];
    const activeQuote = Store.quote(job);
    const totals = Rules.jobTotals(job);
    const receipt = Store.jobReceipt(job.id);

    let out = UI.pageHeader({
      title: job.id,
      subtitle: (vehicle ? vehicle.plate + ' · ' + vehicle.brand + ' ' + vehicle.model + ' · ' : '') + Rules.jobServiceLabel(job),
      actions: UI.btn('Back to jobs', { action: 'nav', variant: 'secondary', attrs: { nav: 'S06' } })
    });

    if (mechanic && !mine && job.lifecycleStatus === 'Open') {
      out += UI.banner('warn', 'This job is not assigned to you',
        'Mechanics see the details of their own assignments only. Switch the demo role to see another job.');
      return out;
    }

    /* action row */
    const actions = [];
    const pricedRedo = Rules.isPricedRedo(job);
    if (job.workStatus === 'Check-in' || job.workStatus === 'Diagnose/Quote') {
      if (pricedRedo) {
        /* a Redo has an explicit Manager price, so it needs no customer quote */
        actions.push(UI.btn('Start work', { action: 'job.startWork', variant: 'primary', icon: 'wrench', attrs: { jobId: job.id } }));
      } else {
        actions.push(UI.btn('Start inspection', { action: 'job.startInspection', variant: 'primary', icon: 'wrench', attrs: { jobId: job.id } }));
      }
    }
    if ((job.workStatus === 'Approved' || job.workStatus === 'Diagnose/Quote') && !pricedRedo) {
      actions.push(UI.btn('Start work', { action: 'job.startWork', variant: 'primary', icon: 'wrench', attrs: { jobId: job.id } }));
    }
    if (job.workStatus === 'In Progress') {
      actions.push(UI.btn('Mark complete', { action: 'job.complete', variant: 'primary', icon: 'checkCircle', attrs: { jobId: job.id } }));
      actions.push(UI.btn('Waiting for parts', { action: 'job.markWaitingParts', variant: 'secondary', attrs: { jobId: job.id } }));
    }
    if (job.workStatus === 'Waiting for Parts') {
      actions.push(UI.btn('Resume work', { action: 'job.resumeWork', variant: 'primary', attrs: { jobId: job.id } }));
    }
    if (!pricedRedo && (job.workStatus === 'In Progress' || job.workStatus === 'Approved' || job.workStatus === 'Diagnose/Quote')) {
      actions.push(UI.btn('Add extra work', { action: 'job.addExtra', variant: 'secondary', icon: 'plus', attrs: { jobId: job.id } }));
    }
    if (manager) {
      actions.push(UI.btn('Assign mechanics', { action: 'job.assignStaff', variant: 'quiet', attrs: { jobId: job.id } }));
      if (job.workStatus === 'Completed' && job.paymentStatus === 'Unpaid' && job.collectionStatus !== 'Collected') {
        actions.push(UI.btn('Reopen', { action: 'job.reopen', variant: 'quiet', attrs: { jobId: job.id } }));
      }
      if (job.paymentStatus === 'Paid' || job.paymentStatus === 'No charge') {
        /* a settled job keeps its price; a comeback is a separate linked record */
        actions.push(UI.btn('Create linked Redo', { action: 'job.createRedo', variant: 'quiet', icon: 'refresh', attrs: { jobId: job.id } }));
      }
      if (job.lifecycleStatus === 'Open') {
        actions.push(UI.btn('Cancel job', { action: 'job.cancel', variant: 'quiet', attrs: { jobId: job.id } }));
      }
      if (job.lifecycleStatus === 'Closed') {
        actions.push(UI.btn('Archive record', { action: 'job.archive', variant: 'quiet', attrs: { jobId: job.id } }));
      }
    }
    if (job.redoOfJobId) {
      out += UI.banner('plain', 'Linked Redo of ' + job.redoOfJobId,
        'A Redo is a comeback record. It settles separately and never earns commission.' +
        (pricedRedo
          ? ' The Manager set the price to ' + Util.mmk(job.managerSetRedoChargeMMK) +
            ' MMK, so no customer quote is needed for this Redo.'
          : ''));
    }
    out += '<div class="action-bar">' + actions.join('') + '</div>';

    /* status chips */
    out += UI.chips([
      { label: 'Work', value: job.workStatus, tone: job.workStatus === 'Completed' ? 'green' : job.workStatus === 'Waiting for Parts' ? 'orange' : 'blue' },
      { label: 'Approval', value: job.approvalStatus, tone: job.approvalStatus === 'Approved' ? 'green' : job.approvalStatus === 'Pending' ? 'orange' : job.approvalStatus === 'Declined' ? 'red' : 'green' },
      { label: 'Payment', value: job.paymentStatus, tone: job.paymentStatus === 'Paid' ? 'green' : job.paymentStatus === 'Review required' ? 'orange' : 'orange' },
      { label: 'Collection', value: job.collectionStatus, tone: job.collectionStatus === 'Collected' ? 'grey' : 'orange' }
    ]);

    if (job.approvalStatus === 'Pending') {
      out += UI.banner('warn', 'Waiting for the customer decision',
        'Work cannot start while the quote is pending. ' +
        (ctx.role === 'Cashier' || manager
          ? UI.link('Record the decision', 'S08', { jobId: job.id }) + '.'
          : 'The Cashier or a Manager records the customer decision.'));
    }
    if (job.workStatus === 'Waiting for Parts') {
      const short = Rules.shortages(job);
      out += UI.banner('warn', 'Waiting for parts',
        short.length
          ? 'Shortage: ' + short.map(s => {
            const item = Store.item(s.line.itemId);
            return (item ? item.name : s.line.label) + ' (need ' + s.remaining + ', on hand ' + (item ? item.onHand : 0) + ')';
          }).join('; ') + '. The bay stays occupied until a Manager reassigns the job.'
          : 'The bay stays occupied until a Manager reassigns the job.');
    }
    if (job.cancellation) {
      out += UI.banner('danger', 'Job cancelled',
        'Reason: ' + E(job.cancellation.reason) + '. The original records are kept.');
    }

    /* main grid */
    out += '<div class="grid-2">';

    /* left column */
    out += '<div>';
    out += UI.card({
      title: 'Vehicle and check-in',
      body: UI.dl([
        ['Vehicle', vehicle ? vehicle.plate + ' · ' + vehicle.brand + ' ' + vehicle.model + ' (' + vehicle.year + ')' : '—'],
        ['Size', job.size],
        ['Customer', customer ? customer.name : '—'],
        ['Phone', customer ? customer.phone : '—'],
        ['Mileage', (job.mileageKm === null || job.mileageKm === undefined ? '—' : job.mileageKm + ' km')],
        ['Damage', job.damage || 'None recorded'],
        ['Fuel', job.fuelLevel || '—'],
        ['Belongings', job.belongings || 'None recorded'],
        ['Checked in', Util.fmtDateTime(job.createdAt)]
      ])
    });

    out += UI.card({
      title: 'Repair checklist',
      subtitle: 'Complete all items before marking the job complete.',
      body: '<ul class="checklist">' + (job.requiredChecklist || []).map(function (c) {
        return '<li><input type="checkbox" id="chk-' + E(c.id) + '" data-live="job.checklist" data-check-id="' + E(c.id) +
          '" data-job-id="' + E(job.id) + '"' + (c.done ? ' checked' : '') + '>' +
          '<label for="chk-' + E(c.id) + '">' + E(c.text) + '</label></li>';
      }).join('') + '</ul>' +
        '<p class="note" id="checklist-state">' + (job.requiredChecklist || []).filter(c => c.done).length + ' of ' +
        (job.requiredChecklist || []).length + ' items done</p>'
    });

    out += UI.card({
      title: 'Quote versions',
      subtitle: 'Approved versions are frozen; an edit creates a new version.',
      body: quotes.length ? UI.table({
        label: 'Quote versions',
        head: ['Version', 'Type', 'Status', 'Subtotal', 'Total', 'Approval basis', 'Approved', ''],
        rows: quotes.map(function (q) {
          const t = Rules.quoteTotals(q);
          return [
            'v' + q.version + (q.version === job.activeQuoteVersion ? ' (current)' : ''),
            q.isExtraWork ? 'Extra work' : 'Initial',
            { html: UI.statusBadge(q.status) },
            { html: Util.mmk(t.subtotalMMK), className: 'num' },
            { html: Util.mmk(t.totalMMK), className: 'num' },
            { html: Util.mmk(t.repairApprovalBasisMMK), className: 'num' },
            q.approval ? E(Util.fmtDateTime(q.approval.recordedAt)) + '<br><span class="muted small">' + E(q.approval.channel || '') + '</span>' : '—',
            { html: UI.link('Open', q.isExtraWork ? 'S07' : 'S07', { jobId: job.id, version: q.version }) }
          ];
        })
      }) : '<div class="empty-state"><p>No quote has been prepared yet.</p></div>',
      actions: UI.btn('Open inspection', { action: 'nav', variant: 'secondary', attrs: { nav: 'S07', params: JSON.stringify({ jobId: job.id }) } })
    });

    out += UI.card({
      title: 'Service and material lines',
      subtitle: 'Committed scope plus any material already issued to this job.',
      body: UI.table({
        label: 'Job lines',
        head: ['Description', 'Kind', 'Qty', 'Unit price', 'Amount'],
        rows: (function () {
          const rows = [];
          (job.committedServiceLines || []).forEach(function (l) {
            rows.push([
              E(Store.serviceLabel(l)),
              E(l.kind === 'service' ? 'Labour / service' : l.kind === 'customerMaterial' ? 'Customer-supplied' : l.kind),
              E(l.quantity),
              { html: Util.mmk(l.unitPriceMMK), className: 'num' },
              { html: Util.mmk(l.totalMMK), className: 'num' }
            ]);
          });
          (job.materialIssues || []).forEach(function (iss) {
            const item = Store.item(iss.itemId);
            rows.push([
              E((item ? item.name : iss.itemId) + (iss.disposition ? ' (' + iss.disposition + ')' : '')),
              'Issued material',
              E(iss.quantity - (iss.returnedQuantity || 0) + ' ' + iss.unit),
              { html: Util.mmk(iss.unitPriceMMK), className: 'num' },
              { html: Util.mmk((iss.quantity - (iss.returnedQuantity || 0)) * iss.unitPriceMMK), className: 'num' }
            ]);
          });
          return rows;
        })(),
        empty: 'No committed scope yet.'
      })
    });

    out += '</div>';

    /* right column */
    out += '<div>';
    out += UI.card({
      title: 'Assignment',
      body: UI.dl([
        ['Bay', job.bayId && Store.bay(job.bayId) ? Store.bay(job.bayId).name : 'No bay assigned'],
        ['Mechanic', (job.assignedStaffIds || []).map(function (id) { return Store.staffName(id); }).join(', ') || 'Not assigned'],
        ['Job type', Rules.jobServiceLabel(job)],
        ['Vehicle', vehicle ? vehicle.plate : '—']
      ]) +
        (job.workStatus !== 'Completed'
          ? '<div class="banner banner-plain" style="margin-top:12px">' + UI.icon('info', 18) +
            '<div>Completing the repair releases its bay immediately, even while the payment is still open.</div></div>'
          : '<div class="banner banner-plain" style="margin-top:12px">' + UI.icon('info', 18) +
            '<div>Work completed ' + E(Util.fmtDateTime(job.completedAt)) + '. The bay was released at the same moment.</div></div>')
    });

    out += UI.card({
      title: 'Payment and collection',
      body: UI.dl([
        ['Workable total', Util.mmk(totals.totalMMK) + ' MMK'],
        ['Receipt', receipt ? receipt.id + ' · ' + Util.mmk(receipt.totalMMK) + ' MMK' : 'Not issued yet'],
        ['Payment', job.paymentStatus],
        ['Effective balance', Rules.effectiveCharge(job) - Rules.netPayment(job) === 0 && receipt ? 'Settled' : Util.mmk(Rules.effectiveBalance(job)) + ' MMK'],
        ['Collection', job.collectionStatus + (job.collectedAt ? ' · ' + Util.fmtDateTime(job.collectedAt) : '')]
      ]) +
        '<div class="row" style="margin-top:12px">' +
        UI.link('Open receipt', 'S12', { jobId: job.id }) +
        (manager ? UI.link('Corrections', 'S17', { tab: 'corrections', jobId: job.id }) : '') +
        '</div>'
    });

    out += UI.card({
      title: 'Materials',
      subtitle: 'Shop material is issued explicitly; quoting never deducts stock.',
      body: UI.table({
        label: 'Material issues',
        head: ['Item', 'Qty', 'Cost snapshot', 'Disposition'],
        rows: (job.materialIssues || []).map(function (iss) {
          const item = Store.item(iss.itemId);
          return [
            E(item ? item.name : iss.itemId),
            E(iss.quantity + ' ' + iss.unit),
            { html: iss.unitCostSnapshotMMK === null || iss.unitCostSnapshotMMK === undefined ? 'Not captured' : Util.mmk(iss.unitCostSnapshotMMK), className: 'num' },
            E(iss.disposition || 'Issued')
          ];
        }),
        empty: 'No material has been issued to this job.'
      }),
      actions: UI.btn('Open materials', { action: 'nav', variant: 'secondary', attrs: { nav: 'S09', params: JSON.stringify({ jobId: job.id }) } })
    });

    out += UI.card({
      title: 'Job activity',
      subtitle: 'Key events in this job.',
      body: activityHtml(job, state)
    });

    out += '</div></div>';

    return out;
  }

  function activityHtml(job, state) {
    const events = [];
    events.push({ at: job.createdAt, title: 'Check-in', text: 'Vehicle checked in.' });
    (job.quotes || []).forEach(function (q) {
      events.push({ at: q.submittedAt, title: 'Quote v' + q.version + ' submitted', text: 'Total ' + Util.mmk(q.totalMMK) + ' MMK · ' + q.status });
      if (q.approval && q.approval.recordedAt) {
        events.push({
          at: q.approval.recordedAt, title: 'Quote v' + q.version + ' ' + String(q.approval.decision).toLowerCase(),
          text: (q.approval.channel || '') + ' — ' + (q.approval.note || 'recorded in the demo')
        });
      }
    });
    (job.materialIssues || []).forEach(function (iss) {
      const item = Store.item(iss.itemId);
      events.push({ at: state.demoNow, title: 'Material issued', text: (item ? item.name : iss.itemId) + ' × ' + iss.quantity + ' ' + iss.unit });
    });
    if (job.completedAt) events.push({ at: job.completedAt, title: 'Work completed', text: 'The bay was released immediately.' });
    if (job.collectedAt) events.push({ at: job.collectedAt, title: 'Vehicle collected', text: 'Handed over to the customer.' });
    if (job.closedAt) events.push({ at: job.closedAt, title: 'Job closed', text: 'Moved to history.' });
    const log = (state.activity || []).filter(a => a.jobId === job.id || (a.message || '').indexOf(job.id) >= 0);
    log.forEach(function (a) { events.push({ at: a.at, title: a.type, text: a.message }); });

    if (!events.length) return '<div class="empty-state"><p>No activity recorded yet.</p></div>';
    events.sort(function (a, b) { return (a.at || '') < (b.at || '') ? 1 : -1; });
    return '<ul class="timeline">' + events.slice(0, 12).map(function (e) {
      return '<li><span class="tl-dot"></span><div>' +
        '<div class="tl-time">' + E(Util.fmtDateTime(e.at)) + '</div>' +
        '<div class="tl-title">' + E(e.title) + '</div>' +
        '<div class="muted small">' + E(e.text || '') + '</div></div></li>';
    }).join('') + '</ul>';
  }
})(window);
