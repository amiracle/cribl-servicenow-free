var AutoCloseStale = Class.create();
AutoCloseStale.prototype = {
    initialize: function() {
        this.autoCloseDays = parseInt(gs.getProperty('x_cribl.auto_close_days', '7'));
        this.informationalThreshold = 20; // Impact score below this = informational
    },

    execute: function() {
        var closedCount = this._closeInformationalCases();
        var resolvedCount = this._closeResolvedCases();

        gs.info('Cribl AutoCloseStale: Closed {0} informational cases and {1} resolved cases',
            closedCount, resolvedCount);

        return { informational_closed: closedCount, resolved_closed: resolvedCount };
    },

    _closeInformationalCases: function() {
        var cutoff = new GlideDateTime();
        cutoff.addSeconds(-1 * this.autoCloseDays * 86400);

        var gr = new GlideRecord('x_cribl_alert_case');
        gr.addQuery('impact_score', '<', this.informationalThreshold);
        gr.addQuery('state', '!=', 7); // Not already Closed
        gr.addQuery('state', '!=', 8); // Not Cancelled
        gr.addQuery('last_seen', '<=', cutoff);
        gr.query();

        var count = 0;
        while (gr.next()) {
            gr.setValue('state', 7); // Closed
            gr.setValue('close_notes',
                'Auto-closed: Informational case with no activity for ' + this.autoCloseDays + ' days.');
            gr.work_notes = 'Automatically closed by Cribl Alert Intelligence scheduled job. ' +
                'Impact score: ' + gr.getValue('impact_score') + '. ' +
                'Last activity: ' + gr.getValue('last_seen');
            gr.update();
            count++;
        }

        return count;
    },

    _closeResolvedCases: function() {
        var resolveCutoff = new GlideDateTime();
        resolveCutoff.addSeconds(-3 * 86400); // 3 days after resolution

        var gr = new GlideRecord('x_cribl_alert_case');
        gr.addQuery('state', 6); // Resolved
        gr.addQuery('sys_updated_on', '<=', resolveCutoff);
        gr.query();

        var count = 0;
        while (gr.next()) {
            gr.setValue('state', 7); // Closed
            gr.setValue('close_notes', 'Auto-closed: Resolved case with no reopening after 3 days.');
            gr.work_notes = 'Automatically closed 3 days after resolution with no further activity.';
            gr.update();
            count++;
        }

        return count;
    },

    type: 'AutoCloseStale'
};

// Scheduled job entry point
(function() {
    var job = new AutoCloseStale();
    job.execute();
})();
