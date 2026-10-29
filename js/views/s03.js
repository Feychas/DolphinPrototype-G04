/* S03 — Register customer and vehicle */
(function (global) {
  'use strict';
  const E = Util.esc;
  global.DolphinViews = global.DolphinViews || {};

  global.DolphinViews.S03 = {
    render: function (ctx) {
      const state = ctx.state;
      const sample = ctx.fixture.sampleInputs.registration;
      const mode = ctx.params.mode || sample.customerMode || 'Existing';

      let out = UI.pageHeader({
        title: 'Register customer and vehicle',
        subtitle: 'Add one customer (if new) and one vehicle, then continue to the check-in.',
        actions: UI.btn('Cancel', { action: 'nav', variant: 'secondary', attrs: { nav: 'S02' } })
      });

      out += UI.card({
        title: 'Customer',
        body: '<form id="register-form" data-form="register.save">' +
          '<div class="field"><span class="field-label" id="cm-label">Customer type</span>' +
          '<div class="radio-row" role="radiogroup" aria-labelledby="cm-label">' +
          '<label><input type="radio" name="customerMode" value="Existing" data-change="register.mode"' + (mode === 'Existing' ? ' checked' : '') + '> <span>Existing customer</span></label>' +
          '<label><input type="radio" name="customerMode" value="New" data-change="register.mode"' + (mode === 'New' ? ' checked' : '') + '> <span>New customer</span></label>' +
          '</div></div>' +
          '<div id="existing-customer-block"' + (mode === 'New' ? ' hidden' : '') + '>' +
          '<div class="field"><label for="reg-customer">Existing customer</label>' +
          '<select id="reg-customer" name="customerId">' +
          state.customers.filter(c => !c.archived).map(c => '<option value="' + E(c.id) + '"' + (c.id === sample.customerId ? ' selected' : '') + '>' + E(c.name + ' — ' + c.phone) + '</option>').join('') +
          '</select></div></div>' +
          '<div id="new-customer-block"' + (mode === 'New' ? '' : ' hidden') + '>' +
          '<div class="form-grid">' +
          UI.field({ id: 'reg-new-name', name: 'newName', label: 'Customer name', required: true, value: mode === 'New' ? sample.newCustomerAlternative.name : '' }) +
          UI.field({ id: 'reg-new-phone', name: 'newPhone', label: 'Phone', required: true, value: mode === 'New' ? sample.newCustomerAlternative.phone : '' }) +
          UI.field({ id: 'reg-new-viber', name: 'viber', label: 'Viber (optional)', value: '' }) +
          UI.field({ id: 'reg-new-facebook', name: 'facebook', label: 'Facebook (optional)', value: '' }) +
          '</div></div>' +
          '<hr class="divider">' +
          '<h3 class="card-title">Vehicle</h3>' +
          '<p class="note">The plate number must be unique and the size class must be selected explicitly — it is never inferred from the model name.</p>' +
          '<div class="form-grid-3">' +
          UI.field({ id: 'reg-plate', name: 'plate', label: 'Plate number', required: true, value: sample.plate, placeholder: 'DEMO-030' }) +
          UI.field({ id: 'reg-brand', name: 'brand', label: 'Brand', required: true, value: sample.brand }) +
          UI.field({ id: 'reg-model', name: 'model', label: 'Model', required: true, value: sample.model }) +
          UI.field({ id: 'reg-year', name: 'year', label: 'Year', type: 'number', min: 1900, max: 2026, step: 1, required: true, value: sample.year }) +
          '<div class="field"><label for="reg-size">Size <span class="req" aria-hidden="true">*</span></label>' +
          '<select id="reg-size" name="size" required>' +
          '<option value="">Select size</option>' +
          ['S', 'M', 'L'].map(sz => '<option value="' + sz + '"' + (sz === sample.size ? ' selected' : '') + '>' + sz + '</option>').join('') +
          '</select></div>' +
          '</div>' +
          '<div class="form-actions">' +
          UI.btn('Register and continue to check-in', { variant: 'primary', icon: 'check', type: 'submit' }) +
          UI.btn('Cancel', { action: 'nav', variant: 'secondary', attrs: { nav: 'S02' } }) +
          '</div>' +
          '</form>'
      });

      out += UI.card({
        title: 'Sample values from the source pack',
        body: '<p class="note">Registration sample: ' + E(sample.plate) + ', ' + E(sample.brand + ' ' + sample.model) + ' ' +
          E(String(sample.year)) + ', size ' + E(sample.size) + ', existing customer ' + E(sample.customerId) + '. ' +
          'Optional new customer: ' + E(sample.newCustomerAlternative.name) + ' (' + E(sample.newCustomerAlternative.phone) + ').</p>' +
          '<p class="note">These are demo values. They are not live workshop records.</p>'
      });

      return out;
    },

    mount: function (root) {
      const toggle = function () {
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
      toggle();
    }
  };
})(window);
