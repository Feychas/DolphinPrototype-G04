/* S08 — Customer approval */
(function (global) {
  'use strict';
  const E = Util.esc;
  global.DolphinViews = global.DolphinViews || {};

  const CHANNELS = ['Phone', 'Viber', 'Messenger', 'In person'];

  global.DolphinViews.S08 = {
    render: function (ctx) {
      const job = Store.job(ctx.params.jobId);
      if (!job) {
        return UI.pageHeader({ title: 'Customer approval' }) +
          UI.card({ title: 'No job selected', body: '<div class="empty-state"><p>Open a job first.</p>' +
            UI.btn('Go to jobs', { action: 'nav', variant: 'primary', attrs: { nav: 'S06' } }) + '</div>' });
      }
      const vehicle = Store.vehicle(job.vehicleId);
      const customer = vehicle ? Store.customer(vehicle.customerId) : null;
      const canRecord = ctx.role !== 'Mechanic';
      const quotes = job.quotes || [];
      const wanted = ctx.params.version ? parseInt(ctx.params.version, 10) : null;
      const active = Store.quote(job);
      const quote = wanted ? quotes.filter(q => q.version === wanted)[0] : active;
      const isCurrent = !!(quote && quote.version === job.activeQuoteVersion);

      let out = UI.pageHeader({
        title: 'Customer approval',
        subtitle: job.id + ' · ' + (vehicle ? vehicle.plate : '') + ' · ' + (customer ? customer.name : ''),
        actions: UI.btn('Back to job', { action: 'nav', variant: 'secondary', attrs: { nav: 'S06', params: JSON.stringify({ jobId: job.id }) } })
      });

      if (!quotes.length) {
        out += UI.card({
          title: 'No quote to approve',
          body: '<div class="empty-state"><p>Prepare a quote on the Inspection screen first.</p>' +
            UI.btn('Open inspection', { action: 'nav', variant: 'primary', attrs: { nav: 'S07', params: JSON.stringify({ jobId: job.id }) } }) +
            '</div>'
        });
        return out;
      }

      /* version list */
      out += UI.card({
        title: 'Quote versions',
        subtitle: 'The decision is kept against the exact version it was given for.',
        body: UI.table({
          label: 'Quote versions',
          head: ['Version', 'Type', 'Status', 'Total', 'Approval basis', 'Decision', ''],
          rows: quotes.map(function (q) {
            const t = Rules.quoteTotals(q);
            return [
              'v' + q.version,
              q.isExtraWork ? 'Extra work' : 'Initial',
              { html: UI.statusBadge(q.status) },
              { html: Util.mmk(t.totalMMK), className: 'num' },
              { html: Util.mmk(t.repairApprovalBasisMMK), className: 'num' },
              q.approval
                ? E(q.approval.decision) + '<br><span class="muted small">' + E(q.approval.channel || '') +
                  (q.approval.note ? ' · ' + E(q.approval.note) : '') + '</span>'
                : '<span class="muted">Not recorded</span>',
              { html: UI.link('Open', 'S08', { jobId: job.id, version: q.version }) }
            ];
          })
        })
      });

      if (!quote) {
        out += UI.card({ title: 'Version not found', body: '<p>Choose a version above.</p>' });
        return out;
      }

      if (!isCurrent) {
        out += UI.banner('warn', 'Version v' + quote.version + ' has been superseded',
          'This version is kept for the record but it is no longer the current scope. A decision cannot be recorded against a superseded version — create a new proposal instead.');
      }

      const t = Rules.quoteTotals(quote);
      const prev = quotes.filter(q => q.version < quote.version).pop();

      out += '<div class="grid-2">';
      out += '<div>';

      out += UI.card({
        title: 'Version v' + quote.version + (quote.isExtraWork ? ' — extra work' : ' — initial quote'),
        subtitle: 'Submitted ' + Util.fmtDateTime(quote.submittedAt),
        body: UI.table({
          label: 'Quoted scope of version ' + quote.version,
          head: ['Description', 'Source', 'Qty', 'Unit price', 'Amount'],
          rows: (quote.lines || []).map(function (l) {
            const src = l.kind === 'customerMaterial' || l.source === 'Customer' ? 'Customer-supplied'
              : (l.kind === 'part' || l.kind === 'oil') ? 'Shop material' : 'Labour / service';
            return [
              E(l.label),
              E(src),
              E(l.quantity),
              { html: Util.mmk(l.unitPriceMMK), className: 'num' },
              { html: Util.mmk(Rules.lineGross(l)), className: 'num' }
            ];
          })
        }) +
          '<div class="detail-list">' +
          '<div class="detail-row"><span>Subtotal</span><span>' + Util.mmk(t.subtotalMMK) + ' MMK</span></div>' +
          '<div class="detail-row"><span>Rounding</span><span>' + Util.mmk(t.roundingMMK) + ' MMK</span></div>' +
          '<div class="detail-row"><span>Total</span><span><strong>' + Util.mmk(t.totalMMK) + ' MMK</strong></span></div>' +
          '</div>' +
          (quote.inspectionNotes ? '<p class="note">Inspection notes: ' + E(quote.inspectionNotes) + '</p>' : '')
      });

      if (prev) {
        const before = new Set((prev.lines || []).map(l => l.label + '|' + l.quantity + '|' + l.unitPriceMMK));
        const added = (quote.lines || []).filter(l => !before.has(l.label + '|' + l.quantity + '|' + l.unitPriceMMK));
        const removed = (prev.lines || []).filter(l => !(quote.lines || []).some(n =>
          n.label === l.label && n.quantity === l.quantity && n.unitPriceMMK === l.unitPriceMMK));
        out += UI.card({
          title: 'Scope change against v' + prev.version,
          body: UI.dl([
            ['Previous total', Util.mmk(prev.totalMMK) + ' MMK'],
            ['Revised total', Util.mmk(t.totalMMK) + ' MMK'],
            ['Difference', Util.mmk(t.totalMMK - prev.totalMMK) + ' MMK'],
            ['Added lines', added.length ? added.map(l => E(l.label)).join(', ') : 'None'],
            ['Removed lines', removed.length ? removed.map(l => E(l.label)).join(', ') : 'None']
          ]) + '<p class="note">Material already issued under the earlier version stays issued. Accepting this version does not issue it again.</p>'
        });
      }

      out += '</div>';

      /* right column */
      out += '<div>';

      if (quote.approval) {
        out += UI.card({
          title: 'Recorded decision',
          body: UI.dl([
            ['Decision', quote.approval.decision],
            ['Channel', quote.approval.channel || '—'],
            ['Recorded by', quote.approval.recordedBy ? Store.staffName(quote.approval.recordedBy) : 'Not required'],
            ['Recorded at', Util.fmtDateTime(quote.approval.recordedAt)],
            ['Contact note', quote.approval.note || 'None']
          ]) + '<p class="note">Recorded in the demo state only. No message was actually sent.</p>'
        });
      } else if (!canRecord) {
        out += UI.card({
          title: 'Decision summary',
          body: '<p>No decision has been recorded for version v' + quote.version + ' yet.</p>' +
            '<p class="note">The Cashier or a Manager records the customer decision. A mechanic cannot approve on the customer’s behalf.</p>' +
            '<p class="note">Demo state: ' + E(Util.fmtDateTime(Store.state.demoNow)) + ' · ' + E(Store.user().name) + ' (' + E(ctx.role) + ')</p>'
        });
      } else if (!isCurrent) {
        out += UI.card({
          title: 'Decision not available',
          body: '<p>Version v' + quote.version + ' is no longer the current scope, so a decision cannot be recorded against it. ' +
            'Prepare a new version on the Inspection screen.</p>' +
            UI.btn('Prepare a new version', { action: 'quote.newVersion', variant: 'secondary', attrs: { jobId: job.id } })
        });
      } else {
        out += UI.card({
          title: 'Record the customer decision',
          subtitle: 'No contact is actually made. The entry is stored in the demo state only.',
          body: '<form data-form="approval.record" data-job-id="' + E(job.id) + '" data-version="' + quote.version + '">' +
            '<div class="field"><label for="ap-decision">Decision <span class="req" aria-hidden="true">*</span></label>' +
            '<select id="ap-decision" name="decision" required>' +
            '<option value="">Select a decision</option>' +
            '<option value="Approved">Approved</option>' +
            '<option value="Declined">Declined</option>' +
            '</select></div>' +
            '<div class="field"><label for="ap-channel">Channel <span class="req" aria-hidden="true">*</span></label>' +
            '<select id="ap-channel" name="channel" required>' +
            '<option value="">Select the channel used</option>' +
            CHANNELS.map(c => '<option value="' + E(c) + '">' + E(c) + '</option>').join('') +
            '</select><p class="field-hint">The channel is recorded as a simulated contact.</p></div>' +
            '<div class="field"><label for="ap-note">Contact note</label>' +
            '<textarea id="ap-note" name="note" rows="2" placeholder="What the customer said (demo)"></textarea></div>' +
            '<div class="field"><label class="check"><input type="checkbox" name="confirmed"> ' +
            '<span>I confirm the customer decision was taken in this session <span class="req" aria-hidden="true">*</span></span></label></div>' +
            '<div class="form-actions">' +
            UI.btn('Record decision', { variant: 'primary', icon: 'check', type: 'submit' }) +
            '</div></form>'
        });
      }

      if (Rules.hasDeclinedExtra(job)) {
        const withdrawn = !!job.extraWorkWithdrawn;
        const kept = quotes.filter(q => !q.isExtraWork && q.status === 'Approved').pop();
        out += UI.card({
          title: withdrawn ? 'Declined extra work — withdrawn' : 'Declined extra work',
          subtitle: 'The earlier approved scope stays usable after the addition is withdrawn.',
          body: (withdrawn
            ? '<p>The customer declined the extra-work version and it has been withdrawn. The earlier approved scope' +
              (kept ? ' (v' + E(kept.version) + ')' : '') +
              ' is the usable scope. The declined version is kept in the history.</p>' +
              '<p class="note">The earlier approved scope stays usable and can be completed.</p>'
            : '<p>The customer declined the extra-work version. Withdraw it explicitly to continue with the approved scope.</p>' +
              (ctx.role === 'Owner' || ctx.role === 'Manager'
                ? '<div class="action-bar">' +
                  UI.btn('Withdraw the extra work', { action: 'job.withdrawExtra', variant: 'secondary', attrs: { jobId: job.id } }) +
                  '</div>'
                : '<p class="note">Only the Owner or a Manager can withdraw declined extra work. Switch the demo role to continue.</p>'))
        });
      }

      out += UI.card({
        title: 'What happens next',
        body: '<ul class="stack-sm">' +
          '<li>• An approved version commits the authorised scope to the job and lets the work start.</li>' +
          '<li>• A declined initial quote blocks the start of work until a new version is proposed.</li>' +
          '<li>• Every extra-work version needs its own decision, even when it is small.</li>' +
          '<li>• The decision is stored against the version, so an old version never silently changes the current scope.</li>' +
          '</ul>'
      });

      out += '</div></div>';
      return out;
    }
  };
})(window);
