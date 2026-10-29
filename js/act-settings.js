/* js/act-settings.js — actions for S20 Demo settings and presentation controls.

   These actions only change the in-memory demo state. They never write to
   storage, never touch a receipt, payment or job, and never talk to a
   service. The production requirements are a read-only panel with no
   actions at all. */
(function (global) {
  'use strict';

  const Actions = global.Actions;

  /* Same validation pattern as js/actions.js — errors next to the fields,
     a warning toast, and no state change when something is invalid. */
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
     Bays — names and enabled flags
     ======================================================================= */

  Actions.submit['settings.bays'] = function (form) {
    const v = Actions.values(form);
    const errors = {};
    const bays = Store.state.bays || [];
    const changes = [];

    bays.forEach(function (bay) {
      const nameKey = 'bayName-' + bay.id;
      const enabledKey = 'bayEnabled-' + bay.id;
      const raw = v[nameKey] === undefined ? '' : String(v[nameKey]);
      const name = raw.trim();
      if (!name) errors[nameKey] = 'Enter a name for this bay.';
      else if (name.length > 40) errors[nameKey] = 'Use 40 characters or fewer.';
      const enabled = !!v[enabledKey];
      if (bay.enabled && !enabled) {
        const occupant = Rules.bayOccupant(bay.id);
        if (occupant) {
          errors[enabledKey] = 'This bay has ' + occupant.id + ' in it. Move or close that job before switching the bay off.';
        }
      }
      changes.push({ bay: bay, name: name, enabled: enabled });
    });

    if (Object.keys(errors).length) {
      /* A rejected bay stays enabled in the demo state, so the switch is put
         back: the screen must not show the bay as off while the state still
         has it on. */
      bays.forEach(function (bay) {
        const el = form.querySelector('[name="bayEnabled-' + bay.id + '"]');
        if (el && el.type === 'checkbox') el.checked = !!bay.enabled;
      });
      fail(form, errors, 'Check the bay settings.');
      return;
    }

    changes.forEach(function (c) {
      c.bay.name = c.name;
      c.bay.enabled = c.enabled;
    });
    Store.log('Settings', 'Bay settings saved — ' + changes.map(function (c) {
      return c.bay.id + ' "' + c.name + '" ' + (c.enabled ? 'enabled' : 'switched off');
    }).join(', ') + '.');
    ok('Bay settings saved in the demo state. Nothing was written to storage.');
  };

  Actions.click['settings.reset'] = function () {
    App.confirmDialog({
      title: 'Reset the demo values?',
      message: 'The bay names, the enabled flags and the language go back to the fixture values for this scenario. Nothing else changes.',
      confirmLabel: 'Reset demo values',
      onConfirm: function () {
        const fixture = Store.scenario().state || {};
        const fixtureBays = Util.deepCopy(fixture.bays || []);
        (Store.state.bays || []).forEach(function (bay, i) {
          const fb = fixtureBays[i];
          if (!fb) return;
          bay.name = fb.name;
          bay.enabled = fb.enabled;
        });
        Store.state.language = fixture.language || 'EN';
        Store.log('Settings', 'Demo settings reset to the fixture values for scenario ' + Store.scenarioId + '.');
        ok('Demo settings reset to the fixture values.');
      }
    });
  };

  /* =======================================================================
     Language preview — redraws the preview without a full render so the
     unsaved bay names are not thrown away.
     ======================================================================= */

  Actions.live['settings.language'] = function (el) {
    const lang = el.value === 'MM' ? 'MM' : 'EN';
    Store.state.language = lang;

    const en = Util.el('#lang-en');
    const mm = Util.el('#lang-mm');
    if (en) en.classList.toggle('lang-active', lang !== 'MM');
    if (mm) mm.classList.toggle('lang-active', lang === 'MM');

    const holder = Util.el('#settings-language-preview');
    const view = global.DolphinViews && global.DolphinViews.S20;
    if (holder && view && view.languagePreview) holder.innerHTML = view.languagePreview(lang);
  };
})(window);
