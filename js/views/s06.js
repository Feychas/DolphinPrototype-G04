/* S06 — Job list and job card.
   §3: one job page. The header carries the job identity, the four states and
   the single next action; the detail is then split over five tabs —
   Overview, Quote & Approval, Work & Materials, Payment & Collection and
   Activity History — so nothing has to be hunted for on another screen. */
(function (global) {
  'use strict';
  const E = Util.esc;
  global.DolphinViews = global.DolphinViews || {};

  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'quote', label: 'Quote & Approval' },
    { id: 'work', label: 'Work & Materials' },
    { id: 'payment', label: 'Payment & Collection' },
    { id: 'activity', label: 'Activity History' }
  ];

  const FILTERS = [
    { id: 'open', label: 'Open' },
    { id: 'progress', label: 'In progress' },
    { id: 'waiting', label: 'Waiting for parts' },
    { id: 'awaiting', label: 'Completed, not collected' },
    { id: 'closed', label: 'Closed' },
    { id: 'cancelled', label: 'Cancelled' },
    { id: 'redo', label: 'Redo' },
    { id: 'all', label: 'All' }
  ];

  function filterJobs(jobs, filter) {
    switch (filter) {
      case 'open': return jobs.filter(j => j.lifecycleStatus === 'Open');
      case 'progress': return jobs.filter(j => j.workStatus === 'In Progress' || j.workStatus === 'Waiting for Parts');
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
      if (ctx.params.view === 'current') return currentJob(ctx);
      return list(ctx);
    }
  };

  /* =======================================================================
     Small shared helpers
     ===================================================================== */

  /** The service of a job. Committed lines carry the translated label, so
      the Myanmar preview shows the supplied name. */
  function serviceSummary(job) {
    const lines = (job.committedServiceLines || []).filter(function (l) {
      return l.serviceId || l.kind === 'service';
    });
    if (lines.length) {
      return lines.map(function (l) { return Store.serviceLabel(l); }).join(', ');
    }
    return Rules.jobServiceLabel(job);
  }

  function staffNames(job) {
    return (job.assignedStaffIds || []).map(function (id) { return Store.staffName(id); }).join(', ');
  }

  function shortageText(job) {
    return Rules.shortages(job).map(function (s) {
      const item = Store.item(s.line.itemId);
      return (item ? item.name : s.line.label) + ' (need ' + s.remaining + ', on hand ' + (item ? item.onHand : 0) + ')';
    }).join('; ');
  }

  /* =======================================================================
     The next action — the single step that moves this job forward
     ===================================================================== */
  function act(label, action, job, icon, why) {
    return { label: label, action: action, attrs: { jobId: job.id }, icon: icon, why: why };
  }
  function navTo(label, screen, job, icon, why) {
    return { label: label, screen: screen, params: { jobId: job.id }, icon: icon, why: why };
  }
  function note(label, why) {
    return { label: label, why: why, blocked: true };
  }

  function nextAction(ctx, job) {
    if (!job) return null;
    if (job.lifecycleStatus !== 'Open') return null;          /* cancelled or closed */
    const manager = Store.isManagerial();
    const mechanic = ctx.role === 'Mechanic';
    const pricedRedo = Rules.isPricedRedo(job);
    const hasBay = !!job.bayId;
    const hasStaff = (job.assignedStaffIds || []).length > 0;

    /* 1 · check-in → inspection */
    if (job.workStatus === 'Check-in') {
      if (pricedRedo) {
        return act('Start work', 'job.startWork', job, 'wrench',
          'The Manager set the price of this Redo, so no customer quote is needed.');
      }
      return act('Start inspection', 'job.startInspection', job, 'wrench',
        'Inspect the vehicle and prepare the quote.');
    }

    /* 2 · a quote is waiting for the customer */
    if (job.workStatus === 'Diagnose/Quote') {
      if (job.approvalStatus === 'Declined') {
        return navTo('Prepare a new quote', 'S07', job, 'wrench',
          'The customer declined this quote. A new proposal is needed before work can start.');
      }
      if (job.approvalStatus === 'Pending') {
        if (mechanic) {
          return navTo('Prepare the quote', 'S07', job, 'wrench',
            'The quote is with the customer. The Cashier or a Manager records the decision.');
        }
        return navTo('Record the customer decision', 'S08', job, 'checkCircle',
          'The customer has not answered yet. Work cannot start until they do.');
      }
    }

    /* 3 · the authorised scope needs a bay and a mechanic */
    if (job.workStatus === 'Approved' || job.workStatus === 'Diagnose/Quote') {
      if (!hasBay) {
        return manager
          ? act('Assign bay and mechanic', 'bay.assign', job, 'car',
            'A free bay and at least one mechanic are needed before work can start.')
          : note('Assign bay and mechanic', 'A Manager assigns the bay and the mechanic before work can start.');
      }
      if (!hasStaff) {
        return manager
          ? act('Assign a mechanic', 'job.assignStaff', job, 'users',
            'At least one mechanic is needed before work can start.')
          : note('Assign a mechanic', 'A Manager assigns a mechanic before work can start.');
      }
      return act('Start work', 'job.startWork', job, 'wrench',
        'The scope is approved and the job is ready for the repair.');
    }

    /* 4 · the repair is running */
    if (job.workStatus === 'In Progress') {
      return act('Mark completed', 'job.complete', job, 'checkCircle',
        'Tick every checklist item first. Completing the repair releases the bay at once.');
    }
    if (job.workStatus === 'Waiting for Parts') {
      const short = shortageText(job);
      return act('Resume work', 'job.resumeWork', job, 'wrench',
        short ? 'Shortage: ' + short + '. The bay stays occupied until a Manager reassigns the job.'
          : 'The parts have arrived. Resume the repair.');
    }

    /* 5 · settlement, collection and closure */
    if (job.workStatus === 'Completed') {
      if (!Rules.jobIsSettled(job)) {
        const totals = Rules.jobTotals(job);
        const label = totals.totalMMK > 0 ? 'Collect payment' : 'Settle as no charge';
        return mechanic
          ? note(label, 'The Cashier records the payment on the receipt screen.')
          : navTo(label, 'S12', job, 'wallet',
            'Only the full amount is accepted. The balance is ' + Util.mmk(Rules.effectiveBalance(job)) + ' MMK.');
      }
      if (job.collectionStatus !== 'Collected') {
        return mechanic
          ? note('Confirm collection', 'The Cashier records the handover on the receipt screen.')
          : navTo('Confirm collection', 'S12', job, 'checkCircle',
            'The balance is settled. Hand the vehicle over and record the collection.');
      }
      return navTo('Close job', 'S12', job, 'archive',
        'Work is completed, settled and collected. Closing moves the job to the history.');
    }

    return null;
  }

  function nextActionHtml(na) {
    if (!na) return '';
    let btn = '';
    if (na.action) {
      btn = UI.btn(na.label, { action: na.action, variant: 'primary', icon: na.icon, attrs: na.attrs });
    } else if (na.screen) {
      btn = UI.btn(na.label, {
        action: 'nav', variant: 'primary', icon: na.icon,
        attrs: { nav: na.screen, params: JSON.stringify(na.params) }
      });
    }
    return '<div class="next-action">' +
      '<span class="next-action-label">Next action</span>' +
      (btn || '<p class="summary-line"><strong>' + E(na.label) + '</strong></p>') +
      (na.why ? '<p class="next-action-why">' + E(na.why) + '</p>' : '') +
      '</div>';
  }

  /* =======================================================================
     The job list
     ===================================================================== */
  function list(ctx) {
    const filter = ctx.params.tab || (ctx.params.view === 'progress' ? 'progress' : 'open');
    const jobs = filterJobs(Store.visibleJobs(), filter);
    const label = FILTERS.filter(f => f.id === filter)[0];
    const heading = label ? label.label : 'Jobs';

    let out = UI.pageHeader({
      title: ctx.role === 'Mechanic' ? 'My jobs' : 'Jobs',
      subtitle: ctx.role === 'Mechanic'
        ? 'Only the jobs assigned to you are listed.'
        : 'Every workshop job with its work, approval, payment and collection state.'
    });

    out += UI.tabs(FILTERS.map(f => ({ id: f.id, label: f.label })), filter, 'jobs');
    out += '<div class="action-bar">' +
      UI.btn('New check-in', { action: 'dashboard.newCheckIn', variant: 'primary', icon: 'plus' }) +
      '</div>';

    out += UI.card({
      title: heading + ' jobs',
      subtitle: jobs.length + ' job' + (jobs.length === 1 ? '' : 's'),
      body: UI.table({
        label: 'Job list',
        head: ['Job', 'Vehicle', 'Work', 'Next action'],
        rows: jobs.map(function (j) {
          const v = Store.vehicle(j.vehicleId);
          const na = nextAction(ctx, j);
          /* The job, the vehicle, the work state and the next step stay in
             the list. The rest opens under the row it belongs to. */
          return {
            cells: [
              { html: UI.link(j.id, 'S06', { jobId: j.id }) },
              E(v ? v.plate : '—'),
              { html: UI.statusBadge(j.workStatus) },
              na ? E(na.label) : '—'
            ],
            detail: UI.dl([
              ['Service', serviceSummary(j) || '—'],
              ['Approval', j.approvalStatus],
              ['Payment', j.paymentStatus],
              ['Collection', j.collectionStatus],
              ['Bay', j.bayId && Store.bay(j.bayId) ? Store.bay(j.bayId).name : 'Released'],
              ['Mechanic', staffNames(j) || 'Not assigned']
            ])
          };
        }),
        empty: 'No job matches this filter in the current scenario.'
      })
    });

    return out;
  }

  /* The mechanic's "Current job" entry: the live job they are on. */
  function currentJob(ctx) {
    const jobs = Store.visibleJobs();
    const live = jobs.filter(j => j.lifecycleStatus === 'Open' && j.workStatus !== 'Completed');
    const job = live[0] || jobs[0];
    if (!job) {
      return UI.pageHeader({ title: 'My current job' }) +
        UI.card({
          title: 'No job assigned',
          body: '<div class="empty-state"><p>No job is assigned to you in this scenario.</p></div>'
        });
    }
    return detail(ctx, job);
  }

  /* =======================================================================
     The job card
     ===================================================================== */
  function detail(ctx, job) {
    const state = ctx.state;
    const vehicle = Store.vehicle(job.vehicleId);
    const customer = vehicle ? Store.customer(vehicle.customerId) : null;
    const manager = Store.isManagerial();
    const mechanic = ctx.role === 'Mechanic';
    const mine = (job.assignedStaffIds || []).indexOf(ctx.user.id) >= 0;
    const section = SECTIONS.filter(s => s.id === ctx.params.section)[0] ? ctx.params.section : 'overview';

    let out = '';

    if (mechanic && !mine && job.lifecycleStatus === 'Open') {
      out += UI.pageHeader({ title: job.id, subtitle: vehicle ? vehicle.plate : '' });
      out += UI.banner('warn', 'This job is not assigned to you',
        'Mechanics see the details of their own assignments only. Switch the demo role to see another job.');
      return out;
    }

    if (job.redoOfJobId) {
      out += UI.banner('plain', 'Linked Redo of ' + job.redoOfJobId,
        'A Redo is a comeback record. It settles separately and never earns commission.' +
        (Rules.isPricedRedo(job)
          ? ' The Manager set the price to ' + Util.mmk(job.managerSetRedoChargeMMK) +
            ' MMK, so no customer quote is needed for this Redo.'
          : ''));
    }
    if (job.cancellation) {
      out += UI.banner('danger', 'Job cancelled',
        'Reason: ' + E(job.cancellation.reason) + '. The original records are kept.');
    }
    if (job.workStatus === 'Waiting for Parts') {
      const short = shortageText(job);
      out += UI.banner('warn', 'Waiting for parts',
        (short ? 'Shortage: ' + E(short) + '. ' : '') +
        'The bay stays occupied until a Manager reassigns the job.');
    }

    out += jobHeader(ctx, job, vehicle, customer, manager);
    out += UI.tabs(SECTIONS, section, 'job', 'section');

    if (section === 'quote') out += quotePanel(ctx, job);
    else if (section === 'work') out += workPanel(ctx, job, manager, mechanic);
    else if (section === 'payment') out += paymentPanel(ctx, job, manager);
    else if (section === 'activity') out += activityPanel(job, state);
    else out += overviewPanel(ctx, job, vehicle, customer, manager);

    return out;
  }

  /* ---------------- header ---------------- */
  function jobHeader(ctx, job, vehicle, customer, manager) {
    const totals = Rules.jobTotals(job);
    const receipt = Store.jobReceipt(job.id);
    const na = nextAction(ctx, job);
    const pricedRedo = Rules.isPricedRedo(job);

    let out = '<div class="job-head">';
    out += '<div class="job-head-top">';
    out += '<div class="job-head-id">' +
      '<h1>' + E(job.id) + '</h1>' +
      '<div class="job-head-meta">' +
      E(vehicle ? vehicle.plate + ' · ' + vehicle.brand + ' ' + vehicle.model + ' (' + vehicle.year + ')' : 'Vehicle unknown') +
      '</div>' +
      '<div class="job-head-meta">' +
      E(customer ? customer.name : 'No customer') +
      (customer && customer.phone ? ' · ' + E(customer.phone) : '') +
      ' · ' + E(serviceSummary(job)) +
      '</div>' +
      '</div>';
    out += '<div class="job-head-total">' +
      '<span class="t-label">Total</span>' +
      '<span class="t-value">' +
      (receipt || totals.totalMMK > 0 ? Util.mmk(totals.totalMMK) + ' <span class="muted small">MMK</span>' : '<span class="muted small">Not quoted yet</span>') +
      '</span></div>';
    out += '</div>';

    /* the four states stay separate — the chips only present them */
    out += '<div class="chip-row">' +
      chip('Work', job.workStatus, job.workStatus === 'Completed' ? 'green' : job.workStatus === 'Waiting for Parts' ? 'orange' : job.workStatus === 'Cancelled' ? 'grey' : 'blue') +
      chip('Approval', job.approvalStatus, job.approvalStatus === 'Approved' ? 'green' : job.approvalStatus === 'Pending' ? 'orange' : job.approvalStatus === 'Declined' ? 'red' : 'green') +
      chip('Payment', job.paymentStatus, job.paymentStatus === 'Paid' || job.paymentStatus === 'No charge' ? 'green' : 'orange') +
      chip('Collection', job.collectionStatus, job.collectionStatus === 'Collected' ? 'grey' : 'orange') +
      '</div>';

    out += nextActionHtml(na);
    out += secondaryActions(ctx, job, manager, pricedRedo);
    out += '</div>';
    return out;
  }

  function chip(label, value, tone) {
    return '<div class="chip chip-' + tone + '" title="' + E(label + ': ' + value) + '">' +
      '<span class="chip-label">' + E(label) + '</span>' +
      '<strong class="chip-value">' + E(value) + '</strong></div>';
  }

  /* Everything that is not the next action: still reachable, but quiet. */
  function secondaryActions(ctx, job, manager, pricedRedo) {
    const items = [];
    if (job.workStatus === 'In Progress') {
      items.push(UI.btn('Waiting for parts', { action: 'job.markWaitingParts', variant: 'secondary', attrs: { jobId: job.id } }));
    }
    if (!pricedRedo && (job.workStatus === 'In Progress' || job.workStatus === 'Approved' || job.workStatus === 'Diagnose/Quote')) {
      items.push(UI.btn('Add extra work', { action: 'job.addExtra', variant: 'secondary', icon: 'plus', attrs: { jobId: job.id } }));
    }
    if (manager) {
      items.push(UI.btn('Assign mechanics', { action: 'job.assignStaff', variant: 'quiet', attrs: { jobId: job.id } }));
      if (job.workStatus === 'Completed' && job.paymentStatus === 'Unpaid' && job.collectionStatus !== 'Collected') {
        items.push(UI.btn('Reopen', { action: 'job.reopen', variant: 'quiet', attrs: { jobId: job.id } }));
      }
      if (job.paymentStatus === 'Paid' || job.paymentStatus === 'No charge') {
        items.push(UI.btn('Create linked Redo', { action: 'job.createRedo', variant: 'quiet', icon: 'refresh', attrs: { jobId: job.id } }));
      }
      if (job.lifecycleStatus === 'Open') {
        items.push(UI.btn('Cancel job', { action: 'job.cancel', variant: 'quiet', attrs: { jobId: job.id } }));
      }
      if (job.lifecycleStatus === 'Closed') {
        items.push(UI.btn('Archive record', { action: 'job.archive', variant: 'quiet', attrs: { jobId: job.id } }));
      }
    }
    if (!items.length) return '';
    return '<div class="secondary-actions">' + items.join('') + '</div>';
  }

  /* ---------------- tab: Overview ---------------- */
  function overviewPanel(ctx, job, vehicle, customer, manager) {
    const mine = (job.assignedStaffIds || []).indexOf(ctx.user.id) >= 0;
    let out = '<div class="grid-2">';
    out += '<div>';

    out += UI.card({
      title: 'Vehicle and check-in',
      body: UI.dl([
        ['Vehicle', vehicle ? vehicle.plate + ' · ' + vehicle.brand + ' ' + vehicle.model + ' (' + vehicle.year + ')' : '—'],
        ['Size', job.size],
        ['Customer', customer ? customer.name : '—'],
        ['Phone', customer ? customer.phone : '—'],
        ['Mileage', (job.mileageKm === null || job.mileageKm === undefined ? '—' : job.mileageKm + ' km')],
        ['Existing damage', job.damage || 'None recorded'],
        ['Fuel', job.fuelLevel || '—'],
        ['Belongings', job.belongings || 'None recorded'],
        ['Checked in', Util.fmtDateTime(job.createdAt)]
      ])
    });

    /* §7 — the description and the complaint can be edited while the job is open */
    const canEdit = (manager || ctx.role === 'Cashier') && job.lifecycleStatus === 'Open' &&
      job.paymentStatus !== 'Paid' && job.paymentStatus !== 'No charge';
    out += UI.card({
      title: 'Requested work and customer complaint',
      subtitle: canEdit ? 'Open the fields to change them. Every change is written to the job history.'
        : 'A settled or closed job keeps the description it was closed with.',
      body: UI.dl([
        ['Requested work', job.description || 'Not recorded'],
        ['Customer complaint', job.complaint || 'Not recorded']
      ]) +
        (canEdit
          ? '<div class="action-bar">' +
            UI.btn('Edit description', { action: 'job.editDetails', variant: 'secondary', icon: 'edit', attrs: { jobId: job.id } }) +
            '</div>'
          : ''),
      actions: canEdit ? '' : ''
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

    out += '</div><div>';

    /* §7 — check-in damage photos. Every photo record is kept with the job:
       the note, who added it and when. Nothing is edited or removed later. */
    const photos = job.damagePhotos || [];
    const canPhoto = job.lifecycleStatus === 'Open' &&
      (manager || ctx.role === 'Cashier' || (ctx.role === 'Mechanic' && mine));
    out += UI.card({
      title: 'Damage photos',
      subtitle: photos.length
        ? photos.length + ' record' + (photos.length === 1 ? '' : 's') + ', kept with the job'
        : 'No photo record yet',
      body: (photos.length
        ? '<ul class="stack-sm">' + photos.map(function (p) {
          return '<li><strong>' + E(p.stage) + '</strong> ' +
            '<span class="muted small">' + E(p.actorName || Store.staffName(p.actor)) + ' · ' +
            E(Util.fmtDateTime(p.at)) + '</span><br>' + E(p.caption) + '</li>';
        }).join('') + '</ul>'
        : '<p class="note">No photo record yet. One can be added while the job is open.</p>') +
        '<p class="note">A photo record stays as it was added — it cannot be edited or deleted.</p>',
      actions: canPhoto
        ? UI.btn('Add photo record', { action: 'job.addPhoto', variant: 'secondary', icon: 'plus', attrs: { jobId: job.id } })
        : ''
    });

    out += UI.card({
      title: 'Assignment',
      body: UI.dl([
        ['Bay', job.bayId && Store.bay(job.bayId) ? Store.bay(job.bayId).name : 'No bay assigned'],
        ['Mechanic', staffNames(job) || 'Not assigned'],
        ['Job type', Rules.jobServiceLabel(job)]
      ]) +
        (manager
          ? '<div class="action-bar">' +
            UI.btn('Assign bay and mechanic', { action: 'bay.assign', variant: 'secondary', icon: 'car', attrs: { jobId: job.id } }) +
            '</div>'
          : '') +
        '<p class="note">' + (job.workStatus !== 'Completed'
          ? 'Completing the repair releases its bay immediately, even while the payment is still open.'
          : 'Work completed ' + E(Util.fmtDateTime(job.completedAt)) + '. The bay was released at the same moment.') + '</p>'
    });

    out += UI.card({
      title: 'Where this job stands',
      body: UI.dl([
        ['Workflow', workflowLabel(job)],
        ['Next step', nextAction(ctx, job) ? nextAction(ctx, job).label : 'Nothing is waiting on this job'],
        ['Open since', Util.fmtDateTime(job.createdAt)]
      ])
    });

    out += '</div></div>';
    return out;
  }

  function workflowLabel(job) {
    if (job.lifecycleStatus === 'Closed') return 'Closed';
    if (job.lifecycleStatus === 'Cancelled') return 'Cancelled';
    if (job.workStatus === 'Check-in') return 'Check-in';
    if (job.workStatus === 'Diagnose/Quote') return 'Inspection and quote';
    if (job.workStatus === 'Approved') return 'Approved — waiting for bay and mechanic';
    if (job.workStatus === 'In Progress') return 'In progress';
    if (job.workStatus === 'Waiting for Parts') return 'In progress — waiting for parts';
    if (job.workStatus === 'Completed') {
      if (job.paymentStatus === 'Paid' || job.paymentStatus === 'No charge') {
        return job.collectionStatus === 'Collected' ? 'Collected — ready to close' : 'Paid — waiting for collection';
      }
      return 'Completed — waiting for payment';
    }
    return job.workStatus;
  }

  /* ---------------- tab: Quote & Approval ---------------- */
  function quotePanel(ctx, job) {
    const quotes = job.quotes || [];
    const active = Store.quote(job);
    const manager = Store.isManagerial();
    let out = '<div class="grid-2">';
    out += '<div>';

    out += UI.card({
      title: 'Quote versions',
      subtitle: 'Approved versions are frozen. An edit creates a new version.',
      body: quotes.length ? UI.table({
        label: 'Quote versions',
        head: ['Version', 'Type', 'Status', 'Total', ''],
        rows: quotes.map(function (q) {
          const t = Rules.quoteTotals(q);
          /* The figures behind the version open under the row. */
          return {
            cells: [
              'v' + q.version + (q.version === job.activeQuoteVersion ? ' (current)' : ''),
              q.isExtraWork ? 'Extra work' : 'Initial',
              { html: UI.statusBadge(q.status) },
              { html: Util.mmk(t.totalMMK), className: 'num' },
              { html: UI.link('Open', 'S07', { jobId: job.id, version: q.version }) }
            ],
            detail: UI.dl([
              ['Subtotal', Util.mmk(t.subtotalMMK) + ' MMK'],
              ['Discount', t.discountMMK ? '−' + Util.mmk(t.discountMMK) + ' MMK' : 'None'],
              ['Approval basis', Util.mmk(t.repairApprovalBasisMMK) + ' MMK'],
              ['Approved', q.approval ? Util.fmtDateTime(q.approval.recordedAt) + (q.approval.channel ? ' · ' + q.approval.channel : '') : '—']
            ])
          };
        })
      }) : '<div class="empty-state"><p>No quote has been prepared yet.</p></div>',
      actions: UI.btn('Open inspection', { action: 'nav', variant: 'secondary', attrs: { nav: 'S07', params: JSON.stringify({ jobId: job.id }) } })
    });

    if (active) {
      const t = Rules.quoteTotals(active);
      out += UI.card({
        title: 'Current scope — v' + active.version + (active.isExtraWork ? ' (extra work)' : ''),
        subtitle: 'Submitted ' + Util.fmtDateTime(active.submittedAt),
        body: UI.table({
          label: 'Quoted lines of version ' + active.version,
          head: ['Description', 'Source', 'Qty', 'Unit price', 'Amount'],
          rows: (active.lines || []).map(function (l) {
            const src = l.kind === 'customerMaterial' || l.source === 'Customer' ? 'Customer-supplied'
              : (l.kind === 'part' || l.kind === 'oil') ? 'Shop material' : 'Labour / service';
            return [
              E(Store.serviceLabel(l)),
              E(src),
              E(l.quantity),
              { html: Util.mmk(l.unitPriceMMK), className: 'num' },
              { html: Util.mmk(Rules.lineGross(l)), className: 'num' }
            ];
          })
        }) +
          '<div class="detail-list">' +
          '<div class="detail-row"><span>Subtotal</span><span>' + Util.mmk(t.subtotalMMK) + ' MMK</span></div>' +
          '<div class="detail-row"><span>Discount applied</span><span>' + (t.discountMMK ? '−' + Util.mmk(t.discountMMK) + ' MMK' : 'None') + '</span></div>' +
          '<div class="detail-row"><span>Rounding</span><span>' + Util.mmk(t.roundingMMK) + ' MMK</span></div>' +
          '<div class="detail-row"><span>Total</span><span><strong>' + Util.mmk(t.totalMMK) + ' MMK</strong></span></div>' +
          '</div>'
      });
    }

    out += '</div><div>';

    /* the inspection notes stay complete — only the reading is shortened */
    const notes = active ? active.inspectionNotes : '';
    out += UI.card({
      title: 'Inspection notes',
      subtitle: 'The complete note is kept with the version it was written for.',
      body: UI.disclosure('The complete note is kept with the version it was written for.', notes, 'Show the full inspection notes')
    });

    if (active && active.approval) {
      out += UI.card({
        title: 'Recorded decision',
        body: UI.dl([
          ['Decision', active.approval.decision],
          ['Channel', active.approval.channel || '—'],
          ['Recorded by', active.approval.recordedBy ? Store.staffName(active.approval.recordedBy) : 'Not required'],
          ['Recorded at', Util.fmtDateTime(active.approval.recordedAt)],
          ['Contact note', active.approval.note || 'None']
        ]) + '<p class="note">Recorded in the demo state only. No message was actually sent.</p>'
      });
    } else {
      out += UI.card({
        title: 'Customer decision',
        body: '<p>' + (job.approvalStatus === 'Pending'
          ? 'The quote is with the customer. No decision has been recorded yet.'
          : job.approvalStatus === 'Declined'
            ? 'The customer declined this quote. A new proposal is needed.'
            : 'No customer approval was needed for this scope.') + '</p>' +
          '<div class="action-bar">' +
          UI.link('Open the approval screen', 'S08', { jobId: job.id }) +
          '</div>'
      });
    }

    if (Rules.hasDeclinedExtra(job)) {
      const withdrawn = !!job.extraWorkWithdrawn;
      const kept = quotes.filter(q => !q.isExtraWork && q.status === 'Approved').pop();
      out += UI.card({
        title: withdrawn ? 'Declined extra work — withdrawn' : 'Declined extra work',
        body: (withdrawn
          ? '<p>The declined version is kept in the history and the earlier approved scope' +
            (kept ? ' (v' + E(kept.version) + ')' : '') + ' stays usable.</p>'
          : '<p>The customer declined the extra-work version. Withdraw it explicitly to continue with the approved scope.</p>') +
          (!withdrawn && manager
            ? '<div class="action-bar">' +
              UI.btn('Withdraw the extra work', { action: 'job.withdrawExtra', variant: 'secondary', attrs: { jobId: job.id } }) +
              '</div>'
            : '')
      });
    }

    out += '</div></div>';
    return out;
  }

  /* ---------------- tab: Work & Materials ---------------- */
  function workPanel(ctx, job, manager, mechanic) {
    const notes = job.notes || [];
    const canNote = (manager || (mechanic && (job.assignedStaffIds || []).indexOf(ctx.user.id) >= 0)) &&
      job.lifecycleStatus === 'Open';
    let out = '<div class="grid-2">';
    out += '<div>';

    out += UI.card({
      title: 'Service and material lines',
      subtitle: 'The committed scope plus any material already issued to this job.',
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

    out += '</div><div>';

    /* §7 — work performed and internal notes */
    out += UI.card({
      title: 'Work performed and internal notes',
      subtitle: 'Each note keeps its author and the time it was written.',
      body: (notes.length
        ? '<ul class="stack-sm">' + notes.map(function (n) {
          return '<li><strong>' + E(n.kind === 'internal' ? 'Internal note' : 'Work performed') + '</strong> ' +
            '<span class="muted small">' + E(n.authorName || Store.staffName(n.authorId)) + ' · ' + E(Util.fmtDateTime(n.at)) + '</span>' +
            '<br>' + E(n.text) + '</li>';
        }).join('') + '</ul>'
        : '<p class="note">No note has been written for this job yet.</p>') +
        (canNote
          ? '<form id="note-form" data-form="job.note" data-job-id="' + E(job.id) + '">' +
            '<div class="field"><label for="note-kind">Note type</label>' +
            '<select id="note-kind" name="kind">' +
            '<option value="work">Work performed</option>' +
            '<option value="internal">Internal note</option>' +
            '</select></div>' +
            '<div class="field"><label for="note-text">Note</label>' +
            '<textarea id="note-text" name="text" rows="2" placeholder="What was done, or what the next mechanic needs to know"></textarea></div>' +
            '<div class="form-actions">' +
            UI.btn('Add note', { variant: 'primary', icon: 'plus', type: 'submit' }) +
            '</div></form>'
          : '<p class="note">' + (job.lifecycleStatus !== 'Open'
            ? 'A closed job keeps the notes it was closed with.'
            : 'Only a mechanic assigned to this job or a Manager can write a note.') + '</p>')
    });

    out += UI.card({
      title: 'Bay and work state',
      body: UI.dl([
        ['Bay', job.bayId && Store.bay(job.bayId) ? Store.bay(job.bayId).name : 'Released'],
        ['Mechanic', staffNames(job) || 'Not assigned'],
        ['Work status', job.workStatus],
        ['Completed at', job.completedAt ? Util.fmtDateTime(job.completedAt) : '—']
      ])
    });

    out += '</div></div>';
    return out;
  }

  /* ---------------- tab: Payment & Collection ---------------- */
  function paymentPanel(ctx, job, manager) {
    const totals = Rules.jobTotals(job);
    const receipt = Store.jobReceipt(job.id);
    const balance = Rules.effectiveBalance(job);
    let out = '<div class="grid-2">';
    out += '<div>';

    out += UI.card({
      title: 'Payment and collection',
      body: UI.dl([
        ['Workable total', Util.mmk(totals.totalMMK) + ' MMK'],
        ['Discount applied', totals.discountMMK ? '−' + Util.mmk(totals.discountMMK) + ' MMK' : 'None'],
        ['Receipt', receipt ? receipt.id + ' · ' + Util.mmk(receipt.totalMMK) + ' MMK' : 'Not issued yet'],
        ['Payment', job.paymentStatus],
        ['Effective balance', balance === 0 && receipt ? 'Settled' : Util.mmk(balance) + ' MMK'],
        ['Collection', job.collectionStatus + (job.collectedAt ? ' · ' + Util.fmtDateTime(job.collectedAt) : '')]
      ]) +
        '<div class="row" style="margin-top:12px">' +
        UI.link('Open receipt', 'S12', { jobId: job.id }) +
        (manager ? UI.link('Corrections', 'S17', { tab: 'corrections', jobId: job.id }) : '') +
        '</div>'
    });

    /* The rules of settlement are stated once, on the receipt screen. Here
       only the two points that are not obvious from the figures. */
    out += UI.card({
      title: 'How this job settles',
      body: '<ul class="stack-sm">' +
        '<li>• Only a full payment is accepted — a part payment is refused.</li>' +
        '<li>• An issued receipt keeps its price lines. A change is a Manager correction, never an edit.</li>' +
        '</ul>' +
        '<p class="note">The receipt screen carries the full settlement rules.</p>'
    });

    out += '</div><div>';

    out += UI.card({
      title: 'Settlement steps',
      body: UI.dl([
        ['Work completed', job.workStatus === 'Completed' ? 'Yes' : 'Not yet'],
        ['Balance settled', Rules.jobIsSettled(job) ? 'Yes' : 'No'],
        ['Vehicle collected', job.collectionStatus === 'Collected' ? 'Yes' : 'No'],
        ['Job closed', job.lifecycleStatus === 'Closed' ? 'Yes' : 'No']
      ]) +
        '<div class="action-bar" style="margin-top:12px">' +
        UI.btn('Open receipt screen', { action: 'nav', variant: 'secondary', attrs: { nav: 'S12', params: JSON.stringify({ jobId: job.id }) } }) +
        '</div>'
    });

    out += '</div></div>';
    return out;
  }

  /* ---------------- tab: Activity History ---------------- */
  function activityPanel(job, state) {
    return UI.card({
      title: 'Job activity',
      subtitle: 'Key events in this job, newest first.',
      body: activityHtml(job, state)
    });
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
    (job.notes || []).forEach(function (n) {
      events.push({ at: n.at, title: n.kind === 'internal' ? 'Internal note' : 'Work performed', text: n.text });
    });
    (job.damagePhotos || []).forEach(function (p) {
      events.push({ at: p.at, title: p.stage + ' photo', text: p.caption });
    });
    if (job.completedAt) events.push({ at: job.completedAt, title: 'Work completed', text: 'The bay was released immediately.' });
    if (job.collectedAt) events.push({ at: job.collectedAt, title: 'Vehicle collected', text: 'Handed over to the customer.' });
    if (job.closedAt) events.push({ at: job.closedAt, title: 'Job closed', text: 'Moved to history.' });
    const log = (state.activity || []).filter(a => a.jobId === job.id || (a.message || '').indexOf(job.id) >= 0);
    log.forEach(function (a) { events.push({ at: a.at, title: a.type, text: a.message }); });

    if (!events.length) return '<div class="empty-state"><p>No activity recorded yet.</p></div>';
    events.sort(function (a, b) { return (a.at || '') < (b.at || '') ? 1 : -1; });
    return '<ul class="timeline">' + events.slice(0, 40).map(function (e) {
      return '<li><span class="tl-dot"></span><div>' +
        '<div class="tl-time">' + E(Util.fmtDateTime(e.at)) + '</div>' +
        '<div class="tl-title">' + E(e.title) + '</div>' +
        '<div class="muted small">' + E(e.text || '') + '</div></div></li>';
    }).join('') + '</ul>';
  }
})(window);
