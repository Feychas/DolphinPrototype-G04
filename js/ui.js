/* Dolphin AutoTrack prototype — shared UI building blocks.
   Views are plain HTML strings; these helpers keep the look consistent. */
(function (global) {
  'use strict';

  const UI = {};
  const E = Util.esc;

  /* ---------------- icons (inline, decorative) ---------------- */
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
    users2: '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6"/><path d="M18.5 20a6.4 6.4 0 0 0-2.2-4.8"/>',
    clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 11h6M9 15h4"/>',
    car: '<path d="M4 16v2a1 1 0 0 1-1 1H2v-3"/><path d="M22 16v2a1 1 0 0 1-1 1h-1v-3"/><path d="M2 16l1.6-5.2A2 2 0 0 1 5.5 9.6h13a2 2 0 0 1 1.9 1.2L22 16z"/><path d="M6 13h2M16 13h2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M8 3v14"/>',
    receipt: '<path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.4V3z"/><path d="M9 8h6M9 12h6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
    plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.4 2"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.2v.1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
    wrench: '<path d="M14.5 5.5a4 4 0 0 0 5 5L14 16l-3-3z"/><path d="M8.5 18.5 5 22l-3-3 3.5-3.5"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="17" cy="14.5" r="1.3"/>',
    package: '<path d="M3 8l9-4 9 4-9 4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v7H7z"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
    edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/>',
    archive: '<rect x="3" y="5" width="18" height="4" rx="1"/><path d="M5 9v10h14V9"/><path d="M10 13h4"/>'
  };
  UI.icon = function (name, size) {
    const path = ICONS[name] || ICONS.info;
    const s = size || 20;
    return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + '</svg>';
  };

  /* ---------------- badges ---------------- */
  const TONES = {
    blue: 'blue', green: 'green', orange: 'orange', grey: 'grey', red: 'red', amber: 'orange'
  };
  UI.badge = function (text, tone) {
    const t = TONES[tone] || 'grey';
    return '<span class="badge badge-' + t + '"><span class="dot" aria-hidden="true"></span>' + E(text) + '</span>';
  };

  const STATUS_TONES = {
    'Check-in': 'grey',
    'Diagnose/Quote': 'orange',
    'Approved': 'green',
    'In Progress': 'blue',
    'Waiting for Parts': 'orange',
    'Completed': 'green',
    'Cancelled': 'grey',
    'Not required': 'green',
    'Pending': 'orange',
    'Declined': 'red',
    'Unpaid': 'orange',
    'Paid': 'green',
    'No charge': 'green',
    'Review required': 'orange',
    'Not collected': 'orange',
    'Collected': 'grey',
    'Open': 'blue',
    'Closed': 'grey',
    'Booked': 'blue',
    'Requested': 'orange',
    'Arrived': 'blue',
    'No-show': 'grey',
    'Received': 'green',
    'Partial': 'orange',
    'Ordered': 'orange',
    'Active': 'green',
    'Ended': 'grey',
    'In stock': 'green',
    'Low stock': 'orange',
    'Approved v1': 'green'
  };
  UI.toneFor = function (value) { return STATUS_TONES[value] || 'grey'; };
  UI.statusBadge = function (value, extra) {
    const label = extra ? value + ' ' + extra : value;
    return UI.badge(label, UI.toneFor(value));
  };

  /* ---------------- structure ---------------- */
  UI.pageHeader = function (o) {
    return '<header class="page-head">' +
      '<div class="page-head-text">' +
      '<h1>' + E(o.title) + '</h1>' +
      (o.subtitle ? '<p class="page-sub">' + E(o.subtitle) + '</p>' : '') +
      '</div>' +
      (o.actions ? '<div class="page-actions">' + o.actions + '</div>' : '') +
      '</header>';
  };

  UI.card = function (o) {
    const cls = 'card' + (o.className ? ' ' + o.className : '');
    return '<section class="' + cls + '"' + (o.id ? ' id="' + E(o.id) + '"' : '') + '>' +
      (o.title ? '<div class="card-head"><div><h2 class="card-title">' + E(o.title) + '</h2>' +
        (o.subtitle ? '<p class="card-sub">' + E(o.subtitle) + '</p>' : '') + '</div>' +
        (o.actions ? '<div class="card-actions">' + o.actions + '</div>' : '') + '</div>' : '') +
      '<div class="card-body">' + (o.body || '') + '</div>' +
      '</section>';
  };

  UI.buttons = function (o) {
    let out = '';
    if (o.secondary) out += '<button type="button" class="btn btn-secondary"' + (o.secondaryAction ? ' data-action="' + E(o.secondaryAction) + '"' : '') + '>' + o.secondary + '</button>';
    if (o.primary) out += '<button type="button" class="btn btn-primary"' + (o.primaryAction ? ' data-action="' + E(o.primaryAction) + '"' : '') + '>' + o.primary + '</button>';
    return out;
  };

  UI.kpi = function (o) {
    return '<div class="kpi' + (o.tone ? ' kpi-' + o.tone : '') + '">' +
      (o.icon ? '<span class="kpi-icon">' + UI.icon(o.icon, 22) + '</span>' : '') +
      '<div class="kpi-text">' +
      '<span class="kpi-label">' + E(o.label) + '</span>' +
      '<span class="kpi-value">' + (o.valueHtml || E(o.value)) + '</span>' +
      (o.sub ? '<span class="kpi-sub">' + E(o.sub) + '</span>' : '') +
      '</div></div>';
  };

  UI.table = function (o) {
    const head = (o.head || []).map(h => '<th scope="col">' + (h.html || E(h.label !== undefined ? h.label : h)) + '</th>').join('');
    let body;
    if (!o.rows || !o.rows.length) {
      body = '<tr><td class="empty-cell" colspan="' + Math.max(1, (o.head || []).length) + '">' +
        E(o.empty || 'Nothing to show yet.') + '</td></tr>';
    } else {
      body = o.rows.map(function (r) {
        /* a row is either an array of cells or {attr, cells:[...]} */
        const cells = Array.isArray(r) ? r : (r.cells || []);
        const attr = Array.isArray(r) ? '' : (r.attr || '');
        return '<tr' + attr + '>' + cells.map(function (c) {
          const isHead = c && c.head;
          const html = c && c.html !== undefined ? c.html : E(c === null || c === undefined ? '—' : c);
          const cls = c && c.className ? ' class="' + E(c.className) + '"' : '';
          return isHead ? '<th scope="row"' + cls + '>' + html + '</th>' : '<td' + cls + '>' + html + '</td>';
        }).join('') + '</tr>';
      }).join('');
    }
    return '<div class="table-scroll" tabindex="0" role="region" aria-label="' + E(o.label || 'Data table') + '">' +
      '<table class="data-table"><caption class="sr-only">' + E(o.label || 'Data table') + '</caption>' +
      '<thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  };

  UI.empty = function (msg, action) {
    return '<div class="empty-state"><p>' + E(msg) + '</p>' + (action || '') + '</div>';
  };

  UI.banner = function (kind, title, text) {
    const cls = kind === 'warn' ? 'banner-warn' : kind === 'danger' ? 'banner-danger' : kind === 'plain' ? 'banner-plain' : 'banner-info';
    const ic = kind === 'warn' ? 'alert' : kind === 'danger' ? 'alert' : kind === 'plain' ? 'info' : 'info';
    return '<div class="banner ' + cls + '" role="note">' + UI.icon(ic, 20) +
      '<div><strong>' + E(title) + '</strong>' + (text ? '<p>' + text + '</p>' : '') + '</div></div>';
  };

  UI.tabs = function (tabs, active, name) {
    return '<div class="tabs" role="tablist" aria-label="Sections">' + tabs.map(function (t) {
      const on = t.id === active;
      return '<button type="button" role="tab" aria-selected="' + (on ? 'true' : 'false') +
        '" class="tab' + (on ? ' tab-active' : '') + '" data-tab="' + E(t.id) + '"' +
        (name ? ' data-tab-group="' + E(name) + '"' : '') + '>' + E(t.label) + '</button>';
    }).join('') + '</div>';
  };

  UI.chips = function (list) {
    return '<div class="chip-row">' + list.map(function (c) {
      return '<div class="chip chip-' + (c.tone || 'grey') + '">' +
        '<span class="chip-label">' + E(c.label) + '</span>' +
        '<strong class="chip-value">' + (c.valueHtml || E(c.value)) + '</strong></div>';
    }).join('') + '</div>';
  };

  /* ---------------- form controls ---------------- */
  UI.field = function (o) {
    const id = o.id || Util.uid('f');
    const req = o.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
    const describedBy = [];
    if (o.hint) describedBy.push(id + '-hint');
    if (o.error) describedBy.push(id + '-err');
    const desc = describedBy.length ? ' aria-describedby="' + describedBy.join(' ') + '"' : '';
    let control;
    if (o.type === 'textarea') {
      control = '<textarea id="' + id + '" name="' + E(o.name || id) + '" rows="' + (o.rows || 3) + '"' +
        (o.required ? ' required' : '') + (o.disabled ? ' disabled' : '') + desc +
        (o.placeholder ? ' placeholder="' + E(o.placeholder) + '"' : '') + '>' + E(o.value || '') + '</textarea>';
    } else if (o.type === 'select') {
      control = '<select id="' + id + '" name="' + E(o.name || id) + '"' + (o.required ? ' required' : '') +
        (o.disabled ? ' disabled' : '') + desc + '>' +
        (o.options || []).map(function (op) {
          const val = op.value !== undefined ? op.value : op;
          const lab = op.label !== undefined ? op.label : op;
          const sel = String(val) === String(o.value) ? ' selected' : '';
          return '<option value="' + E(val) + '"' + sel + (op.disabled ? ' disabled' : '') + '>' + E(lab) + '</option>';
        }).join('') + '</select>';
    } else if (o.type === 'checkbox') {
      control = '<label class="check"><input type="checkbox" id="' + id + '" name="' + E(o.name || id) + '"' +
        (o.checked ? ' checked' : '') + (o.disabled ? ' disabled' : '') + '> <span>' + E(o.checkLabel || '') + '</span></label>';
    } else {
      control = '<input type="' + E(o.type || 'text') + '" id="' + id + '" name="' + E(o.name || id) + '"' +
        (o.value !== undefined && o.value !== null ? ' value="' + E(o.value) + '"' : '') +
        (o.required ? ' required' : '') + (o.disabled ? ' disabled' : '') +
        (o.readonly ? ' readonly' : '') +
        (o.step ? ' step="' + E(o.step) + '"' : '') +
        (o.min !== undefined ? ' min="' + E(o.min) + '"' : '') +
        (o.max !== undefined ? ' max="' + E(o.max) + '"' : '') +
        (o.inputmode ? ' inputmode="' + E(o.inputmode) + '"' : '') +
        desc + (o.placeholder ? ' placeholder="' + E(o.placeholder) + '"' : '') + '>';
    }
    if (o.type === 'checkbox') {
      return '<div class="field' + (o.error ? ' field-error' : '') + '">' + control +
        (o.error ? '<p class="field-error-text" id="' + id + '-err">' + E(o.error) + '</p>' : '') + '</div>';
    }
    return '<div class="field' + (o.error ? ' field-error' : '') + '">' +
      '<label for="' + id + '">' + E(o.label) + req + '</label>' + control +
      (o.hint ? '<p class="field-hint" id="' + id + '-hint">' + E(o.hint) + '</p>' : '') +
      (o.error ? '<p class="field-error-text" id="' + id + '-err">' + E(o.error) + '</p>' : '') +
      '</div>';
  };

  UI.actionsRow = function (primary, secondary, tertiary) {
    return '<div class="form-actions">' +
      (primary || '') + (secondary || '') + (tertiary || '') + '</div>';
  };

  UI.btn = function (label, o) {
    o = o || {};
    const cls = 'btn ' + (o.variant || 'primary');
    /* HTML lower-cases attribute names, so camelCase keys are written in kebab-case:
       {jobId: x} becomes data-job-id="x". */
    const attrs = Object.keys(o.attrs || {}).map(function (k) {
      const name = k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      return ' data-' + name + '="' + E(o.attrs[k]) + '"';
    }).join('');
    return '<button type="' + (o.type || 'button') + '" class="' + cls + '"' +
      (o.action ? ' data-action="' + E(o.action) + '"' : '') +
      (o.form ? ' form="' + E(o.form) + '"' : '') + attrs +
      (o.disabled ? ' disabled' : '') + '>' + (o.icon ? UI.icon(o.icon, 18) : '') + '<span>' + E(label) + '</span></button>';
  };

  UI.link = function (label, screen, params, o) {
    o = o || {};
    return '<a href="#" class="link' + (o.className ? ' ' + o.className : '') + '" data-nav="' + E(screen) + '"' +
      (params ? ' data-params=\'' + E(JSON.stringify(params)) + '\'' : '') + '>' + E(label) + '</a>';
  };

  UI.note = function (text, tone) {
    return '<p class="note' + (tone ? ' note-' + tone : '') + '">' + text + '</p>';
  };

  UI.dl = function (pairs) {
    return '<dl class="detail-list">' + pairs.map(function (p) {
      return '<div><dt>' + E(p[0]) + '</dt><dd>' + (p[2] ? p[1] : E(p[1])) + '</dd></div>';
    }).join('') + '</dl>';
  };

  global.UI = UI;
})(window);
