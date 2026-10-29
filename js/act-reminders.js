/* S13 — Reminders: tab switching and the follow-up note.
   A saved note is a demo record only. Nothing is called, messaged or sent,
   and a contacted vehicle stays in the collection queue. */
(function (global) {
  'use strict';

  const CHANNELS = ['Phone', 'Viber', 'Messenger', 'In person'];

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

  /* =======================================================================
     Tabs
     ======================================================================= */
  global.Actions.click['reminders.tab'] = function (el) {
    const tab = el.getAttribute('data-tab-value');
    if (tab !== 'service' && tab !== 'collection') return;
    App.go('S13', { tab: tab }, { force: true });
  };
  /* =======================================================================
     Selecting the row the follow-up form applies to
     ======================================================================= */
  global.Actions.click['reminders.select'] = function (el) {
    const jobId = el.getAttribute('data-job-id');
    const job = Store.job(jobId);
    if (!job) { App.toast('That job is no longer in the list.', 'warn'); return; }
    const params = Object.assign({}, Store.params, { jobId: jobId });
    App.go('S13', params, { force: true });
  };

  global.Actions.click['reminders.clear'] = function () {
    const form = Util.el('#followup-form');
    if (form) form.reset();
    App.toast('The note was cleared. Nothing was saved.', 'info');
  };

  /* =======================================================================
     Save a follow-up note
     ======================================================================= */
  global.Actions.submit['reminders.followUp'] = function (form) {
    const v = values(form);
    const jobId = form.getAttribute('data-job-id');
    const job = Store.job(jobId);
    const errors = {};
    if (!job) errors.channel = 'Select a vehicle from the list first.';
    if (!v.channel) errors.channel = 'Choose the channel used.';
    else if (CHANNELS.indexOf(v.channel) < 0) errors.channel = 'Choose a channel from the list.';
    if (!v.outcome || !v.outcome.trim()) errors.outcome = 'Record the outcome of the contact.';
    if (v.nextActionDate && !v.nextAction) {
      errors.nextAction = 'Choose a next action before setting a next action date.';
    }
    if (Object.keys(errors).length) {
      return fail(form, errors, 'The follow-up note was not saved. Fix the highlighted fields.');
    }

    const vehicle = Store.vehicle(job.vehicleId);
    const record = {
      id: 'FU-' + Util.pad4((Store.state.followUps || []).length + 1),
      jobId: job.id,
      vehicleId: job.vehicleId,
      channel: v.channel,
      outcome: v.outcome.trim(),
      note: (v.note || '').trim(),
      nextAction: (v.nextAction || '').trim(),
      nextActionDate: (v.nextActionDate || '').trim(),
      at: Store.now(),
      actor: Store.userId
    };
    if (!Store.state.followUps) Store.state.followUps = [];
    Store.state.followUps.push(record);
    Store.log('Reminder', 'Follow-up (' + record.channel + ') recorded for ' + job.id +
      (vehicle ? ' (' + vehicle.plate + ')' : '') + ': ' + record.outcome + '. No message was sent.');
    return ok('Follow-up note saved for ' + job.id + '. Nothing was sent to the customer.');
  };
})(window);
