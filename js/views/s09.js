/* S09 — Job materials */
(function (global) {
  'use strict';
  const E = Util.esc;
  global.DolphinViews = global.DolphinViews || {};

  global.DolphinViews.S09 = {
    render: function (ctx) {
      const job = Store.job(ctx.params.jobId);
      if (!job) {
        return UI.pageHeader({ title: 'Job materials' }) +
          UI.card({ title: 'No job selected', body: '<div class="empty-state"><p>Open a job first.</p>' +
            UI.btn('Go to jobs', { action: 'nav', variant: 'primary', attrs: { nav: 'S06' } }) + '</div>' });
      }
      const vehicle = Store.vehicle(job.vehicleId);
      const quote = Store.quote(job);
      const manager = ctx.role === 'Owner' || ctx.role === 'Manager';
      const mine = (job.assignedStaffIds || []).indexOf(ctx.user.id) >= 0;
      const settled = job.paymentStatus === 'Paid' || job.paymentStatus === 'No charge';

      let out = UI.pageHeader({
        title: 'Job materials',
        subtitle: job.id + ' · ' + (vehicle ? vehicle.plate : '') + ' · material is issued explicitly and deducted once',
        actions: UI.btn('Back to job', { action: 'nav', variant: 'secondary', attrs: { nav: 'S06', params: JSON.stringify({ jobId: job.id }) } })
      });

      if (ctx.role === 'Mechanic' && !mine) {
        out += UI.banner('warn', 'This job is not assigned to you',
          'Mechanics can only issue material for their own assignments.');
        return out;
      }

      if (!quote || quote.status !== 'Approved') {
        out += UI.banner('warn', 'No approved material scope',
          quote
            ? 'Quote version v' + quote.version + ' is ' + quote.status.toLowerCase() + '. Material can only be issued from an approved version.'
            : 'Prepare and approve a quote before issuing material.');
        out += UI.card({
          title: 'Material issued so far',
          body: UI.table({
            label: 'Issued material',
            head: ['Item', 'Qty', 'Cost snapshot', 'Issued at'],
            rows: (job.materialIssues || []).map(function (iss) {
              const item = Store.item(iss.itemId);
              return [
                E(item ? item.name : iss.itemId),
                E(iss.quantity + ' ' + iss.unit),
                { html: iss.unitCostSnapshotMMK === null || iss.unitCostSnapshotMMK === undefined ? 'Not captured' : Util.mmk(iss.unitCostSnapshotMMK), className: 'num' },
                E(Util.fmtDateTime(iss.issuedAt || Store.state.demoNow))
              ];
            }),
            empty: 'Nothing has been issued to this job.'
          })
        });
        return out;
      }

      if (settled) {
        out += UI.banner('plain', 'This job is settled',
          'Material can no longer be issued because the payment is closed. A Manager can still record a disposition in Stock adjustments.');
      }

      const materialLines = (quote.lines || []).filter(function (l) {
        return (l.kind === 'part' || l.kind === 'oil') && l.source !== 'Customer' && l.kind !== 'customerMaterial';
      });
      const customerLines = (quote.lines || []).filter(function (l) {
        return l.kind === 'customerMaterial' || l.source === 'Customer';
      });

      out += UI.card({
        title: 'Authorised material lines',
        subtitle: 'Only the approved quantity can be issued, and never more than is on hand.',
        body: UI.table({
          label: 'Authorised material lines',
          head: ['Item', 'Unit', 'Approved', 'Issued', 'Pending', 'On hand', 'State', ''],
          rows: materialLines.map(function (l) {
            const item = Store.item(l.itemId);
            const remaining = Rules.issueRemaining(job, l);
            const required = l.quantity || 0;
            const issued = required - remaining;
            const onHand = item ? item.onHand : 0;
            const state = remaining <= 0
              ? UI.badge('Fully issued', 'green')
              : (onHand < remaining ? UI.badge('Waiting for Parts', 'orange') : UI.badge('Ready to issue', 'blue'));
            const disabled = remaining <= 0 || onHand <= 0 || settled;
            return [
              E(Store.serviceLabel(l)),
              E(item ? item.unit : l.unit || '—'),
              E(required + ' ' + (item ? item.unit : '')),
              E(issued),
              { html: E(String(remaining)) + ' ' + (item ? item.unit : ''), className: 'num' },
              { html: E(String(onHand)) + ' ' + (item ? item.unit : ''), className: 'num' },
              { html: state },
              disabled
                ? { html: '<span class="muted small">' + (remaining <= 0 ? 'Nothing left to issue' : (onHand <= 0 ? 'No stock' : 'Settled')) + '</span>' }
                : { html: UI.btn('Add to job', { action: 'materials.issue', variant: 'primary', attrs: { jobId: job.id, lineId: l.id } }) }
            ];
          }),
          empty: 'The approved quote contains no shop material.'
        })
      });

      const shortages = Rules.shortages(job);
      if (shortages.length) {
        out += UI.banner('warn', 'Waiting for Parts',
          shortages.map(function (s) {
            const item = Store.item(s.line.itemId);
            return (item ? item.name : s.line.label) + ': ' + s.remaining + ' ' + (item ? item.unit : '') +
              ' needed, ' + (item ? item.onHand : 0) + ' on hand';
          }).join('; ') + '. ' +
          (manager ? 'Receive stock to continue.' : 'Ask a Manager to receive the stock.'));
      }

      if (customerLines.length) {
        out += UI.card({
          title: 'Customer-supplied material',
          subtitle: 'Described on the quote but never charged and never a shop-stock movement.',
          body: UI.table({
            label: 'Customer-supplied material',
            head: ['Description', 'Quantity', 'Charge', 'Shop stock effect'],
            rows: customerLines.map(function (l) {
              return [
                E(Store.serviceLabel(l)),
                E(l.quantity + ' ' + (l.unit || '')),
                { html: Util.mmk(l.unitPriceMMK), className: 'num' },
                { html: '<span class="muted">None — the customer supplies it</span>' }
              ];
            })
          })
        });
      }

      out += UI.card({
        title: 'Issued material',
        subtitle: 'Each issue appends one material issue and one stock movement. Nothing is deducted twice.',
        body: UI.table({
          label: 'Material issues for this job',
          head: ['Issue', 'Item', 'Quantity', 'Unit price', 'Cost snapshot', 'Disposition', ''],
          rows: (job.materialIssues || []).map(function (iss) {
            const item = Store.item(iss.itemId);
            const returned = iss.returnedQuantity || 0;
            return [
              E(iss.id),
              E(item ? item.name : iss.itemId),
              E(iss.quantity + ' ' + iss.unit + (returned ? ' (returned ' + returned + ')' : '')),
              { html: Util.mmk(iss.unitPriceMMK), className: 'num' },
              { html: iss.unitCostSnapshotMMK === null || iss.unitCostSnapshotMMK === undefined ? 'Not captured' : Util.mmk(iss.unitCostSnapshotMMK), className: 'num' },
              E(iss.disposition || 'Issued'),
              manager
                ? UI.btn('Disposition', { action: 'materials.disposition', variant: 'quiet', attrs: { jobId: job.id, issueId: iss.id } })
                : { html: '<span class="muted small">Manager only</span>' }
            ];
          }),
          empty: 'Nothing has been issued to this job yet.'
        }),
        actions: manager ? UI.btn('Stock adjustments', { action: 'nav', variant: 'secondary', attrs: { nav: 'S16' } }) : ''
      });

      out += UI.card({
        title: 'How material works here',
        body: '<ul class="stack-sm">' +
        '<li>• Quoting a part never changes the stock balance.</li>' +
        '<li>• A material issue has to be explicit and needs an approved quote version.</li>' +
        '<li>• The approved quantity is the ceiling; the stock balance is the other ceiling.</li>' +
        '<li>• Stock never goes below zero and every issue appends one movement.</li>' +
        '<li>• A settled job cannot take new material; a Manager records a disposition instead.</li>' +
        '</ul>'
      });

      return out;
    }
  };
})(window);
