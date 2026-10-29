/* js/views/s18.js — S18 import preview (Owner and Manager).

   Every row comes from the demo pack (ctx.fixture.importFixtures). There is no
   file engine and no upload service: "Load sample rows" only fills a staging
   preview, and "Simulate import" writes the staged rows into the simulated
   demo records plus a batch log in state.importBatches.

   The pure helpers are published on window.DolphinS18 so js/act-import.js
   applies exactly the analysis that is shown on screen. */
(function (global) {
  'use strict';

  const E = Util.esc;

  /* =======================================================================
     The six import types
     ======================================================================= */

  const TYPES = [
    {
      id: 'customers',
      label: 'Customers',
      keyField: 'id',
      keyLabel: 'customer id',
      collection: 'customers',
      existing: function () { return Store.state.customers || []; },
      target: function () { return Store.state.customers; },
      make: function (row) {
        return {
          id: row.id,
          name: row.name || '',
          phone: row.phone || '',
          viber: '',
          facebook: '',
          archived: false
        };
      },
      validate: function (row) {
        if (!row.name || !String(row.name).trim()) {
          return ['The customer name is missing — this row cannot be imported.'];
        }
        return [];
      },
      note: 'A customer record is a master record. A merge only updates the customer itself — ' +
        'receipts, payments and job history are never rewritten.'
    },
    {
      id: 'vehicles',
      label: 'Vehicles',
      keyField: 'plate',
      keyLabel: 'plate',
      collection: 'vehicles',
      existing: function () { return Store.state.vehicles || []; },
      target: function () { return Store.state.vehicles; },
      make: function (row) {
        return {
          id: Store.nextId('vehicle'),
          customerId: row.customerId || '',
          plate: row.plate,
          brand: row.brand || '',
          model: row.model || '',
          year: row.year === undefined || row.year === '' ? null : row.year,
          size: row.size || 'M',
          archived: false
        };
      },
      validate: function (row) {
        const problems = [];
        if (!row.customerId || !Store.customer(row.customerId)) {
          problems.push('The customer ' + (row.customerId || '(missing)') +
            ' does not exist — this row cannot be imported.');
        }
        return problems;
      },
      note: 'The plate is the duplicate key. A merge updates the vehicle master record only; ' +
        'the jobs, receipts and payments of that vehicle are left untouched.'
    },
    {
      id: 'inventory',
      label: 'Inventory',
      keyField: 'id',
      keyLabel: 'item id',
      collection: 'items',
      existing: function () { return Store.state.items || []; },
      target: function () { return Store.state.items; },
      make: function (row) {
        return {
          id: row.id,
          name: row.name || '',
          type: row.type || 'Part',
          unit: row.unit || 'piece',
          fractional: false,
          onHand: row.onHand || 0,
          reorderLevel: row.reorderLevel || 0,
          sellPriceMMK: 0,
          latestPurchaseCostMMK: 0,
          supplierId: row.supplierId || null,
          brand: null,
          grade: null
        };
      },
      validate: function (row) {
        if (!row.name || !String(row.name).trim()) {
          return ['The item name is missing — this row cannot be imported.'];
        }
        return [];
      },
      note: 'Imported items start with the quantity of the sample row. No stock movement is ' +
        'replayed, so the stock ledger stays consistent.'
    },
    {
      id: 'suppliers',
      label: 'Suppliers',
      keyField: 'id',
      keyLabel: 'supplier id',
      collection: 'suppliers',
      existing: function () { return Store.state.suppliers || []; },
      target: function () { return Store.state.suppliers; },
      make: function (row) {
        return {
          id: row.id,
          name: row.name || '',
          contact: row.contact || '',
          active: true
        };
      },
      validate: function (row) {
        if (!row.name || !String(row.name).trim()) {
          return ['The supplier name is missing — this row cannot be imported.'];
        }
        return [];
      },
      note: 'Suppliers are only referenced by purchase orders. An import never creates a ' +
        'purchase order and never posts a payment.'
    },
    {
      id: 'services',
      label: 'Services / prices',
      keyField: 'id',
      keyLabel: 'service id',
      collection: 'services',
      existing: function () { return Store.state.services || []; },
      target: function () { return Store.state.services; },
      make: function (row) {
        return {
          id: row.id,
          nameEN: row.nameEN || '',
          nameMM: '',
          priceBySizeMMK: {},
          fixedPriceMMK: row.fixedPriceMMK || 0,
          isRepairForDemo: false,
          active: true,
          priceVersion: 1,
          priceBasis: 'Imported demo price — not a verified live price'
        };
      },
      validate: function (row) {
        if (!row.nameEN || !String(row.nameEN).trim()) {
          return ['The service name is missing — this row cannot be imported.'];
        }
        return [];
      },
      note: 'Prices are demo values, not verified live pricing. A price version is only created ' +
        'by a quote — an import never changes a paid price line.'
    },
    {
      id: 'pastJobs',
      label: 'Past jobs',
      keyField: 'id',
      keyLabel: 'job id',
      collection: null,
      historical: true,
      existing: function () {
        return (Store.state.jobs || []).concat(Store.state.importedHistory || []);
      },
      target: function () {
        if (!Store.state.importedHistory) Store.state.importedHistory = [];
        return Store.state.importedHistory;
      },
      make: function (row) {
        return {
          id: row.id,
          vehicleId: row.vehicleId || '',
          date: row.date || '',
          totalMMK: row.totalMMK || 0,
          paymentStatus: row.paymentStatus || 'Paid',
          historical: true,
          importedAt: Store.now()
        };
      },
      validate: function (row) {
        if (!row.date || !String(row.date).trim()) {
          return ['The date is missing — this row cannot be imported.'];
        }
        return [];
      },
      note: 'Past jobs are read-only history. An import never replays a stock issue, a payment ' +
        'posting, a commission or today’s sales — the row is only listed as history.'
    }
  ];

  /* =======================================================================
     Helpers
     ======================================================================= */

  function fixtures() { return global.DOLPHIN_FIXTURES.importFixtures || {}; }

  function typeDef(id) {
    const hit = TYPES.filter(function (t) { return t.id === id; })[0];
    return hit || TYPES[0];
  }

  function selectedTypeId(ctx) {
    return (ctx && ctx.params && ctx.params.type) || 'vehicles';
  }

  function normKey(def, value) {
    if (def.keyField === 'plate') return Util.normPlate(value);
    return Util.norm(value);
  }

  /** The existing record that already uses this key, if there is one. */
  function findExisting(def, key) {
    if (key === undefined || key === null || !String(key).trim()) return null;
    const wanted = normKey(def, key);
    const list = def.existing() || [];
    for (let i = 0; i < list.length; i += 1) {
      const rec = list[i];
      const recKey = def.keyField === 'plate' ? rec.plate : rec.id;
      if (recKey === undefined || recKey === null) continue;
      if (normKey(def, recKey) === wanted) return rec;
    }
    return null;
  }

  /** Check one row and describe what would happen to it. */
  function analyseRow(def, data, index) {
    const row = {
      index: index,
      data: data,
      key: data[def.keyField],
      status: 'valid',
      messages: [],
      choice: 'skip',
      mergeConfirmed: false,
      corrected: false,
      existingId: null
    };
    const problems = [];
    if (row.key === undefined || row.key === null || !String(row.key).trim()) {
      problems.push('The ' + def.keyLabel + ' is missing — this row cannot be imported.');
    } else {
      const extra = def.validate ? def.validate(data) : [];
      for (let i = 0; i < extra.length; i += 1) problems.push(extra[i]);
    }
    if (problems.length) {
      row.status = 'error';
      row.messages = problems;
      return row;
    }
    const hit = findExisting(def, row.key);
    if (hit) {
      row.status = 'duplicate';
      row.existingId = hit.id;
      row.messages.push('A ' + def.label.toLowerCase() + ' with this ' + def.keyLabel +
        ' already exists (' + hit.id + ').');
    }
    return row;
  }

  /** The sample rows of a type, analysed against the current demo records. */
  function sampleRows(def) {
    const fx = fixtures()[def.id] || {};
    const rows = fx.rows || [];
    return rows.map(function (data, i) { return analyseRow(def, data, i + 1); });
  }

  /** Field by field comparison between the existing record and the staged row. */
  function diffFields(def, row) {
    if (!row || row.status !== 'duplicate') return [];
    const existing = findExisting(def, row.key);
    if (!existing) return [];
    const columns = (fixtures()[def.id] || {}).columns || [];
    return columns.map(function (col) {
      const incoming = row.data[col];
      const current = existing[col];
      const same = String(incoming === undefined || incoming === null ? '' : incoming) ===
        String(current === undefined || current === null ? '' : current);
      return { column: col, incoming: incoming, current: current, same: same };
    });
  }

  function countRows(rows) {
    const counts = { valid: 0, duplicate: 0, error: 0, skipped: 0, merged: 0, total: rows.length };
    (rows || []).forEach(function (r) {
      if (r.status === 'valid') counts.valid += 1;
      else if (r.status === 'duplicate') counts.duplicate += 1;
      else counts.error += 1;
    });
    return counts;
  }

  /* ---------------------------------------------------------------------
     Staging — the temporary preview. It lives in the state so a scenario
     reset clears it, but it never touches a business record.
     --------------------------------------------------------------------- */
  function stagingStore() {
    if (!Store.state.importStaging || typeof Store.state.importStaging !== 'object') {
      Store.state.importStaging = {};
    }
    return Store.state.importStaging;
  }

  function stagingFor(typeId) {
    const store = stagingStore();
    return store[typeId] || null;
  }

  function setStaging(typeId, rows) {
    const store = stagingStore();
    store[typeId] = { type: typeId, at: Store.now(), rows: rows };
    return store[typeId];
  }

  function clearStaging(typeId) {
    const store = stagingStore();
    delete store[typeId];
  }

  /** The header row of the template CSV for a type. */
  function csvFor(def) {
    const columns = (fixtures()[def.id] || {}).columns || [];
    return columns.join(',') + '\n';
  }

  /* __PART2__ */

  /* =======================================================================
     Rendering helpers
     ======================================================================= */

  function statusBadge(row) {
    if (row.status === 'valid') return UI.badge('Valid', 'green');
    if (row.status === 'duplicate') return UI.badge('Duplicate', 'orange');
    return UI.badge('Error', 'red');
  }

  function cellValue(value) {
    if (value === undefined || value === null || value === '') return '<span class="muted">—</span>';
    return E(String(value));
  }

  /** What the import would do with the staged rows right now. */
  function planFor(rows) {
    const plan = { create: 0, skip: 0, merge: 0, error: 0, needConfirm: 0 };
    (rows || []).forEach(function (r) {
      if (r.status === 'error') { plan.error += 1; return; }
      if (r.status === 'duplicate') {
        if (r.choice === 'merge') {
          plan.merge += 1;
          if (!r.mergeConfirmed) plan.needConfirm += 1;
        } else {
          plan.skip += 1;
        }
        return;
      }
      plan.create += 1;
    });
    return plan;
  }

  function planSentence(plan) {
    const bits = [];
    bits.push(plan.create + ' row' + (plan.create === 1 ? '' : 's') + ' will be created');
    bits.push(plan.skip + ' skipped');
    bits.push(plan.merge + ' merged');
    bits.push(plan.error + ' with an error');
    return bits.join(' · ');
  }

  function typeChooser(def) {
    return '<div class="radio-row">' + TYPES.map(function (t) {
      return '<label class="check"><input type="radio" name="importType" value="' + E(t.id) + '"' +
        ' data-live="import.type"' + (t.id === def.id ? ' checked' : '') + '>' +
        '<span>' + E(t.label) + '</span></label>';
    }).join('') + '</div>';
  }

  function stagingTable(def, rows) {
    const columns = (fixtures()[def.id] || {}).columns || [];
    const head = columns.map(function (c) { return { label: c }; });
    head.push({ label: 'Status' });
    head.push({ label: 'Decision' });
    const body = rows.map(function (row) {
      const cells = columns.map(function (c) {
        return { html: cellValue(row.data[c]) };
      });
      cells.push({
        html: statusBadge(row) + (row.messages.length
          ? '<br><span class="muted small">' + E(row.messages.join(' ')) + '</span>' : '')
      });
      let decision;
      if (row.status === 'valid') {
        decision = '<span class="muted">A new record will be created.</span>';
      } else if (row.status === 'error') {
        decision = '<span class="muted">This row is not imported.</span>';
      } else {
        const name = 'choice-row-' + row.index;
        if (def.historical) {
          decision = '<div class="radio-row">' +
            '<label class="check"><input type="radio" name="' + name + '" value="skip" checked disabled>' +
            '<span>Skip</span></label></div>' +
            '<span class="muted small">The existing record ' + E(row.existingId) +
            ' is kept as it is — history is never merged or overwritten.</span>';
        } else {
          decision = '<div class="radio-row">' +
            '<label class="check"><input type="radio" name="' + name + '" value="skip"' +
            ' data-live="import.choice" data-type="' + E(def.id) + '" data-row-index="' + row.index + '"' +
            (row.choice === 'merge' ? '' : ' checked') + '><span>Skip</span></label>' +
            '<label class="check"><input type="radio" name="' + name + '" value="merge"' +
            ' data-live="import.choice" data-type="' + E(def.id) + '" data-row-index="' + row.index + '"' +
            (row.choice === 'merge' ? ' checked' : '') + '><span>Merge</span></label>' +
            '</div><span class="muted small">' + (row.choice === 'merge'
              ? 'The existing record ' + E(row.existingId) + ' is updated with the incoming values.'
              : 'The existing record ' + E(row.existingId) + ' is kept as it is.') + '</span>';
        }
      }
      cells.push({ html: decision });
      return { cells: cells };
    });
    return UI.table({
      label: 'Staged rows for ' + def.label,
      head: head,
      rows: body,
      empty: 'No rows are staged yet.'
    });
  }

  function mergeReview(def, rows) {
    const out = [];
    rows.forEach(function (row) {
      if (row.status !== 'duplicate' || row.choice !== 'merge') return;
      const diffs = diffFields(def, row);
      const table = UI.table({
        label: 'Field differences for row ' + row.index,
        head: [{ label: 'Field' }, { label: 'Current value' }, { label: 'Incoming value' }, { label: 'Change' }],
        rows: diffs.map(function (d) {
          return {
            cells: [
              { html: E(d.column) },
              { html: cellValue(d.current) },
              { html: cellValue(d.incoming) },
              { html: d.same ? '<span class="muted">Same</span>' : UI.badge('Will change', 'orange') }
            ]
          };
        }),
        empty: 'No field differs.'
      });
      out.push('<div class="card card-body" style="margin-bottom:14px">' +
        '<h3 class="card-sub">Row ' + row.index + ' — merge into ' + E(row.existingId) + '</h3>' +
        table +
        (row.mergeConfirmed
          ? '<p class="note">' + UI.badge('Merge confirmed', 'green') +
            ' The merge is applied when the import is simulated. Paid history is never rewritten.</p>'
          : '<div class="action-bar">' +
            UI.btn('Confirm merge for row ' + row.index, {
              variant: 'secondary', action: 'import.confirmMerge', attrs: { rowIndex: row.index }
            }) +
            '<span class="note">A merge is only applied after it is confirmed row by row.</span>' +
            '</div>') +
        '</div>');
    });
    return out.join('');
  }

  function batchLog() {
    const list = (Store.state.importBatches || []).slice().reverse();
    if (!list.length) return UI.empty('No import has been simulated yet.');
    return UI.table({
      label: 'Simulated import batches',
      head: [
        { label: 'Batch' }, { label: 'Type' }, { label: 'When' }, { label: 'By' },
        { label: 'Created' }, { label: 'Skipped' }, { label: 'Merged' }, { label: 'Errors' }, { label: 'Rows' }
      ],
      rows: list.map(function (b) {
        const c = b.counts || {};
        const rows = (b.rows || []).map(function (r) {
          return 'row ' + r.row + ' ' + r.action + (r.target ? ' (' + r.target + ')' : '');
        }).join('<br>') || '—';
        return {
          cells: [
            { html: '<strong>' + E(b.id) + '</strong>' },
            { html: E(b.type) },
            { html: E(Util.fmtDateTime(b.at)) },
            { html: E(Store.staffName(b.actor)) },
            { html: String(c.valid || 0), className: 'num' },
            { html: String(c.skipped || 0), className: 'num' },
            { html: String(c.merged || 0), className: 'num' },
            { html: String(c.errors || 0), className: 'num' },
            { html: rows }
          ]
        };
      })
    });
  }

  /* =======================================================================
     The screen
     ======================================================================= */

  function render(ctx) {
    const def = typeDef(selectedTypeId(ctx));
    const fx = fixtures()[def.id] || {};
    const columns = fx.columns || [];
    const staged = stagingFor(def.id);
    const rows = staged ? staged.rows : [];
    const counts = staged ? countRows(rows) : null;
    const plan = staged ? planFor(rows) : null;
    const corrected = fx.correctedRow3 || null;

    const typeCard = UI.card({
      title: '1 — What do you want to import?',
      subtitle: 'Owner and Manager only. The duplicate key of this type is ' + def.keyLabel + '.',
      body: typeChooser(def) +
        '<p class="note">' + E(def.note) + '</p>'
    });

    const templateCard = UI.card({
      title: '2 — Template and sample rows',
      subtitle: 'The rows come from the demo pack — no file is read and nothing is uploaded.',
      body: '<div class="row">' + columns.map(function (c) {
        return '<span class="tag">' + E(c) + '</span>';
      }).join('') + '</div>' +
        '<p class="note">' + E((fx.rows || []).length) + ' sample row' +
        ((fx.rows || []).length === 1 ? '' : 's') + ' in the demo pack · duplicate key: <strong>' +
        E(fx.duplicateKey || def.keyField) + '</strong></p>' +
        '<div class="action-bar">' +
        UI.btn('Download template', { variant: 'secondary', action: 'import.template', attrs: { type: def.id } }) +
        UI.btn('Load sample rows', { variant: 'primary', action: 'import.load', attrs: { type: def.id } }) +
        (staged ? UI.btn('Clear staging', { variant: 'secondary', action: 'import.clear', attrs: { type: def.id } }) : '') +
        '</div>' +
        '<p class="note">“Load sample rows” only fills the staging preview below — no record is ' +
        'created until the import is simulated. “Download template” gives a CSV with the column ' +
        'headers of this type; it is generated in the browser and is not sent anywhere.</p>'
    });

    let stagingBody;
    if (!staged) {
      stagingBody = UI.empty('No rows are staged yet. Choose “Load sample rows” above.');
    } else {
      stagingBody = '<div class="row">' +
        UI.badge(counts.valid + ' valid', 'green') + ' ' +
        UI.badge(counts.duplicate + ' duplicate', 'orange') + ' ' +
        UI.badge(counts.error + ' error', counts.error ? 'red' : 'grey') +
        '</div>' +
        '<p class="note">Staged ' + E(Util.fmtDateTime(staged.at)) + ' · ' + E(counts.total) +
        ' row' + (counts.total === 1 ? '' : 's') + ' from the demo pack. Nothing has been written yet.</p>' +
        stagingTable(def, rows) +
        mergeReview(def, rows) +
        (corrected && counts.error
          ? '<div class="action-bar">' +
            UI.btn('Use corrected sample', { variant: 'secondary', action: 'import.corrected', attrs: { type: def.id } }) +
            '<span class="note">Replaces the failing row with the corrected row from the demo pack' +
            (corrected.plate ? ' (' + E(corrected.plate) + ')' : '') + '.</span>' +
            '</div>'
          : '');
    }

    const stagingCard = UI.card({
      title: '3 — Staging preview',
      subtitle: 'What each row would do. A duplicate is skipped by default; a merge has to be confirmed row by row.',
      body: stagingBody
    });

    let importBody;
    if (!staged) {
      importBody = UI.empty('Load the sample rows first — there is nothing to simulate yet.');
    } else {
      const blocked = plan.error > 0 || plan.needConfirm > 0;
      const why = plan.error
        ? plan.error + ' row' + (plan.error === 1 ? ' still has' : 's still have') + ' an error. Fix it before importing.'
        : plan.needConfirm
          ? plan.needConfirm + ' merge' + (plan.needConfirm === 1 ? ' still needs' : 's still need') + ' a per-row confirmation.'
          : '';
      importBody = '<div class="row">' +
        (blocked ? UI.badge('Blocked', 'red') : UI.badge('Ready to simulate', 'green')) +
        '<span class="muted">' + E(planSentence(plan)) + '</span></div>' +
        (blocked ? '<p class="note note-warn">' + E(why) + '</p>' : '') +
        '<div class="action-bar">' +
        UI.btn('Simulate import', { variant: 'primary', action: 'import.simulate', attrs: { type: def.id } }) +
        UI.btn('Clear staging', { variant: 'secondary', action: 'import.clear', attrs: { type: def.id } }) +
        '</div>' +
        '<p class="note">The import writes to the simulated demo records and adds a batch log below. ' +
        'It never rewrites a receipt, a payment or a paid price line, and it never replays stock ' +
        'issues or commission. All money and all imports are simulated.</p>';
    }

    const importCard = UI.card({
      title: '4 — Simulate the import',
      subtitle: 'A duplicate is skipped by default, so the sample import creates two records and skips one.',
      body: importBody
    });

    return UI.pageHeader({
      title: 'Import preview',
      subtitle: 'Check every row before it is written to the demo records.',
      actions: UI.badge('Owner / Manager only', 'grey')
    }) +
      UI.banner('plain', 'Simulated import',
        '<p>There is no file engine and no upload service in this prototype. The rows come from the ' +
        'demo pack, the template is generated in the browser, and nothing is sent anywhere. ' +
        'Importing never overwrites paid history: a duplicate is skipped unless you confirm a merge, ' +
        'and past-job rows stay read-only history.</p>') +
      typeCard + templateCard + stagingCard + importCard +
      UI.card({
        title: '5 — Import batch log',
        subtitle: 'Every simulated import with its counts, actor and time.',
        body: batchLog()
      });
  }

  global.DolphinViews = global.DolphinViews || {};
  global.DolphinViews.S18 = {
    render: render
  };

  global.DolphinS18 = {
    TYPES: TYPES,
    typeDef: typeDef,
    selectedTypeId: selectedTypeId,
    fixtures: fixtures,
    findExisting: findExisting,
    analyseRow: analyseRow,
    sampleRows: sampleRows,
    diffFields: diffFields,
    countRows: countRows,
    planFor: planFor,
    stagingFor: stagingFor,
    setStaging: setStaging,
    clearStaging: clearStaging,
    csvFor: csvFor
  };
})(window);
