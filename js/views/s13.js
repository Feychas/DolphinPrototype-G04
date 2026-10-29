/* S13 — Reminders: service due and awaiting collection.
   A follow-up is a demo note only. Nothing is called, messaged or sent. */
(function (global) {
  'use strict';
  const E = Util.esc;

  const CHANNELS = ['Phone', 'Viber', 'Messenger', 'In person'];
  const OUTCOMES = [
    'Customer will collect tomorrow',
    'Customer will collect later this week',
    'Customer asked to call back',
    'Customer not reachable — try again later',
    'Customer will not collect yet',
    'Other — describe in the note'
  ];
  const NEXT_ACTIONS = [
    'No further action',
    'Call again if still uncollected',
    'Message again in 3 days',
    'Wait for the customer to call',
    'Escalate to a Manager'
  ];

  /* ---------------- data helpers ---------------- */

  function vehicleOf(job) { return job ? Store.vehicle(job.vehicleId) : null; }
  function customerOf(job) {
    const v = vehicleOf(job);
    return v ? Store.customer(v.customerId) : null;
  }

  /** Whole days since completion, rounded down. */
  function daysWaiting(job) {
    if (!job || !job.completedAt) return 0;
    return Math.floor(Util.msBetween(job.completedAt, Store.now()) / 86400000);
  }

  /** One active service plan per vehicle: the newest stored plan wins. */
  function servicePlanJobs() {
    const byVehicle = {};
    (Store.state.jobs || []).forEach(function (job) {
      if (!job.nextServiceDueDate && !job.nextServiceDueMileageKm) return;
      if (job.lifecycleStatus === 'Cancelled') return;
      const stamp = job.closedAt || job.completedAt || job.createdAt || '';
      const current = byVehicle[job.vehicleId];
      if (!current || stamp > current.stamp) {
        byVehicle[job.vehicleId] = { job: job, stamp: stamp };
      }
    });
    return Object.keys(byVehicle).map(function (k) { return byVehicle[k].job; });
  }

  /** Vehicles whose stored service plan is due on the demo date. */
  function serviceQueue() {
    return servicePlanJobs().filter(function (job) {
      return !!Rules.serviceDue(job, Store.now());
    }).sort(function (a, b) {
      const ka = a.nextServiceDueDate || '9999-12-31';
      const kb = b.nextServiceDueDate || '9999-12-31';
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
  }

  /** Completed more than three days ago, still uncollected. Payment is irrelevant. */
  function collectionQueue() {
    return (Store.state.jobs || []).filter(function (job) {
      return Rules.collectionEligible(job, Store.now());
    }).sort(function (a, b) {
      const ka = a.completedAt || '';
      const kb = b.completedAt || '';
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
  }

  /** Follow-up notes recorded for one job, newest first. */
  function followUpsFor(jobId) {
    const list = (Store.state.followUps || []).filter(function (f) { return f.jobId === jobId; });
    return list.slice().reverse();
  }

  /** Most recent follow-up for one job, or null. */
  function lastFollowUp(jobId) {
    const list = followUpsFor(jobId);
    return list.length ? list[0] : null;
  }

  /** Short "last contact" summary shown on a row. */
  function contactSummary(job) {
    const f = lastFollowUp(job.id);
    if (!f) return { text: 'Not contacted', badge: UI.badge('Not contacted', 'orange') };
    return {
      text: f.channel + ' · ' + f.outcome,
      badge: UI.badge('Contacted', 'green'),
      at: Util.fmtDateTime(f.at)
    };
  }

  function serviceLabel(job) {
    const svc = (job.committedServiceLines || [])[0];
    if (!svc) return '—';
    const s = svc.serviceId ? Store.service(svc.serviceId) : null;
    if (s && Store.state.language === 'MM' && s.nameMM) return s.nameMM;
    return svc.label || (s ? s.nameEN : '—');
  }

  /** Plate with the vehicle under it, so the reminder tables stay narrow. */
  function vehicleCell(v) {
    if (!v) return '—';
    return '<strong>' + E(v.plate) + '</strong>' +
      '<br><span class="muted small">' + E(v.brand + ' ' + v.model) + '</span>';
  }

  /* ---------------- markup helpers ---------------- */

  /** Tab strip. Clicking a tab is handled by the reminders.tab action. */
  function tabStrip(items, active) {
    return '<div class="tabs" role="tablist" aria-label="Reminder lists">' + items.map(function (t) {
      const on = t.id === active;
      return '<button type="button" role="tab" aria-selected="' + (on ? 'true' : 'false') +
        '" class="tab' + (on ? ' tab-active' : '') + '" data-action="reminders.tab" data-tab-value="' + E(t.id) + '">' +
        E(t.label) + '</button>';
    }).join('') + '</div>';
  }

  function followUpCard(job, tab) {
    if (!job) {
      return UI.card({
        title: 'Record follow-up',
        subtitle: 'No message is actually sent — this is a demo note only.',
        body: UI.empty('Select a vehicle in the list to record a follow-up note.')
      });
    }
    const v = vehicleOf(job);
    const c = customerOf(job);
    const contact = contactSummary(job);
    const waiting = daysWaiting(job);
    const pairs = [
      ['Plate', v ? v.plate : '—'],
      ['Job', job.id],
      ['Vehicle', v ? (v.brand + ' ' + v.model + ' (' + v.year + ')') : '—'],
      ['Customer', c ? c.name : '—'],
      ['Customer phone', c ? c.phone : '—'],
      ['Completed', Util.fmtDate(job.completedAt) + ' ' + Util.fmtTime(job.completedAt)],
      ['Waiting', waiting + (waiting === 1 ? ' day' : ' days')],
      ['Payment status', job.paymentStatus],
      ['Status', contact.badge, true]
    ];
    const half = Math.ceil(pairs.length / 2);
    return UI.card({
      title: 'Record follow-up',
      subtitle: 'No message is actually sent — this is a demo note only.',
      body: '<div class="grid-2-even">' +
        UI.dl(pairs.slice(0, half)) +
        UI.dl(pairs.slice(half)) +
        '</div>' +
      '<form id="followup-form" data-form="reminders.followUp" data-job-id="' + E(job.id) + '" novalidate>' +
      '<div class="form-grid">' +
      UI.field({
        id: 'followup-channel', label: 'Channel', name: 'channel', type: 'select', required: true,
        value: 'Phone', options: CHANNELS.map(function (c2) { return { value: c2, label: c2 }; }),
        hint: 'The channel you used for this contact attempt.'
      }) +
      UI.field({
        id: 'followup-outcome', label: 'Outcome', name: 'outcome', type: 'select', required: true,
        value: OUTCOMES[0], options: OUTCOMES.map(function (o) { return { value: o, label: o }; })
      }) +
      UI.field({
        id: 'followup-nextaction', label: 'Next action', name: 'nextAction', type: 'select',
        value: NEXT_ACTIONS[0], options: NEXT_ACTIONS.map(function (a) { return { value: a, label: a }; }),
        hint: 'Optional. What should happen next.'
      }) +
      UI.field({
        id: 'followup-nextdate', label: 'Next action date', name: 'nextActionDate', type: 'date',
        hint: 'Optional. A demo date only.'
      }) +
      '</div>' +
      UI.field({
        id: 'followup-note', label: 'Note', name: 'note', type: 'textarea', rows: 3,
        hint: 'Optional. What the customer said.'
      }) +
      '<p class="note">Saving records a demo note against ' + E(job.id) +
      '. The customer is not contacted by this prototype. A contacted but uncollected car stays in the queue.</p>' +
      '<div class="form-actions">' +
      '<button type="submit" class="btn btn-primary">Save demo note</button>' +
      UI.btn('Clear note', { action: 'reminders.clear', variant: 'secondary' }) +
      '</div>' +
      '</form>'
    });
  }

  function followUpList() {
    const rows = (Store.state.followUps || []).slice().reverse();
    return UI.card({
      title: 'Follow-up notes',
      subtitle: 'Every saved demo note, newest first. A note records a contact attempt only.',
      body: UI.table({
        label: 'Follow-up notes',
        head: ['Recorded', 'Job', 'Plate', 'Channel', 'Outcome', 'Next action', 'By'],
        rows: rows.map(function (f) {
          const job = Store.job(f.jobId);
          const v = job ? vehicleOf(job) : null;
          return [
            Util.fmtDateTime(f.at),
            job ? UI.link(f.jobId, 'S06', { jobId: f.jobId }) : f.jobId,
            v ? v.plate : '—',
            f.channel,
            f.outcome,
            (f.nextAction ? f.nextAction : '—') + (f.nextActionDate ? ' (' + f.nextActionDate + ')' : ''),
            Store.staffName(f.actor)
          ];
        }),
        empty: 'No follow-up notes have been recorded yet.'
      })
    });
  }

  /* ---------------- render ---------------- */

  global.DolphinViews = global.DolphinViews || {};

  global.DolphinViews.S13 = {
    render: function (ctx) {
      const tab = ctx.params.tab === 'service' ? 'service' : 'collection';

      const service = serviceQueue();
      const collection = collectionQueue();

      /* keep the selection inside the visible list */
      const visible = tab === 'service' ? service : collection;
      let selected = visible.filter(function (j) { return j.id === ctx.params.jobId; })[0] || null;
      if (!selected && visible.length === 1) selected = visible[0];

      let out = UI.pageHeader({
        title: 'Reminders',
        subtitle: 'Follow up with customers to collect completed vehicles.'
      });

      if (ctx.state.language === 'MM') {
        out += UI.banner('warn', 'Myanmar preview — partial translation',
          'Only the service names supplied by the source are shown in Myanmar. The rest of this screen stays in English.');
      }

      out += tabStrip([
        { id: 'service', label: 'Service due (' + service.length + ')' },
        { id: 'collection', label: 'Awaiting collection (' + collection.length + ')' }
      ], tab);

      let listBody;
      if (tab === 'service') {
        listBody = UI.table({
          label: 'Vehicles due for service',
          head: ['Vehicle', 'Job', 'Customer', 'Due', 'Reason', 'Last contact', ''],
          rows: service.map(function (job) {
            const v = vehicleOf(job);
            const c = customerOf(job);
            const due = Rules.serviceDue(job, Store.now());
            const contact = contactSummary(job);
            const dueParts = [];
            if (job.nextServiceDueDate) dueParts.push(Util.fmtDate(job.nextServiceDueDate + 'T00:00:00+06:30'));
            if (job.nextServiceDueMileageKm) {
              dueParts.push(job.nextServiceDueMileageKm + ' km');
              const latest = Rules.latestMileage(job.vehicleId);
              if (latest !== null) dueParts.push('latest ' + latest + ' km');
            }
            const dueText = dueParts.length ? dueParts.join(' · ') : '—';
            return {
              attr: ' class="' + (selected && selected.id === job.id ? 'row-active' : '') + '"',
              cells: [
                { html: vehicleCell(v) },
                { html: UI.link(job.id, 'S06', { jobId: job.id }) },
                c ? c.name : '—',
                dueText,
                { html: due ? UI.badge(due.reason, 'orange') : '—' },
                { html: contact.badge + (contact.at ? ' <span class="muted small">' + E(contact.text) + '</span>' : '') },
                {
                  html: UI.btn('Follow-up', {
                    action: 'reminders.select', variant: 'secondary',
                    attrs: { jobId: job.id }
                  })
                }
              ]
            };
          }),
          empty: 'No stored service plan is due on ' + Util.fmtDate(Store.now()) + '.'
        }) +
        '<p class="note">A vehicle is due only when a stored next-service date has passed or the latest known visit mileage ' +
        'has reached the stored mileage. Mileage is never inferred from the calendar.</p>';
      } else {
        listBody = UI.table({
          label: 'Vehicles awaiting collection',
          head: ['Vehicle', 'Job', 'Customer', 'Completed', 'Waiting', 'Payment', 'Bay', 'Last contact', ''],
          rows: collection.map(function (job) {
            const v = vehicleOf(job);
            const c = customerOf(job);
            const contact = contactSummary(job);
            const days = daysWaiting(job);
            return {
              attr: ' class="' + (selected && selected.id === job.id ? 'row-active' : '') + '"',
              cells: [
                { html: vehicleCell(v) },
                { html: UI.link(job.id, 'S06', { jobId: job.id }) },
                c ? c.name : '—',
                Util.fmtDate(job.completedAt) + ' ' + Util.fmtTime(job.completedAt),
                days + (days === 1 ? ' day' : ' days'),
                { html: UI.statusBadge(job.paymentStatus) },
                { html: UI.badge('Bay released', 'grey') },
                { html: contact.badge + (contact.at ? ' <span class="muted small">' + E(contact.text) + '</span>' : '') },
                {
                  html: UI.btn('Follow-up', {
                    action: 'reminders.select', variant: 'secondary',
                    attrs: { jobId: job.id }
                  })
                }
              ]
            };
          }),
          empty: 'No completed vehicle has been waiting more than three days.'
        }) +
        '<p class="note">The collection reminder starts more than three days after repair completion. Payment status does not ' +
        'change eligibility. The repair bay was released when the work was completed, so a waiting vehicle does not block a bay.</p>';
      }

      out += UI.card({
        title: tab === 'service' ? 'Vehicles due for service' : 'Vehicles awaiting collection',
        subtitle: tab === 'service'
          ? 'One active reminder per vehicle, taken from the newest stored service plan.'
          : 'One active reminder per vehicle, never one per page visit.',
        body: listBody
      });

      out += followUpCard(selected, tab);
      out += followUpList();

      return out;
    }
  };
})(window);
