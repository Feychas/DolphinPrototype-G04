/* Dolphin AutoTrack prototype — S14 Bookings (day list + selected booking).
   Bookings are simulated demo records: no customer is contacted and no real
   workshop slot is reserved. */
(function (global) {
  'use strict';

  const E = Util.esc;

  /* Small field builder that also accepts extra attributes such as
     data-change / data-live (UI.field cannot carry those). */
  function field(o) {
    const id = o.id;
    const req = o.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
    let control;
    if (o.type === 'select') {
      control = '<select id="' + E(id) + '" name="' + E(o.name || id) + '"' +
        (o.required ? ' required' : '') + (o.attrs || '') + '>' +
        (o.options || []).map(function (op) {
          const val = op.value !== undefined ? op.value : op;
          const lab = op.label !== undefined ? op.label : op;
          const sel = String(val) === String(o.value) ? ' selected' : '';
          return '<option value="' + E(val) + '"' + sel + '>' + E(lab) + '</option>';
        }).join('') + '</select>';
    } else {
      control = '<input type="' + E(o.type || 'text') + '" id="' + E(id) + '" name="' + E(o.name || id) + '"' +
        (o.value !== undefined && o.value !== null ? ' value="' + E(o.value) + '"' : '') +
        (o.required ? ' required' : '') +
        (o.min !== undefined ? ' min="' + E(min(o.min)) + '"' : '') +
        (o.max !== undefined ? ' max="' + E(min(o.max)) + '"' : '') +
        (o.step !== undefined ? ' step="' + E(min(o.step)) + '"' : '') +
        (o.attrs || '') + '>';
    }
    return '<div class="field"><label for="' + E(id) + '">' + E(o.label) + req + '</label>' + control +
      (o.hint ? '<p class="field-hint">' + E(o.hint) + '</p>' : '') + '</div>';
  }
  function min(v) { return String(v).replace(/[^0-9.\-]/g, ''); }

  function helpers() {
    return global.DolphinBookings || {
      bookings: function (s) { return s.bookings || []; },
      find: function (s, id) {
        return (s.bookings || []).filter(function (b) { return b.id === id; })[0] || null;
      },
      selectedDay: function (s) { return s.selectedBookingDay || Util.dayKey(Store.now()); },
      dayBookings: function (s, day) {
        return (s.bookings || []).filter(function (b) { return Util.dayKey(b.startAt) === day; })
          .sort(function (a, b) { return String(a.startAt).localeCompare(String(b.startAt)); });
      },
      ensureDraft: function (s) {
        if (!s.bookingDraft) {
          s.bookingDraft = {
            customerId: (s.customers || [])[0] ? s.customers[0].id : '',
            vehicleId: '', serviceId: (s.services || [])[0] ? s.services[0].id : '',
            date: Util.dayKey(Store.now()), startTime: '09:00', endTime: '10:00'
          };
        }
        return s.bookingDraft;
      },
      timeOf: function (iso) { const m = /T(\d{2}:\d{2})/.exec(String(iso || '')); return m ? m[1] : ''; },
      dayOf: function (iso) { return Util.dayKey(iso); },
      vehicleLabel: function (v) { return v ? v.plate : '—'; }
    };
  }

  function serviceName(id) {
    const s = Store.service(id);
    return s ? s.nameEN : (id || '—');
  }

  function bayName(id) {
    const b = id ? Store.bay(id) : null;
    return b ? b.name : (id || '—');
  }

  /* ---------------- day list ---------------- */
  function dayListCard(ctx, day) {
    const B = helpers();
    const rows = B.dayBookings(ctx.state, day);
    const body = UI.table({
      label: 'Bookings on ' + Util.fmtDate(day + 'T00:00:00+06:30'),
      head: ['Time', 'Vehicle', 'Service', 'Bay', 'Status', 'Action'],
      empty: 'No bookings on this day. Use "New booking" to add one.',
      rows: rows.map(function (b) {
        const vehicle = Store.vehicle(b.vehicleId);
        const customer = vehicle ? Store.customer(vehicle.customerId) : null;
        const active = ctx.state.selectedBookingId === b.id ? ' class="row-active"' : '';
        let action;
        if (b.jobId && Store.job(b.jobId)) {
          action = UI.link('Open job', 'S06', { jobId: b.jobId });
        } else if (b.cancelled) {
          action = UI.btn('Record late arrival', {
            variant: 'secondary', action: 'booking.lateArrival', attrs: { bookingId: b.id }
          });
        } else {
          action = UI.btn('Check in', {
            variant: 'secondary', action: 'booking.checkIn', attrs: { bookingId: b.id }
          });
        }
        return {
          attr: active,
          cells: [
            { html: '<button type="button" class="btn btn-ghost btn-sm" data-action="booking.select" data-booking-id="' +
                E(b.id) + '">' + E(B.timeOf(b.startAt)) + ' – ' + E(B.timeOf(b.endAt)) + '</button>' },
            { html: E(vehicle ? vehicle.plate : b.vehicleId) + '<br><span class="muted small">' +
                E(customer ? customer.name : '') + '</span>' },
            E(serviceName(b.serviceId)),
            { html: b.bayId ? E(bayName(b.bayId)) : (b.releasedBayId
              ? '<span class="muted">Released (' + E(bayName(b.releasedBayId)) + ')</span>'
              : '<span class="muted">Not assigned</span>') },
            { html: UI.statusBadge(b.status) },
            { html: action }
          ]
        };
      })
    });

    return UI.card({
      title: 'Day list — ' + Util.fmtDate(day + 'T00:00:00+06:30'),
      subtitle: rows.length + ' booking(s) on this workshop date.',
      actions: UI.btn('Run demo no-show check', {
        variant: 'secondary', action: 'booking.noShowCheck'
      }),
      body: body +
        '<p class="note">A no-show is cancelled once when the demo clock reaches the start time plus 30 minutes. ' +
        'It releases that booking reservation only — no other job\'s bay is touched. The cancelled record is kept.</p>'
    });
  }

  /* ---------------- new booking form ---------------- */
  function newBookingCard(ctx) {
    const B = helpers();
    const draft = B.ensureDraft(ctx.state);
    const customers = (ctx.state.customers || []).filter(function (c) { return !c.archived; });
    const vehicles = (ctx.state.vehicles || []).filter(function (v) {
      return !v.archived && v.customerId === draft.customerId;
    });
    const services = (ctx.state.services || []).filter(function (s) { return s.active !== false; });

    const body =
      '<form id="booking-new-form" data-form="booking.save" novalidate>' +
      '<div class="form-grid">' +
      field({
        id: 'bk-customer', label: 'Customer', type: 'select', name: 'customerId',
        required: true, value: draft.customerId,
        options: customers.map(function (c) { return { value: c.id, label: c.name + ' — ' + c.phone }; }),
        attrs: ' data-change="booking.customerChanged"'
      }) +
      field({
        id: 'bk-vehicle', label: 'Vehicle', type: 'select', name: 'vehicleId', required: true,
        value: draft.vehicleId,
        options: vehicles.length ? vehicles.map(function (v) {
          return { value: v.id, label: v.plate + ' — ' + v.brand + ' ' + v.model + ' (' + v.size + ')' };
        }) : [{ value: '', label: 'No vehicle for this customer' }]
      }) +
      field({
        id: 'bk-service', label: 'Requested service', type: 'select', name: 'serviceId', required: true,
        value: draft.serviceId,
        options: services.map(function (s) { return { value: s.id, label: s.nameEN + ' / ' + s.nameMM }; })
      }) +
      field({
        id: 'bk-date', label: 'Date', type: 'date', name: 'date', required: true, value: draft.date,
        attrs: ' data-live="booking.draftSync" data-change="booking.draftSync"'
      }) +
      field({
        id: 'bk-start', label: 'Start time', type: 'time', name: 'startTime', required: true,
        value: draft.startTime, attrs: ' data-live="booking.draftSync" data-change="booking.draftSync"'
      }) +
      field({
        id: 'bk-end', label: 'End time', type: 'time', name: 'endTime', required: true,
        value: draft.endTime, attrs: ' data-live="booking.draftSync" data-change="booking.draftSync"'
      }) +
      '</div>' +
      '<div class="field"><label for="bk-bay">Bay</label>' +
      '<input type="text" id="bk-bay" value="Assigned by a Manager after the request is saved" readonly>' +
      '<p class="field-hint">A saved booking starts as <strong>Requested</strong> with no bay. A Manager assigns ' +
      'the bay and confirms it as <strong>Booked</strong>.</p></div>' +
      '<div class="form-actions">' +
      '<button type="submit" class="btn btn-primary">Save demo booking</button>' +
      '<button type="button" class="btn btn-secondary" data-action="booking.fillSample">Fill demo sample</button>' +
      '</div>' +
      '</form>' +
      '<p class="note">Same-bay bookings cannot overlap. The demo sample loads the published conflict example: ' +
      '11:30–12:30 in Bay 1 clashes with BK-01 (11:00–12:00), while 12:00–13:00 is valid.</p>' +
      '<p class="note">All bookings, customers and workshop slots in this prototype are fictional. Nothing is ' +
      'reserved and no message is sent to a customer.</p>';

    return UI.card({ title: 'New booking', subtitle: 'Request a workshop slot for a customer vehicle.', body: body });
  }
  /* ---------------- selected booking detail ---------------- */
  function detailCard(ctx, booking) {
    const B = helpers();
    if (!booking) {
      return UI.card({
        title: 'Selected booking',
        body: UI.empty('Select a booking in the day list to see its detail, bay reservation and history.')
      });
    }
    const vehicle = Store.vehicle(booking.vehicleId);
    const customer = vehicle ? Store.customer(vehicle.customerId) : null;
    const service = Store.service(booking.serviceId);
    const job = booking.jobId ? Store.job(booking.jobId) : null;
    const managerial = ctx.role === 'Owner' || ctx.role === 'Manager';

    const pairs = [
      ['Booking', booking.id],
      ['Status', { html: UI.statusBadge(booking.status), raw: true }],
      ['Customer', customer ? customer.name : '—'],
      ['Vehicle', vehicle ? vehicle.plate + ' — ' + vehicle.brand + ' ' + vehicle.model + ' (' + vehicle.size + ')' : '—'],
      ['Service', service ? service.nameEN + ' / ' + service.nameMM : (booking.serviceId || '—')],
      ['Date', Util.fmtDate(booking.startAt)],
      ['Time', B.timeOf(booking.startAt) + ' – ' + B.timeOf(booking.endAt)],
      ['Bay', booking.bayId ? bayName(booking.bayId)
        : (booking.releasedBayId
          ? 'Released — ' + bayName(booking.releasedBayId) + ' (reservation released)'
          : 'Not assigned yet — a Manager assigns it')],
      ['Arrival', booking.arrivedAt ? Util.fmtDateTime(booking.arrivedAt) : 'Not arrived'],
      ['Linked job', job
        ? { html: UI.link(job.id, 'S06', { jobId: job.id }) + ' <span class="muted small">(' + E(job.workStatus) + ')</span>', raw: true }
        : 'None yet'],
      ['Created', booking.createdAt
        ? Util.fmtDateTime(booking.createdAt) + ' by ' + E(Store.staffName(booking.createdBy))
        : 'Not recorded — seeded demo booking'],
      ['Reason', booking.reason || '—'],
      ['Cancellation reason', booking.cancelReason || '—']
    ];

    const dl = UI.dl(pairs.map(function (p) {
      return [p[0], p[1].raw ? p[1].html : p[1], true];
    }));

    /* action buttons */
    const buttons = [];
    if (!booking.cancelled) {
      if (managerial) {
        buttons.push(UI.btn('Assign bay and confirm', {
          variant: 'primary', action: 'booking.assignBay', attrs: { bookingId: booking.id }
        }));
      }
      if (!job) {
        buttons.push(UI.btn('Check in', {
          variant: 'secondary', action: 'booking.checkIn', attrs: { bookingId: booking.id }
        }));
      }
      buttons.push(UI.btn('Edit booking', {
        variant: 'secondary', action: 'booking.edit', attrs: { bookingId: booking.id }
      }));
      buttons.push(UI.btn('Cancel booking', {
        variant: 'danger', action: 'booking.cancel', attrs: { bookingId: booking.id }
      }));
    } else {
      buttons.push(UI.btn('Record late arrival', {
        variant: 'primary', action: 'booking.lateArrival', attrs: { bookingId: booking.id }
      }));
    }
    if (booking.arrivedAt && !job) {
      const open = Store.jobsOfVehicle(booking.vehicleId).filter(function (j) {
        return j.lifecycleStatus === 'Open';
      });
      if (open.length) {
        buttons.push(UI.btn('Link existing job', {
          variant: 'secondary', action: 'booking.linkJob', attrs: { bookingId: booking.id }
        }));
      }
    }
    if (job) {
      buttons.push(UI.link('Open job ' + job.id, 'S06', { jobId: job.id }));
    }

    const notes = [];
    if (!managerial && booking.status === 'Requested') {
      notes.push('A Manager assigns the bay and confirms the booking as Booked.');
    }
    if (booking.cancelled) {
      notes.push('This record is kept. A late arrival is recorded as a new booking so the history stays intact.');
    }
    if (booking.noShow) {
      notes.push('No arrival within the 30-minute grace period, so the booking was cancelled once as a no-show.');
    }
    notes.push('Check in records the arrival first, then opens vehicle check-in (S04) and links the new job. ' +
      'A booking that already has a job opens that job instead of creating a second one.');

    const history = booking.history && booking.history.length
      ? '<ul class="timeline">' + booking.history.map(function (h) {
        return '<li><span class="tl-dot" aria-hidden="true"></span><div>' +
          '<span class="tl-time">' + E(Util.fmtDateTime(h.at)) + ' · ' + E(Store.staffName(h.by)) + '</span>' +
          '<div class="tl-title">' + E(h.action) + '</div>' +
          '<div class="muted small">' + E(h.reason || '') + '</div></div></li>';
      }).join('') + '</ul>'
      : '<p class="note">No changes recorded yet.</p>';

    return UI.card({
      title: 'Selected booking — ' + booking.id,
      subtitle: 'Records are kept and never deleted. Every edit and cancellation stores its reason.',
      body: dl +
        '<div class="form-actions">' + buttons.join('') + '</div>' +
        notes.map(function (n) { return '<p class="note">' + E(n) + '</p>'; }).join('') +
        '<h3 class="card-title">History</h3>' + history
    });
  }

  /* ---------------- day picker ---------------- */
  function dayPicker(ctx, day) {
    const prev = Util.addDaysToKey(day, -1);
    const next = Util.addDaysToKey(day, 1);
    const today = Util.dayKey(Store.now());
    return '<div class="search-bar">' +
      '<div class="field"><label for="booking-day">Workshop date</label>' +
      '<input type="date" id="booking-day" name="day" value="' + E(day) + '" data-change="booking.dayChanged"></div>' +
      '<button type="button" class="btn btn-secondary" data-action="booking.dayPrev">Previous day</button>' +
      '<button type="button" class="btn btn-secondary" data-action="booking.dayNext">Next day</button>' +
      (day === today ? '' : '<button type="button" class="btn btn-secondary" data-action="booking.dayToday">Today</button>') +
      '</div>';
  }

  global.DolphinViews = global.DolphinViews || {};
  global.DolphinViews.S14 = {
    render: function (ctx) {
      const B = helpers();
      const day = B.selectedDay(ctx.state);
      const booking = ctx.state.selectedBookingId ? B.find(ctx.state, ctx.state.selectedBookingId) : null;

      const head = UI.pageHeader({
        title: 'Bookings',
        subtitle: 'View and manage workshop bookings for the selected date. The day clock is fixed at ' +
          Util.fmtDateTime(Store.now()) + '.',
        actions: UI.btn('New booking', { variant: 'primary', action: 'booking.focusNew' })
      });

      const banner = UI.banner('plain', 'Simulated demo data',
        'Bookings, bay reservations and arrivals are fictional records kept in memory only. No customer is ' +
        'contacted, no message is sent and no real workshop slot is reserved.');

      const body = head + banner + dayPicker(ctx, day) +
        '<div class="grid-2">' + dayListCard(ctx, day) + newBookingCard(ctx) + '</div>' +
        detailCard(ctx, booking);

      return body;
    }
  };
})(window);
