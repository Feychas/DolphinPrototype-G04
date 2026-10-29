/* Dolphin AutoTrack prototype — S14 Bookings.
   Every booking, bay reservation and arrival below is a simulated in-memory
   record. No customer is contacted, no message is sent and no real workshop
   slot is reserved. The demo clock (Store.now) is the only clock. */
(function (global) {
  'use strict';

  const E = Util.esc;
  const Actions = global.Actions;

  /* =======================================================================
     Local helpers (mirrors the pattern used in js/actions.js)
     ===================================================================== */

  function values(form) { return Actions.values(form); }

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

  function allBookings(state) { return state.bookings || []; }

  function findBooking(state, id) {
    const list = allBookings(state);
    for (let i = 0; i < list.length; i += 1) if (list[i].id === id) return list[i];
    return null;
  }

  function selectedDay(state) {
    return state.selectedBookingDay || Util.dayKey(Store.now());
  }

  function dayBookings(state, day) {
    return allBookings(state).filter(function (b) {
      return Util.dayKey(b.startAt) === day;
    }).sort(function (a, b) {
      return String(a.startAt).localeCompare(String(b.startAt));
    });
  }

  /* Booking ids continue the BK-nn series from the ids already in state. */
  function nextBookingId(state) {
    let max = 0;
    allBookings(state).forEach(function (b) {
      const m = /(\d+)\s*$/.exec(b.id || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'BK-' + String(max + 1).padStart(2, '0');
  }

  function defaultDraft(state) {
    const customers = (state.customers || []).filter(function (c) { return !c.archived; });
    const customerId = customers.length ? customers[0].id : '';
    const vehicles = (state.vehicles || []).filter(function (v) {
      return !v.archived && v.customerId === customerId;
    });
    const services = (state.services || []).filter(function (s) { return s.active !== false; });
    return {
      customerId: customerId,
      vehicleId: vehicles.length ? vehicles[0].id : '',
      serviceId: services.length ? services[0].id : '',
      date: selectedDay(state),
      startTime: '09:00',
      endTime: '10:00'
    };
  }

  function ensureDraft(state) {
    if (!state.bookingDraft) state.bookingDraft = defaultDraft(state);
    return state.bookingDraft;
  }

  function vehicleLabel(vehicle) {
    if (!vehicle) return '—';
    return vehicle.plate + ' — ' + vehicle.brand + ' ' + vehicle.model + ' (' + vehicle.size + ')';
  }

  function vehiclesOf(state, customerId) {
    return (state.vehicles || []).filter(function (v) {
      return !v.archived && v.customerId === customerId;
    });
  }

  function timeOf(iso) {
    const m = /T(\d{2}:\d{2})/.exec(String(iso || ''));
    return m ? m[1] : '';
  }

  function dayOf(iso) {
    return Util.dayKey(iso);
  }

  function historyPush(booking, action, reason) {
    if (!booking.history) booking.history = [];
    booking.history.push({ at: Store.now(), by: Store.userId, action: action, reason: reason || '' });
  }

  /* =======================================================================
     Day selection
     ===================================================================== */

  Actions.click['booking.select'] = function (el) {
    Store.state.selectedBookingId = el.getAttribute('data-booking-id');
    App.render();
  };

  function setDay(day) {
    Store.state.selectedBookingDay = day;
    App.render();
  }

  Actions.click['booking.dayPrev'] = function () {
    setDay(Util.addDaysToKey(selectedDay(Store.state), -1));
  };

  Actions.click['booking.dayNext'] = function () {
    setDay(Util.addDaysToKey(selectedDay(Store.state), 1));
  };

  Actions.click['booking.dayToday'] = function () {
    setDay(Util.dayKey(Store.now()));
  };

  Actions.live['booking.dayChanged'] = function (el) {
    if (!el.value) return;
    setDay(el.value);
  };

  Actions.click['booking.focusNew'] = function () {
    const el = document.getElementById('bk-customer');
    if (!el) { App.toast('The new booking form is not on this screen.', 'warn'); return; }
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
    el.focus();
  };

  /* =======================================================================
     New booking form
     ===================================================================== */

  Actions.live['booking.customerChanged'] = function (el) {
    const state = Store.state;
    const draft = ensureDraft(state);
    draft.customerId = el.value || '';
    const list = vehiclesOf(state, draft.customerId);
    draft.vehicleId = list.length ? list[0].id : '';
    const sel = document.getElementById('bk-vehicle');
    if (sel) {
      sel.innerHTML = list.length
        ? list.map(function (v) {
          return '<option value="' + E(v.id) + '">' + E(vehicleLabel(v)) + '</option>';
        }).join('')
        : '<option value="">No vehicle for this customer</option>';
      sel.value = draft.vehicleId;
    }
  };

  Actions.live['booking.draftSync'] = function (el) {
    const draft = ensureDraft(Store.state);
    if (!el.name) return;
    draft[el.name] = el.value;
  };

  /* Fill the published demo sample (bookingConflict / bookingAdjacent). */
  Actions.click['booking.fillSample'] = function () {
    const state = Store.state;
    const sample = (global.DOLPHIN_FIXTURES || {}).sampleInputs || {};
    const conflict = sample.bookingConflict;
    const draft = ensureDraft(state);
    if (conflict) {
      const vehicle = Store.vehicle(conflict.vehicleId);
      if (vehicle) {
        draft.customerId = vehicle.customerId;
        draft.vehicleId = vehicle.id;
      }
      draft.date = dayOf(conflict.startAt) || draft.date;
      draft.startTime = timeOf(conflict.startAt) || draft.startTime;
      draft.endTime = timeOf(conflict.endAt) || draft.endTime;
    }
    const svc = (state.services || []).filter(function (s) { return s.id === 'SVC-BRAKE'; })[0];
    if (svc) draft.serviceId = svc.id;
    App.render();
    App.toast('Demo sample loaded: ' + (conflict ? timeOf(conflict.startAt) + '-' + timeOf(conflict.endAt) : '') +
      '. Save it, then assign a bay as a Manager to see the BK-01 overlap check.', 'info');
  };

  Actions.submit['booking.save'] = function (form) {
    const state = Store.state;
    const v = values(form);
    const draft = ensureDraft(state);
    const errors = {};

    if (!v.customerId) errors.customerId = 'Choose a customer.';
    if (!v.vehicleId) errors.vehicleId = 'Choose a vehicle.';
    if (!v.serviceId) errors.serviceId = 'Choose the requested service.';
    if (!v.date) errors.date = 'Choose the booking date.';
    if (!v.startTime) errors.startTime = 'Choose a start time.';
    if (!v.endTime) errors.endTime = 'Choose an end time.';

    const vehicle = v.vehicleId ? Store.vehicle(v.vehicleId) : null;
    if (v.customerId && vehicle && vehicle.customerId !== v.customerId) {
      errors.vehicleId = 'This vehicle does not belong to the selected customer.';
    }
    if (!v.startTime || !v.endTime) {
      /* time presence already reported */
    } else if (v.endTime <= v.startTime) {
      errors.endTime = 'The end time must be after the start time.';
    }

    if (Object.keys(errors).length) {
      return fail(form, errors, 'The booking was not saved. Fix the highlighted fields.');
    }

    const startAt = Util.fromLocalInput(v.date + 'T' + v.startTime);
    const endAt = Util.fromLocalInput(v.date + 'T' + v.endTime);
    if (!startAt || !endAt) {
      return fail(form, { date: 'Use a valid date and time.' }, 'The booking was not saved.');
    }

    const booking = {
      id: nextBookingId(state),
      customerId: v.customerId,
      vehicleId: v.vehicleId,
      serviceId: v.serviceId,
      startAt: startAt,
      endAt: endAt,
      bayId: null,
      status: 'Requested',
      arrivedAt: null,
      jobId: null,
      createdAt: Store.now(),
      createdBy: Store.userId,
      reason: null,
      cancelReason: null,
      cancelledAt: null,
      cancelledBy: null,
      releasedBayId: null,
      noShow: false,
      cancelled: false,
      rescheduledFrom: null,
      replacedByBookingId: null,
      history: []
    };
    historyPush(booking, 'Created', 'Booking requested by ' + Store.user().name + '. No bay reserved yet.');
    state.bookings.push(booking);
    state.selectedBookingId = booking.id;
    state.selectedBookingDay = Util.dayKey(booking.startAt);
    draft.date = Util.dayKey(booking.startAt);
    Store.log('Booking', booking.id + ' requested for ' + (vehicle ? vehicle.plate : v.vehicleId) +
      ' on ' + Util.fmtDate(booking.startAt) + ' ' + v.startTime + '-' + v.endTime + '. No bay assigned.');
    return ok(booking.id + ' saved as Requested. A Manager assigns the bay and confirms it.');
  };
  /* =======================================================================
     Manager: assign a bay and confirm the booking
     ===================================================================== */

  function bayOptionText(bay, booking) {
    const occupant = Rules.bayOccupant(bay.id);
    const clash = booking ? Rules.bookingOverlap(bay.id, booking.startAt, booking.endAt, booking.id) : null;
    let note = '';
    if (!bay.enabled) note = ' (disabled)';
    else if (clash) note = ' (reserved by ' + clash.id + ' at that time)';
    else if (occupant) note = ' (physically occupied by ' + occupant.id + ')';
    return bay.name + note;
  }

  Actions.click['booking.assignBay'] = function (el) {
    if (!Store.isManagerial()) {
      App.toast('Only the Owner or a Manager can assign a bay and confirm a booking.', 'warn');
      return;
    }
    const state = Store.state;
    const booking = findBooking(state, el.getAttribute('data-booking-id'));
    if (!booking) { App.toast('That booking is no longer in the demo data.', 'warn'); return; }
    if (booking.cancelled) { App.toast('This booking was cancelled. Its bay reservation was released.', 'warn'); return; }

    const vehicle = Store.vehicle(booking.vehicleId);
    const bays = (state.bays || []).filter(function (b) { return b.enabled; });
    const body =
      '<p>Booking <strong>' + E(booking.id) + '</strong> · ' + E(vehicle ? vehicle.plate : booking.vehicleId) +
      ' · ' + E(Util.fmtDate(booking.startAt)) + ' ' + E(timeOf(booking.startAt)) + '–' + E(timeOf(booking.endAt)) + '.</p>' +
      '<form id="assign-bay-form">' +
      '<div class="field"><label for="assign-bay">Bay</label><select id="assign-bay" name="bayId" required>' +
      bays.map(function (b) {
        const sel = booking.bayId === b.id ? ' selected' : '';
        return '<option value="' + E(b.id) + '"' + sel + '>' + E(bayOptionText(b, booking)) + '</option>';
      }).join('') +
      '</select></div>' +
      '<p class="note">A bay reservation and physical occupancy are separate. A future booking does not occupy a ' +
      'repair bay, but a bay that is physically occupied right now can still block an arrival.</p>' +
      '<p class="note">Same-bay bookings use [start, end) time ranges, so 12:00–13:00 may follow 11:00–12:00 ' +
      'without a conflict.</p>' +
      '</form>';

    App.modal({
      title: 'Assign bay and confirm booking',
      body: body,
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Assign bay and confirm', variant: 'primary', onClick: function () {
            const form = document.getElementById('assign-bay-form');
            const v = values(form);
            const errors = {};
            if (!v.bayId) errors.bayId = 'Choose a bay.';
            const bay = v.bayId ? Store.bay(v.bayId) : null;
            if (!bay) errors.bayId = 'That bay is not in the demo data.';
            else if (!bay.enabled) errors.bayId = 'This bay is disabled.';
            if (bay) {
              const clash = Rules.bookingOverlap(bay.id, booking.startAt, booking.endAt, booking.id);
              if (clash) {
                errors.bayId = bay.name + ' is already reserved by ' + clash.id + ' (' +
                  timeOf(clash.startAt) + '–' + timeOf(clash.endAt) + '). Pick another bay or move the booking.';
              }
            }
            if (Object.keys(errors).length) {
              fail(form, errors, 'The bay was not assigned: ' + (errors.bayId || 'check the field.'));
              return;
            }
            booking.bayId = bay.id;
            booking.status = 'Booked';
            historyPush(booking, 'Bay assigned', bay.name + ' assigned and the booking confirmed as Booked.');
            Store.log('Booking', booking.id + ' confirmed as Booked in ' + bay.name + '.');
            App.closeModal();
            ok(booking.id + ' confirmed as Booked in ' + bay.name + '.');
          }
        }
      ]
    });
  };

  /* =======================================================================
     Arrival / check in
     ===================================================================== */

  Actions.click['booking.checkIn'] = function (el) {
    const state = Store.state;
    const booking = findBooking(state, el.getAttribute('data-booking-id'));
    if (!booking) { App.toast('That booking is no longer in the demo data.', 'warn'); return; }

    /* Already linked to a job: open that job instead of creating a second one. */
    if (booking.jobId && Store.job(booking.jobId)) {
      App.go('S06', { jobId: booking.jobId }, { force: true });
      return;
    }

    if (booking.cancelled) {
      Actions.click['booking.lateArrival'](el);
      return;
    }

    /* Physical occupancy can still prevent the arrival assignment. */
    if (booking.bayId) {
      const occupant = Rules.bayOccupant(booking.bayId);
      if (occupant) {
        const bay = Store.bay(booking.bayId);
        App.toast((bay ? bay.name : booking.bayId) + ' is physically occupied by ' + occupant.id +
          '. A Manager must release it or assign a free bay before this arrival can be recorded.', 'warn');
        return;
      }
    }

    /* The arrival is recorded FIRST so the no-show rule cannot cancel it. */
    booking.arrivedAt = Store.now();
    booking.status = 'Arrived';
    historyPush(booking, 'Arrived', 'Arrival recorded at ' + Util.fmtTime(Store.now()) + '.');
    Store.log('Booking', booking.id + ' arrival recorded at ' + Util.fmtTime(Store.now()) + '.');
    state.pendingBookingId = booking.id;
    state.selectedVehicleId = booking.vehicleId;
    App.toast('Arrival recorded for ' + booking.id + '. Opening vehicle check-in.', 'info');
    App.go('S04', { vehicleId: booking.vehicleId }, { force: true });
  };

  /* A late arrival after a no-show creates a new booking; the cancelled one stays. */
  Actions.click['booking.lateArrival'] = function (el) {
    const state = Store.state;
    const old = findBooking(state, el.getAttribute('data-booking-id'));
    if (!old) { App.toast('That booking is no longer in the demo data.', 'warn'); return; }
    if (old.jobId && Store.job(old.jobId)) {
      App.go('S06', { jobId: old.jobId }, { force: true });
      return;
    }
    const minutes = Math.max(30, Math.round(Util.msBetween(old.startAt, old.endAt) / 60000));
    const startAt = Store.now();
    const endAt = new Date(Util.parseDate(startAt).getTime() + minutes * 60000).toISOString();
    const fresh = {
      id: nextBookingId(state),
      customerId: old.customerId,
      vehicleId: old.vehicleId,
      serviceId: old.serviceId,
      startAt: startAt,
      endAt: endAt,
      bayId: old.bayId,
      status: 'Arrived',
      arrivedAt: Store.now(),
      jobId: null,
      createdAt: Store.now(),
      createdBy: Store.userId,
      reason: 'Late arrival — rescheduled from ' + old.id + '.',
      cancelReason: null,
      cancelledAt: null,
      cancelledBy: null,
      releasedBayId: null,
      noShow: false,
      cancelled: false,
      rescheduledFrom: old.id,
      replacedByBookingId: null,
      history: []
    };
    historyPush(fresh, 'Created', 'Late arrival created as a new booking after ' + old.id + ' was cancelled.');
    state.bookings.push(fresh);
    old.replacedByBookingId = fresh.id;
    historyPush(old, 'Late arrival', 'A late arrival was recorded as new booking ' + fresh.id + '. This record is kept.');
    state.selectedBookingId = fresh.id;
    state.selectedBookingDay = Util.dayKey(fresh.startAt);
    state.pendingBookingId = fresh.id;
    state.selectedVehicleId = fresh.vehicleId;
    Store.log('Booking', 'Late arrival for ' + old.vehicleId + ' recorded as ' + fresh.id + '. ' + old.id + ' stays cancelled.');
    App.toast('Late arrival saved as ' + fresh.id + '. ' + old.id + ' stays cancelled.', 'info');
    App.go('S04', { vehicleId: fresh.vehicleId }, { force: true });
  };

  /* Link an arrival to a job that was created outside the check-in flow. */
  Actions.click['booking.linkJob'] = function (el) {
    const state = Store.state;
    const booking = findBooking(state, el.getAttribute('data-booking-id'));
    if (!booking) return;
    const jobs = Store.jobsOfVehicle(booking.vehicleId).filter(function (j) {
      return j.lifecycleStatus === 'Open';
    });
    if (!jobs.length) {
      App.toast('There is no open job for this vehicle yet. Use Check in to create one.', 'warn');
      return;
    }
    const body = '<form id="link-job-form">' +
      '<div class="field"><label for="link-job">Open job for this vehicle</label>' +
      '<select id="link-job" name="jobId" required>' +
      jobs.map(function (j) {
        return '<option value="' + E(j.id) + '">' + E(j.id + ' — ' + j.workStatus) + '</option>';
      }).join('') +
      '</select></div></form>';
    App.modal({
      title: 'Link a job to ' + booking.id,
      body: body,
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Link job', variant: 'primary', onClick: function () {
            const form = document.getElementById('link-job-form');
            const v = values(form);
            if (!v.jobId) { fail(form, { jobId: 'Choose a job.' }, 'Nothing was linked.'); return; }
            booking.jobId = v.jobId;
            if (!booking.arrivedAt) booking.arrivedAt = Store.now();
            if (booking.status === 'Requested' || booking.status === 'Booked') booking.status = 'Arrived';
            historyPush(booking, 'Linked', 'Linked to job ' + v.jobId + '.');
            Store.log('Booking', booking.id + ' linked to job ' + v.jobId + '.');
            App.closeModal();
            ok(booking.id + ' is now linked to ' + v.jobId + '.');
          }
        }
      ]
    });
  };
  /* =======================================================================
     Edit and cancel — the record is kept, a reason is stored
     ===================================================================== */

  Actions.click['booking.edit'] = function (el) {
    const state = Store.state;
    const booking = findBooking(state, el.getAttribute('data-booking-id'));
    if (!booking) { App.toast('That booking is no longer in the demo data.', 'warn'); return; }
    if (booking.cancelled) { App.toast('A cancelled booking is kept as a record and is not edited.', 'warn'); return; }
    const services = (state.services || []).filter(function (s) { return s.active !== false; });
    const body = '<p>Editing keeps booking <strong>' + E(booking.id) + '</strong> and stores the reason. Nothing is deleted.</p>' +
      '<form id="edit-booking-form">' +
      '<div class="form-grid">' +
      '<div class="field"><label for="eb-date">Date</label>' +
      '<input type="date" id="eb-date" name="date" value="' + E(dayOf(booking.startAt)) + '" required></div>' +
      '<div class="field"><label for="eb-service">Service</label>' +
      '<select id="eb-service" name="serviceId">' +
      services.map(function (s) {
        const sel = s.id === booking.serviceId ? ' selected' : '';
        return '<option value="' + E(s.id) + '"' + sel + '>' + E(s.nameEN) + '</option>';
      }).join('') +
      '</select></div>' +
      '<div class="field"><label for="eb-start">Start time</label>' +
      '<input type="time" id="eb-start" name="startTime" value="' + E(timeOf(booking.startAt)) + '" required></div>' +
      '<div class="field"><label for="eb-end">End time</label>' +
      '<input type="time" id="eb-end" name="endTime" value="' + E(timeOf(booking.endAt)) + '" required></div>' +
      '</div>' +
      '<div class="field"><label for="eb-reason">Reason for the change (required)</label>' +
      '<textarea id="eb-reason" name="reason" required></textarea></div>' +
      (booking.bayId
        ? '<p class="note">This booking holds ' + E((Store.bay(booking.bayId) || {}).name || booking.bayId) +
          '. The same-bay overlap rule is checked again when you save.</p>'
        : '<p class="note">No bay is held yet, so no bay overlap is checked.</p>') +
      '</form>';
    App.modal({
      title: 'Edit booking ' + booking.id,
      body: body,
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Save changes', variant: 'primary', onClick: function () {
            const form = document.getElementById('edit-booking-form');
            const v = values(form);
            const errors = {};
            if (!v.date) errors.date = 'Choose a date.';
            if (!v.startTime) errors.startTime = 'Choose a start time.';
            if (!v.endTime) errors.endTime = 'Choose an end time.';
            if (v.startTime && v.endTime && v.endTime <= v.startTime) {
              errors.endTime = 'The end time must be after the start time.';
            }
            if (!v.reason || !v.reason.trim()) errors.reason = 'A reason is required.';
            if (Object.keys(errors).length) {
              fail(form, errors, 'The booking was not changed.');
              return;
            }
            const startAt = Util.fromLocalInput(v.date + 'T' + v.startTime);
            const endAt = Util.fromLocalInput(v.date + 'T' + v.endTime);
            if (!startAt || !endAt) {
              fail(form, { date: 'Use a valid date and time.' }, 'The booking was not changed.');
              return;
            }
            if (booking.bayId) {
              const clash = Rules.bookingOverlap(booking.bayId, startAt, endAt, booking.id);
              if (clash) {
                fail(form, { startTime: 'The bay is already reserved by ' + clash.id + ' (' +
                  timeOf(clash.startAt) + '–' + timeOf(clash.endAt) + ') at that time.' },
                  'The booking was not changed.');
                return;
              }
            }
            const before = timeOf(booking.startAt) + '-' + timeOf(booking.endAt);
            booking.startAt = startAt;
            booking.endAt = endAt;
            if (v.serviceId) booking.serviceId = v.serviceId;
            booking.reason = v.reason.trim();
            historyPush(booking, 'Edited', before + ' → ' + timeOf(startAt) + '-' + timeOf(endAt) + '. ' + v.reason.trim());
            state.selectedBookingDay = Util.dayKey(startAt);
            Store.log('Booking', booking.id + ' edited to ' + Util.fmtDate(startAt) + ' ' +
              timeOf(startAt) + '-' + timeOf(endAt) + ': ' + v.reason.trim());
            App.closeModal();
            ok(booking.id + ' was edited. The original record and the reason are kept.');
          }
        }
      ]
    });
  };

  Actions.click['booking.cancel'] = function (el) {
    const state = Store.state;
    const booking = findBooking(state, el.getAttribute('data-booking-id'));
    if (!booking) { App.toast('That booking is no longer in the demo data.', 'warn'); return; }
    if (booking.cancelled) { App.toast('This booking is already cancelled. The record is kept.', 'warn'); return; }
    const bayName = booking.bayId && Store.bay(booking.bayId) ? Store.bay(booking.bayId).name : null;
    const body = '<p>Cancelling keeps booking <strong>' + E(booking.id) + '</strong> with its reason. Nothing is deleted.</p>' +
      '<p>' + (bayName
        ? 'Its ' + E(bayName) + ' reservation is released. Other jobs keep their own bay occupancy.'
        : 'It holds no bay reservation, so no bay is released.') + '</p>' +
      '<div class="field"><label for="cancel-booking-reason">Reason (required)</label>' +
      '<textarea id="cancel-booking-reason" name="reason" required></textarea></div>';
    App.modal({
      title: 'Cancel booking ' + booking.id,
      body: body,
      actions: [
        { label: 'Keep booking', variant: 'secondary' },
        {
          label: 'Cancel booking', variant: 'primary', onClick: function () {
            const form = document.getElementById('cancel-booking-reason') ?
              document.getElementById('cancel-booking-reason').closest('.field') : null;
            const holder = form || document.getElementById('modal-root .modal-body');
            const reason = (document.getElementById('cancel-booking-reason') || {}).value || '';
            if (!reason.trim()) {
              if (holder) {
                let msg = holder.querySelector('.field-error-text');
                if (!msg) { msg = document.createElement('p'); msg.className = 'field-error-text'; holder.appendChild(msg); }
                msg.textContent = 'A reason is required.';
                holder.classList.add('field-error');
              }
              App.toast('A reason is required to cancel a booking.', 'warn');
              return;
            }
            booking.status = 'Cancelled';
            booking.cancelled = true;
            booking.cancelReason = reason.trim();
            booking.cancelledAt = Store.now();
            booking.cancelledBy = Store.userId;
            booking.releasedBayId = booking.bayId;
            booking.bayId = null;
            historyPush(booking, 'Cancelled', reason.trim());
            Store.log('Booking', booking.id + ' cancelled: ' + reason.trim());
            App.closeModal();
            ok(booking.id + ' cancelled. The record and the reason are kept.');
          }
        }
      ]
    });
  };

  /* =======================================================================
     Demo no-show check — runs only when the button is pressed
     ===================================================================== */

  Actions.click['booking.noShowCheck'] = function () {
    const state = Store.state;
    const now = Store.now();
    const due = allBookings(state).filter(function (b) {
      return !b.cancelled && Rules.noShowDue(b, now);
    });
    if (!due.length) {
      App.toast('No booking is past its 30-minute grace period at ' + Util.fmtTime(now) + '.', 'info');
      return;
    }
    due.forEach(function (b) {
      b.status = 'No-show';
      b.cancelled = true;
      b.noShow = true;
      b.cancelReason = 'No arrival within the 30-minute grace period (start ' + timeOf(b.startAt) +
        ', demo clock ' + Util.fmtTime(now) + ').';
      b.cancelledAt = now;
      b.cancelledBy = Store.userId;
      b.releasedBayId = b.bayId;
      b.bayId = null;
      historyPush(b, 'No-show', b.cancelReason);
      Store.log('Booking', b.id + ' marked as No-show. Its bay reservation was released; no other job was changed.');
    });
    ok(due.length + ' booking(s) marked as No-show and their reservations released.');
  };

  /* =======================================================================
     Shared helpers used by js/views/s14.js
     ===================================================================== */

  global.DolphinBookings = {
    bookings: allBookings,
    find: findBooking,
    selectedDay: selectedDay,
    dayBookings: dayBookings,
    nextId: nextBookingId,
    ensureDraft: ensureDraft,
    timeOf: timeOf,
    dayOf: dayOf,
    vehicleLabel: vehicleLabel
  };

  /* =======================================================================
     Link a booking to the job created by the S04 check-in.
     The S04 handler in js/actions.js is wrapped here (not modified) so the
     booking record can pick up the new job id. Nothing is deleted.
     ===================================================================== */

  function linkCheckIn() {
    const original = Actions.submit['checkin.save'];
    if (!original || original.__dolphinBookingLink) return;
    function wrapped(form, ev) {
      const pendingId = Store.state.pendingBookingId || null;
      const before = {};
      (Store.state.jobs || []).forEach(function (j) { before[j.id] = true; });
      const result = original.call(Actions.submit, form, ev);
      if (!pendingId) return result;
      let created = null;
      (Store.state.jobs || []).forEach(function (j) {
        if (!before[j.id]) created = j;
      });
      const booking = findBooking(Store.state, pendingId);
      Store.state.pendingBookingId = null;
      if (!booking) return result;
      if (!created) {
        Store.log('Booking', booking.id + ' arrival was recorded; no new job was created, so nothing was linked.');
        return result;
      }
      booking.jobId = created.id;
      if (!booking.arrivedAt) booking.arrivedAt = Store.now();
      booking.status = 'Arrived';
      historyPush(booking, 'Checked in', 'Job ' + created.id + ' linked at vehicle check-in.');
      Store.log('Booking', booking.id + ' linked to job ' + created.id + ' after check-in.');
      return result;
    }
    wrapped.__dolphinBookingLink = true;
    Actions.submit['checkin.save'] = wrapped;
  }
  linkCheckIn();
})(window);
