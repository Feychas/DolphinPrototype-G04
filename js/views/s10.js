/* S10 — Inventory, suppliers and purchase orders */
(function (global) {
  'use strict';
  const E = Util.esc;
  global.DolphinViews = global.DolphinViews || {};

  const TABS = [
    { id: 'inventory', label: 'Inventory' },
    { id: 'suppliers', label: 'Suppliers' },
    { id: 'orders', label: 'Purchase orders' }
  ];

  global.DolphinViews.S10 = {
    render: function (ctx) {
      const state = ctx.state;
      const tab = ctx.params.tab || 'inventory';

      let out = UI.pageHeader({
        title: 'Inventory and purchasing',
        subtitle: 'Stock balances, suppliers and demo purchase orders. Nothing is ordered from a real supplier.',
        actions: UI.btn('Receive stock', { action: 'nav', variant: 'primary', icon: 'plus', attrs: { nav: 'S11' } })
      });

      out += UI.tabs(TABS, tab, 'inventory');

      if (tab === 'suppliers') return out + suppliersTab(ctx);
      if (tab === 'orders') return out + ordersTab(ctx);
      return out + inventoryTab(ctx);
    }
  };

  /* ---------------- inventory ---------------- */
  function inventoryTab(ctx) {
    const state = ctx.state;
    const items = state.items || [];
    const totalValue = Util.sum(items, function (i) {
      return i.onHand * (i.latestPurchaseCostMMK || 0);
    });
    const low = items.filter(Rules.lowStock);

    let out = '<div class="action-bar">' +
      '<div class="field field-inline"><label class="sr-only" for="inv-search">Search items</label>' +
      '<input type="search" id="inv-search" placeholder="Search item, brand or supplier" data-live="inventory.search"></div>' +
      '<div class="field field-inline"><label class="sr-only" for="inv-type">Filter by type</label>' +
      '<select id="inv-type" data-change="inventory.type">' +
      '<option value="all">All types</option>' +
      '<option value="Part">Parts</option>' +
      '<option value="Oil">Oil</option>' +
      '<option value="Consumable">Consumables</option>' +
      '</select></div>' +
      '<span class="muted small" id="inv-count">' + items.length + ' items</span>' +
      '</div>';

    out += UI.card({
      title: 'Stock on hand',
      subtitle: 'Units are kept separate. A low-stock badge appears at or below the reorder level.',
      body: '<div class="table-scroll"><table class="data-table"><caption class="sr-only">Inventory items</caption>' +
        '<thead><tr><th scope="col">Item</th><th scope="col">Type</th><th scope="col">Brand / grade</th>' +
        '<th scope="col">Unit</th><th scope="col">On hand</th><th scope="col">Reorder level</th>' +
        '<th scope="col">Supplier</th><th scope="col">State</th><th scope="col">Actions</th></tr></thead><tbody>' +
        items.map(function (i) {
          const supplier = i.supplierId ? Store.supplier(i.supplierId) : null;
          const hay = [i.name, i.type, i.brand, i.grade, i.unit, supplier ? supplier.name : ''].join(' ');
          const lowStock = Rules.lowStock(i);
          return '<tr data-item-row data-type="' + E(i.type) + '" data-search="' + E(hay) + '">' +
            '<th scope="row">' + E(i.name) + '</th>' +
            '<td>' + E(i.type) + '</td>' +
            '<td>' + E([i.brand, i.grade].filter(Boolean).join(' · ') || '—') + '</td>' +
            '<td>' + E(i.unit) + '</td>' +
            '<td class="num">' + E(String(i.onHand)) + '</td>' +
            '<td class="num">' + E(String(i.reorderLevel)) + '</td>' +
            '<td>' + E(supplier ? supplier.name + ' (' + supplier.id + ')' : '—') + '</td>' +
            '<td>' + (lowStock ? UI.badge('Low stock', 'orange') : UI.badge('In stock', 'green')) + '</td>' +
            '<td class="row-actions">' +
            UI.btn('Movements', { action: 'inventory.movements', variant: 'quiet', attrs: { itemId: i.id } }) +
            UI.btn('Receive', { action: 'nav', variant: 'quiet', attrs: { nav: 'S11' } }) +
            UI.btn('Adjust', { action: 'nav', variant: 'quiet', attrs: { nav: 'S16' } }) +
            '</td></tr>';
        }).join('') + '</tbody></table></div>',
      actions: UI.btn('Stock adjustments', { action: 'nav', variant: 'secondary', attrs: { nav: 'S16' } })
    });

    out += UI.card({
      title: 'Stock summary',
      body: UI.dl([
        ['Items', items.length],
        ['Low stock items', low.length ? low.map(i => i.name + ' (' + i.onHand + ' ' + i.unit + ')').join(', ') : 'None'],
        ['Estimated stock value', Util.mmk(totalValue) + ' MMK (on hand × latest purchase cost)'],
        ['Goods receipts recorded', (ctx.state.goodsReceipts || []).length]
      ]) + '<p class="note">The estimate uses the latest purchase cost of each item. It is a demo figure, not a valuation.</p>'
    });

    return out;
  }

  /* ---------------- suppliers ---------------- */
  function suppliersTab(ctx) {
    const state = ctx.state;
    const suppliers = state.suppliers || [];

    let out = UI.card({
      title: 'Suppliers',
      subtitle: 'Two sample suppliers are supplied with the demo data. Archiving keeps the existing records.',
      body: UI.table({
        label: 'Suppliers',
        head: ['ID', 'Name', 'Contact', 'State', ''],
        rows: suppliers.map(function (s) {
          const active = s.active !== false;
          return [
            E(s.id),
            E(s.name),
            E(s.contact || '—'),
            { html: active ? UI.badge('Active', 'green') : UI.badge('Archived', 'grey') },
            {
              html: UI.btn('Edit', { action: 'supplier.edit', variant: 'quiet', attrs: { supplierId: s.id } }) +
                UI.btn(active ? 'Archive' : 'Restore', { action: 'supplier.archive', variant: 'quiet', attrs: { supplierId: s.id } })
            }
          ];
        })
      })
    });

    out += UI.card({
      title: 'Add a supplier',
      subtitle: 'A demo record only. No supplier is contacted.',
      body: '<form data-form="supplier.save">' +
        '<div class="form-grid">' +
        UI.field({ id: 'sup-name', name: 'name', label: 'Supplier name', required: true, value: 'Demo Parts Supply' }) +
        UI.field({ id: 'sup-contact', name: 'contact', label: 'Contact note', required: true, value: 'Supplier C - demonstration' }) +
        '</div>' +
        '<div class="form-actions">' + UI.btn('Add supplier', { variant: 'primary', icon: 'plus', type: 'submit' }) + '</div>' +
        '</form>'
    });

    return out;
  }

  /* ---------------- purchase orders ---------------- */
  function ordersTab(ctx) {
    const state = ctx.state;
    const orders = state.purchaseOrders || [];
    const sample = ctx.fixture.sampleInputs.supplierOrder;

    let out = UI.card({
      title: 'Purchase orders',
      subtitle: 'An order with status Ordered never changes the stock balance. Receiving against it opens the receive screen.',
      body: orders.length ? UI.table({
        label: 'Purchase orders',
        head: ['Order', 'Supplier', 'Item', 'Quantity', 'Unit cost', 'Total', 'Status', ''],
        rows: orders.map(function (o) {
          const item = Store.item(o.itemId);
          const supplier = Store.supplier(o.supplierId);
          const tone = o.status === 'Received' ? 'green' : o.status === 'Partial' ? 'orange' : 'blue';
          return [
            E(o.id),
            E(supplier ? supplier.name : o.supplierId),
            E(item ? item.name : o.itemId),
            E(o.quantity + ' ' + o.unit),
            { html: Util.mmk(o.unitCostMMK), className: 'num' },
            { html: Util.mmk(o.totalMMK), className: 'num' },
            { html: UI.badge(o.status, tone) },
            { html: o.status === 'Received' ? '<span class="muted small">Complete</span>' : UI.btn('Receive', { action: 'po.receive', variant: 'secondary', attrs: { poId: o.id } }) }
          ];
        })
      }) : '<div class="empty-state"><p>No purchase order has been created in this session.</p></div>'
    });

    out += UI.card({
      title: 'Create a demo order',
      subtitle: 'Sample values: five brake pieces at 12,000 MMK from ' + sample.supplierId + ' = 60,000 MMK.',
      body: '<form data-form="po.create">' +
        '<div class="form-grid">' +
        '<div class="field"><label for="po-supplier">Supplier <span class="req" aria-hidden="true">*</span></label>' +
        '<select id="po-supplier" name="supplierId" required>' +
        (state.suppliers || []).filter(s => s.active !== false).map(s =>
          '<option value="' + E(s.id) + '"' + (s.id === sample.supplierId ? ' selected' : '') + '>' + E(s.name) + ' (' + E(s.id) + ')</option>').join('') +
        '</select><p class="field-hint">Archived suppliers are not listed here, but old records still name them.</p></div>' +
        '<div class="field"><label for="po-item">Item <span class="req" aria-hidden="true">*</span></label>' +
        '<select id="po-item" name="itemId" required>' +
        (state.items || []).map(i => '<option value="' + E(i.id) + '"' + (i.id === sample.itemId ? ' selected' : '') + '>' +
          E(i.name + ' (' + i.unit + ')') + '</option>').join('') +
        '</select></div>' +
        UI.field({ id: 'po-qty', name: 'quantity', label: 'Quantity', type: 'number', min: 1, step: 1, required: true, value: sample.quantity }) +
        UI.field({ id: 'po-cost', name: 'unitCostMMK', label: 'Purchase cost per unit (MMK)', type: 'number', min: 0, step: 1, required: true, value: sample.unitCostMMK }) +
        UI.field({ id: 'po-ref', name: 'reference', label: 'Order reference', required: true, value: sample.reference }) +
        '</div>' +
        '<div class="form-actions">' + UI.btn('Create order', { variant: 'primary', icon: 'plus', type: 'submit' }) + '</div>' +
        '</form>' +
        '<p class="note">Creating an order does not send anything to a supplier and does not change the stock balance.</p>'
    });

    return out;
  }
})(window);
