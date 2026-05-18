var DeduplicationEngine = Class.create();
DeduplicationEngine.prototype = {
    initialize: function() {
        this.dedupWindowHours = parseInt(gs.getProperty('x_cribl.dedup_window_hours', '4'));
    },

    computeKey: function(sourceType, sourceId, resourceId) {
        var raw = sourceType + '|' + sourceId + '|' + resourceId;
        var digest = new GlideDigest();
        return digest.generateMD5(raw);
    },

    findExistingCase: function(dedupKey) {
        var gr = new GlideRecord('x_cribl_alert_case');
        gr.addQuery('dedup_key', dedupKey);
        gr.addQuery('state', '!=', 7); // Not Closed
        gr.addQuery('state', '!=', 8); // Not Cancelled

        var windowStart = new GlideDateTime();
        windowStart.addSeconds(-1 * this.dedupWindowHours * 3600);
        gr.addQuery('last_seen', '>=', windowStart);

        gr.setLimit(1);
        gr.orderByDesc('last_seen');
        gr.query();

        if (gr.next()) {
            return gr;
        }
        return null;
    },

    updateExistingCase: function(caseGr, newEvent) {
        var currentCount = parseInt(caseGr.getValue('occurrence_count')) || 1;
        caseGr.setValue('occurrence_count', currentCount + 1);
        caseGr.setValue('last_seen', new GlideDateTime());

        var existingPayload = caseGr.getValue('cribl_raw_payload');
        try {
            var payloadObj = JSON.parse(existingPayload);
            if (!Array.isArray(payloadObj)) {
                payloadObj = [payloadObj];
            }
            if (payloadObj.length < 10) {
                payloadObj.push(newEvent);
            }
            caseGr.setValue('cribl_raw_payload', JSON.stringify(payloadObj));
        } catch (e) {
            caseGr.setValue('cribl_raw_payload', JSON.stringify([newEvent]));
        }

        if (newEvent.severity) {
            var newSev = this._mapSeverity(newEvent.severity);
            var currentSev = parseInt(caseGr.getValue('severity'));
            if (newSev < currentSev) {
                caseGr.setValue('severity', newSev);
            }
        }
    },

    isDuplicate: function(sourceType, sourceId, resourceId) {
        var key = this.computeKey(sourceType, sourceId, resourceId);
        return this.findExistingCase(key) !== null;
    },

    _mapSeverity: function(severityStr) {
        var map = {
            'CRITICAL': 1, 'critical': 1,
            'HIGH': 2, 'high': 2,
            'MEDIUM': 3, 'medium': 3,
            'LOW': 4, 'low': 4,
            'INFORMATIONAL': 5, 'informational': 5
        };
        return map[severityStr] || 3;
    },

    type: 'DeduplicationEngine'
};
