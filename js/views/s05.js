/* S05 — Bay board */
(function (global) {
  'use strict';
  const E = Util.esc;
  global.DolphinViews = global.DolphinViews || {};

  global.DolphinViews.S05 = {
    render: function (ctx) {
      const state = ctx.state;
      const canAssign = ctx.role === 'Owner' || ctx.role === 'Manager';
      const mechanicOnly = ctx.role === 'Mechanic';
      const now = state.demoNow;

      let out = UI.pageHeader({
        title: 'Bay board',
        subtitle: 'Three illustrative bays. Completing a repair releases its bay immediately.',
        actions: canAssign ? UI.btn('Assign job to bay', { action: 'bay.assign', variant: 'primary', icon: 'plus' }) : ''
      });

      if (mechanicOnly) {
        out += UI.banner('plain', 'Mechanic view',
          'You see the bays occupied by your own assignments only.');
      } else if (!canAssign) {
        out += UI.banner('plain', 'Cashier view',
          'The board is read-only for the Cashier role. Switch the demo role to Manager to assign a bay.');
      }

      const bays = state.bays.map(function (bay) {
        const occupant = Rules.bayOccupant(bay.id);
        if (occupant && mechanicOnly && (occupant.assignedStaffIds || []).indexOf(ctx.user.id) < 0) return null;
        const vehicle = occupant ? Store.vehicle(occupant.vehicleId) : null;
        const customer = vehicle ? Store.customer(vehicle.customerId) : null;
        const booking = (state.bookings || []).filter(function (b) {
          return b.bayId === bay.id && b.status !== 'Cancelled'
            && Util.parseDate(b.startAt) && Util.parseDate(b.startAt).getTime() >= Util.parseDate(now).getTime() - 3600000;
        })[0];
        let body;
        if (!bay.enabled) {
          body = '<p class="muted">Disabled in the demo settings.</p>';
        } else if (!occupant) {
          body = '<p class="muted">Available — no job occupies this bay.</p>' +
            (booking ? '<p class="note">Reserved soon: ' + E(booking.id) + ' at ' + E(Util.fmtTime(booking.startAt)) +
              ' (a reservation does not occupy the bay).</p>' : '');
        } else {
          body = UI.dl([
            ['Job', occupant.id],
            ['Vehicle', vehicle ? vehicle.plate + ' · ' + vehicle.brand + ' ' + vehicle.model : '—'],
            ['Customer', customer ? customer.name : '—'],
            ['Mechanic', (occupant.assignedStaffIds || []).map(function (id) { return Store.staffName(id); }).join(', ') || 'Not assigned'],
            ['Work', occupant.workStatus]
          ]);
        }
        return UI.card({
          className: occupant ? 'bay-card bay-busy' : 'bay-card',
          title: bay.name + (occupant ? '' : ' · Available'),
          subtitle: occupant ? '' : 'Ready for the next job',
          body: body,
          actions: occupant
            ? UI.btn('Open job', { action: 'nav', variant: 'secondary', attrs: { nav: 'S06', params: JSON.stringify({ jobId: occupant.id }) } })
            : (canAssign ? UI.btn('Assign a job here', { action: 'bay.assign', variant: 'secondary', attrs: { bayId: bay.id } }) : '')
        });
      }).filter(Boolean);

      out += '<div class="grid-3">' + bays.join('') + '</div>';

      const queue = Rules.completedUncollected().filter(function (j) {
        if (!mechanicOnly) return true;
        return (j.assignedStaffIds || []).indexOf(ctx.user.id) >= 0;
      });
      out += UI.card({
        title: 'Completed, waiting for collection',
        subtitle: 'The bay was released as soon as the repair was completed. Payment is tracked separately.',
        body: UI.table({
          label: 'Completed vehicles awaiting collection',
          head: ['Job', 'Vehicle', 'Customer', 'Completed', 'Payment', 'Bay', 'Action'],
          rows: queue.map(function (j) {
            const v = Store.vehicle(j.vehicleId);
            const c = v ? Store.customer(v.customerId) : null;
            return [
              { html: UI.link(j.id, 'S06', { jobId: j.id }) },
              E(v ? v.plate : '—'),
              E(c ? c.name : '—'),
              E(Util.fmtDateTime(j.completedAt)),
              { html: UI.statusBadge(j.paymentStatus) },
              'Released',
              { html: UI.link('Receipt', 'S12', { jobId: j.id }) }
            ];
          }),
          empty: 'No completed vehicle is waiting for collection.'
        })
      });

      const unassigned = state.jobs.filter(function (j) {
        return j.lifecycleStatus === 'Open' && j.workStatus !== 'Completed' && j.workStatus !== 'Cancelled' && !j.bayId;
      });
      if (unassigned.length && !mechanicOnly) {
        out += UI.card({
          title: 'Waiting for a bay',
          body: UI.table({
            label: 'Jobs without a bay',
            head: ['Job', 'Vehicle', 'Service', 'Status', 'Action'],
            rows: unassigned.map(function (j) {
              const v = Store.vehicle(j.vehicleId);
              return [
                { html: UI.link(j.id, 'S06', { jobId: j.id }) },
                E(v ? v.plate : '—'),
                E(Rules.jobServiceLabel(j)),
                { html: UI.statusBadge(j.workStatus) },
                canAssign ? UI.btn('Assign', { action: 'bay.assign', variant: 'secondary', attrs: { jobId: j.id } }) : { html: '—' }
              ];
            })
          })
        });
      }

      return out;
    }
  };
})(window);
