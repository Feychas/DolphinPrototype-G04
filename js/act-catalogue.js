/* Dolphin AutoTrack prototype — S15 Catalogue, promotions and discount requests.
   Prices, promotions and discount decisions are simulated demo records kept in
   memory only. Nothing is charged, no customer is contacted and no supplier is
   involved. The demo clock (Store.now) is the only clock. */
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

  function money(n) { return Util.mmk(n) + ' MMK'; }

  function whole(raw) {
    const n = Util.parseIntStrict(raw === undefined || raw === null ? '' : raw);
    return isFinite(n) ? n : NaN;
  }

  function nextId(state, kind, prefix, width) {
    let max = 0;
    const list = kind === 'service' ? (state.services || [])
      : kind === 'promotion' ? (state.promotions || [])
        : (state.discountRequests || []);
    list.forEach(function (item) {
      const m = /(\d+)\s*$/.exec(item.id || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return prefix + String(max + 1).padStart(width, '0');
  }

  function isRepairService(serviceId) {
    const s = serviceId ? Store.service(serviceId) : null;
    return !!(s && s.isRepairForDemo);
  }

  /* =======================================================================
     Services
     ===================================================================== */

  function serviceFormHtml(service) {
    const isSize = service ? (service.priceBySizeMMK && !service.fixedPriceMMK) : false;
    const fixed = service ? (service.fixedPriceMMK === null || service.fixedPriceMMK === undefined ? '' : service.fixedPriceMMK) : '';
    const bySize = service && service.priceBySizeMMK ? service.priceBySizeMMK : {};
    const size = function (k) { return bySize[k] === undefined || bySize[k] === null ? '' : bySize[k]; };
    return '<form id="catalogue-service-form">' +
      '<div class="field"><label for="svc-name-en">Service name (English) <span class="req" aria-hidden="true">*</span></label>' +
      '<input type="text" id="svc-name-en" name="nameEN" required value="' + E(service ? service.nameEN : '') + '"></div>' +
      '<div class="field"><label for="svc-name-mm">Service name (Myanmar)</label>' +
      '<input type="text" id="svc-name-mm" name="nameMM" value="' + E(service ? service.nameMM : '') + '">' +
      '<p class="field-hint">Myanmar preview — partial translation. Leave empty to fall back to English.</p></div>' +
      '<div class="field"><label for="svc-mode">Pricing</label>' +
      '<select id="svc-mode" name="pricingMode" data-change="catalogue.pricingModeChanged">' +
      '<option value="fixed"' + (isSize ? '' : ' selected') + '>Fixed price (one amount)</option>' +
      '<option value="sizes"' + (isSize ? ' selected' : '') + '>By vehicle size (S, M and L required)</option>' +
      '</select></div>' +
      '<div class="field" id="svc-fixed-wrap"' + (isSize ? ' hidden' : '') + '>' +
      '<label for="svc-fixed">Fixed price (MMK)</label>' +
      '<input type="number" id="svc-fixed" name="fixedPrice" min="0" step="1" value="' + E(fixed) + '"></div>' +
      '<div id="svc-size-wrap"' + (isSize ? '' : ' hidden') + '>' +
      '<div class="form-grid form-grid-3">' +
      '<div class="field"><label for="svc-price-s">Size S price (MMK)</label>' +
      '<input type="number" id="svc-price-s" name="priceS" min="0" step="1" value="' + E(size('S')) + '"></div>' +
      '<div class="field"><label for="svc-price-m">Size M price (MMK)</label>' +
      '<input type="number" id="svc-price-m" name="priceM" min="0" step="1" value="' + E(size('M')) + '"></div>' +
      '<div class="field"><label for="svc-price-l">Size L price (MMK)</label>' +
      '<input type="number" id="svc-price-l" name="priceL" min="0" step="1" value="' + E(size('L')) + '"></div>' +
      '</div></div>' +
      '<label class="check"><input type="checkbox" name="isRepairForDemo"' +
      (service && service.isRepairForDemo ? ' checked' : '') + '> <span>Counts as repair work for the demo ' +
      '(it is part of the 50,000 MMK approval basis)</span></label>' +
      '</form>';
  }

  Actions.live['catalogue.pricingModeChanged'] = function (el) {
    const fixed = document.getElementById('svc-fixed-wrap');
    const sizes = document.getElementById('svc-size-wrap');
    if (!fixed || !sizes) return;
    const bySize = el.value === 'sizes';
    fixed.hidden = bySize;
    sizes.hidden = !bySize;
    const fixedInput = document.getElementById('svc-fixed');
    if (fixedInput) fixedInput.disabled = bySize;
    ['svc-price-s', 'svc-price-m', 'svc-price-l'].forEach(function (id) {
      const input = document.getElementById(id);
      if (input) input.disabled = !bySize;
    });
  };

  function readServiceForm(form) {
    const v = values(form);
    const errors = {};
    const mode = v.pricingMode === 'sizes' ? 'sizes' : 'fixed';
    if (!v.nameEN || !v.nameEN.trim()) errors.nameEN = 'The English service name is required.';
    let fixedPrice = null;
    let bySize = null;
    if (mode === 'fixed') {
      fixedPrice = whole(v.fixedPrice);
      if (!isFinite(fixedPrice) || fixedPrice < 0) errors.fixedPrice = 'Enter a whole price of zero or more.';
    } else {
      bySize = {};
      ['S', 'M', 'L'].forEach(function (k) {
        const n = whole(v['price' + k]);
        if (!isFinite(n) || n < 0) errors['price' + k] = 'Size ' + k + ' needs a whole price of zero or more.';
        else bySize[k] = n;
      });
    }
    return { values: v, mode: mode, fixedPrice: fixedPrice, bySize: bySize, errors: errors };
  }

  Actions.click['catalogue.addService'] = function () {
    if (!Store.isManagerial()) {
      App.toast('Only the Owner or a Manager can change the catalogue.', 'warn');
      return;
    }
    App.modal({
      title: 'Add a service',
      body: '<p>New services are available to new jobs only. Existing job and receipt snapshots stay unchanged.</p>' +
        serviceFormHtml(null),
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Add service', variant: 'primary', onClick: function () {
            const form = document.getElementById('catalogue-service-form');
            const read = readServiceForm(form);
            if (Object.keys(read.errors).length) {
              fail(form, read.errors, 'The service was not added.');
              return;
            }
            const state = Store.state;
            const service = {
              id: nextId(state, 'service', 'SVC-', 2),
              nameEN: read.values.nameEN.trim(),
              nameMM: (read.values.nameMM || '').trim(),
              priceBySizeMMK: read.mode === 'sizes' ? read.bySize : null,
              fixedPriceMMK: read.mode === 'fixed' ? read.fixedPrice : null,
              isRepairForDemo: !!read.values.isRepairForDemo,
              active: true,
              priceVersion: 1,
              priceBasis: 'Demo catalogue entry; not verified live pricing'
            };
            state.services.push(service);
            Store.log('Catalogue', 'Service ' + service.id + ' (' + service.nameEN + ') added.');
            App.closeModal();
            ok('Service ' + service.nameEN + ' added as ' + service.id + '.');
          }
        }
      ]
    });
  };

  Actions.click['catalogue.editService'] = function (el) {
    if (!Store.isManagerial()) {
      App.toast('Only the Owner or a Manager can change the catalogue.', 'warn');
      return;
    }
    const service = Store.service(el.getAttribute('data-service-id'));
    if (!service) { App.toast('That service is no longer in the demo data.', 'warn'); return; }
    App.modal({
      title: 'Edit service ' + service.id,
      body: '<p>Changing a price increments the demo price version of this service. Job and receipt snapshots that ' +
        'already used the old price stay unchanged; new jobs use the new value.</p>' +
        serviceFormHtml(service),
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Save service', variant: 'primary', onClick: function () {
            const form = document.getElementById('catalogue-service-form');
            const read = readServiceForm(form);
            if (Object.keys(read.errors).length) {
              fail(form, read.errors, 'The service was not changed.');
              return;
            }
            const before = JSON.stringify([service.priceBySizeMMK, service.fixedPriceMMK]);
            service.nameEN = read.values.nameEN.trim();
            service.nameMM = (read.values.nameMM || '').trim();
            service.priceBySizeMMK = read.mode === 'sizes' ? read.bySize : null;
            service.fixedPriceMMK = read.mode === 'fixed' ? read.fixedPrice : null;
            service.isRepairForDemo = !!read.values.isRepairForDemo;
            const after = JSON.stringify([service.priceBySizeMMK, service.fixedPriceMMK]);
            if (before !== after) {
              service.priceVersion = (service.priceVersion || 1) + 1;
              Store.log('Catalogue', 'Service ' + service.id + ' price updated to price version ' + service.priceVersion +
                '. Existing snapshots are unchanged.');
              App.closeModal();
              ok(service.nameEN + ' updated. Price version is now ' + service.priceVersion + '.');
            } else {
              Store.log('Catalogue', 'Service ' + service.id + ' details updated.');
              App.closeModal();
              ok(service.nameEN + ' updated. The price did not change, so the price version stays at ' +
                (service.priceVersion || 1) + '.');
            }
          }
        }
      ]
    });
  };

  Actions.click['catalogue.archiveService'] = function (el) {
    if (!Store.isManagerial()) {
      App.toast('Only the Owner or a Manager can archive a service.', 'warn');
      return;
    }
    const service = Store.service(el.getAttribute('data-service-id'));
    if (!service) { App.toast('That service is no longer in the demo data.', 'warn'); return; }
    const used = (Store.state.jobs || []).filter(function (j) {
      return (j.requestedServiceIds || []).indexOf(service.id) >= 0;
    }).length;
    App.modal({
      title: 'Archive ' + service.nameEN,
      body: '<p>Archiving keeps the service and its history. It stays visible with an <strong>Archived</strong> ' +
        'marker and is not offered for new bookings.</p>' +
        (used ? '<p class="note">' + used + ' job(s) already used this service. Their snapshots stay unchanged.</p>' : '') +
        '<div class="field"><label for="svc-archive-reason">Reason (required)</label>' +
        '<textarea id="svc-archive-reason" name="reason" required></textarea></div>',
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Archive service', variant: 'primary', onClick: function () {
            const reason = (document.getElementById('svc-archive-reason') || {}).value || '';
            if (!reason.trim()) { App.toast('A reason is required to archive a service.', 'warn'); return; }
            service.active = false;
            service.archived = true;
            service.archiveReason = reason.trim();
            service.archivedAt = Store.now();
            service.archivedBy = Store.userId;
            Store.log('Catalogue', 'Service ' + service.id + ' archived: ' + reason.trim());
            App.closeModal();
            ok(service.nameEN + ' archived. It stays visible with an Archived marker.');
          }
        }
      ]
    });
  };

  Actions.click['catalogue.restoreService'] = function (el) {
    if (!Store.isManagerial()) {
      App.toast('Only the Owner or a Manager can restore a service.', 'warn');
      return;
    }
    const service = Store.service(el.getAttribute('data-service-id'));
    if (!service) return;
    service.active = true;
    service.archived = false;
    Store.log('Catalogue', 'Service ' + service.id + ' restored from the archive.');
    ok(service.nameEN + ' restored.');
  };
  /* =======================================================================
     Promotions
     ===================================================================== */

  function promotionFormHtml(promo) {
    const services = Store.state.services || [];
    const chosen = promo ? (promo.serviceIds || []) : [];
    const sizes = promo ? (promo.sizes || []) : ['S', 'M', 'L'];
    const type = promo ? promo.type : 'fixed';
    return '<form id="catalogue-promotion-form">' +
      '<div class="field"><label for="promo-name-en">Promotion name (English) <span class="req" aria-hidden="true">*</span></label>' +
      '<input type="text" id="promo-name-en" name="nameEN" required value="' + E(promo ? promo.nameEN : '') + '"></div>' +
      '<div class="field"><label for="promo-name-mm">Promotion name (Myanmar)</label>' +
      '<input type="text" id="promo-name-mm" name="nameMM" value="' + E(promo ? promo.nameMM : '') + '"></div>' +
      '<div class="form-grid">' +
      '<div class="field"><label for="promo-start">Start date (inclusive) <span class="req" aria-hidden="true">*</span></label>' +
      '<input type="date" id="promo-start" name="startDate" required value="' + E(promo ? promo.startDate : '') + '"></div>' +
      '<div class="field"><label for="promo-end">End date (inclusive) <span class="req" aria-hidden="true">*</span></label>' +
      '<input type="date" id="promo-end" name="endDate" required value="' + E(promo ? promo.endDate : '') + '"></div>' +
      '</div>' +
      '<div class="field"><span class="field-label" id="promo-services-label">Services <span class="req" aria-hidden="true">*</span></span>' +
      '<div class="stack-sm" role="group" aria-labelledby="promo-services-label">' +
      services.map(function (s) {
        const on = chosen.indexOf(s.id) >= 0;
        return '<label class="check"><input type="checkbox" name="serviceIds" value="' + E(s.id) + '"' + (on ? ' checked' : '') + '> ' +
          '<span>' + E(s.nameEN) + '</span></label>';
      }).join('') +
      '</div></div>' +
      '<div class="field"><span class="field-label" id="promo-sizes-label">Vehicle sizes</span>' +
      '<div class="radio-row" role="group" aria-labelledby="promo-sizes-label">' +
      ['S', 'M', 'L'].map(function (k) {
        const on = sizes.indexOf(k) >= 0;
        return '<label><input type="checkbox" name="sizes" value="' + k + '"' + (on ? ' checked' : '') + '> ' + k + '</label>';
      }).join('') +
      '</div><p class="field-hint">Leave every size unticked to apply the promotion to all sizes.</p></div>' +
      '<div class="form-grid">' +
      '<div class="field"><label for="promo-type">Type <span class="req" aria-hidden="true">*</span></label>' +
      '<select id="promo-type" name="type">' +
      '<option value="fixed"' + (type === 'fixed' ? ' selected' : '') + '>Fixed subtraction (MMK off)</option>' +
      '<option value="percent"' + (type === 'percent' ? ' selected' : '') + '>Percentage subtraction (%)</option>' +
      '<option value="setPrice"' + (type === 'setPrice' ? ' selected' : '') + '>Set final price (MMK)</option>' +
      '</select></div>' +
      '<div class="field"><label for="promo-value">Value <span class="req" aria-hidden="true">*</span></label>' +
      '<input type="number" id="promo-value" name="value" min="0" step="1" value="' + E(promo ? promo.value : 0) + '"></div>' +
      '</div>' +
      '<label class="check"><input type="checkbox" name="active"' + (!promo || promo.active ? ' checked' : '') + '> ' +
      '<span>Active</span></label>' +
      '</form>';
  }

  function readPromotionForm(form) {
    const v = values(form);
    const errors = {};
    const serviceIds = Util.els('input[name="serviceIds"]:checked', form).map(function (c) { return c.value; });
    const sizes = Util.els('input[name="sizes"]:checked', form).map(function (c) { return c.value; });
    if (!v.nameEN || !v.nameEN.trim()) errors.nameEN = 'The English promotion name is required.';
    if (!v.startDate) errors.startDate = 'Choose a start date.';
    if (!v.endDate) errors.endDate = 'Choose an end date.';
    if (v.startDate && v.endDate && v.endDate < v.startDate) {
      errors.endDate = 'The end date must be on or after the start date.';
    }
    if (!serviceIds.length) errors.serviceIds = 'Choose at least one service.';
    const value = whole(v.value);
    if (!isFinite(value) || value < 0) errors.value = 'Enter a value of zero or more.';
    else if (v.type === 'percent' && value > 100) errors.value = 'A percentage cannot be above 100.';
    return {
      values: v, serviceIds: serviceIds, sizes: sizes, value: value, errors: errors
    };
  }

  Actions.click['catalogue.addPromotion'] = function () {
    if (!Store.isManagerial()) {
      App.toast('Only the Owner or a Manager can manage promotions.', 'warn');
      return;
    }
    App.modal({
      title: 'Add a promotion',
      body: '<p>One automatic promotion is applied per eligible service line, matched on service, vehicle size ' +
        'and job date. The dates below are inclusive.</p>' + promotionFormHtml(null),
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Add promotion', variant: 'primary', onClick: function () {
            const form = document.getElementById('catalogue-promotion-form');
            const read = readPromotionForm(form);
            if (Object.keys(read.errors).length) {
              fail(form, read.errors, 'The promotion was not added.');
              return;
            }
            const state = Store.state;
            const promo = {
              id: nextId(state, 'promotion', 'PROMO-', 2),
              nameEN: read.values.nameEN.trim(),
              nameMM: (read.values.nameMM || '').trim(),
              startDate: read.values.startDate,
              endDate: read.values.endDate,
              serviceIds: read.serviceIds,
              sizes: read.sizes,
              type: read.values.type,
              value: read.value,
              active: !!read.values.active,
              createdAt: Store.now()
            };
            state.promotions.push(promo);
            Store.log('Promotion', promo.id + ' added (' + promo.type + ' ' + promo.value + ').');
            App.closeModal();
            ok('Promotion ' + promo.id + ' added.');
          }
        }
      ]
    });
  };

  Actions.click['catalogue.editPromotion'] = function (el) {
    if (!Store.isManagerial()) {
      App.toast('Only the Owner or a Manager can manage promotions.', 'warn');
      return;
    }
    const state = Store.state;
    const promo = (state.promotions || []).filter(function (p) { return p.id === el.getAttribute('data-promotion-id'); })[0];
    if (!promo) { App.toast('That promotion is no longer in the demo data.', 'warn'); return; }
    App.modal({
      title: 'Edit promotion ' + promo.id,
      body: '<p>Editing changes only the promotion itself. Receipts that already used it keep their own prices.</p>' +
        promotionFormHtml(promo),
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Save promotion', variant: 'primary', onClick: function () {
            const form = document.getElementById('catalogue-promotion-form');
            const read = readPromotionForm(form);
            if (Object.keys(read.errors).length) {
              fail(form, read.errors, 'The promotion was not changed.');
              return;
            }
            promo.nameEN = read.values.nameEN.trim();
            promo.nameMM = (read.values.nameMM || '').trim();
            promo.startDate = read.values.startDate;
            promo.endDate = read.values.endDate;
            promo.serviceIds = read.serviceIds;
            promo.sizes = read.sizes;
            promo.type = read.values.type;
            promo.value = read.value;
            promo.active = !!read.values.active;
            promo.updatedAt = Store.now();
            Store.log('Promotion', promo.id + ' updated.');
            App.closeModal();
            ok('Promotion ' + promo.id + ' updated. Old receipts keep their own prices.');
          }
        }
      ]
    });
  };

  Actions.click['catalogue.endPromotion'] = function (el) {
    if (!Store.isManagerial()) {
      App.toast('Only the Owner or a Manager can end a promotion.', 'warn');
      return;
    }
    const state = Store.state;
    const promo = (state.promotions || []).filter(function (p) { return p.id === el.getAttribute('data-promotion-id'); })[0];
    if (!promo) { App.toast('That promotion is no longer in the demo data.', 'warn'); return; }
    if (promo.active === false) { App.toast('This promotion is already ended.', 'warn'); return; }
    App.modal({
      title: 'End promotion ' + promo.id,
      body: '<p>Ending the promotion stops it applying to new jobs. It does not change any receipt that was ' +
        'already issued — old prices stay exactly as they were printed.</p>' +
        '<div class="field"><label for="promo-end-reason">Reason (required)</label>' +
        '<textarea id="promo-end-reason" name="reason" required></textarea></div>',
      actions: [
        { label: 'Keep active', variant: 'secondary' },
        {
          label: 'End promotion', variant: 'primary', onClick: function () {
            const reason = (document.getElementById('promo-end-reason') || {}).value || '';
            if (!reason.trim()) { App.toast('A reason is required to end a promotion.', 'warn'); return; }
            promo.active = false;
            promo.endedAt = Store.now();
            promo.endedBy = Store.userId;
            promo.endReason = reason.trim();
            Store.log('Promotion', promo.id + ' ended: ' + reason.trim() + '. Old receipts are unchanged.');
            App.closeModal();
            ok('Promotion ' + promo.id + ' ended. Receipts that already used it are unchanged.');
          }
        }
      ]
    });
  };
  /* =======================================================================
     Discount requests
     ===================================================================== */

  function discountJobs(state) {
    return (state.jobs || []).filter(function (j) {
      return j.paymentStatus === 'Unpaid' && j.lifecycleStatus === 'Open';
    });
  }

  /* Labour lines that may carry a requested manual discount.
     Parts and oil lines are never offered. */
  function discountCandidates(state, jobId) {
    const out = [];
    const job = jobId ? Store.job(jobId) : null;
    if (job) {
      const quote = Store.activeQuote(job);
      if (quote) {
        (quote.lines || []).forEach(function (line) {
          if (line.kind !== 'service') return;
          out.push({
            source: 'quote', quoteVersion: quote.version, lineId: line.id,
            serviceId: line.serviceId || '', label: line.label,
            regularMMK: (line.unitPriceMMK || 0) * (line.quantity || 1),
            blocked: (line.discountMMK || 0) > 0 || !!line.promotionId,
            note: (line.discountMMK || 0) > 0 ? 'automatic promotion already applied' : ''
          });
        });
      }
      (job.committedServiceLines || []).forEach(function (line) {
        if (line.kind !== 'service') return;
        out.push({
          source: 'committed', quoteVersion: '', lineId: line.id,
          serviceId: line.serviceId || '', label: line.label,
          regularMMK: (line.unitPriceMMK || 0) * (line.quantity || 1),
          blocked: (line.discountMMK || 0) > 0 || !!line.promotionId,
          note: (line.discountMMK || 0) > 0 ? 'automatic promotion already applied' : ''
        });
      });
    }
    const sample = ((global.DOLPHIN_FIXTURES || {}).sampleInputs || {}).manualDiscount;
    if (sample) {
      out.push({
        source: 'sample', quoteVersion: '', lineId: '',
        serviceId: sample.serviceId, label: 'Demo sample — Brake repair labour',
        regularMMK: sample.regularMMK, blocked: false,
        note: 'published sample: ' + sample.regularMMK + ' MMK'
      });
    }
    return out;
  }

  function lineKey(c) {
    return c.source + '|' + (c.quoteVersion === '' || c.quoteVersion === null ? '' : c.quoteVersion) +
      '|' + c.lineId + '|' + c.serviceId + '|' + c.regularMMK;
  }

  function parseLineKey(key) {
    if (!key) return null;
    const parts = String(key).split('|');
    if (parts.length < 5) return null;
    return {
      source: parts[0],
      quoteVersion: parts[1] === '' ? null : parseInt(parts[1], 10),
      lineId: parts[2],
      serviceId: parts[3],
      regularMMK: parseInt(parts[4], 10)
    };
  }

  function discountDraft(state) {
    if (!state.discountDraft) {
      const jobs = discountJobs(state);
      const jobId = jobs.length ? jobs[0].id : '';
      const cands = discountCandidates(state, jobId);
      state.discountDraft = {
        jobId: jobId,
        lineKey: cands.length ? lineKey(cands[0]) : '',
        percent: 10,
        reason: ''
      };
    }
    return state.discountDraft;
  }

  function updateDiscountPreview() {
    const el = document.getElementById('dr-preview');
    if (!el) return;
    const draft = discountDraft(Store.state);
    const cand = parseLineKey(draft.lineKey);
    if (!cand) { el.textContent = 'Choose a labour line to see the amounts.'; return; }
    const percent = Util.parseIntStrict(draft.percent);
    if (!isFinite(percent) || percent <= 0 || percent > 100) {
      el.textContent = 'Enter a whole percent between 1 and 100 to see the amounts.';
      return;
    }
    const discount = Util.roundHalfUp(cand.regularMMK * percent / 100);
    const finalMMK = cand.regularMMK - discount;
    const authority = percent > 10 ? 'the Owner (a discount above 10%)' : 'a Manager (10% or less)';
    el.textContent = 'Regular ' + Util.mmk(cand.regularMMK) + ' MMK − ' + Util.mmk(discount) + ' MMK (' +
      percent + '%) = ' + Util.mmk(finalMMK) + ' MMK. Approval needed from ' + authority + '.';
  }

  Actions.live['catalogue.discountJobChanged'] = function (el) {
    const state = Store.state;
    const draft = discountDraft(state);
    draft.jobId = el.value || '';
    const cands = discountCandidates(state, draft.jobId);
    draft.lineKey = cands.length ? lineKey(cands[0]) : '';
    const sel = document.getElementById('dr-line');
    if (sel) {
      sel.innerHTML = cands.length ? cands.map(function (c) {
        const suffix = c.note ? ' — ' + c.note : '';
        return '<option value="' + E(lineKey(c)) + '">' +
          E(c.label + ' — ' + Util.mmk(c.regularMMK) + ' MMK' + suffix) + '</option>';
      }).join('') : '<option value="">No labour line available</option>';
      sel.value = draft.lineKey;
    }
    updateDiscountPreview();
  };

  Actions.live['catalogue.discountChanged'] = function (el) {
    const draft = discountDraft(Store.state);
    if (!el.name) return;
    draft[el.name] = el.value;
    if (el.name === 'lineKey') {
      const sel = document.getElementById('dr-line');
      if (sel) sel.value = el.value;
    }
    updateDiscountPreview();
  };

  function findRequest(state, id) {
    return (state.discountRequests || []).filter(function (r) { return r.id === id; })[0] || null;
  }

  Actions.submit['catalogue.discountRequest'] = function (form) {
    const state = Store.state;
    const v = values(form);
    const errors = {};
    if (!v.jobId) errors.jobId = 'Choose the unpaid job.';
    if (!v.lineKey) errors.lineKey = 'Choose a labour line.';
    const percent = Util.parseIntStrict(v.percent);
    if (!isFinite(percent) || percent <= 0 || percent > 100) {
      errors.percent = 'Enter a whole percent between 1 and 100.';
    }
    if (!v.reason || !v.reason.trim()) errors.reason = 'A reason is required.';

    const job = v.jobId ? Store.job(v.jobId) : null;
    if (v.jobId && !job) errors.jobId = 'That job is no longer in the demo data.';
    else if (job && (job.paymentStatus !== 'Unpaid' || job.lifecycleStatus !== 'Open')) {
      errors.jobId = 'Only an open, unpaid job can carry a discount request.';
    }

    const cand = parseLineKey(v.lineKey);
    if (v.lineKey && !cand) errors.lineKey = 'Choose a labour line.';
    if (cand && job) {
      const quote = Store.activeQuote(job);
      const pool = [];
      if (quote) pool.push.apply(pool, quote.lines || []);
      pool.push.apply(pool, job.committedServiceLines || []);
      const line = pool.filter(function (l) {
        if (l.kind !== 'service') return false;
        if (cand.lineId) return l.id === cand.lineId;
        return !!cand.serviceId && l.serviceId === cand.serviceId &&
          (l.unitPriceMMK || 0) * (l.quantity || 1) === cand.regularMMK;
      })[0];
      if (line && (line.kind === 'part' || line.kind === 'oil')) {
        errors.lineKey = 'A manual discount applies to labour only, never to parts or oil.';
      }
      if (cand.blocked || (line && ((line.discountMMK || 0) > 0 || !!line.promotionId))) {
        errors.lineKey = 'This line already carries an automatic promotion. A manual discount never stacks on it.';
      }
    }

    if (job && cand) {
      const dupe = (state.discountRequests || []).filter(function (r) {
        return r.jobId === job.id && r.serviceId === cand.serviceId &&
          r.regularMMK === cand.regularMMK &&
          (r.status === 'Pending' || (r.status === 'Approved' && !r.appliedQuoteVersion));
      })[0];
      if (dupe) errors.lineKey = 'Request ' + dupe.id + ' already covers this line (' + dupe.status.toLowerCase() + ').';
    }

    if (Object.keys(errors).length) {
      return fail(form, errors, 'The discount request was not submitted. Fix the highlighted fields.');
    }

    const discountMMK = Util.roundHalfUp(cand.regularMMK * percent / 100);
    const finalMMK = cand.regularMMK - discountMMK;
    const rec = {
      id: nextId(state, 'request', 'DR-', 2),
      jobId: job.id,
      quoteVersion: cand.quoteVersion,
      serviceId: cand.serviceId,
      label: cand.label,
      regularMMK: cand.regularMMK,
      percent: percent,
      discountMMK: discountMMK,
      finalMMK: finalMMK,
      requestedBy: Store.userId,
      requestedAt: Store.now(),
      reason: v.reason.trim(),
      status: 'Pending',
      approver: null,
      approvedAt: null,
      decisionReason: null,
      appliedQuoteVersion: null
    };
    if (!state.discountRequests) state.discountRequests = [];
    state.discountRequests.push(rec);
    Store.log('Discount', 'Request ' + rec.id + ' submitted for ' + job.id + ': ' + percent + '% of ' +
      Util.mmk(rec.regularMMK) + ' MMK = ' + Util.mmk(rec.finalMMK) + ' MMK.');
    const draft = discountDraft(state);
    draft.reason = '';
    return ok('Request ' + rec.id + ' submitted: ' + percent + '% of ' + Util.mmk(rec.regularMMK) + ' MMK = ' +
      Util.mmk(rec.finalMMK) + ' MMK. ' +
      (percent > 10 ? 'Owner approval is required.' : 'A Manager may approve it.'));
  };

  function decideDiscount(el, decision) {
    const state = Store.state;
    const rec = findRequest(state, el.getAttribute('data-request-id'));
    if (!rec) { App.toast('That request is no longer in the demo data.', 'warn'); return; }
    if (rec.status !== 'Pending') {
      App.toast('This request was already ' + String(rec.status).toLowerCase() + '.', 'warn');
      return;
    }
    if (!Store.isManagerial()) {
      App.toast('Only the Owner or a Manager can decide a discount request.', 'warn');
      return;
    }
    if (decision === 'Approved' && rec.percent > 10 && !Store.isOwner()) {
      App.toast('A discount above 10% needs the Owner. Switch the demo role to Owner to approve it.', 'warn');
      return;
    }
    const job = Store.job(rec.jobId);
    const body = '<p>Request <strong>' + E(rec.id) + '</strong> on job ' + E(rec.jobId) +
      (job ? ' (' + E((Store.vehicle(job.vehicleId) || {}).plate || '') + ')' : '') + '.</p>' +
      '<ul class="stack-sm">' +
      '<li class="muted">Line</li><li>' + E(rec.label) + '</li>' +
      '<li class="muted">Regular price</li><li>' + E(money(rec.regularMMK)) + '</li>' +
      '<li class="muted">Requested discount</li><li>' + E(rec.percent + '% = ' + money(rec.discountMMK)) + '</li>' +
      '<li class="muted">Price after the discount</li><li>' + E(money(rec.finalMMK)) + '</li>' +
      '<li class="muted">Requested by</li><li>' + E(Store.staffName(rec.requestedBy)) + ' on ' +
      E(Util.fmtDateTime(rec.requestedAt)) + '</li>' +
      '<li class="muted">Reason</li><li>' + E(rec.reason) + '</li>' +
      '</ul>' +
      (decision === 'Approved'
        ? '<p class="note">Applying this discount to an already approved quote creates a new quote version for ' +
          'review. The authorised price is never edited silently.</p>'
        : '') +
      '<div class="field"><label for="discount-decision-reason">Decision note' +
      (decision === 'Approved' ? ' (optional)' : ' (required)') + '</label>' +
      '<textarea id="discount-decision-reason" name="reason"></textarea></div>';
    App.modal({
      title: (decision === 'Approved' ? 'Approve' : 'Reject') + ' discount request ' + rec.id,
      body: body,
      actions: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: decision === 'Approved' ? 'Approve request' : 'Reject request', variant: 'primary',
          onClick: function () {
            const note = (document.getElementById('discount-decision-reason') || {}).value || '';
            if (decision === 'Rejected' && !note.trim()) {
              App.toast('A note is required to reject a discount request.', 'warn');
              return;
            }
            rec.status = decision;
            rec.approver = Store.userId;
            rec.approvedAt = Store.now();
            rec.decisionReason = note.trim();
            Store.log('Discount', 'Request ' + rec.id + ' ' + decision.toLowerCase() + ' by ' +
              Store.user().name + (note.trim() ? ': ' + note.trim() : '.'));
            App.closeModal();
            ok('Request ' + rec.id + ' ' + decision.toLowerCase() + '.');
          }
        }
      ]
    });
  }

  Actions.click['catalogue.approveDiscount'] = function (el) { decideDiscount(el, 'Approved'); };
  Actions.click['catalogue.rejectDiscount'] = function (el) { decideDiscount(el, 'Rejected'); };

  /* Apply an approved discount: a new quote version is created for review. */
  Actions.click['catalogue.applyDiscount'] = function (el) {
    if (!Store.isManagerial()) {
      App.toast('Only the Owner or a Manager can apply an approved discount.', 'warn');
      return;
    }
    const state = Store.state;
    const rec = findRequest(state, el.getAttribute('data-request-id'));
    if (!rec) { App.toast('That request is no longer in the demo data.', 'warn'); return; }
    if (rec.status !== 'Approved') {
      App.toast('Only an approved request can be applied to a quote.', 'warn');
      return;
    }
    if (rec.appliedQuoteVersion) {
      App.toast('This request was already applied as quote v' + rec.appliedQuoteVersion + '.', 'warn');
      return;
    }
    const job = Store.job(rec.jobId);
    if (!job) { App.toast('The job is no longer in the demo data.', 'warn'); return; }
    if (job.paymentStatus === 'Paid' || job.paymentStatus === 'No charge') {
      App.toast('This job is already settled, so a new price version cannot be created.', 'warn');
      return;
    }

    const base = Store.activeQuote(job);
    let version;
    let lines;
    if (base) {
      version = job.quotes.reduce(function (m, q) { return Math.max(m, q.version); }, 0) + 1;
      lines = Util.deepCopy(base.lines || []);
      let target = null;
      lines.forEach(function (l) {
        if (l.kind !== 'service') return;
        if (rec.serviceId && l.serviceId === rec.serviceId &&
          (l.unitPriceMMK || 0) * (l.quantity || 1) === rec.regularMMK) target = l;
      });
      if (target) {
        target.discountMMK = rec.discountMMK;
        target.totalMMK = (target.quantity || 1) * target.unitPriceMMK - rec.discountMMK;
      } else {
        lines.push({
          id: 'Q' + version + '-L' + (lines.length + 1),
          kind: 'service', label: rec.label, quantity: 1,
          unitPriceMMK: rec.regularMMK, discountMMK: rec.discountMMK, totalMMK: rec.finalMMK,
          serviceId: rec.serviceId, repair: isRepairService(rec.serviceId)
        });
      }
    } else {
      version = 1;
      lines = [{
        id: 'Q1-L1', kind: 'service', label: rec.label, quantity: 1,
        unitPriceMMK: rec.regularMMK, discountMMK: rec.discountMMK, totalMMK: rec.finalMMK,
        serviceId: rec.serviceId, repair: isRepairService(rec.serviceId)
      }];
    }

    /* Approval basis is the repair subtotal before the discount and before rounding. */
    const basisLines = Util.deepCopy(lines).map(function (l) {
      return {
        kind: l.kind, quantity: l.quantity, unitPriceMMK: l.unitPriceMMK,
        discountMMK: 0, repair: !!l.repair
      };
    });
    const basis = Rules.approvalBasis(basisLines);
    const needsApproval = Rules.approvalRequired(basis);
    const totals = Rules.totals(lines, 0);
    const quote = {
      version: version,
      isExtraWork: false,
      status: needsApproval ? 'Pending' : 'Approved',
      lines: lines,
      repairApprovalBasisMMK: basis,
      subtotalMMK: totals.subtotalMMK,
      discountMMK: totals.discountMMK,
      roundingMMK: totals.roundingMMK,
      totalMMK: totals.totalMMK,
      inspectionNotes: 'Manual discount ' + rec.id + ' applied — ' + rec.percent + '% of ' +
        Util.mmk(rec.regularMMK) + ' MMK. ' + rec.reason,
      submittedAt: Store.now(),
      discountRequestId: rec.id,
      approval: needsApproval ? null : {
        decision: 'Approved', channel: 'Not required (below threshold)', recordedBy: null,
        recordedAt: Store.now(), note: 'Not required — repair subtotal at or below 50,000 MMK.'
      }
    };
    job.quotes.push(quote);
    job.activeQuoteVersion = version;
    job.approvalStatus = needsApproval ? 'Pending' : 'Not required';
    /* A version that needs no customer approval becomes the authorised work, exactly
       as a normal quote submission does in js/actions.js. A version that still waits
       for approval leaves the previously authorised lines untouched. */
    if (!quote.isExtraWork && quote.status === 'Approved') {
      job.committedServiceLines = Rules.commitLinesFromQuote(quote);
    }
    rec.appliedQuoteVersion = version;
    Store.log('Discount', 'Request ' + rec.id + ' applied to ' + job.id + ' as quote v' + version +
      ' (' + Util.mmk(totals.totalMMK) + ' MMK). The authorised version is unchanged.');
    return ok('Quote v' + version + ' created for ' + job.id + ' — ' + Util.mmk(totals.totalMMK) + ' MMK. ' +
      (needsApproval
        ? 'It waits for customer approval on S08. The earlier authorised version is unchanged.'
        : 'Approval is not required at this subtotal. The earlier authorised version is unchanged.'));
  };
  /* =======================================================================
     Shared helpers used by js/views/s15.js
     ===================================================================== */

  global.DolphinCatalogue = {
    discountJobs: discountJobs,
    discountCandidates: discountCandidates,
    discountDraft: discountDraft,
    lineKey: lineKey,
    parseLineKey: parseLineKey,
    updateDiscountPreview: updateDiscountPreview,
    nextRequestId: function (state) { return nextId(state, 'request', 'DR-', 2); }
  };

  /* =======================================================================
     Role access note
     ---------------------------------------------------------------------
     The Cashier may request a manual discount, so the Discount requests tab
     of S15 is written for the Cashier role as well as Owner and Manager.
     The shell decides which screens a role may open (ACCESS in js/app.js);
     that map is not changed here. To let the demo Cashier reach S15, add
     'Cashier' to ACCESS.S15 in js/app.js. No shell behaviour is patched or
     bypassed from this file.
     ===================================================================== */
})(window);
