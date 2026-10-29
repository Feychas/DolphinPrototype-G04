/* Dolphin AutoTrack prototype — state mutations.
   Every action guards its own preconditions, mutates the single shared state
   and then re-renders. Nothing is persisted anywhere. */
(function (global) {
  'use strict';

  const E = Util.esc;
  const Actions = { click: {}, submit: {}, live: {} };

  /* ---------------- helpers ---------------- */
  function values(form) {
    const out = {};
    Util.els('input, select, textarea', form).forEach(function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  }
  Actions.values = values;

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

  function jobFrom(el) {
    const id = el.getAttribute('data-job-id') || (Store.state.selectedJobId);
    return Store.job(id);
  }

  /* A settled job keeps its price. Changing it needs a reasoned correction
     on S17, never a new quote version. */
  function isPriceLocked(job) {
    if (!job) return false;
    return job.paymentStatus === 'Paid' || job.paymentStatus === 'No charge';
  }
  Actions.isPriceLocked = isPriceLocked;

  function nextQuoteVersion(job) {
    return job.quotes.reduce(function (m, q) { return Math.max(m, q.version); }, 0) + 1;
  }

  /* =======================================================================
     Demo controls
     ===================================================================== */
  Actions.click['demo.resetScenario'] = function () { App.resetScenario(); };
  Actions.click['demo.resetAll'] = function () { App.resetAll(); };

  /* Generic navigation helper: data-nav="S06" data-params='{"jobId":"..."}' */
  Actions.click['nav'] = function (el) {
    let params = {};
    const raw = el.getAttribute('data-params');
    if (raw) { try { params = JSON.parse(raw); } catch (e) { params = {}; } }
    App.go(el.getAttribute('data-nav'), params);
  };

  Actions.click['dashboard.newCheckIn'] = function () {
    App.go('S02', { action: 'checkin' });
  };

  Actions.live['dashboard.role'] = function (el) {
    App.switchRole(el.value);
  };

  /* =======================================================================
     S02 — customers, vehicles, history
     ===================================================================== */
  Actions.click['customers.selectVehicle'] = function (el) {
    Store.state.selectedVehicleId = el.getAttribute('data-vehicle-id');
    App.render();
  };

  Actions.live['customers.search'] = function (el) {
    const q = Util.norm(el.value);
    const rows = Util.els('[data-vehicle-row]');
    let shown = 0;
    rows.forEach(function (row) {
      const hay = Util.norm(row.getAttribute('data-search'));
      const match = !q || hay.indexOf(q) >= 0;
      row.style.display = match ? '' : 'none';
      if (match) shown += 1;
    });
    const note = Util.el('#vehicle-count');
    if (note) note.textContent = shown + (shown === 1 ? ' vehicle' : ' vehicles');
  };

  Actions.live['customers.filter'] = function (el) {
    App.go('S02', Object.assign({}, Store.params, { filter: el.value }), { force: true });
  };

  Actions.click['customers.checkin'] = function () {
    App.go('S04', { vehicleId: Store.state.selectedVehicleId });
  };

  Actions.click['customers.openJob'] = function (el) {
    App.go('S06', { jobId: el.getAttribute('data-job-id') });
  };

  Actions.click['customers.edit'] = function () {
    const v = Store.vehicle(Store.state.selectedVehicleId);
    if (!v) { App.toast('Select a vehicle first.', 'warn'); return; }
    const c = Store.customer(v.customerId);
    if (!c) { App.toast('This vehicle has no customer record.', 'warn'); return; }
    App.modal({
      title: 'Edit customer — ' + c.name,
      body: '<p>Past receipt snapshots keep the prices that were charged at the time.</p>' +
        '<form id="customer-edit-form" data-form="customers.edit" data-customer-id="' + E(c.id) + '" data-vehicle-id="' + E(v.id) + '">' +
        '<div class="form-grid">' +
        UI.field({ id: 'ce-name', name: 'name', label: 'Customer name', value: c.name, required: true }) +
        UI.field({ id: 'ce-phone', name: 'phone', label: 'Phone', value: c.phone, required: true }) +
        UI.field({ id: 'ce-viber', name: 'viber', label: 'Viber (optional)', value: c.viber }) +
        UI.field({ id: 'ce-facebook', name: 'facebook', label: 'Facebook (optional)', value: c.facebook }) +
        UI.field({ id: 'ce-brand', name: 'brand', label: 'Vehicle brand', value: v.brand }) +
        UI.field({ id: 'ce-model', name: 'model', label: 'Vehicle model', value: v.model }) +
        '</div>' +
        '<input type="hidden" name="customerId" value="' + E(c.id) + '">' +
        '</form>',
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Save profile', variant: 'primary', onClick: function () {
            const form = Util.el('#customer-edit-form');
            if (!form) return;
            const res = Actions.submit['customers.edit'](form);
            if (res && res.ok) App.closeModal();
          }
        }
      ]
    });
  };

  Actions.click['customers.archiveVehicle'] = function (el) {
    const id = el.getAttribute('data-vehicle-id');
    const vehicle = Store.vehicle(id);
    if (!vehicle) return;
    const open = Store.jobsOfVehicle(id).filter(j => j.lifecycleStatus === 'Open');
    if (open.length) {
      App.toast('This vehicle has an open visit (' + open[0].id + '). Archive it after the visit is closed.', 'warn');
      return;
    }
    App.modal({
      title: 'Archive ' + vehicle.plate,
      body: '<p>Archiving keeps the vehicle and its history accessible under the <strong>Archived</strong> filter. Records are never deleted.</p>' +
        '<div class="field"><label for="arch-reason">Reason (required)</label>' +
        '<textarea id="arch-reason" name="reason" required></textarea></div>',
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Archive vehicle', variant: 'primary', onClick: function () {
            const reason = (Util.el('#arch-reason') || {}).value || '';
            if (!reason.trim()) { App.toast('A reason is required to archive.', 'warn'); return; }
            vehicle.archived = true;
            vehicle.archiveReason = reason.trim();
            Store.log('Archive', vehicle.plate + ' archived: ' + reason.trim());
            ok(vehicle.plate + ' archived. It stays available under the Archived filter.');
          }
        }
      ]
    });
  };

  Actions.click['customers.unarchiveVehicle'] = function (el) {
    const v = Store.vehicle(el.getAttribute('data-vehicle-id'));
    if (!v) return;
    v.archived = false;
    Store.log('Archive', v.plate + ' restored from the archive.');
    ok(v.plate + ' restored.');
  };

  Actions.submit['customers.edit'] = function (form) {
    const v = values(form);
    const customer = Store.customer(v.customerId);
    const vehicle = Store.vehicle(v.vehicleId);
    if (!customer) return fail(form, { customerId: 'Unknown customer.' });
    if (!v.name || !v.name.trim()) return fail(form, { name: 'Name is required.' });
    if (!v.phone || !v.phone.trim()) return fail(form, { phone: 'Phone is required.' });
    customer.name = v.name.trim();
    customer.phone = v.phone.trim();
    customer.viber = (v.viber || '').trim();
    customer.facebook = (v.facebook || '').trim();
    if (vehicle) {
      vehicle.brand = (v.brand || '').trim() || vehicle.brand;
      vehicle.model = (v.model || '').trim() || vehicle.model;
      vehicle.size = v.size || vehicle.size;
    }
    Store.log('Customer', 'Customer profile updated for ' + customer.name + '.');
    return ok('Customer profile updated. Past receipt snapshots are unchanged.');
  };

  /* =======================================================================
     S03 — register customer and vehicle
     ===================================================================== */
  Actions.live['register.mode'] = function () {
    const form = Util.el('#register-form');
    if (!form) return;
    const checked = form.querySelector('input[name="customerMode"]:checked');
    const mode = checked ? checked.value : 'Existing';
    const ex = Util.el('#existing-customer-block');
    const nw = Util.el('#new-customer-block');
    if (ex) ex.hidden = mode !== 'Existing';
    if (nw) nw.hidden = mode !== 'New';
    const sel = Util.el('#reg-customer');
    if (sel) sel.disabled = mode !== 'Existing';
    Util.els('[name="newName"],[name="newPhone"],[name="viber"],[name="facebook"]', form).forEach(function (el) {
      el.disabled = mode !== 'New';
    });
  };

  Actions.submit['register.save'] = function (form) {    const v = values(form);
    const errors = {};
    let customerId = v.customerId;
    if (v.customerMode === 'New') {
      if (!v.newName || !v.newName.trim()) errors.newName = 'Customer name is required.';
      if (!v.newPhone || !v.newPhone.trim()) errors.newPhone = 'Phone is required.';
      customerId = null;
    } else if (!customerId) {
      errors.customerId = 'Choose an existing customer or switch to New customer.';
    }
    const plate = Util.normPlate(v.plate);
    if (!plate) errors.plate = 'Plate number is required.';
    const year = Util.parseIntStrict(v.year);
    if (!isFinite(year) || year < 1900) errors.year = 'Enter a valid year (whole number).';
    else if (year > 2026) errors.year = 'The year cannot be in the future.';
    if (!v.brand || !v.brand.trim()) errors.brand = 'Brand is required.';
    if (!v.model || !v.model.trim()) errors.model = 'Model is required.';
    if (!v.size) errors.size = 'Select a size class (S, M or L).';
    if (!errors.plate && Store.state.vehicles.some(x => Util.normPlate(x.plate) === plate)) {
      errors.plate = 'This plate is already registered (' + Store.state.vehicles.find(x => Util.normPlate(x.plate) === plate).plate + ').';
    }
    if (Object.keys(errors).length) return fail(form, errors, 'The vehicle was not saved. Fix the highlighted fields.');

    if (v.customerMode === 'New') {
      customerId = Store.nextId('customer');
      Store.state.customers.push({
        id: customerId, name: v.newName.trim(), phone: v.newPhone.trim(),
        viber: (v.viber || '').trim(), facebook: (v.facebook || '').trim(), archived: false
      });
    }
    const vehicleId = Store.nextId('vehicle');
    Store.state.vehicles.push({
      id: vehicleId, customerId: customerId, plate: v.plate.trim(), brand: v.brand.trim(),
      model: v.model.trim(), year: year, size: v.size, archived: false
    });
    Store.state.selectedVehicleId = vehicleId;
    Store.log('Registration', v.plate.trim() + ' registered for ' + Store.customer(customerId).name + '.');
    App.toast('Vehicle ' + v.plate.trim() + ' registered.', 'info');
    App.go('S04', { vehicleId: vehicleId }, { force: true });
  };

  /* =======================================================================
     S04 — vehicle check-in
     ===================================================================== */
  Actions.submit['checkin.save'] = function (form) {
    const v = values(form);
    const vehicleId = form.getAttribute('data-vehicle-id') || Store.state.selectedVehicleId;
    const vehicle = Store.vehicle(vehicleId);
    const errors = {};
    if (!vehicle) errors.vehicleId = 'Select a vehicle first.';
    const mileage = Util.parseIntStrict(v.mileageKm);
    if (!isFinite(mileage)) errors.mileageKm = 'Mileage is required and must be a whole number.';
    else if (mileage < 0) errors.mileageKm = 'Mileage cannot be negative.';
    else {
      const latest = Rules.latestMileage(vehicleId);
      if (latest !== null && mileage < latest) {
        const confirmed = form.querySelector('[name="confirmLowerMileage"]');
        if (!confirmed || !confirmed.checked) {
          errors.mileageKm = 'This is lower than the latest recorded visit (' + latest + ' km). A Manager must confirm the correction.';
        }
      }
    }
    if (!v.size) errors.size = 'Select the vehicle size.';
    if (!v.serviceId) errors.serviceId = 'Select at least one service.';
    const services = v.serviceIds || (v.serviceId ? [v.serviceId] : []);
    if (!services.length) errors.serviceId = 'Select at least one service.';
    if (Object.keys(errors).length) return fail(form, errors, 'The check-in was not saved. Fix the highlighted fields.');

    const open = Store.jobsOfVehicle(vehicleId).filter(j => j.lifecycleStatus === 'Open');
    if (open.length) {
      App.toast('This vehicle already has an open visit (' + open[0].id + '). A Manager must review it before another check-in.', 'warn');
      App.go('S06', { jobId: open[0].id }, { force: true });
      return { ok: false };
    }

    const jobId = Store.nextId('job');
    const size = v.size;
    const job = {
      id: jobId, vehicleId: vehicleId, createdAt: Store.now(), mileageKm: mileage, size: size,
      requestedServiceIds: services,
      damage: (v.damage || '').trim(), fuelLevel: (v.fuelLevel || 'Half').trim(),
      belongings: (v.belongings || '').trim(), photoSample: 'sample-vehicle-condition',
      workStatus: 'Check-in', approvalStatus: 'Not required', paymentStatus: 'Unpaid',
      collectionStatus: 'Not collected', lifecycleStatus: 'Open',
      assignedStaffIds: [], bayId: null, completedAt: null, collectedAt: null, closedAt: null,
      redoOfJobId: null, managerSetRedoChargeMMK: null, quotes: [], activeQuoteVersion: null,
      materialIssues: [], committedServiceLines: [],
      requiredChecklist: [
        { id: 'C1', text: 'Requested work completed', done: false },
        { id: 'C2', text: 'Final inspection completed', done: false }
      ],
      nextServiceDueDate: null, nextServiceDueMileageKm: null, notes: [], cancellation: null
    };
    Store.state.jobs.push(job);
    Store.state.selectedJobId = jobId;
    Store.state.selectedVehicleId = vehicleId;
    Store.log('Check-in', jobId + ' created for ' + vehicle.plate + ' (' + mileage + ' km).');
    App.toast('Check-in saved as ' + jobId + '.', 'info');
    App.go('S06', { jobId: jobId }, { force: true });
  };

  /* =======================================================================
     S05 — bay board
     ===================================================================== */
  Actions.click['bay.assign'] = function (el) {
    if (!Store.isManagerial()) { App.toast('Only Owner or Manager can assign a bay.', 'warn'); return; }
    const preJob = el.getAttribute('data-job-id');
    const jobs = Store.state.jobs.filter(function (j) {
      return j.lifecycleStatus === 'Open' && j.workStatus !== 'Completed' && j.workStatus !== 'Cancelled' && !j.bayId;
    });
    const mechanics = Store.state.users.filter(u => u.role === 'Mechanic');
    const body = '<form id="assign-form">' +
      '<div class="field"><label for="assign-job">Job</label><select id="assign-job" name="jobId" required>' +
      (preJob ? '<option value="' + E(preJob) + '">' + E(preJob) + '</option>' : '') +
      jobs.filter(j => !preJob || j.id === preJob).map(function (j) {
        const v = Store.vehicle(j.vehicleId);
        return '<option value="' + E(j.id) + '"' + (preJob && j.id === preJob ? ' selected' : '') + '>' +
          E(j.id + ' — ' + (v ? v.plate : '')) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label for="assign-bay">Bay</label><select id="assign-bay" name="bayId" required>' +
      Store.state.bays.map(function (b) {
        const occ = Rules.bayOccupant(b.id);
        const reason = !b.enabled ? ' (disabled)' : occ ? ' (occupied by ' + occ.id + ')' : '';
        return '<option value="' + E(b.id) + '"' + (occ || !b.enabled ? ' disabled' : '') + '>' + E(b.name + reason) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><span class="field-label" id="mech-label">Mechanics</span>' +
      '<div class="stack-sm" role="group" aria-labelledby="mech-label">' +
      mechanics.map(function (m) {
        return '<label class="check"><input type="checkbox" name="staffIds" value="' + E(m.id) + '"> <span>' + E(m.name) + '</span></label>';
      }).join('') + '</div></div>' +
      '<p class="note">A bay reservation (booking) and physical occupancy are separate. A future booking does not block a repair bay.</p>' +
      '</form>';

    App.modal({
      title: 'Assign bay and mechanic',
      body: body,
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Assign', variant: 'primary', onClick: function () {
            const form = Util.el('#assign-form');
            const v = values(form);
            const staffIds = Util.els('input[name="staffIds"]:checked', form).map(function (c) { return c.value; });
            const errors = {};
            if (!v.jobId) errors.jobId = 'Choose a job.';
            if (!v.bayId) errors.bayId = 'Choose a bay.';
            if (!staffIds.length) errors.staffIds = 'Select at least one mechanic.';
            const bay = Store.bay(v.bayId);
            if (bay && !bay.enabled) errors.bayId = 'This bay is disabled.';
            const occ = bay ? Rules.bayOccupant(bay.id, v.jobId) : null;
            if (occ) errors.bayId = 'This bay is already occupied by ' + occ.id + '.';
            const job = Store.job(v.jobId);
            if (job) {
              const conflict = Rules.bookingOverlap(bay ? bay.id : null, Store.now(), Util.addDays(Store.now(), 1), null);
              if (conflict && !occ) errors.bayId = 'A booking (' + conflict.id + ') already reserves this bay. Ask a Manager to replan.';
            }
            if (Object.keys(errors).length) {
              fail(form, errors, 'The assignment was not saved.');
              return;
            }
            job.bayId = v.bayId;
            job.assignedStaffIds = staffIds;
            Store.log('Bay', job.id + ' assigned to ' + (bay ? bay.name : v.bayId) + ' (' + staffIds.map(function (id) { return Store.staffName(id); }).join(', ') + ').');
            App.closeModal();
            ok(job.id + ' assigned to ' + (bay ? bay.name : v.bayId) + '.');
          }
        }
      ]
    });
  };

  /* =======================================================================
     S06 — job card actions
     ===================================================================== */
  Actions.click['job.startInspection'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    if (!Store.isManagerial() && !Store.isMechanic()) { App.toast('Your role cannot start an inspection.', 'warn'); return; }
    if (job.workStatus === 'Check-in') {
      job.workStatus = 'Diagnose/Quote';
      Store.log('Job', job.id + ' moved to Diagnose/Quote.');
    }
    App.go('S07', { jobId: job.id }, { force: true });
  };

  Actions.click['job.startWork'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    const check = Rules.canStartWork(job);
    if (!check.ok) { App.toast(check.reasons[0], 'warn'); return; }
    if (job.quotes.length && !job.committedServiceLines.length) {
      const q = Store.quote(job);
      if (q && q.status === 'Approved') {
        job.committedServiceLines = Rules.commitLinesFromQuote(q);
      }
    }
    job.workStatus = 'In Progress';
    Store.log('Work', job.id + ' work started by ' + Store.user().name + '.');
    ok('Work started on ' + job.id + '.');
  };

  Actions.click['job.markWaitingParts'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    job.workStatus = 'Waiting for Parts';
    Store.log('Work', job.id + ' set to Waiting for Parts. The bay stays occupied until a Manager reassigns.');
    ok(job.id + ' is waiting for parts. The bay is still occupied.');
  };

  Actions.click['job.resumeWork'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    const short = Rules.shortages(job);
    if (short.length) { App.toast('The shortage is still unresolved.', 'warn'); return; }
    job.workStatus = 'In Progress';
    Store.log('Work', job.id + ' resumed after parts arrived.');
    ok(job.id + ' back in progress.');
  };

  Actions.click['job.complete'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    const check = Rules.canComplete(job);
    if (!check.ok) {
      App.modal({
        title: 'Cannot complete yet',
        body: '<p>' + E(check.reasons[0]) + '</p><ul class="stack-sm">' +
          check.reasons.slice(1).map(r => '<li>• ' + E(r) + '</li>').join('') + '</ul>',
        actions: [{ label: 'OK', variant: 'primary' }]
      });
      return;
    }
    const bayName = job.bayId && Store.bay(job.bayId) ? Store.bay(job.bayId).name : 'the bay';
    job.workStatus = 'Completed';
    job.completedAt = Store.now();
    job.bayId = null;               /* the bay is released immediately */
    Store.log('Work', job.id + ' marked complete. ' + bayName + ' released immediately.', { bayId: job.bayId });
    ok(job.id + ' completed. ' + bayName + ' is available again; payment and collection are still open.');
  };

  Actions.live['job.checklist'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    const item = (job.requiredChecklist || []).filter(c => c.id === el.getAttribute('data-check-id'))[0];
    if (item) item.done = el.checked;
    const wrap = Util.el('#checklist-state');
    if (wrap) {
      const done = (job.requiredChecklist || []).filter(c => c.done).length;
      wrap.textContent = done + ' of ' + (job.requiredChecklist || []).length + ' items done';
    }
  };

  Actions.click['job.assignStaff'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    if (!Store.isManagerial()) { App.toast('Only Owner or Manager can change staff assignment.', 'warn'); return; }
    const mechanics = Store.state.users.filter(u => u.role === 'Mechanic');
    App.modal({
      title: 'Assign mechanics to ' + job.id,
      body: '<p>Managers can assign more than one mechanic. Each mechanic then sees this job in their own list.</p>' +
        '<div class="stack-sm">' + mechanics.map(function (m) {
          const on = (job.assignedStaffIds || []).indexOf(m.id) >= 0;
          return '<label class="check"><input type="checkbox" name="staffIds" value="' + E(m.id) + '"' + (on ? ' checked' : '') + '> <span>' + E(m.name) + '</span></label>';
        }).join('') + '</div>',
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Save assignment', variant: 'primary', onClick: function () {
            const ids = Util.els('#modal-root input[name="staffIds"]:checked').map(c => c.value);
            job.assignedStaffIds = ids;
            Store.log('Job', job.id + ' staff assignment set to ' + (ids.length ? ids.map(function (id) { return Store.staffName(id); }).join(', ') : 'nobody') + '.');
            App.closeModal();
            ok('Assignment updated.');
          }
        }
      ]
    });
  };

  /* Extra work always becomes a new version on top of the approved scope. */
  Actions.click['job.addExtra'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    if (!Store.isMechanic() && !Store.isManagerial()) {
      App.toast('Your role cannot prepare extra work.', 'warn'); return;
    }
    if (job.lifecycleStatus !== 'Open') { App.toast('This job is not open.', 'warn'); return; }
    if (isPriceLocked(job)) {
      App.toast('The price of a settled job is locked. Use a reasoned correction on Daily closing → Corrections.', 'warn');
      return;
    }
    if (Rules.hasPendingExtra(job)) {
      App.toast('An extra-work version is already waiting for a decision.', 'warn'); return;
    }
    const approved = (job.quotes || []).filter(q => q.status === 'Approved').pop();
    if (!approved) {
      App.toast('Approve the first quote before adding extra work.', 'warn'); return;
    }
    const version = nextQuoteVersion(job);
    window.__dolphinDraft = {
      jobId: job.id, version: version, isExtraWork: true, baseVersion: approved.version,
      vehicleId: job.vehicleId, size: job.size,
      lines: Util.deepCopy(approved.lines),
      inspectionNotes: approved.inspectionNotes || '',
      draftSaved: false
    };
    Store.log('Quote', job.id + ' extra-work draft v' + version + ' prepared on top of v' + approved.version + '.');
    App.go('S07', { jobId: job.id }, { force: true });
  };

  /* Archiving a closed record keeps it in history but out of the working lists. */
  Actions.click['job.archive'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    if (!Store.isManagerial()) { App.toast('Only Owner or Manager can archive a closed record.', 'warn'); return; }
    if (job.lifecycleStatus !== 'Closed') { App.toast('Only a closed job can be archived.', 'warn'); return; }
    job.archived = true;
    job.archivedAt = Store.now();
    Store.log('Job', job.id + ' closed record archived. The history is kept.');
    ok(job.id + ' archived. The record and its history are kept.');
  };

  Actions.click['job.withdrawExtra'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    /* Withdrawing changes the authorised scope, so it sits with the
       Owner and the Manager — the same roles that may cancel or reopen a
       job. The Cashier records the customer's decision; the Cashier does
       not authorise the scope. */
    if (!Store.isManagerial()) {
      App.toast('Only the Owner or a Manager can withdraw declined extra work.', 'warn');
      return;
    }
    const declined = (job.quotes || []).filter(q => q.isExtraWork && q.status === 'Declined');
    if (!declined.length) { App.toast('There is no declined extra work to withdraw.', 'warn'); return; }
    if (job.extraWorkWithdrawn) {
      App.toast('The declined extra work was already withdrawn. The original scope stays usable.', 'info');
      return;
    }
    job.extraWorkWithdrawn = true;
    Store.log('Job', job.id + ': declined extra work withdrawn. The original scope stays usable.');
    ok('Declined extra work withdrawn. The original approved scope can be completed.');
  };

  Actions.click['job.cancel'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    if (!Store.isManagerial()) { App.toast('Only Owner or Manager can cancel a job.', 'warn'); return; }
    const issues = (job.materialIssues || []).filter(i => i.quantity > (i.returnedQuantity || 0));
    let body = '<p>Cancelling releases ' + (job.bayId && Store.bay(job.bayId) ? Store.bay(job.bayId).name : 'the bay') +
      ' and keeps every original record. Nothing is deleted.</p>' +
      '<div class="field"><label for="cancel-reason">Reason (required)</label><textarea id="cancel-reason" name="reason" required></textarea></div>';
    if (issues.length) {
      body += '<h3 class="card-title">Issued material disposition</h3><p class="note">Recoverable unused parts go back to stock once. Consumed or unusable material is recorded with no extra stock change.</p>' +
        issues.map(function (iss) {
          const item = Store.item(iss.itemId);
          return '<div class="field"><label for="disp-' + E(iss.id) + '">' + E((item ? item.name : iss.itemId) + ' — ' + iss.quantity + ' ' + iss.unit) + '</label>' +
            '<select id="disp-' + E(iss.id) + '" name="disp-' + E(iss.id) + '">' +
            '<option value="Consumed">Consumed or unusable (no stock change)</option>' +
            '<option value="Recoverable">Recoverable — return to stock</option>' +
            '</select></div>';
        }).join('');
    }
    App.modal({
      title: 'Cancel ' + job.id,
      body: body,
      actions: [
        { label: 'Keep job open', variant: 'secondary' },
        {
          label: 'Cancel job', variant: 'primary', onClick: function () {
            const reason = (Util.el('#cancel-reason') || {}).value || '';
            if (!reason.trim()) { App.toast('A reason is required.', 'warn'); return; }
            issues.forEach(function (iss) {
              const sel = Util.el('[name="disp-' + iss.id + '"]');
              const disposition = sel ? sel.value : 'Consumed';
              iss.disposition = disposition;
              if (disposition === 'Recoverable') {
                const qty = iss.quantity - (iss.returnedQuantity || 0);
                if (qty > 0) {
                  const item = Store.item(iss.itemId);
                  if (item) {
                    item.onHand = Util.round2(item.onHand + qty);
                    iss.returnedQuantity = iss.quantity;
                    Store.state.stockMovements.push({
                      id: Store.nextId('movement'), itemId: iss.itemId, delta: qty, unit: iss.unit,
                      type: 'Recoverable job return', jobId: job.id, issueId: iss.id,
                      actor: Store.userId, at: Store.now(), reason: 'Cancellation: ' + reason.trim(),
                      unitCostMMK: iss.unitCostSnapshotMMK
                    });
                  }
                }
              }
            });
            job.cancellation = { reason: reason.trim(), at: Store.now(), by: Store.userId };
            job.workStatus = 'Cancelled';
            job.lifecycleStatus = 'Cancelled';
            job.bayId = null;
            Store.log('Job', job.id + ' cancelled: ' + reason.trim());
            App.closeModal();
            ok(job.id + ' cancelled. The bay is released and the original records are kept.');
          }
        }
      ]
    });
  };

  Actions.click['job.reopen'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    if (!Store.isManagerial()) { App.toast('Only Owner or Manager can reopen a job.', 'warn'); return; }
    if (job.paymentStatus !== 'Unpaid' || job.collectionStatus === 'Collected') {
      App.toast('The simple Reopen demo only applies to unpaid, uncollected, completed jobs. Use a linked Redo or a correction instead.', 'warn');
      return;
    }
    if (job.workStatus !== 'Completed') { App.toast('Only a completed job can be reopened.', 'warn'); return; }
    App.modal({
      title: 'Reopen ' + job.id,
      body: '<p>Reopening resets the completion and checklist for a new work cycle. The previous bay is <strong>not</strong> taken back — a free bay must be assigned again.</p>' +
        '<div class="field"><label for="reopen-reason">Manager reason (required)</label><textarea id="reopen-reason" name="reason" required></textarea></div>',
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Reopen job', variant: 'primary', onClick: function () {
            const reason = (Util.el('#reopen-reason') || {}).value || '';
            if (!reason.trim()) { App.toast('A Manager reason is required.', 'warn'); return; }
            job.workStatus = 'Approved';
            job.completedAt = null;
            job.collectedAt = null;
            job.closedAt = null;
            job.bayId = null;
            job.extraWorkWithdrawn = false;
            (job.requiredChecklist || []).forEach(function (c) { c.done = false; });
            job.reopenReason = reason.trim();
            Store.log('Job', job.id + ' reopened: ' + reason.trim() + '. A new free bay assignment is required.');
            App.closeModal();
            ok(job.id + ' reopened. Assign a free bay before restarting work.');
          }
        }
      ]
    });
  };

  Actions.click['job.createRedo'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    if (!Store.isManagerial()) { App.toast('Only Owner or Manager can create a linked Redo.', 'warn'); return; }
    App.modal({
      title: 'Create linked Redo for ' + job.id,
      body: '<p>A Redo is a separate comeback job that links back to the original. It has its own bay, checklist and completion, and it never earns commission. It is not a warranty feature.</p>' +
        '<div class="field"><label for="redo-price">Redo price (MMK)</label>' +
        '<input type="number" id="redo-price" name="price" min="0" step="1" value="0"></div>' +
        '<p class="note">A price of 0 creates a zero-charge Redo that settles with “Settle as no charge”.</p>',
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Create Redo', variant: 'primary', onClick: function () {
            const raw = (Util.el('#redo-price') || {}).value;
            const price = Util.parseIntStrict(raw === undefined ? '' : raw);
            if (!isFinite(price) || price < 0) { App.toast('Enter a whole non-negative amount.', 'warn'); return; }
            const jobId = Store.nextId('job');
            const vehicle = Store.vehicle(job.vehicleId);
            Store.state.jobs.push({
              id: jobId, vehicleId: job.vehicleId, createdAt: Store.now(), mileageKm: job.mileageKm,
              size: job.size, requestedServiceIds: job.requestedServiceIds.slice(),
              damage: 'Redo of ' + job.id, fuelLevel: job.fuelLevel, belongings: '',
              photoSample: 'sample-vehicle-condition',
              workStatus: 'Check-in', approvalStatus: 'Not required', paymentStatus: 'Unpaid',
              collectionStatus: 'Not collected', lifecycleStatus: 'Open',
              assignedStaffIds: [], bayId: null, completedAt: null, collectedAt: null, closedAt: null,
              redoOfJobId: job.id, managerSetRedoChargeMMK: price,
              quotes: [], activeQuoteVersion: null, materialIssues: [],
              committedServiceLines: price > 0 ? [{
                id: 'R-' + jobId + '-L1', kind: 'service', label: 'Redo work (Manager-set price)',
                quantity: 1, unitPriceMMK: price, discountMMK: 0, totalMMK: price, serviceId: null,
                redoCharge: true
              }] : [],
              requiredChecklist: [
                { id: 'C1', text: 'Redo work completed', done: false },
                { id: 'C2', text: 'Final inspection completed', done: false }
              ],
              nextServiceDueDate: null, nextServiceDueMileageKm: null, notes: [], cancellation: null
            });
            Store.state.selectedJobId = jobId;
            Store.log('Job', jobId + ' created as a linked Redo of ' + job.id + ' (' + price + ' MMK).');
            App.closeModal();
            App.toast('Redo ' + jobId + ' created.', 'info');
            App.go('S06', { jobId: jobId }, { force: true });
          }
        }
      ]
    });
  };

  /* =======================================================================
     S07 — inspection and quotation
     ===================================================================== */
  function cataloguePrice(service, size) {
    if (service.fixedPriceMMK !== null && service.fixedPriceMMK !== undefined) return service.fixedPriceMMK;
    return (service.priceBySizeMMK && service.priceBySizeMMK[size] !== undefined) ? service.priceBySizeMMK[size] : 0;
  }

  function draftLineId(draft) {
    return 'Q' + draft.version + '-L' + (draft.lines.length + 1);
  }

  Actions.click['quote.removeLine'] = function (el) {
    const form = Util.el('#quote-form');
    const idx = parseInt(el.getAttribute('data-index'), 10);
    const draft = window.__dolphinDraft;
    if (!draft) return;
    draft.lines.splice(idx, 1);
    if (form) App.render();
  };

  Actions.click['quote.addService'] = function (el) {
    const draft = window.__dolphinDraft;
    if (!draft) return;
    const serviceId = el.getAttribute('data-service-id');
    const service = Store.service(serviceId);
    if (!service) return;
    const vehicle = Store.vehicle(draft.vehicleId);
    const size = draft.size || (vehicle ? vehicle.size : 'M');
    const regular = cataloguePrice(service, size);
    /* one automatic promotion per eligible service line, lowest final price wins */
    const promo = Rules.bestPromotion(Store.state.promotions || [], service.id, size, Util.dayKey(Store.state.demoNow), regular);
    const price = promo ? Rules.promotionFinal(promo, regular) : regular;
    draft.lines.push({
      id: draftLineId(draft),
      kind: 'service', label: service.nameEN, serviceId: service.id, quantity: 1,
      unitPriceMMK: price, discountMMK: 0, totalMMK: price, repair: !!service.isRepairForDemo,
      regularPriceMMK: regular,
      promotionId: promo ? promo.id : null,
      promotionType: promo ? promo.type : null,
      promotionValue: promo ? promo.value : null
    });
    App.render();
  };

  Actions.click['quote.addShopMaterial'] = function (el) {
    const draft = window.__dolphinDraft;
    if (!draft) return;
    const item = Store.item(el.getAttribute('data-item-id'));
    if (!item) return;
    const price = item.sellPriceMMK || 0;
    draft.lines.push({
      id: draftLineId(draft),
      kind: item.type === 'Oil' ? 'oil' : 'part', label: item.name, itemId: item.id,
      unit: item.unit, source: 'Shop', quantity: 1, unitPriceMMK: price, discountMMK: 0,
      totalMMK: price, repair: draft.lines.some(l => l.repair)
    });
    App.render();
  };

  Actions.click['quote.addCustomerMaterial'] = function (el) {
    const draft = window.__dolphinDraft;
    if (!draft) return;
    draft.lines.push({
      id: draftLineId(draft),
      kind: 'customerMaterial', label: 'Customer-supplied engine oil', source: 'Customer',
      unit: 'liter', quantity: 4, unitPriceMMK: 0, discountMMK: 0, totalMMK: 0,
      repair: false, noShopStock: true
    });
    App.render();
  };

  /* Notes are kept in the draft so that adding a line never loses them. */
  Actions.live['quote.notes'] = function (el) {
    const draft = window.__dolphinDraft;
    if (!draft) return;
    draft.inspectionNotes = el.value;
  };

  Actions.click['quote.saveDraft'] = function () {
    const form = Util.el('#quote-form');
    if (!form) { App.toast('The quote form is not available.', 'warn'); return; }
    Actions.submit['quote.save'](form);
  };

  Actions.submit['quote.addCustomLine'] = function (form) {
    const v = values(form);
    const draft = window.__dolphinDraft;
    if (!draft) return fail(form, { label: 'No quote draft is open.' });
    const errors = {};
    if (!v.label || !v.label.trim()) errors.label = 'Describe the work.';
    const price = Util.parseNum(v.unitPriceMMK);
    if (v.unitPriceMMK === '' || v.unitPriceMMK === null || !isFinite(price) || price < 0) {
      errors.unitPriceMMK = 'Enter a price of zero or more.';
    }
    const qty = Util.parseNum(v.quantity);
    if (v.quantity === '' || v.quantity === null || !isFinite(qty) || qty <= 0) {
      errors.quantity = 'Enter a quantity greater than zero.';
    }
    if (Object.keys(errors).length) return fail(form, errors, 'The line was not added.');
    draft.lines.push({
      id: draftLineId(draft), kind: 'service', label: v.label.trim(),
      quantity: qty, unitPriceMMK: price, discountMMK: 0, totalMMK: price * qty,
      repair: draft.lines.some(l => l.repair)
    });
    Store.log('Quote', 'Manual labour line added to the draft of ' + draft.jobId + '.');
    ok('Line added to the draft.');
  };

  /* A new version is always a new number: approved versions stay frozen. */
  Actions.click['quote.newVersion'] = function (el) {
    const job = Store.job(el.getAttribute('data-job-id'));
    if (!job) return;
    if (isPriceLocked(job)) {
      App.toast('The price of a settled job is locked. Use a reasoned correction on Daily closing → Corrections.', 'warn');
      return;
    }
    const latest = Store.latestQuote(job);
    const version = nextQuoteVersion(job);
    window.__dolphinDraft = {
      jobId: job.id, version: version, isExtraWork: latest ? !!latest.isExtraWork : false,
      baseVersion: latest ? latest.version : null,
      vehicleId: job.vehicleId, size: job.size,
      lines: latest ? Util.deepCopy(latest.lines) : [],
      inspectionNotes: latest ? (latest.inspectionNotes || '') : '',
      draftSaved: false
    };
    Store.log('Quote', job.id + ' draft v' + version + ' prepared from v' + (latest ? latest.version : 0) + '.');
    App.render();
  };

  Actions.live['quote.linePrice'] = function (el) {
    const draft = window.__dolphinDraft;
    if (!draft) return;
    const idx = parseInt(el.getAttribute('data-index'), 10);
    const line = draft.lines[idx];
    if (!line) return;
    const q = Util.parseNum(el.value);
    line.unitPriceMMK = isFinite(q) && q >= 0 ? q : 0;
    line.totalMMK = line.unitPriceMMK * (line.quantity || 1) - (line.discountMMK || 0);
    App.render();
  };

  Actions.live['quote.lineQty'] = function (el) {
    const draft = window.__dolphinDraft;
    if (!draft) return;
    const idx = parseInt(el.getAttribute('data-index'), 10);
    const line = draft.lines[idx];
    if (!line) return;
    const q = Util.parseNum(el.value);
    line.quantity = isFinite(q) && q > 0 ? q : 1;
    line.totalMMK = line.unitPriceMMK * (line.quantity || 1) - (line.discountMMK || 0);
    App.render();
  };

  Actions.submit['quote.save'] = function (form) {
    const v = values(form);
    const draft = window.__dolphinDraft;
    if (!draft) return fail(form, { lines: 'No draft is open.' });
    if (!draft.lines.length) return fail(form, { lines: 'Add at least one line before saving.' });
    if (!v.inspectionNotes || !v.inspectionNotes.trim()) {
      return fail(form, { inspectionNotes: 'Inspection notes are required.' });
    }
    const job = Store.job(draft.jobId);
    if (!job) return fail(form, { lines: 'Job not found.' });
    draft.inspectionNotes = v.inspectionNotes.trim();
    draft.totals = Rules.totals(draft.lines, 0);
    draft.repairApprovalBasisMMK = Rules.approvalBasis(draft.lines);
    draft.draftSaved = true;
    Store.log('Quote', 'Draft saved for ' + job.id + ' (v' + draft.version + ').');
    ok('Draft saved for ' + job.id + '. Stock is unchanged until material is explicitly issued.');
  };

  Actions.submit['quote.submit'] = function (form) {
    const v = values(form);
    const draft = window.__dolphinDraft;
    if (!draft) return fail(form, { lines: 'No draft is open.' });
    const job = Store.job(draft.jobId);
    if (!job) return fail(form, { lines: 'Job not found.' });
    if (isPriceLocked(job)) {
      return fail(form, { lines: 'The price of a settled job is locked. Use a reasoned correction on Daily closing → Corrections.' },
        'Nothing was submitted. The paid price stays as it is.');
    }
    const errors = {};
    if (!v.inspectionNotes || !v.inspectionNotes.trim()) errors.inspectionNotes = 'Inspection notes are required.';
    if (!draft.lines.length) errors.lines = 'Add at least one quote line.';
    draft.lines.forEach(function (l, i) {
      if (!isFinite(l.unitPriceMMK) || l.unitPriceMMK < 0) errors['line-' + i] = 'Price must be zero or more.';
      if (!isFinite(l.quantity) || l.quantity <= 0) errors['line-' + i] = 'Quantity must be greater than zero.';
    });
    if (Object.keys(errors).length) return fail(form, errors, 'The quote was not submitted. Fix the highlighted fields.');

    draft.inspectionNotes = v.inspectionNotes.trim();
    const basis = Rules.approvalBasis(draft.lines);
    const totals = Rules.totals(draft.lines, 0);
    const needsApproval = Rules.approvalRequired(basis);

    const quote = {
      version: draft.version,
      isExtraWork: !!draft.isExtraWork,
      status: needsApproval ? 'Pending' : 'Approved',
      lines: Util.deepCopy(draft.lines),
      repairApprovalBasisMMK: basis,
      subtotalMMK: totals.subtotalMMK,
      discountMMK: totals.discountMMK,
      roundingMMK: totals.roundingMMK,
      totalMMK: totals.totalMMK,
      inspectionNotes: draft.inspectionNotes,
      submittedAt: Store.now(),
      approval: needsApproval ? null : {
        decision: 'Approved', channel: 'Not required (below threshold)', recordedBy: null,
        recordedAt: Store.now(), note: 'Not required — repair subtotal at or below 50,000 MMK.'
      }
    };
    if (draft.isExtraWork) {
      const prev = job.quotes.filter(q => q.version < quote.version).pop();
      quote.basedOnVersion = prev ? prev.version : null;
      quote.previousTotalMMK = prev ? prev.totalMMK : null;
    }
    job.quotes.push(quote);
    job.activeQuoteVersion = quote.version;
    job.approvalStatus = needsApproval ? 'Pending' : 'Not required';
    if (!draft.isExtraWork && quote.status === 'Approved') {
      job.committedServiceLines = Rules.commitLinesFromQuote(quote);
    }
    if (job.workStatus === 'Check-in') job.workStatus = 'Diagnose/Quote';
    Store.log('Quote', job.id + ' quote v' + quote.version + ' submitted (' + totals.totalMMK + ' MMK, ' +
      (needsApproval ? 'approval required' : 'approval not required') + ').');
    window.__dolphinDraft = null;
    App.toast('Quote v' + quote.version + ' submitted: ' + Util.mmk(totals.totalMMK) + ' MMK.', 'info');
    if (needsApproval) App.go('S08', { jobId: job.id }, { force: true });
    else App.go('S06', { jobId: job.id }, { force: true });
  };

  Actions.click['quote.cancel'] = function (el) {
    const jobId = (el.getAttribute('data-job-id') || (window.__dolphinDraft && window.__dolphinDraft.jobId));
    window.__dolphinDraft = null;
    App.toast('Draft discarded. The previous saved quote version is unchanged.', 'info');
    App.go('S06', { jobId: jobId }, { force: true });
  };

  /* =======================================================================
     S08 — customer approval
     ===================================================================== */
  Actions.submit['approval.record'] = function (form) {
    const v = values(form);
    const job = Store.job(form.getAttribute('data-job-id'));
    if (!job) return fail(form, { decision: 'Job not found.' });
    const version = parseInt(form.getAttribute('data-version'), 10);
    const quote = (job.quotes || []).filter(q => q.version === version)[0];
    if (!quote) return fail(form, { decision: 'Quote version not found.' });
    const errors = {};
    if (!v.decision) errors.decision = 'Record a decision.';
    if (!v.channel) errors.channel = 'Choose the channel used.';
    if (!v.confirmed) errors.confirmed = 'Tick the confirmation box to record the decision.';
    if (quote.version !== job.activeQuoteVersion) {
      errors.decision = 'This version has been superseded. Create a new proposal before recording a decision.';
    }
    if (Object.keys(errors).length) return fail(form, errors, 'The decision was not recorded.');

    quote.approval = {
      decision: v.decision, channel: v.channel + ' (simulated)', recordedBy: Store.userId,
      recordedAt: Store.now(), note: (v.note || '').trim()
    };
    quote.status = v.decision === 'Approved' ? 'Approved' : 'Declined';
    job.approvalStatus = v.decision === 'Approved' ? 'Approved' : 'Declined';
    if (v.decision === 'Approved') {
      if (!quote.isExtraWork) job.committedServiceLines = Rules.commitLinesFromQuote(quote);
      else {
        const existing = (job.committedServiceLines || []).map(l => l.id);
        Rules.commitLinesFromQuote(quote).forEach(function (l) {
          if (existing.indexOf(l.id) < 0) job.committedServiceLines.push(l);
        });
      }
      if (job.workStatus === 'Diagnose/Quote') job.workStatus = 'Approved';
    }
    Store.log('Approval', job.id + ' quote v' + version + ' ' + v.decision.toLowerCase() + ' (' + v.channel + ', simulated).');
    ok('Decision recorded against quote v' + version + '. No message was actually sent.');
  };

  /* =======================================================================
     S09 — job materials
     ===================================================================== */
  Actions.click['materials.issue'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    const quoteLineId = el.getAttribute('data-line-id');
    const quote = Store.quote(job);
    if (!quote || quote.status !== 'Approved') {
      App.toast('Only an approved quote version can have material issued.', 'warn');
      return;
    }
    const line = (quote.lines || []).filter(l => l.id === quoteLineId)[0];
    if (!line) return;
    const item = Store.item(line.itemId);
    if (!item) return;
    const remaining = Rules.issueRemaining(job, line);
    if (remaining <= 0) { App.toast('This line is already fully issued.', 'warn'); return; }
    const onHand = item.onHand;
    if (onHand <= 0) {
      App.toast('No stock available for ' + item.name + '.', 'warn');
      return;
    }
    if (Store.isMechanic() && (job.assignedStaffIds || []).indexOf(Store.userId) < 0) {
      App.toast('You can only issue material for your own jobs.', 'warn');
      return;
    }
    if (job.paymentStatus === 'Paid' || job.paymentStatus === 'No charge') {
      App.toast('This job is settled; material can no longer be issued.', 'warn');
      return;
    }
    const max = Math.min(remaining, onHand);
    App.modal({
      title: 'Add to job — ' + item.name,
      body: '<p>' + E(item.name) + ' · on hand ' + E(String(onHand)) + ' ' + E(item.unit) +
        ' · approved but not issued: ' + E(String(remaining)) + ' ' + E(item.unit) + '</p>' +
        '<form id="issue-form"><div class="field"><label for="issue-qty">Quantity (' + E(item.unit) + ')</label>' +
        '<input type="number" id="issue-qty" name="quantity" min="0.01" step="' + (item.fractional ? '0.01' : '1') + '" value="' + max + '"></div>' +
        '<p class="note">' + (item.fractional ? 'Litres may be fractional (up to 2 decimals).' : 'This unit is counted in whole numbers.') +
        ' Issuing deducts stock once and appends one movement.</p></form>',
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Issue to job', variant: 'primary', onClick: function () {
            const q = Util.parseNum((Util.el('#issue-qty') || {}).value);
            const errors = {};
            if (!isFinite(q) || q <= 0) errors.quantity = 'Enter a quantity greater than zero.';
            else if (!item.fractional && Math.abs(q - Math.round(q)) > 1e-9) errors.quantity = 'This unit must be a whole number.';
            else if (q > remaining + 1e-9) errors.quantity = 'Only ' + remaining + ' ' + item.unit + ' is still approved on this line.';
            else if (q > onHand + 1e-9) errors.quantity = 'Only ' + onHand + ' ' + item.unit + ' is on hand. Receive stock first.';
            if (Object.keys(errors).length) { fail(Util.el('#issue-form'), errors, 'Nothing was issued.'); return; }

            const issueId = 'ISS-' + Store.nextId('issue').split('-').pop();
            const issue = {
              id: issueId, quoteVersion: quote.version, quoteLineId: line.id, itemId: item.id,
              quantity: Util.round2(q), unit: item.unit, unitPriceMMK: line.unitPriceMMK,
              unitCostSnapshotMMK: item.latestPurchaseCostMMK === undefined ? null : item.latestPurchaseCostMMK,
              returnedQuantity: 0, disposition: null, kind: line.kind, issuedAt: Store.now()
            };
            job.materialIssues.push(issue);
            item.onHand = Util.round2(item.onHand - issue.quantity);
            Store.state.stockMovements.push({
              id: Store.nextId('movement'), itemId: item.id, delta: -issue.quantity, unit: item.unit,
              type: 'Job issue', jobId: job.id, issueId: issue.id, actor: Store.userId,
              at: Store.now(), reason: 'Approved job issue', unitCostMMK: issue.unitCostSnapshotMMK
            });
            if (job.workStatus === 'Approved') job.workStatus = 'In Progress';
            Store.log('Material', issue.quantity + ' ' + item.unit + ' of ' + item.name + ' issued to ' + job.id + '. Stock now ' + item.onHand + '.');
            App.closeModal();
            ok(issue.quantity + ' ' + item.unit + ' issued to ' + job.id + '. Stock is now ' + item.onHand + '.');
          }
        }
      ]
    });
  };

  /* =======================================================================
     S11 — receive stock
     ===================================================================== */
  /* Manager disposition for an issued item: recoverable (add back once) or
     consumed/unusable (no further stock change at all). */
  Actions.click['materials.disposition'] = function (el) {
    const job = Store.job(el.getAttribute('data-job-id'));
    if (!job) return;
    if (!Store.isManagerial()) { App.toast('Only Owner or Manager can record a disposition.', 'warn'); return; }
    const issue = (job.materialIssues || []).filter(i => i.id === el.getAttribute('data-issue-id'))[0];
    if (!issue) return;
    const item = Store.item(issue.itemId);
    const returnable = issue.quantity - (issue.returnedQuantity || 0);
    if (returnable <= 0) { App.toast('This issue has no returnable quantity left.', 'warn'); return; }
    App.modal({
      title: 'Disposition — ' + (item ? item.name : issue.itemId),
      body: '<p>Issue ' + E(issue.id) + ' · ' + E(String(returnable)) + ' ' + E(issue.unit) + ' can still be returned. ' +
        'Current stock: ' + E(item ? String(item.onHand) : '0') + ' ' + E(issue.unit) + '.</p>' +
        '<div class="field"><label for="disp-kind">Disposition</label>' +
        '<select id="disp-kind" name="disposition">' +
        '<option value="Consumed">Consumed or unusable — no additional stock change</option>' +
        '<option value="Recoverable">Recoverable — return ' + E(String(returnable)) + ' ' + E(issue.unit) + ' to stock once</option>' +
        '</select></div>' +
        '<div class="field"><label for="disp-reason">Reason</label><textarea id="disp-reason" name="reason"></textarea></div>' +
        '<p class="note">A consumed item is never deducted a second time. The original issue and its movement are kept.</p>',
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Record disposition', variant: 'primary', onClick: function () {
            const kind = (Util.el('#disp-kind') || {}).value || 'Consumed';
            const reason = ((Util.el('#disp-reason') || {}).value || '').trim();
            if (kind === 'Recoverable') {
              issue.returnedQuantity = issue.quantity;
              issue.disposition = 'Recoverable';
              if (item) item.onHand = Util.round2(item.onHand + returnable);
              Store.state.stockMovements.push({
                id: Store.nextId('movement'), itemId: issue.itemId, delta: returnable, unit: issue.unit,
                type: 'Recoverable job return', jobId: job.id, issueId: issue.id,
                actor: Store.userId, at: Store.now(), reason: reason || 'Recoverable return',
                unitCostMMK: issue.unitCostSnapshotMMK
              });
            } else {
              issue.disposition = 'Consumed';
            }
            Store.log('Material', 'Disposition for issue ' + issue.id + ': ' + kind + (reason ? ' — ' + reason : '') + '.');
            App.closeModal();
            ok('Disposition recorded. The original issue and movement are kept.');
          }
        }
      ]
    });
  };

  /* S10 — inventory, suppliers, purchase orders */

  function filterInventory() {
    const searchEl = Util.el('#inv-search');
    const typeEl = Util.el('#inv-type');
    const q = Util.norm(searchEl ? searchEl.value : '');
    const type = typeEl ? typeEl.value : 'all';
    const rows = Util.els('[data-item-row]');
    let shown = 0;
    rows.forEach(function (row) {
      const hay = Util.norm(row.getAttribute('data-search'));
      const t = row.getAttribute('data-type');
      const match = (!q || hay.indexOf(q) >= 0) && (type === 'all' || t === type);
      row.style.display = match ? '' : 'none';
      if (match) shown += 1;
    });
    const note = Util.el('#inv-count');
    if (note) note.textContent = shown + (shown === 1 ? ' item' : ' items');
  }

  Actions.live['inventory.search'] = filterInventory;
  Actions.live['inventory.type'] = filterInventory;

  Actions.click['inventory.movements'] = function (el) {
    const item = Store.item(el.getAttribute('data-item-id'));
    if (!item) return;
    const moves = Rules.itemMovements(item.id).slice().reverse();
    App.modal({
      title: 'Movement history — ' + item.name,
      body: moves.length
        ? '<div class="table-scroll"><table class="data-table"><caption class="sr-only">Stock movements</caption>' +
          '<thead><tr><th scope="col">Movement</th><th scope="col">Type</th><th scope="col">Change</th>' +
          '<th scope="col">Reason</th><th scope="col">Actor</th><th scope="col">Time</th></tr></thead><tbody>' +
          moves.map(function (m) {
            return '<tr><td>' + E(m.id) + '</td><td>' + E(m.type) + '</td>' +
              '<td class="num">' + (m.delta > 0 ? '+' : '') + E(String(m.delta)) + ' ' + E(m.unit || '') + '</td>' +
              '<td>' + E(m.reason || '') + '</td><td>' + E(Store.staffName(m.actor)) + '</td>' +
              '<td>' + E(Util.fmtDateTime(m.at)) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="empty-state"><p>No movement has been recorded for this item yet.</p></div>',
      actions: [{ label: 'Close', variant: 'primary' }]
    });
  };

  Actions.click['supplier.edit'] = function (el) {
    const s = Store.supplier(el.getAttribute('data-supplier-id'));
    if (!s) return;
    App.modal({
      title: 'Edit supplier — ' + s.id,
      body: '<form id="supplier-edit-form" data-form="supplier.save" data-supplier-id="' + E(s.id) + '">' +
        '<div class="field"><label for="se-name">Supplier name</label>' +
        '<input type="text" id="se-name" name="name" value="' + E(s.name) + '"></div>' +
        '<div class="field"><label for="se-contact">Contact note</label>' +
        '<input type="text" id="se-contact" name="contact" value="' + E(s.contact || '') + '"></div>' +
        '</form>',
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Save supplier', variant: 'primary', onClick: function () {
            const form = Util.el('#supplier-edit-form');
            if (!form) return;
            Actions.submit['supplier.save'](form);
            App.closeModal();
          }
        }
      ]
    });
  };

  Actions.submit['supplier.save'] = function (form) {
    const v = values(form);
    const errors = {};
    if (!v.name || !v.name.trim()) errors.name = 'Enter the supplier name.';
    if (!v.contact || !v.contact.trim()) errors.contact = 'Enter a contact note.';
    if (Object.keys(errors).length) return fail(form, errors, 'The supplier was not saved.');
    const id = form.getAttribute('data-supplier-id');
    if (id) {
      const s = Store.supplier(id);
      if (!s) return fail(form, { name: 'Supplier not found.' });
      s.name = v.name.trim();
      s.contact = v.contact.trim();
      Store.log('Supplier', s.id + ' updated (' + s.name + ').');
      ok('Supplier ' + s.id + ' updated.');
    } else {
      let n = 1;
      Store.state.suppliers.forEach(function (s) {
        const m = /(\d+)$/.exec(s.id);
        if (m) n = Math.max(n, parseInt(m[1], 10) + 1);
      });
      const newId = 'SUP-' + (n < 10 ? '0' + n : String(n));
      Store.state.suppliers.push({ id: newId, name: v.name.trim(), contact: v.contact.trim(), active: true });
      Store.log('Supplier', newId + ' created (' + v.name.trim() + ').');
      ok('Supplier ' + newId + ' created.');
    }
  };

  Actions.click['supplier.archive'] = function (el) {
    const s = Store.supplier(el.getAttribute('data-supplier-id'));
    if (!s) return;
    if (!Store.isManagerial()) { App.toast('Only Owner or Manager can archive a supplier.', 'warn'); return; }
    if (s.active) {
      s.active = false;
      s.archivedAt = Store.now();
      Store.log('Supplier', s.id + ' archived. Existing records still name it.');
      ok(s.id + ' archived. It can no longer be chosen for a new order.');
    } else {
      s.active = true;
      Store.log('Supplier', s.id + ' restored.');
      ok(s.id + ' restored.');
    }
  };

  Actions.submit['po.create'] = function (form) {
    const v = values(form);
    const errors = {};
    const supplier = v.supplierId ? Store.supplier(v.supplierId) : null;
    if (!supplier) errors.supplierId = 'Choose a supplier.';
    else if (!supplier.active) errors.supplierId = 'An archived supplier cannot be used for a new order.';
    const item = v.itemId ? Store.item(v.itemId) : null;
    if (!item) errors.itemId = 'Choose an item.';
    const qty = Util.parseNum(v.quantity);
    if (v.quantity === '' || !isFinite(qty) || qty <= 0) errors.quantity = 'Enter a quantity greater than zero.';
    else if (item && !item.fractional && Math.abs(qty - Math.round(qty)) > 1e-9) errors.quantity = 'This unit is counted in whole numbers.';
    const cost = Util.parseNum(v.unitCostMMK);
    if (v.unitCostMMK === '' || !isFinite(cost) || cost < 0) errors.unitCostMMK = 'Enter a purchase cost of zero or more.';
    if (!v.reference || !v.reference.trim()) errors.reference = 'Enter an order reference.';
    if (Object.keys(errors).length) return fail(form, errors, 'The order was not created.');

    let n = 1;
    (Store.state.purchaseOrders || []).forEach(function (o) {
      const m = /(\d+)$/.exec(o.id);
      if (m) n = Math.max(n, parseInt(m[1], 10) + 1);
    });
    const po = {
      id: 'PO-2026-' + Util.pad4(n),
      supplierId: supplier.id, itemId: item.id, quantity: Util.round2(qty), unit: item.unit,
      unitCostMMK: cost, totalMMK: Math.round(Util.round2(qty) * cost),
      reference: v.reference.trim(), status: 'Ordered',
      createdAt: Store.now(), createdBy: Store.userId, receivedQuantity: 0
    };
    Store.state.purchaseOrders.push(po);
    Store.log('Purchase', po.id + ' created for ' + po.quantity + ' ' + po.unit + ' of ' + item.name +
      ' at ' + po.totalMMK + ' MMK. Status Ordered — stock is unchanged.');
    ok('Order ' + po.id + ' created. Stock is unchanged until the order is received.');
  };

  Actions.click['po.receive'] = function (el) {
    const po = (Store.state.purchaseOrders || []).filter(o => o.id === el.getAttribute('data-po-id'))[0];
    if (!po) return;
    if (po.status === 'Received') { App.toast('This order is already fully received.', 'warn'); return; }
    App.go('S11', {
      poId: po.id, supplierId: po.supplierId, itemId: po.itemId,
      quantity: String(po.quantity), unitCostMMK: String(po.unitCostMMK), reference: po.reference
    }, { force: true });
  };

  Actions.submit['receipt.save'] = function (form) {
    const v = values(form);
    const errors = {};
    if (!v.supplierId) errors.supplierId = 'Choose a supplier.';
    if (!v.reference || !v.reference.trim()) errors.reference = 'Delivery reference is required.';
    if (!v.date) errors.date = 'Delivery date is required.';
    if (!v.itemId) errors.itemId = 'Choose an item.';
    const qty = Util.parseNum(v.quantity);
    if (!isFinite(qty) || qty <= 0) errors.quantity = 'Enter a quantity greater than zero.';
    const cost = Util.parseNum(v.unitCostMMK);
    if (!isFinite(cost) || cost < 0) errors.unitCostMMK = 'Enter a purchase cost of zero or more.';
    const item = v.itemId ? Store.item(v.itemId) : null;
    if (item && isFinite(qty) && !item.fractional && Math.abs(qty - Math.round(qty)) > 1e-9) {
      errors.quantity = 'This unit is counted in whole numbers.';
    }
    if (Object.keys(errors).length) return fail(form, errors, 'The receipt was not saved.');

    const dupe = (Store.state.goodsReceipts || []).some(function (g) {
      return g.supplierId === v.supplierId && g.reference === v.reference.trim() && g.itemId === v.itemId;
    });
    if (dupe) {
      return fail(form, { reference: 'This supplier, reference and item combination was already received.' },
        'The receipt was not saved. Repeat receipts are blocked.');
    }

    const gr = {
      id: 'GR-' + Store.nextId('gr').split('-').pop(),
      supplierId: v.supplierId, reference: v.reference.trim(), date: v.date,
      itemId: v.itemId, quantity: Util.round2(qty), unit: item.unit,
      unitCostMMK: cost, totalMMK: Math.round(Util.round2(qty) * cost),
      receivedAt: Store.now(), actor: Store.userId, purchaseOrderId: form.getAttribute('data-po-id') || null
    };
    Store.state.goodsReceipts.push(gr);
    const before = item.onHand;
    item.onHand = Util.round2(item.onHand + gr.quantity);
    item.latestPurchaseCostMMK = cost;
    Store.state.stockMovements.push({
      id: Store.nextId('movement'), itemId: item.id, delta: gr.quantity, unit: item.unit,
      type: 'Goods receipt', actor: Store.userId, at: Store.now(),
      reason: 'Receipt ' + gr.reference + ' from ' + (Store.supplier(v.supplierId) || {}).name,
      unitCostMMK: cost, goodsReceiptId: gr.id
    });
    Store.log('Stock', gr.quantity + ' ' + item.unit + ' of ' + item.name + ' received (' + gr.reference + '). Stock ' + before + ' → ' + item.onHand + '.');
    /* a purchase order that is received is closed, a smaller delivery is partial */
    if (gr.purchaseOrderId) {
      const po = (Store.state.purchaseOrders || []).filter(o => o.id === gr.purchaseOrderId)[0];
      if (po) {
        po.receivedQuantity = Util.round2((po.receivedQuantity || 0) + gr.quantity);
        po.status = po.receivedQuantity >= po.quantity ? 'Received' : 'Partial';
        po.goodsReceiptId = gr.id;
        po.receivedAt = gr.receivedAt;
        Store.log('Purchase', po.id + ' is now ' + po.status + '.');
      }
    }
    App.toast('Stock received. ' + item.name + ' is now ' + item.onHand + ' ' + item.unit + '.', 'info');
    App.go('S10', { tab: 'inventory' }, { force: true });
  };

  /* Live preview of the resulting stock balance. */
  Actions.live['receipt.preview'] = function () {
    const box = Util.el('#gr-preview');
    if (!box) return;
    const qtyEl = Util.el('#gr-qty');
    const costEl = Util.el('#gr-cost');
    const itemEl = Util.el('#gr-item');
    const item = itemEl ? Store.item(itemEl.value) : null;
    if (!item) { box.innerHTML = '<div>Choose an item to see the balance preview.</div>'; return; }
    const qty = Util.parseNum(qtyEl ? qtyEl.value : '');
    if (!isFinite(qty) || qty <= 0) {
      box.innerHTML = '<div>Enter a quantity greater than zero to see the balance preview.</div>';
      return;
    }
    const cost = Util.parseNum(costEl ? costEl.value : '');
    const after = Util.round2(item.onHand + qty);
    const total = isFinite(cost) ? Util.round2(qty * cost) : 0;
    box.innerHTML = UI.icon('info', 18) +
      '<div>Preview: ' + E(item.name) + ' goes from <strong>' + E(String(item.onHand)) + ' ' + E(item.unit) +
      '</strong> to <strong>' + E(String(after)) + ' ' + E(item.unit) + '</strong>. ' +
      'Receipt value ' + Util.mmk(total) + ' MMK. Nothing changes until the receipt is recorded.</div>';
  };

  /* =======================================================================
     S12 — receipts, payment, collection, closure
     ===================================================================== */
  Actions.click['receipt.pay'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    if (Store.jobReceipt(job.id)) {
      App.toast('A receipt already exists for this job (' + Store.jobReceipt(job.id).id + '). Payment is posted once only.', 'warn');
      return;
    }
    if (job.workStatus !== 'Completed') { App.toast('Only a completed job can be settled.', 'warn'); return; }
    const totals = Rules.jobTotals(job);
    if (totals.totalMMK <= 0) { App.toast('There is nothing to charge on this job.', 'warn'); return; }
    const existing = Store.jobPayment(job.id);
    if (existing) { App.toast('This job is already settled.', 'warn'); return; }
    App.go('S12', { jobId: job.id, tab: 'payment' }, { force: true });
  };

  Actions.submit['payment.record'] = function (form) {
    const v = values(form);
    const job = Store.job(form.getAttribute('data-job-id'));
    if (!job) return fail(form, { method: 'Job not found.' });
    if (Store.jobReceipt(job.id)) {
      return fail(form, { method: 'A receipt already exists for this job.' }, 'Payment is posted once only.');
    }
    if (job.workStatus !== 'Completed') return fail(form, { method: 'Only a completed job can be settled.' });
    const totals = Rules.jobTotals(job);
    const payable = totals.totalMMK;
    const errors = {};
    if (!v.method) errors.method = 'Choose a payment method.';
    let tendered = null, change = 0;
    if (v.method === 'Cash') {
      tendered = Util.parseIntStrict(v.tenderedMMK);
      if (!isFinite(tendered)) errors.tenderedMMK = 'Enter the cash tendered as a whole number.';
      else if (tendered < payable) errors.tenderedMMK = 'Cash tendered must cover the full payable of ' + Util.mmk(payable) + ' MMK. Underpayment is not accepted.';
      else change = tendered - payable;
    } else {
      if (!v.reference || !v.reference.trim()) errors.reference = 'Enter the simulated transfer reference.';
      if (!v.verified) errors.verified = 'Tick “Verified (demo)” before posting a wallet payment.';
    }
    if (Object.keys(errors).length) return fail(form, errors, 'The payment was not posted.');

    const receiptId = Store.nextId('receipt');
    const receipt = {
      id: receiptId, jobId: job.id, issuedAt: Store.now(),
      lines: totals.lines.map(l => Util.deepCopy(l)),
      subtotalMMK: totals.subtotalMMK, discountMMK: totals.discountMMK,
      roundingMMK: totals.roundingMMK, totalMMK: payable, kind: 'Receipt'
    };
    Store.state.receipts.push(receipt);
    const payment = {
      id: Store.nextId('payment'), receiptId: receiptId, jobId: job.id, method: v.method,
      amountAppliedMMK: payable, cashTenderedMMK: tendered, changeMMK: change,
      verified: v.method === 'Cash' ? true : !!v.verified,
      reference: v.method === 'Cash' ? null : (v.reference || '').trim(),
      at: Store.now()
    };
    Store.state.payments.push(payment);
    job.paymentStatus = 'Paid';
    Store.log('Payment', receiptId + ' issued for ' + job.id + ' — ' + Util.mmk(payable) + ' MMK by ' + v.method +
      (change ? ' (change ' + Util.mmk(change) + ' MMK)' : '') + '.');
    ok('Payment posted. Receipt ' + receiptId + ' created and the price lines are now locked.');
  };

  /* Cash and wallet fields are shown for the chosen method only. */
  Actions.live['payment.method'] = function (el) {
    const method = el.value;
    const cash = Util.el('#pay-cash-block');
    const wallet = Util.el('#pay-wallet-block');
    const verify = Util.el('#pay-verify-block');
    if (cash) cash.hidden = method !== 'Cash';
    if (wallet) wallet.hidden = method === 'Cash' || method === '';
    if (verify) verify.hidden = method === 'Cash' || method === '';
    const preview = Util.el('#pay-preview');
    if (preview && method !== 'Cash') {
      preview.innerHTML = '<div>A wallet payment is simulated. Enter a demo reference and tick “Verified (demo)”.</div>';
    }
  };

  Actions.live['payment.preview'] = function () {
    const box = Util.el('#pay-preview');
    if (!box) return;
    const form = box.closest('form');
    const payable = form ? parseInt(form.getAttribute('data-payable') || '0', 10) : 0;
    const tenderedEl = Util.el('#pay-tendered');
    const tendered = Util.parseIntStrict(tenderedEl ? tenderedEl.value : '');
    if (!isFinite(tendered)) {
      box.innerHTML = '<div>Enter the cash tendered to see the change.</div>';
      return;
    }
    if (tendered < payable) {
      box.innerHTML = UI.icon('info', 18) + '<div>Tendered ' + Util.mmk(tendered) +
        ' MMK is below the payable of ' + Util.mmk(payable) +
        ' MMK. A part payment is not accepted and nothing would be posted.</div>';
      return;
    }
    box.innerHTML = UI.icon('info', 18) + '<div>Tendered ' + Util.mmk(tendered) + ' MMK — applied ' +
      Util.mmk(payable) + ' MMK — change ' + Util.mmk(tendered - payable) + ' MMK.</div>';
  };

  Actions.click['receipt.settleNoCharge'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    if (Store.jobReceipt(job.id)) { App.toast('A receipt already exists for this job.', 'warn'); return; }
    const totals = Rules.jobTotals(job);
    if (totals.totalMMK > 0) { App.toast('This job has a payable amount. Record a full payment instead.', 'warn'); return; }
    const receiptId = Store.nextId('receipt');
    Store.state.receipts.push({
      id: receiptId, jobId: job.id, issuedAt: Store.now(), lines: totals.lines.map(l => Util.deepCopy(l)),
      subtotalMMK: totals.subtotalMMK, discountMMK: totals.discountMMK, roundingMMK: totals.roundingMMK,
      totalMMK: 0, kind: 'Receipt'
    });
    job.paymentStatus = 'No charge';
    Store.log('Payment', receiptId + ' settled as no charge for ' + job.id + '.');
    ok('Settled as no charge. A zero-total receipt was created; no cash transfer was recorded.');
  };

  Actions.click['receipt.collect'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    if (!Rules.jobIsSettled(job)) { App.toast('Collect the vehicle only after full settlement.', 'warn'); return; }
    if (job.collectionStatus === 'Collected') { App.toast('This vehicle was already collected.', 'warn'); return; }
    job.collectionStatus = 'Collected';
    job.collectedAt = Store.now();
    Store.log('Collection', 'Vehicle handed over for ' + job.id + '.');
    ok('Collection recorded. The job can now be closed.');
  };

  Actions.click['receipt.close'] = function (el) {
    const job = jobFrom(el);
    if (!job) return;
    const check = Rules.canClose(job);
    if (!check.ok) {
      App.modal({
        title: 'Cannot close yet',
        body: '<ul class="stack-sm">' + check.reasons.map(r => '<li>• ' + E(r) + '</li>').join('') + '</ul>',
        actions: [{ label: 'OK', variant: 'primary' }]
      });
      return;
    }
    App.modal({
      title: 'Close ' + job.id,
      body: '<p>The job is completed, settled and collected. The next service plan is optional and uses explicitly entered sample values — no service interval is invented.</p>' +
        '<div class="form-grid">' +
        UI.field({ id: 'next-date', label: 'Next service date', type: 'date' }) +
        UI.field({ id: 'next-mileage', label: 'Next service mileage (km)', type: 'number', min: 0, step: 1 }) +
        '</div>' +
        '<p class="note">Sample values from the source pack: 28 November 2026 or 73,000 km.</p>',
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Close job', variant: 'primary', onClick: function () {
            const date = (Util.el('#next-date') || {}).value;
            const kmRaw = (Util.el('#next-mileage') || {}).value;
            const km = kmRaw === '' || kmRaw === undefined ? null : Util.parseIntStrict(kmRaw);
            if (date) job.nextServiceDueDate = date;
            if (km !== null && isFinite(km) && km > 0) job.nextServiceDueMileageKm = km;
            job.lifecycleStatus = 'Closed';
            job.closedAt = Store.now();
            Store.log('Job', job.id + ' closed. The vehicle moved to history.');
            App.closeModal();
            ok(job.id + ' closed and moved to history.');
          }
        }
      ]
    });
  };

  Actions.click['receipt.print'] = function () {
    window.print();
  };

  Actions.click['receipt.reprint'] = function (el) {
    const id = el.getAttribute('data-receipt-id');
    const rc = Store.receipt(id);
    if (!rc) return;
    App.modal({
      title: 'Reprint preview — COPY',
      body: '<p class="copy-label">COPY</p>' +
        '<p>Reprinting uses the original receipt number <strong>' + E(rc.id) + '</strong>. A second receipt is never created.</p>' +
        '<div class="receipt-paper" style="margin-top:12px">' +
        '<div class="rp-head"><strong>Dolphin AutoTrack</strong> — Receipt (demo)<br>' +
        '<span class="muted small">' + E(rc.id) + ' · ' + E(Util.fmtDateTime(rc.issuedAt)) + '</span></div>' +
        rc.lines.map(l => '<div class="preview-row"><span>' + E(l.label) + ' × ' + E(l.quantity) + '</span><span>' + E(Util.mmk(l.totalMMK)) + '</span></div>').join('') +
        '<div class="preview-row total"><span>Total</span><span>' + E(Util.mmk(rc.totalMMK)) + ' MMK</span></div></div>',
      actions: [
        { label: 'Close', variant: 'secondary' },
        { label: 'Print this copy', variant: 'primary', onClick: function () { window.print(); } }
      ]
    });
  };

  Actions.click['receipt.share'] = function (el) {
    const id = el.getAttribute('data-receipt-id');
    const rc = Store.receipt(id);
    if (!rc) return;
    const text = 'Dolphin AutoTrack (demo) — Receipt ' + rc.id + ', total ' + Util.mmk(rc.totalMMK) + ' MMK. Fictional demo data; no real payment was made.';
    App.modal({
      title: 'Share preview (simulated)',
      body: '<p>Nothing is sent and no live recipient is opened. This is a text preview only.</p>' +
        '<div class="field"><label for="share-text">Preview text</label><textarea id="share-text" rows="4" readonly>' + E(text) + '</textarea></div>' +
        '<p class="note">Viber and Messenger are named as channels only. The prototype has no messaging integration.</p>',
      actions: [{ label: 'Close', variant: 'primary' }]
    });
  };

  global.Actions = Actions;
})(window);
