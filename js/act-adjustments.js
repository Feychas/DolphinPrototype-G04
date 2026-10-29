/* S16 — Stock adjustments: live preview, confirmation and the append-only
   movement log. Every posting is a demo record: nothing is ordered, returned
   or paid for, and nothing is stored outside the in-memory demo state. */
(function (global) {
  'use strict';

  /** Shared helpers of the S16 view (loaded separately in index.html). */
  function api() {
    const views = global.DolphinViews || {};
    const view = views.S16;
    return view && view.api ? view.api : null;
  }

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
     Live preview
     ======================================================================= */
  global.Actions.live['adjustments.preview'] = function (el) {
    const a = api();
    if (!a) return;
    a.refresh(document, el);
  };

  /* Pick an item from the stock table and show it in the form. */
  global.Actions.click['adjustments.pickItem'] = function (el) {
    const id = el.getAttribute('data-item-id');
    const sel = Util.el('#adj-item');
    if (!sel || !id) return;
    sel.value = id;
    const a = api();
    if (a) a.refresh(document, sel);
  };

  /* Cancel: the form is cleared and the balance is left exactly as it was. */
  global.Actions.click['adjustments.cancel'] = function () {
    const form = Util.el('#adjust-form');
    if (form) form.reset();
    const a = api();
    if (a) a.refresh(document, null);
    App.toast('Cancelled. The stock balance is unchanged.', 'info');
  };

  /* =======================================================================
     Post an adjustment
     ======================================================================= */
  global.Actions.submit['adjustments.post'] = function (form) {
    if (!Store.isManagerial()) {
      App.toast('Only the Owner or a Manager can adjust stock.', 'warn');
      return;
    }
    const a = api();
    if (!a) { App.toast('This screen is not part of the prototype demo.', 'warn'); return; }

    const res = a.compute(values(form));
    if (!res.ok) {
      return fail(form, res.errors, 'Nothing was posted. Fix the highlighted fields.');
    }

    /* one movement of this type for this item per session */
    if (a.alreadyApplied(res.item.id, res.ledgerType)) {
      App.toast('A ' + res.ledgerType + ' for ' + res.item.name +
        ' was already recorded in this session. Nothing was posted twice.', 'warn');
      a.refresh(document, null);
      return;
    }

    App.modal({
      title: 'Confirm stock adjustment',
      body: a.previewHtml(res) +
        '<p class="note">Confirming appends one movement and one activity entry. ' +
        'Cancelling leaves the balance unchanged.</p>',
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        { label: 'Confirm adjustment', variant: 'primary', onClick: function () { post(res); } }
      ]
    });
  };

  /* Append the movement and apply it to the balance. */
  function post(res) {
    if (!Store.isManagerial()) {
      App.toast('Only the Owner or a Manager can adjust stock.', 'warn');
      return;
    }
    const a = api();
    if (!a) return;

    /* the guard runs again here: a double click cannot post twice */
    if (a.alreadyApplied(res.item.id, res.ledgerType)) {
      App.toast('That adjustment was already recorded. Nothing was posted twice.', 'warn');
      return;
    }

    const item = res.item;
    const before = Util.round2(item.onHand || 0);
    const movement = {
      id: Store.nextId('movement'),
      itemId: item.id,
      delta: res.delta,
      unit: item.unit,
      type: res.ledgerType,
      actor: Store.userId,
      at: Store.now(),
      reason: res.reason
    };
    if (res.issueJob) movement.jobId = res.issueJob.id;
    if (res.issue) movement.issueId = res.issue.id;
    if (item.latestPurchaseCostMMK !== undefined && item.latestPurchaseCostMMK !== null) {
      movement.unitCostMMK = item.latestPurchaseCostMMK;
    }

    /* the balance never goes below zero */
    const after = Util.round2(before + res.delta);
    if (after < 0) {
      App.toast('That would leave the stock balance below zero. Nothing was posted.', 'warn');
      return;
    }
    item.onHand = after;

    /* the issue keeps its own record; a return happens once */
    if (res.issue) {
      if (res.disposition === 'Recoverable') {
        res.issue.returnedQuantity = Util.round2((res.issue.returnedQuantity || 0) + res.qty);
        if (res.issue.returnedQuantity >= res.issue.quantity) res.issue.disposition = 'Returned';
      } else {
        res.issue.disposition = 'Consumed';
      }
    }

    if (!Store.state.stockMovements) Store.state.stockMovements = [];
    Store.state.stockMovements.push(movement);

    Store.log('Stock', res.ledgerType + ': ' + item.name + ' ' + before + ' → ' + after + ' ' + item.unit +
      (res.issue ? ' (issue ' + res.issue.id + ' on ' + res.issueJob.id + ')' : '') + '. ' + res.reason);

    ok(res.ledgerType + ' recorded. ' + item.name + ' is now ' + after + ' ' + item.unit + '.');
  }
})(window);
