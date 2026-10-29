/* js/act-import.js — actions for S18 import preview.

   The analysis helpers live in js/views/s18.js (window.DolphinS18) so the rows
   on screen and the rows that are written are always the same rows. Nothing
   here uploads a file: the template is generated in the browser and the rows
   come from the demo pack. */
(function (global) {
  'use strict';

  /* The analysis helpers of js/views/s18.js are read when an action runs, so
     the order of the script tags in index.html does not matter. */
  const S = new Proxy({}, {
    get: function (target, key) {
      const value = global.DolphinS18[key];
      return typeof value === 'function' ? value.bind(global.DolphinS18) : value;
    }
  });

  function defOf(el) {
    const typeId = (el && el.getAttribute('data-type')) || (global.Store.params && global.Store.params.type) || 'vehicles';
    return S.typeDef(typeId);
  }

  function toast(message, tone) {
    global.App.toast(message, tone || 'info');
  }

  /* =======================================================================
     Choosing the type and the duplicate decision
     ======================================================================= */

  global.Actions.live['import.type'] = function (el) {
    const input = (el && el.tagName === 'INPUT') ? el : el.querySelector('input');
    const value = input ? input.value : '';
    if (!value) return;
    global.Store.params = global.Store.params || {};
    global.Store.params.type = value;
    global.App.render();
  };

  global.Actions.live['import.choice'] = function (el) {
    const input = (el && el.tagName === 'INPUT') ? el : el.querySelector('input');
    if (!input) return;
    const index = parseInt(input.getAttribute('data-row-index'), 10);
    const value = input.value;
    const def = defOf(input);
    const staged = S.stagingFor(def.id);
    if (!staged) return;
    let touched = false;
    staged.rows.forEach(function (row) {
      if (row.index !== index) return;
      touched = true;
      row.choice = value;
      row.mergeConfirmed = false;
    });
    if (!touched) return;
    S.setStaging(def.id, staged.rows);
    global.App.render();
  };

  /* =======================================================================
     Template download — a Blob in the browser, no network
     ======================================================================= */

  global.Actions.click['import.template'] = function (el) {
    const def = defOf(el);
    const csv = S.csvFor(def);
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'dolphin-' + def.id + '-template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast('The template for ' + def.label + ' was generated in your browser. Nothing was uploaded.');
    } catch (e) {
      toast('The template could not be generated in this browser.', 'warn');
    }
  };

  /* =======================================================================
     Staging
     ======================================================================= */

  global.Actions.click['import.load'] = function (el) {
    const def = defOf(el);
    const rows = S.sampleRows(def);
    S.setStaging(def.id, rows);
    const counts = S.countRows(rows);
    toast('Staged ' + counts.total + ' sample row' + (counts.total === 1 ? '' : 's') + ' for ' +
      def.label + ' — ' + counts.valid + ' valid, ' + counts.duplicate + ' duplicate, ' +
      counts.error + ' error. No record has been changed yet.');
    global.App.render();
  };

  global.Actions.click['import.clear'] = function (el) {
    const def = defOf(el);
    S.clearStaging(def.id);
    toast('The staging preview for ' + def.label + ' was cleared. No record was changed.');
    global.App.render();
  };

  global.Actions.click['import.corrected'] = function (el) {
    const def = defOf(el);
    const staged = S.stagingFor(def.id);
    if (!staged) { toast('Load the sample rows first.', 'warn'); return; }
    const corrected = (S.fixtures()[def.id] || {}).correctedRow3;
    if (!corrected) { toast('This type has no corrected sample row.', 'warn'); return; }
    let replaced = 0;
    const rows = staged.rows.map(function (row) {
      if (row.status !== 'error') return row;
      const fresh = S.analyseRow(def, corrected, row.index);
      fresh.choice = row.choice;
      replaced += 1;
      return fresh;
    });
    if (!replaced) { toast('There is no failing row to correct.', 'warn'); return; }
    S.setStaging(def.id, rows);
    const counts = S.countRows(rows);
    toast('The failing row was replaced with the corrected sample row. ' + counts.valid + ' valid, ' +
      counts.duplicate + ' duplicate, ' + counts.error + ' error.');
    global.App.render();
  };

  global.Actions.click['import.confirmMerge'] = function (el) {
    const def = defOf(el);
    const index = parseInt(el.getAttribute('data-row-index'), 10);
    const staged = S.stagingFor(def.id);
    if (!staged) { toast('There is no staging to confirm.', 'warn'); return; }
    let touched = false;
    staged.rows.forEach(function (row) {
      if (row.index !== index) return;
      touched = true;
      row.mergeConfirmed = true;
    });
    if (!touched) { toast('That row is no longer staged.', 'warn'); return; }
    S.setStaging(def.id, staged.rows);
    toast('The merge for row ' + index + ' is confirmed. It is applied when the import is simulated.');
    global.App.render();
  };

  /* =======================================================================
     Simulating the import
     ======================================================================= */

  global.Actions.click['import.simulate'] = function (el) {
    const def = defOf(el);
    const staged = S.stagingFor(def.id);
    if (!staged) { toast('Load the sample rows first — there is nothing to simulate.', 'warn'); return; }

    const plan = S.planFor(staged.rows);
    if (plan.error > 0) {
      toast('The import is blocked: ' + plan.error + ' row' + (plan.error === 1 ? ' still has' : 's still have') +
        ' an error. Use the corrected sample first.', 'warn');
      return;
    }
    if (plan.needConfirm > 0) {
      toast('The import is blocked: confirm the merge for row' +
        (plan.needConfirm === 1 ? '' : 's') + ' ' +
        staged.rows.filter(function (r) { return r.choice === 'merge' && !r.mergeConfirmed; })
          .map(function (r) { return r.index; }).join(', ') + ' first.', 'warn');
      return;
    }

    const counts = { valid: 0, skipped: 0, merged: 0, errors: 0 };
    const applied = [];

    staged.rows.forEach(function (row) {
      if (row.status === 'error') {
        counts.errors += 1;
        applied.push({ row: row.index, key: String(row.key), action: 'error' });
        return;
      }
      if (row.status === 'duplicate') {
        const existing = S.findExisting(def, row.key);
        if (row.choice === 'merge' && row.mergeConfirmed && existing && !def.historical) {
          Object.keys(row.data).forEach(function (col) {
            if (col === def.keyField) return;
            if (existing[col] === undefined) return;
            existing[col] = row.data[col];
          });
          counts.merged += 1;
          applied.push({ row: row.index, key: String(row.key), action: 'merged', target: existing.id });
          return;
        }
        counts.skipped += 1;
        applied.push({ row: row.index, key: String(row.key), action: 'skipped', target: existing ? existing.id : null });
        return;
      }
      const record = def.make(row.data);
      def.target().push(record);
      counts.valid += 1;
      applied.push({ row: row.index, key: String(row.key), action: 'created', target: record.id });
    });

    const batch = {
      id: global.Store.nextId('importbatch'),
      type: def.id,
      at: global.Store.now(),
      actor: global.Store.userId,
      counts: counts,
      rows: applied
    };
    global.Store.state.importBatches = global.Store.state.importBatches || [];
    global.Store.state.importBatches.push(batch);
    global.Store.log('Import', 'Simulated import ' + batch.id + ' (' + def.label + '): ' +
      counts.valid + ' created, ' + counts.skipped + ' skipped, ' + counts.merged + ' merged, ' +
      counts.errors + ' errors. Paid history was not rewritten.');

    S.clearStaging(def.id);
    toast('Import ' + batch.id + ' simulated: ' + counts.valid + ' created, ' + counts.skipped +
      ' skipped, ' + counts.merged + ' merged. Load the sample rows again to see that the new keys ' +
      'are now recognised.');
    global.App.render();
  };
})(window);
