/* js/views/s20.js — S20 Demo settings and presentation controls (Owner only).

   Everything on this screen is a presentation control for the prototype.
   Values are kept in the in-memory demo state only; nothing is saved to a
   database or to browser storage. */
(function (global) {
  'use strict';

  const E = Util.esc;

  /* ------------------------------------------------------------------ */
  /* Translation dictionary                                               */
  /*                                                                     */
  /* Only the service names carry a supplied Myanmar string (services[].  */
  /* nameMM in the fixture). The interface words below are placeholders    */
  /* kept in a dictionary so the translation can be completed later. Every */
  /* label that is not in the dictionary falls back to English.            */
  /* ------------------------------------------------------------------ */
  const I18N = {
    status: 'partial',
    note: 'Only the service names have a supplied Myanmar string. Every other label falls back to English.',
    en: {
      settings: 'Demo settings',
      language: 'Language preview',
      bays: 'Bays',
      bayName: 'Bay name',
      enabled: 'Enabled',
      role: 'Role preview',
      theme: 'Theme',
      light: 'Light',
      save: 'Save changes',
      reset: 'Reset demo values',
      production: 'Production requirements'
    },
    mm: {
      settings: 'ဒီမိုဒီ ဆက်တင်များ',
      language: 'ဘာသာစကား အကြမ်းဖြစ်',
      bays: 'ဘေးများ',
      bayName: 'ဘေးအမည်',
      enabled: 'ဖွင့်ထားသည်',
      role: 'အခန်း အကြမ်းဖြစ်',
      theme: 'အပြင်အဆင်',
      light: 'အလင်း',
      save: 'ပြောင်းလဲမှုများ သိမ်းဆည်းရန်',
      reset: 'ဒီမိုဒီတန်ဖိုးများ ပြန်လည်သတ်မှတ်ရန်',
      production: 'ထုတ်လုပ်မှု လိုအပ်ချက်များ'
    },
    t: function (key, fallback, lang) {
      const dict = (lang === 'MM' ? this.mm : this.en) || {};
      if (dict[key]) return dict[key];
      if (fallback !== undefined && fallback !== null) return fallback;
      return this.en[key] || key;
    },
    hasMyanmar: function (key) { return !!(this.mm && this.mm[key]); },
    serviceLabel: function (svc, lang) {
      if (!svc) return '—';
      if (lang === 'MM' && svc.nameMM) return svc.nameMM;
      return svc.nameEN || svc.id;
    }
  };
  global.DolphinI18n = I18N;

  const PREVIEW_LABELS = [
    { key: 'language', en: 'Language preview' },
    { key: 'bays', en: 'Bays' },
    { key: 'bayName', en: 'Bay name' },
    { key: 'enabled', en: 'Enabled' },
    { key: 'role', en: 'Role preview' },
    { key: 'theme', en: 'Theme' },
    { key: 'light', en: 'Light' },
    { key: 'save', en: 'Save changes' },
    { key: 'reset', en: 'Reset demo values' },
    { key: 'production', en: 'Production requirements' }
  ];

  const ROLE_ROWS = [
    { role: 'Owner', scope: 'Every screen, including Reports and these demo settings.', note: 'Can change the illustrative commission rule.' },
    { role: 'Manager', scope: 'Day-to-day screens, including Reports.', note: 'Cannot open the demo settings.' },
    { role: 'Cashier', scope: 'Customers, check-in, jobs, receipts, reminders, daily closing.', note: 'No reports and no settings.' },
    { role: 'Mechanic', scope: 'Only the jobs assigned to that mechanic.', note: 'No reports and no settings.' }
  ];

  /* ------------------------------------------------------------------ */
  /* language preview                                                     */
  /* ------------------------------------------------------------------ */

  function languagePreview(lang) {
    const isMM = lang === 'MM';
    const head = isMM
      ? UI.banner('warn', 'Myanmar preview — partial translation',
        E('Only the service names have a supplied Myanmar string. Every other label falls back to English. ' +
          'The Burmese interface words below are placeholders kept in a dictionary so the translation can be completed later — ' +
          'no official workshop wording is claimed and this is not a fully translated interface.'))
      : '<p class="note">English preview. Choose MM to see the supplied Myanmar service labels and the partial-translation notice.</p>';
    const rows = [];
    PREVIEW_LABELS.forEach(function (item) {
      const translated = isMM && I18N.hasMyanmar(item.key);
      rows.push([
        { html: E(item.en), head: true },
        { html: E(translated ? I18N.mm[item.key] : item.en) },
        { html: E(translated ? 'Burmese dictionary (placeholder wording)' : 'English fallback') }
      ]);
    });
    (Store.state.services || []).forEach(function (svc) {
      const hasMM = !!svc.nameMM;
      let source;
      if (!hasMM) source = 'English fallback — no Burmese string supplied';
      else if (isMM) source = 'Fixture services[].nameMM';
      else source = 'English (a Burmese string is supplied)';
      rows.push([
        { html: E(svc.nameEN), head: true },
        { html: E(isMM && hasMM ? svc.nameMM : svc.nameEN) },
        { html: E(source) }
      ]);
    });
    return head + UI.table({
      label: 'Language preview labels',
      head: ['Label', 'Shown in this preview', 'Translation source'],
      rows: rows,
      empty: 'There is nothing to preview.'
    });
  }

  function languageCard(lang) {
    return UI.card({
      title: 'Language preview',
      subtitle: 'See how the interface reads in English or Burmese.',
      body: '<div class="radio-row" role="group" aria-label="Language preview">' +
        '<label class="check"><input type="radio" id="settings-lang-en" name="settingsLanguage" value="EN" data-live="settings.language"' +
        (lang === 'EN' ? ' checked' : '') + '> <span>EN — English</span></label>' +
        '<label class="check"><input type="radio" id="settings-lang-mm" name="settingsLanguage" value="MM" data-live="settings.language"' +
        (lang === 'MM' ? ' checked' : '') + '> <span>MM — မြန်မာဘာသာ</span></label>' +
        '</div>' +
        '<p class="note">Choosing a language changes the labels in this prototype straight away. The EN / MM buttons in the top bar do the same thing.</p>' +
        '<div id="settings-language-preview">' + languagePreview(lang) + '</div>'
    });
  }

  /* ------------------------------------------------------------------ */
  /* bays                                                                */
  /* ------------------------------------------------------------------ */

  function bayBlock(bay) {
    const occupant = Rules.bayOccupant(bay.id);
    const job = occupant ? Store.job(occupant.id) : null;
    const note = occupant
      ? '<p class="note note-warn">' + E(bay.name) + ' has ' + E(occupant.id) + ' in it (' +
        E(job ? job.workStatus : 'open') + '). It cannot be switched off until that job leaves the bay.</p>'
      : '<p class="note">No job is in this bay right now.</p>';
    return '<div>' +
      '<div class="field">' +
      '<label for="bay-name-' + E(bay.id) + '">' + E(bay.name) + ' name</label>' +
      '<input type="text" id="bay-name-' + E(bay.id) + '" name="bayName-' + E(bay.id) + '" value="' +
      E(bay.name) + '" maxlength="40" required>' +
      '</div>' +
      '<div class="field">' +
      '<label class="check"><input type="checkbox" id="bay-enabled-' + E(bay.id) + '" name="bayEnabled-' + E(bay.id) + '"' +
      (bay.enabled ? ' checked' : '') + '> <span>Enabled</span></label>' +
      '</div>' +
      note +
      '</div>';
  }

  function baysCard() {
    const bays = Store.state.bays || [];
    return UI.card({
      title: 'Bays',
      subtitle: 'Rename the demo bays or switch a bay off. The bay board uses these values straight away.',
      body: '<form id="settings-bays" data-form="settings.bays">' +
        '<div class="grid-3">' + bays.map(bayBlock).join('') + '</div>' +
        '<div class="form-actions">' +
        UI.btn('Save changes', { type: 'submit', variant: 'primary' }) +
        UI.btn('Reset demo values', { variant: 'secondary', action: 'settings.reset' }) +
        '</div></form>' +
        '<p class="note">Save stores the values in the in-memory demo state only. Reset restores the fixture bay names, the fixture enabled flags and the fixture language. Refreshing the page or resetting the scenario has the same effect.</p>'
    });
  }

  /* ------------------------------------------------------------------ */
  /* read-only explanation panels                                         */
  /* ------------------------------------------------------------------ */

  function roleCard() {
    return UI.card({
      title: 'Role preview',
      subtitle: 'Explains the role selector in the top bar. This panel is read-only.',
      body: '<p>The role selector in the top bar changes which screens and actions the prototype shows. It is a presentation control, not authentication: ' +
        'no password is asked, no account is created and no session is opened. The activity log still records the demo user who made a change.</p>' +
        UI.table({
          label: 'Role preview scope',
          head: ['Role', 'Can open', 'Notes'],
          rows: ROLE_ROWS.map(function (r) {
            return [
              { html: E(r.role), head: true },
              { html: E(r.scope) },
              { html: E(r.note) }
            ];
          }),
          empty: 'No roles are configured.'
        }) +
        '<p class="note">In a real system each staff member would sign in with their own account and the server would decide what they may do. That is described in the production requirements panel below and is not implemented here.</p>'
    });
  }

  function themeCard() {
    return UI.card({
      title: 'Appearance',
      subtitle: 'Light theme only.',
      body: UI.dl([
        ['Theme', 'Light — the warm ivory theme is fixed'],
        ['Dark theme', 'Out of scope for this prototype'],
        ['Where the theme comes from', 'css/styles.css — one set of colour tokens for the whole prototype']
      ]) +
        '<p class="note">A dark theme control is deliberately not offered here. Nothing on this screen can switch the interface to a dark theme.</p>'
    });
  }

  function productionCard() {
    return UI.card({
      title: 'Production requirements',
      subtitle: 'Read-only explanation. Nothing on this panel is implemented in the prototype.',
      body: '<ul>' +
        '<li><strong>Real user accounts.</strong> Every staff member signs in with their own account. There is no login form and no password in this prototype.</li>' +
        '<li><strong>Automatic sign-out.</strong> A production system signs a user out after 30 minutes of inactivity. Nothing signs you out here.</li>' +
        '<li><strong>Backups and restore.</strong> A production system needs a scheduled backup with a retention period and a tested restore procedure. This prototype stores nothing and has no backup or restore control.</li>' +
        '<li><strong>Server-side authorisation and audit trail.</strong> Rights and the audit trail are enforced by the server. Here the role selector is a presentation control and the activity log is in memory only.</li>' +
        '<li><strong>Scheduled work.</strong> Reminders, stock alerts and report runs are done by a scheduler in production. In this prototype they are calculated on screen from the fixed demo clock of ' +
        E(Util.fmtDateTime(Store.now())) + '.</li>' +
        '</ul>' +
        '<p class="note">This panel is an explanation only. It has no buttons on purpose — there is nothing here for the prototype to run.</p>'
    });
  }

  /* ------------------------------------------------------------------ */
  /* view                                                                */
  /* ------------------------------------------------------------------ */

  global.DolphinViews = global.DolphinViews || {};
  global.DolphinViews.S20 = {
    render: function (ctx) {
      if (!Store.isOwner()) {
        return UI.pageHeader({ title: 'Demo settings', subtitle: 'Owner only.' }) +
          UI.card({
            title: 'Not available for this role',
            body: UI.empty('The demo settings screen is part of the Owner demo view. Use the role preview in the top bar to look at it.')
          });
      }
      const lang = Store.state.language === 'MM' ? 'MM' : 'EN';
      return UI.pageHeader({
        title: 'Demo settings',
        subtitle: 'Presentation controls for the prototype. Every value here is temporary and simulated.'
      }) +
        UI.banner('info', 'Everything on this screen is temporary',
          E('These controls change the in-memory demo state only. Refreshing the page or resetting the scenario restores the fixture values. Nothing is saved to a database or to browser storage, and no real account, payment or message is affected.')) +
        languageCard(lang) +
        baysCard() +
        roleCard() +
        themeCard() +
        productionCard();
    },
    mount: function () { /* no DOM wiring needed */ },
    /* Used by js/act-settings.js to redraw the preview without a full render. */
    languagePreview: languagePreview
  };
})(window);
