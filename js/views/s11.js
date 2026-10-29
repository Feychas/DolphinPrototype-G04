/* S11 — Receive stock */
(function (global) {
  'use strict';
  const E = Util.esc;
  global.DolphinViews = global.DolphinViews || {};

  global.DolphinViews.S11 = {
    render: function (ctx) {
      const state = ctx.state;
      const sample = ctx.fixture.sampleInputs.receiptStock;
      const poId = ctx.params.poId || null;
      const po = poId ? (state.purchaseOrders || []).filter(o => o.id === poId)[0] : null;
      const suppliers = (state.suppliers || []).filter(s => s.active !== false);
      const items = state.items || [];

      const supplierId = ctx.params.supplierId || (po ? po.supplierId : sample.supplierId);
      const itemId = ctx.params.itemId || (po ? po.itemId : sample.itemId);
      const quantity = ctx.params.quantity || (po ? String(po.quantity) : String(sample.quantity));
      const unitCost = ctx.params.unitCostMMK || (po ? String(po.unitCostMMK) : String(sample.unitCostMMK));
      const reference = ctx.params.reference || (po ? po.reference : sample.reference);
      const date = Util.dayKey(state.demoNow);

      let out = UI.pageHeader({
        title: 'Receive stock',
        subtitle: 'A goods receipt raises the stock balance by exactly the received quantity.',
        actions: UI.btn('Back to inventory', { action: 'nav', variant: 'secondary', attrs: { nav: 'S10', params: JSON.stringify({ tab: 'inventory' }) } })
      });

      if (po) {
        out += UI.banner('plain', 'Receiving against ' + po.id,
          'Order ' + po.id + ' · ' + po.quantity + ' ' + po.unit + ' at ' + Util.mmk(po.unitCostMMK) + ' MMK. ' +
          'Receiving the full quantity sets the order to Received, a smaller delivery sets it to Partial.');
      }

      out += UI.card({
        title: 'Goods receipt',
        subtitle: 'Every field is required. A repeated supplier, reference and item combination is refused.',
        body: '<form data-form="receipt.save"' + (po ? ' data-po-id="' + E(po.id) + '"' : '') + '>' +
          '<div class="form-grid">' +
          '<div class="field"><label for="gr-supplier">Supplier <span class="req" aria-hidden="true">*</span></label>' +
          '<select id="gr-supplier" name="supplierId" required>' +
          suppliers.map(s => '<option value="' + E(s.id) + '"' + (s.id === supplierId ? ' selected' : '') + '>' +
            E(s.name + ' (' + s.id + ')') + '</option>').join('') +
          '</select></div>' +
          UI.field({ id: 'gr-reference', name: 'reference', label: 'Delivery reference', required: true, value: reference }) +
          UI.field({ id: 'gr-date', name: 'date', label: 'Delivery date', type: 'date', required: true, value: date }) +
          '<div class="field"><label for="gr-item">Item <span class="req" aria-hidden="true">*</span></label>' +
          '<select id="gr-item" name="itemId" required>' +
          items.map(i => '<option value="' + E(i.id) + '"' + (i.id === itemId ? ' selected' : '') + '>' +
            E(i.name + ' (' + i.unit + ', on hand ' + i.onHand + ')') + '</option>').join('') +
          '</select></div>' +
          UI.field({ id: 'gr-qty', name: 'quantity', label: 'Quantity', type: 'number', min: 0.01, step: 1, required: true, value: quantity, attrs: { 'data-live': 'receipt.preview' } }) +
          '<div class="field"><label for="gr-unit">Unit <span class="req" aria-hidden="true">*</span></label>' +
          '<input type="text" id="gr-unit" name="unit" value="piece" readonly>' +
          '<p class="field-hint">The unit comes from the item and cannot be changed here.</p></div>' +
          UI.field({ id: 'gr-cost', name: 'unitCostMMK', label: 'Purchase cost per unit (MMK)', type: 'number', min: 0, step: 1, required: true, value: unitCost, attrs: { 'data-live': 'receipt.preview' } }) +
          '</div>' +
          '<div id="gr-preview" class="banner banner-plain"></div>' +
          '<div class="form-actions">' +
          UI.btn('Record goods receipt', { variant: 'primary', icon: 'check', type: 'submit' }) +
          UI.btn('Cancel', { action: 'nav', variant: 'secondary', attrs: { nav: 'S10', params: JSON.stringify({ tab: 'inventory' }) } }) +
          '</div></form>'
      });

      out += UI.card({
        title: 'Recent goods receipts',
        body: UI.table({
          label: 'Goods receipts',
          head: ['Receipt', 'Supplier', 'Reference', 'Item', 'Quantity', 'Unit cost', 'Total', 'Received'],
          rows: (state.goodsReceipts || []).slice().reverse().map(function (g) {
            const item = Store.item(g.itemId);
            const supplier = Store.supplier(g.supplierId);
            return [
              E(g.id),
              E(supplier ? supplier.name : g.supplierId),
              E(g.reference),
              E(item ? item.name : g.itemId),
              E(g.quantity + ' ' + g.unit),
              { html: Util.mmk(g.unitCostMMK), className: 'num' },
              { html: Util.mmk(g.totalMMK), className: 'num' },
              E(Util.fmtDateTime(g.receivedAt))
            ];
          }),
          empty: 'No goods receipt has been recorded in this session.'
        })
      });

      out += UI.card({
        title: 'What receiving does',
        body: '<ul class="stack-sm">' +
        '<li>• The stock balance rises by the received quantity and the latest purchase cost is updated.</li>' +
        '<li>• One movement and one activity entry are appended. Older movements are never rewritten.</li>' +
        '<li>• A job that is waiting for parts stays waiting until the mechanic issues the material explicitly.</li>' +
        '<li>• Cost snapshots on material that was already issued to a job stay unchanged.</li>' +
        '<li>• The same supplier, reference and item cannot be received twice.</li>' +
        '</ul>'
      });

      return out;
    },

    mount: function (root, ctx) {
      const sel = Util.el('#gr-item');
      const unit = Util.el('#gr-unit');
      if (sel && unit) {
        const syncUnit = function () {
          const item = Store.item(sel.value);
          unit.value = item ? item.unit : '';
        };
        sel.addEventListener('change', syncUnit);
        syncUnit();
      }
      if (global.Actions && global.Actions.live['receipt.preview']) {
        global.Actions.live['receipt.preview'](Util.el('#gr-qty'));
      }
    }
  };
})(window);
