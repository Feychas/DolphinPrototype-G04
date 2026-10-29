/* S01 — Dashboard */
(function (global) {
  'use strict';
  const E = Util.esc;
  global.DolphinViews = global.DolphinViews || {};

  global.DolphinViews.S01 = {
    render: function (ctx) {
      const state = ctx.state;
      const now = state.demoNow;
      const isMechanic = ctx.role === 'Mechanic';
      const jobs = isMechanic ? Store.visibleJobs() : Store.state.jobs;
      const openJobs = jobs.filter(j => j.lifecycleStatus === 'Open');
      const freeBays = Rules.availableBays();
      const awaiting = jobs.filter(j => j.lifecycleStatus === 'Open' && j.workStatus === 'Completed' && j.collectionStatus !== 'Collected');
      const low = Rules.lowStockItems();
      const today = Util.dayKey(now);
      const todayJobs = jobs.filter(j => Util.dayKey(j.createdAt) === today);
      const recent = Util.sortBy(jobs, j => j.createdAt).reverse().slice(0, 6);

      let out = UI.pageHeader({
        title: 'Workshop overview',
        subtitle: Util.fmtWeekday(now) + ', ' + Util.fmtDate(now) + ' · Sample day',
        actions: (ctx.role === 'Cashier' || ctx.role === 'Manager' || ctx.role === 'Owner')
          ? UI.btn('New check-in', { action: 'dashboard.newCheckIn', icon: 'plus' })
          : ''
      });

      if (isMechanic) {
        const mine = openJobs.filter(j => (j.assignedStaffIds || []).indexOf(ctx.user.id) >= 0);
        out += UI.pageHeader({ title: '' }).replace(/<header class="page-head">[\s\S]*?<\/header>/, '');
        out += '<div class="grid-4" style="margin-bottom:20px">' +
          UI.kpi({ label: 'My open jobs', value: String(mine.length), icon: 'clipboard', tone: 'blue' }) +
          UI.kpi({ label: 'In progress', value: String(mine.filter(j => j.workStatus === 'In Progress').length), icon: 'wrench' }) +
          UI.kpi({ label: 'Waiting for parts', value: String(mine.filter(j => j.workStatus === 'Waiting for Parts').length), icon: 'package', tone: 'amber' }) +
          UI.kpi({ label: 'Completed today', value: String(mine.filter(j => j.workStatus === 'Completed').length), icon: 'checkCircle', tone: 'green' }) +
          '</div>';
        out += UI.card({
          title: 'My jobs',
          subtitle: 'You only see the jobs assigned to you.',
          body: UI.table({
            label: 'My jobs',
            head: ['Job', 'Vehicle', 'Service', 'Status', 'Bay'],
            rows: mine.map(j => {
              const v = Store.vehicle(j.vehicleId);
              return [
                { html: UI.link(j.id, 'S06', { jobId: j.id }) },
                v ? v.plate : '—',
                Rules.jobServiceLabel(j),
                { html: UI.statusBadge(j.workStatus) },
                j.bayId && Store.bay(j.bayId) ? Store.bay(j.bayId).name : '—'
              ];
            }),
            empty: 'No jobs are assigned to you in this scenario.'
          }),
          actions: UI.btn('Open My jobs', { action: 'nav', variant: 'secondary', attrs: { nav: 'S06' } })
        });
        return out;
      }

      out += '<div class="grid-4" style="margin-bottom:20px">' +
        UI.kpi({
          label: 'Open jobs', value: String(openJobs.length), icon: 'clipboard', tone: 'blue',
          sub: openJobs.length ? 'Across all bays' : 'Nothing open'
        }) +
        UI.kpi({
          label: 'Available bays', value: freeBays.length + ' / ' + state.bays.filter(b => b.enabled).length,
          icon: 'car', tone: 'green', sub: freeBays.map(b => b.name).join(', ') || 'All bays busy'
        }) +
        UI.kpi({
          label: 'Awaiting collection', value: String(awaiting.length), icon: 'clock', tone: 'amber',
          sub: awaiting.length ? 'Completed, not collected' : 'Nothing waiting'
        }) +
        UI.kpi({
          label: 'Low-stock items', value: String(low.length), icon: 'box',
          tone: low.length ? 'amber' : 'green', sub: low.length ? 'At or below reorder level' : 'All items in stock'
        }) +
        '</div>';

      const attention = [];
      if (awaiting.length) {
        attention.push(UI.link(awaiting.length + ' vehicle' + (awaiting.length === 1 ? '' : 's') + ' awaiting collection', 'S06', { filter: 'awaiting' }) +
          '<span class="muted small"> — completed work still on site</span>');
      }
      if (low.length) {
        attention.push(UI.link(low.length + ' item' + (low.length === 1 ? '' : 's') + ' below reorder level', 'S10', {}) +
          '<span class="muted small"> — ' + low.map(i => i.name + ' (' + i.onHand + ' ' + i.unit + ')').join(', ') + '</span>');
      }
      const pendingApproval = jobs.filter(j => j.approvalStatus === 'Pending');
      if (pendingApproval.length) {
        attention.push(UI.link(pendingApproval.length + ' quote' + (pendingApproval.length === 1 ? '' : 's') + ' waiting for a customer decision', 'S08', {}) +
          '<span class="muted small"> — ' + pendingApproval.map(j => j.id).join(', ') + '</span>');
      }

      out += '<div class="grid-2">' +
        UI.card({
          title: "Today's work",
          subtitle: 'Jobs checked in today.',
          body: UI.table({
            label: "Today's jobs",
            head: ['Job', 'Vehicle', 'Service', 'Status', 'Mechanic'],
            rows: todayJobs.map(j => {
              const v = Store.vehicle(j.vehicleId);
              return [
                { html: UI.link(j.id, 'S06', { jobId: j.id }) },
                v ? v.plate : '—',
                Rules.jobServiceLabel(j),
                { html: UI.statusBadge(j.workStatus) },
                (j.assignedStaffIds || []).map(function (id) { return Store.staffName(id); }).join(', ') || '—'
              ];
            }),
            empty: 'No jobs have been checked in today yet.'
          }),
          actions: UI.btn('View all jobs', { variant: 'secondary', attrs: { nav: 'S06' } })
        }) +
        UI.card({
          title: 'Needs attention',
          body: attention.length
            ? '<div class="stack-sm">' + attention.map(a => '<div>' + a + '</div>').join('') + '</div>'
            : '<div class="empty-state"><p>Nothing needs attention in this scenario.</p></div>'
        }) +
        '</div>';

      out += UI.card({
        title: 'Recent jobs',
        subtitle: 'Newest first, across every bay.',
        body: UI.table({
          label: 'Recent jobs',
          head: ['Job', 'Vehicle', 'Status', 'Approval', 'Payment', 'Bay'],
          rows: recent.map(j => {
            const v = Store.vehicle(j.vehicleId);
            return [
              { html: UI.link(j.id, 'S06', { jobId: j.id }) },
              v ? v.plate : '—',
              { html: UI.statusBadge(j.workStatus) },
              { html: UI.statusBadge(j.approvalStatus) },
              { html: UI.statusBadge(j.paymentStatus) },
              j.bayId && Store.bay(j.bayId) ? Store.bay(j.bayId).name : 'Released'
            ];
          }),
          empty: 'No jobs in this scenario.'
        })
      });

      out += UI.card({
        title: 'Demo controls',
        subtitle: 'Presentation controls for the walkthrough. Nothing here is authentication.',
        body: '<div class="row-between">' +
          '<div class="row">' +
          '<label class="sr-only" for="dash-role">View as role</label>' +
          '<select id="dash-role" data-change="dashboard.role">' +
          Store.users().map(u => '<option value="' + E(u.id) + '"' + (u.id === ctx.user.id ? ' selected' : '') + '>' + E(u.name) + ' — ' + E(u.role) + '</option>').join('') +
          '</select>' +
          '<span class="muted small">Scenario ' + E(ctx.scenario.id) + ' · ' + E(ctx.scenario.label) + '</span>' +
          '</div>' +
          '<div class="row">' +
          UI.btn('Reset scenario', { action: 'demo.resetScenario', variant: 'secondary', icon: 'refresh' }) +
          '</div></div>' +
          '<p class="note" style="margin-top:12px">Switching the role keeps every saved change. Refreshing the page starts again at P01.</p>'
      });

      return out;
    }
  };
})(window);
