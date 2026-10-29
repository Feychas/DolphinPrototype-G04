/* S16 — Stock adjustments and dispositions.
   Owner and Manager only. Every adjustment appends one movement to the
   ledger: older movements are never rewritten and stock never goes
   negative. Nothing is ordered, returned or paid for — all simulated. */
(function (global) {
  'use strict';
  const E = Util.esc;

  const TYPES = [
    {
      id: 'count', label: 'Count adjustment', ledger: 'Count adjustment',
      hint: 'Enter the counted quantity. The difference is appended as one new movement.'
    },
    {
      id: 'consumable', label: 'Consumable opened', ledger: 'Consumable opened',
      hint: 'Deduct a container that has been opened. The deduction happens once, by hand.'
    },
    {
      id: 'writeoff', label: 'Write-off', ledger: 'Write-off',
      hint: 'Remove damaged or unusable stock. Only stock on hand can be written off.'
    },
    {
      id: 'supplierReturn', label: 'Supplier return', ledger: 'Supplier return',
      hint: 'Send stock back to a supplier. Only stock on hand can be returned.'
    },
    {
      id: 'jobReturn', label: 'Recoverable job return', ledger: 'Recoverable job return',
      hint: 'Return unused material from a job. The original issue must be referenced.'
    }
  ];

  const DISPOSITIONS = [
    { value: 'Recoverable', label: 'Recoverable — return to stock once' },
    { value: 'Consumed', label: 'Consumed or unusable — no stock change' }
  ];

  /* A consumed or unusable issue is recorded as a disposition. It keeps a
     ledger row with a zero delta so nothing is ever deducted twice. */
  const CONSUMED_LEDGER = 'Disposition recorded';

  /* ---------------- data helpers ---------------- */

  function typeById(id) {
    const found = TYPES.filter(function (t) { return t.id === id; })[0];
    return found || TYPES[0];
  }

  /** Ledger type for the current form choice. */
  function ledgerFor(typeId, disposition) {
    const type = typeById(typeId);
    if (type.id === 'jobReturn' && disposition === 'Consumed') return CONSUMED_LEDGER;
    return type.ledger;
  }

  function items() { return Store.state.items || []; }

  function onHand(item) { return item ? Util.round2(item.onHand || 0) : 0; }

  /** Issues whose material can still come back to stock. */
  function returnableIssues(itemId) {
    const out = [];
    (Store.state.jobs || []).forEach(function (job) {
      (job.materialIssues || []).forEach(function (iss) {
        if (iss.itemId !== itemId) return;
        if (iss.disposition === 'Consumed' || iss.disposition === 'Used' || iss.disposition === 'Returned') return;
        const available = Util.round2((iss.quantity || 0) - (iss.returnedQuantity || 0));
        if (available <= 0) return;
        const vehicle = job.vehicleId ? Store.vehicle(job.vehicleId) : null;
        out.push({
          job: job, issue: iss, available: available,
          plate: vehicle ? vehicle.plate : ''
        });
      });
    });
    return out;
  }

  function readValues(form) {
    const out = {};
    Util.els('input, select, textarea', form).forEach(function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  }

  /**
   * Work out the movement for a set of form values.
   * Returns the errors, the resulting delta and the resulting balance.
   */
  function compute(v) {
    v = v || {};
    const errors = {};
    const item = v.itemId ? Store.item(v.itemId) : null;
    const type = typeById(v.type);
    const disposition = type.id === 'jobReturn'
      ? (v.disposition === 'Consumed' ? 'Consumed' : 'Recoverable') : null;
    const ledgerType = ledgerFor(type.id, disposition);
    const current = onHand(item);
    const qty = Util.parseNum(v.quantity);
    let delta = 0;
    let after = current;
    let issue = null;
    let issueJob = null;
    let available = 0;

    if (!item) errors.itemId = 'Choose an item.';
    if (item && v.unit !== undefined && v.unit !== null && v.unit !== '' && v.unit !== item.unit) {
      errors.unit = 'The unit must be the unit of the item (' + item.unit + ').';
    }

    if (item) {
      if (type.id === 'count') {
        if (!isFinite(qty)) errors.quantity = 'Enter the counted quantity.';
        else if (qty < 0) errors.quantity = 'The counted quantity cannot be negative.';
        else if (!item.fractional && Math.abs(qty - Math.round(qty)) > 1e-9) {
          errors.quantity = 'This unit is counted in whole numbers.';
        } else {
          delta = Util.round2(qty - current);
          after = Util.round2(qty);
        }
      } else if (type.id === 'jobReturn') {
        const issues = returnableIssues(item.id);
        if (!v.issueId) errors.issueId = 'Reference the original issue.';
        else {
          const found = issues.filter(function (r) { return r.issue.id === v.issueId; })[0];
          if (!found) errors.issueId = 'That issue cannot be returned any more.';
          else {
            issue = found.issue;
            issueJob = found.job;
            available = found.available;
            if (!isFinite(qty)) errors.quantity = 'Enter the quantity being returned.';
            else if (qty <= 0) errors.quantity = 'Enter a quantity greater than zero.';
            else if (!item.fractional && Math.abs(qty - Math.round(qty)) > 1e-9) {
              errors.quantity = 'This unit is counted in whole numbers.';
            } else if (qty > available + 1e-9) {
              errors.quantity = 'Only ' + available + ' ' + item.unit + ' of this issue is still unreturned.';
            } else if (disposition === 'Recoverable') {
              delta = Util.round2(qty);
              after = Util.round2(current + delta);
            } else {
              delta = 0;
              after = current;
            }
          }
        }
      } else {
        /* consumable opened, write-off, supplier return — all deduct stock */
        if (!isFinite(qty)) errors.quantity = 'Enter a quantity.';
        else if (qty <= 0) errors.quantity = 'Enter a quantity greater than zero.';
        else if (!item.fractional && Math.abs(qty - Math.round(qty)) > 1e-9) {
          errors.quantity = 'This unit is counted in whole numbers.';
        } else if (qty > current + 1e-9) {
          errors.quantity = 'Only ' + current + ' ' + item.unit + ' is on hand. Reduce the quantity.';
        } else {
          delta = Util.round2(-qty);
          after = Util.round2(current + delta);
        }
      }
    }

    if (!errors.quantity && after < 0) errors.quantity = 'This would leave the stock balance below zero.';
    if (!v.reason || !v.reason.trim()) errors.reason = 'A reason is required for every adjustment.';

    return {
      ok: !Object.keys(errors).length,
      errors: errors,
      item: item,
      type: type,
      disposition: disposition,
      ledgerType: ledgerType,
      current: current,
      delta: delta,
      after: after,
      qty: isFinite(qty) ? Util.round2(qty) : 0,
      issue: issue,
      issueJob: issueJob,
      available: available,
      reason: (v.reason || '').trim()
    };
  }

  /**
   * Has a movement of this type already been posted for this item in this
   * session? The confirm button must not post the same movement twice.
   */
  function alreadyApplied(itemId, ledgerType) {
    if (!itemId || !ledgerType) return false;
    return (Store.state.stockMovements || []).some(function (m) {
      return m.itemId === itemId && m.type === ledgerType;
    });
  }

  /* ---------------- markup helpers ---------------- */

  /** The before/after preview, also used inside the confirmation dialog. */
  function previewHtml(res) {
    if (!res || !res.item) {
      return '<div class="banner banner-plain">' + UI.icon('info', 18) +
        '<div>Choose an item to see the balance before and after the adjustment.</div></div>';
    }
    const item = res.item;
    const change = res.delta === 0
      ? 'no stock change'
      : (res.delta > 0 ? '+' : '−') + Util.qty(Math.abs(res.delta)) + ' ' + item.unit;

    let rows = '<div class="preview-row"><span>Balance</span><strong>' +
      E(item.name + ': ' + Util.qty(res.current) + ' → ' + Util.qty(res.after)) + '</strong></div>' +
      '<div class="preview-row"><span>Movement</span><span>' +
      E(res.ledgerType) + ' · ' + E(change) + '</span></div>';

    if (res.issue) {
      rows += '<div class="preview-row"><span>Original issue</span><span>' +
        E(res.issueJob ? res.issueJob.id : '') + ' · ' + E(res.issue.id) + ' · ' +
        E(Util.qty(res.available)) + ' ' + E(item.unit) + ' unreturned</span></div>';
    }
    rows += '<div class="preview-row"><span>Recorded by</span><span>' +
      E(Store.user().name) + ' (' + E(Store.role) + ')</span></div>' +
      '<div class="preview-row"><span>Recorded at</span><span>' +
      E(Util.fmtDateTime(Store.now())) + '</span></div>';

    let html = '<div class="preview-list">' + rows + '</div>';

    if (res.disposition === 'Consumed') {
      html += '<p class="note">This material was already issued to a job and is recorded as consumed or unusable. ' +
        'The balance does not change and the item is never deducted a second time.</p>';
    }
    if (res.errors && Object.keys(res.errors).length) {
      html += '<div class="banner banner-warn" role="note">' + UI.icon('alert', 18) +
        '<div><strong>Not ready to post</strong><p>' +
        E(Object.keys(res.errors).map(function (k) { return res.errors[k]; }).join(' ')) +
        '</p></div></div>';
    }
    return html;
  }

  function itemOptionsHtml(selectedId) {
    return items().map(function (i) {
      return '<option value="' + E(i.id) + '"' + (i.id === selectedId ? ' selected' : '') + '>' +
        E(i.name + ' (' + i.unit + ', on hand ' + Util.qty(i.onHand) + ')') + '</option>';
    }).join('');
  }

  function issueOptionsHtml(issues) {
    if (!issues.length) return '<option value="">No issue with material left to return</option>';
    return issues.map(function (r) {
      return '<option value="' + E(r.issue.id) + '">' +
        E((r.job ? r.job.id : '') + (r.plate ? ' (' + r.plate + ')' : '') + ' · ' + r.issue.id + ' · ' +
          Util.qty(r.available) + ' ' + r.issue.unit + ' unreturned') + '</option>';
    }).join('');
  }

  /** Movement rows for one item, newest first. */
  function movementRows(itemId) {
    const list = (Store.state.stockMovements || []).filter(function (m) {
      return !itemId || m.itemId === itemId;
    }).slice().reverse();
    if (!list.length) {
      return '<tr><td class="empty-cell" colspan="7">No movement has been recorded for this item yet.</td></tr>';
    }
    return list.map(function (m) {
      const item = Store.item(m.itemId);
      const delta = m.delta === 0 ? '0' : (m.delta > 0 ? '+' : '−') + Util.qty(Math.abs(m.delta));
      const ref = [m.jobId, m.issueId].filter(Boolean).join(' · ') || '—';
      return '<tr>' +
        '<th scope="row">' + E(m.id) + '</th>' +
        '<td>' + E(Util.fmtDateTime(m.at)) + '</td>' +
        '<td>' + E(m.type) + '</td>' +
        '<td class="num">' + E(delta) + ' ' + E(m.unit || (item ? item.unit : '')) + '</td>' +
        '<td>' + E(ref) + '</td>' +
        '<td>' + E(Store.staffName(m.actor)) + '</td>' +
        '<td>' + E(m.reason || '—') + '</td>' +
        '</tr>';
    }).join('');
  }

  function historyTableHtml(itemId) {
    return '<div class="table-scroll" tabindex="0" role="region" aria-label="Stock movement history">' +
      '<table class="data-table"><caption class="sr-only">Stock movement history</caption>' +
      '<thead><tr><th scope="col">Movement</th><th scope="col">When</th><th scope="col">Type</th>' +
      '<th scope="col">Change</th><th scope="col">Job / issue</th><th scope="col">By</th><th scope="col">Reason</th>' +
      '</tr></thead><tbody id="adj-history-body">' + movementRows(itemId) + '</tbody></table></div>';
  }

  /** The adjustment form. */
  function formHtml(item, type) {
    const step = item && item.fractional ? '0.01' : '1';
    const issues = item ? returnableIssues(item.id) : [];
    const startQty = type.id === 'count' && item ? String(item.onHand) : '';
    return '<form id="adjust-form" data-form="adjustments.post" novalidate>' +
      '<div class="form-grid">' +
      '<div class="field">' +
      '<label for="adj-type">Adjustment type <span class="req" aria-hidden="true">*</span></label>' +
      '<select id="adj-type" name="type" required data-change="adjustments.preview">' +
      TYPES.map(function (t) {
        return '<option value="' + E(t.id) + '"' + (t.id === type.id ? ' selected' : '') + '>' + E(t.label) + '</option>';
      }).join('') + '</select>' +
      '<p class="field-hint" id="adj-type-hint">' + E(type.hint) + '</p></div>' +

      '<div class="field">' +
      '<label for="adj-item">Item <span class="req" aria-hidden="true">*</span></label>' +
      '<select id="adj-item" name="itemId" required data-change="adjustments.preview">' +
      itemOptionsHtml(item ? item.id : null) + '</select>' +
      '<p class="field-hint" id="adj-item-hint">On hand now: <span id="adj-onhand">' +
      E(item ? Util.qty(item.onHand) + ' ' + item.unit : '—') + '</span></p></div>' +

      '<div class="field">' +
      '<label for="adj-unit">Unit <span class="req" aria-hidden="true">*</span></label>' +
      '<input type="text" id="adj-unit" name="unit" value="' + E(item ? item.unit : '') + '" readonly aria-describedby="adj-unit-hint">' +
      '<p class="field-hint" id="adj-unit-hint">The unit comes from the item and cannot be changed here.</p></div>' +

      '<div class="field">' +
      '<label for="adj-qty">Quantity <span class="req" aria-hidden="true">*</span></label>' +
      '<input type="number" id="adj-qty" name="quantity" min="0" step="' + E(step) + '" required ' +
      'value="' + E(startQty) + '" data-live="adjustments.preview" aria-describedby="adj-qty-hint">' +
      '<p class="field-hint" id="adj-qty-hint">Litres may use two decimals. Other units are whole numbers.</p></div>' +
      '</div>' +

      '<div id="adj-return-fields"' + (type.id === 'jobReturn' ? '' : ' hidden') + '>' +
      '<div class="form-grid">' +
      '<div class="field">' +
      '<label for="adj-issue">Original issue <span class="req" aria-hidden="true">*</span></label>' +
      '<select id="adj-issue" name="issueId" data-change="adjustments.preview">' +
      issueOptionsHtml(issues) + '</select>' +
      '<p class="field-hint" id="adj-issue-hint">Only issues that still have material unreturned are listed.</p></div>' +

      '<div class="field">' +
      '<label for="adj-disposition">Disposition <span class="req" aria-hidden="true">*</span></label>' +
      '<select id="adj-disposition" name="disposition" data-change="adjustments.preview">' +
      DISPOSITIONS.map(function (d) {
        return '<option value="' + E(d.value) + '">' + E(d.label) + '</option>';
      }).join('') + '</select>' +
      '<p class="field-hint" id="adj-disposition-hint">A consumed or unusable item is recorded with no stock change.</p></div>' +
      '</div></div>' +

      '<div class="field">' +
      '<label for="adj-reason">Reason <span class="req" aria-hidden="true">*</span></label>' +
      '<textarea id="adj-reason" name="reason" rows="3" required data-live="adjustments.preview" ' +
      'aria-describedby="adj-reason-hint"></textarea>' +
      '<p class="field-hint" id="adj-reason-hint">The reason is stored with the movement and shown in the history.</p></div>' +

      '<div id="adj-applied"></div>' +
      '<div id="adj-preview"></div>' +

      '<div class="form-actions">' +
      '<button type="submit" class="btn btn-primary">Preview adjustment</button>' +
      '<button type="button" class="btn btn-secondary" data-action="adjustments.cancel">Cancel</button>' +
      '</div>' +
      '</form>';
  }

  /**
   * Update the unit, the issue list, the preview, the history and the state
   * of the confirm button. Used on mount and on every change of the form.
   */
  function refresh(root, changed) {
    const scope = root || document;
    const form = scope.querySelector('#adjust-form');
    if (!form) return null;
    const v = readValues(form);
    const item = v.itemId ? Store.item(v.itemId) : null;
    const type = typeById(v.type);
    const changedName = changed && changed.name ? changed.name : '';

    const unitEl = form.querySelector('[name="unit"]');
    if (unitEl) unitEl.value = item ? item.unit : '';

    const onHandEl = form.querySelector('#adj-onhand');
    if (onHandEl) onHandEl.textContent = item ? Util.qty(item.onHand) + ' ' + item.unit : '—';

    const hintEl = form.querySelector('#adj-type-hint');
    if (hintEl) hintEl.textContent = type.hint;

    const returnBox = form.querySelector('#adj-return-fields');
    if (returnBox) returnBox.hidden = type.id !== 'jobReturn';

    const issues = item ? returnableIssues(item.id) : [];
    const issueSel = form.querySelector('[name="issueId"]');
    if (issueSel) {
      const keep = issueSel.value;
      issueSel.innerHTML = issueOptionsHtml(issues);
      if (issues.some(function (r) { return r.issue.id === keep; })) issueSel.value = keep;
    }

    const qtyEl = form.querySelector('[name="quantity"]');
    if (qtyEl) {
      if (changedName === 'type') qtyEl.value = '';
      const touched = changedName === 'type' || changedName === 'itemId' || changedName === 'issueId';
      if (touched || qtyEl.value === '') {
        if (type.id === 'count' && item) qtyEl.value = String(item.onHand);
        else if (type.id === 'jobReturn') {
          const sel = issueSel ? issueSel.value : '';
          const found = issues.filter(function (r) { return r.issue.id === sel; })[0];
          qtyEl.value = found ? String(found.available) : '';
        }
      }
    }

    const res = compute(readValues(form));
    const preview = scope.querySelector('#adj-preview');
    if (preview) preview.innerHTML = previewHtml(res);

    const history = scope.querySelector('#adj-history-body');
    if (history) history.innerHTML = movementRows(res.item ? res.item.id : '');

    const note = scope.querySelector('#adj-history-note');
    if (note) {
      note.textContent = res.item
        ? 'Movements for ' + res.item.name + ', newest first. The ledger is append-only.'
        : 'Movements, newest first. The ledger is append-only.';
    }

    const applied = res.item ? alreadyApplied(res.item.id, res.ledgerType) : false;
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = applied;
    const appliedBox = scope.querySelector('#adj-applied');
    if (appliedBox) {
      appliedBox.innerHTML = applied
        ? '<div class="banner banner-warn" role="note">' + UI.icon('alert', 18) +
          '<div><strong>Already applied</strong><p>A ' + E(res.ledgerType) + ' for ' + E(res.item.name) +
          ' was already recorded in this session, so the confirm button is disabled and the same movement ' +
          'cannot be posted twice.</p></div></div>'
        : '';
    }
    return res;
  }

  /* ---------------- render ---------------- */

  global.DolphinViews = global.DolphinViews || {};

  global.DolphinViews.S16 = {
    render: function (ctx) {
      /* Owner and Manager only. The shell blocks this screen for other roles;
         the view refuses to render as well if it is reached directly. */
      if (ctx.role !== 'Owner' && ctx.role !== 'Manager') return '';

      const state = ctx.state;
      const first = (state.items || [])[0];
      const itemId = ctx.params.itemId || (first ? first.id : null);
      const item = itemId ? Store.item(itemId) : null;
      const type = typeById(ctx.params.type || 'count');

      let out = UI.pageHeader({
        title: 'Stock adjustments',
        subtitle: 'Record a count, an opened consumable, a write-off, a supplier return or a job return.',
        actions: UI.btn('Back to inventory', {
          action: 'nav', variant: 'secondary',
          attrs: { nav: 'S10', params: JSON.stringify({ tab: 'inventory' }) }
        })
      });

      out += UI.banner('plain', 'Demo only — nothing is ordered, returned or paid for',
        'Every adjustment appends one movement to the stock ledger and one entry to the activity list. ' +
        'Older movements are never rewritten and the balance never goes below zero.');

      out += UI.card({
        title: 'Stock on hand',
        subtitle: 'Units are kept separate. A low-stock badge appears at or below the reorder level.',
        body: UI.table({
          label: 'Stock on hand',
          head: ['Item', 'Type', 'Unit', 'On hand', 'Reorder level', 'State', 'Movements', ''],
          rows: (state.items || []).map(function (i) {
            const low = Rules.lowStock(i);
            const movements = Rules.itemMovements(i.id).length;
            return [
              E(i.name),
              E(i.type),
              E(i.unit),
              { html: E(Util.qty(i.onHand)), className: 'num' },
              { html: E(Util.qty(i.reorderLevel)), className: 'num' },
              { html: low ? UI.badge('Low stock', 'orange') : UI.badge('In stock', 'green') },
              { html: movements ? E(String(movements)) : '—', className: 'num' },
              {
                html: UI.btn('Adjust', {
                  action: 'adjustments.pickItem', variant: 'quiet',
                  attrs: { itemId: i.id }
                })
              }
            ];
          }),
          empty: 'This scenario has no stock items.'
        })
      });

      out += UI.card({
        title: 'Record an adjustment',
        subtitle: 'Item, unit, quantity and reason are required. The actor and the timestamp come from the demo state.',
        body: formHtml(item, type)
      });

      out += UI.card({
        title: 'Movement history',
        subtitle: 'The ledger is append-only. An adjustment adds a row; it never edits an older one.',
        body: '<p class="note" id="adj-history-note">Movements for ' +
          E(item ? item.name : 'the selected item') + ', newest first. The ledger is append-only.</p>' +
          historyTableHtml(itemId)
      });

      out += UI.card({
        title: 'What an adjustment does',
        body: '<ul class="stack-sm">' +
          '<li>• A count adjustment appends the difference as a new movement. The counted quantity becomes the balance.</li>' +
          '<li>• A consumable opened is deducted once, by hand. Nothing is deducted a second time automatically.</li>' +
          '<li>• A write-off or a supplier return can only deduct stock that is on hand.</li>' +
          '<li>• A recoverable job return needs the original issue and the quantity that is still unreturned.</li>' +
          '<li>• Consumed or unusable material that was already issued is recorded as a disposition with no stock change.</li>' +
          '<li>• Cancelling leaves the balance unchanged. Older movements are never rewritten.</li>' +
          '</ul>'
      });

      return out;
    },

    mount: function (root, ctx) {
      refresh(root, null);
    },

    /* Shared with js/act-adjustments.js: the preview, the validation and the
       append-only guard all use these helpers. */
    api: {
      TYPES: TYPES,
      DISPOSITIONS: DISPOSITIONS,
      CONSUMED_LEDGER: CONSUMED_LEDGER,
      typeById: typeById,
      ledgerFor: ledgerFor,
      compute: compute,
      alreadyApplied: alreadyApplied,
      previewHtml: previewHtml,
      returnableIssues: returnableIssues,
      readValues: readValues,
      refresh: refresh,
      movementRows: movementRows
    }
  };
})(window);
