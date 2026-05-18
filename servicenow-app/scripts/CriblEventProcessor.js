(function process(request, response) {
    var body = request.body.dataString;
    var hmacHeader = request.getHeader('X-Cribl-Signature');
    var hmacSecret = gs.getProperty('x_cribl.hmac_secret');

    if (hmacSecret && !_validateHmac(body, hmacHeader, hmacSecret)) {
        response.setStatus(401);
        response.setBody({ error: 'Invalid HMAC signature' });
        return;
    }

    var events;
    try {
        var parsed = JSON.parse(body);
        events = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
        response.setStatus(400);
        response.setBody({ error: 'Invalid JSON payload', detail: e.message });
        return;
    }

    if (events.length === 0) {
        response.setStatus(200);
        response.setBody({ created: 0, updated: 0, skipped: 0 });
        return;
    }

    var results = { created: 0, updated: 0, skipped: 0, errors: [] };
    var dedup = new x_cribl_alert_intel.DeduplicationEngine();
    var scorer = new x_cribl_alert_intel.ImpactScorer();
    var router = new x_cribl_alert_intel.CaseRouter();

    for (var i = 0; i < events.length; i++) {
        try {
            var event = events[i];
            var outcome = _processEvent(event, dedup, scorer, router);
            results[outcome]++;
        } catch (e) {
            results.errors.push({ index: i, error: e.message });
        }
    }

    response.setStatus(200);
    response.setBody(results);

    function _processEvent(event, dedup, scorer, router) {
        var sourceType = _resolveSourceType(event);
        var sourceId = event.alertId || event.threatId || event.cveId || event.vulnerabilityId || '';
        var resourceId = event.resourceId || '';

        if (!sourceType || !sourceId) {
            return 'skipped';
        }

        var dedupKey = dedup.computeKey(sourceType, sourceId, resourceId);
        var existingCase = dedup.findExistingCase(dedupKey);

        if (existingCase) {
            dedup.updateExistingCase(existingCase, event);
            var newScore = scorer.compute(existingCase);
            existingCase.setValue('impact_score', newScore);
            existingCase.update();
            _logEvent(existingCase.getUniqueValue(), event, 'Deduplicated — occurrence count incremented');
            return 'updated';
        }

        var caseGr = new GlideRecord('x_cribl_alert_case');
        caseGr.initialize();
        caseGr.setValue('source_id', sourceId);
        caseGr.setValue('source_type', sourceType);
        caseGr.setValue('short_description', _buildTitle(event, sourceType));
        caseGr.setValue('description', _buildDescription(event, sourceType));
        caseGr.setValue('severity', _mapSeverity(event.severity));
        caseGr.setValue('resource_id', resourceId);
        caseGr.setValue('resource_type', event.resourceType || '');
        caseGr.setValue('cloud_provider', (event.cloudProvider || 'other').toLowerCase());
        caseGr.setValue('region', event.region || '');
        caseGr.setValue('cluster', event.cluster || '');
        caseGr.setValue('environment', _resolveEnvironment(event));
        caseGr.setValue('dedup_key', dedupKey);
        caseGr.setValue('occurrence_count', 1);
        caseGr.setValue('first_seen', new GlideDateTime());
        caseGr.setValue('last_seen', new GlideDateTime());
        caseGr.setValue('state', 1); // New
        caseGr.setValue('cribl_raw_payload', JSON.stringify(event));

        if (sourceType === 'vulnerability') {
            caseGr.setValue('cve_id', event.cveId || '');
            caseGr.setValue('cvss_score', event.cvssScore || 0);
        }

        var routingResult = router.route(caseGr);
        caseGr.setValue('assignment_group', routingResult.groupSysId);

        var impactScore = scorer.computeFromEvent(event, sourceType, 1);
        impactScore += routingResult.priorityBoost;
        impactScore = Math.min(100, Math.max(0, impactScore));
        caseGr.setValue('impact_score', impactScore);

        var caseSysId = caseGr.insert();

        if (!caseSysId) {
            throw new Error('Failed to insert case record');
        }

        _logEvent(caseSysId, event, 'New case created');
        return 'created';
    }

    function _resolveSourceType(event) {
        if (event.alertId) return 'alert';
        if (event.threatId) return 'threat';
        if (event.vulnerabilityId || event.cveId) return 'vulnerability';
        if (event.source_type) return event.source_type;
        return '';
    }

    function _mapSeverity(severityStr) {
        if (!severityStr) return 3;
        var map = {
            'CRITICAL': 1, 'critical': 1,
            'HIGH': 2, 'high': 2,
            'MEDIUM': 3, 'medium': 3,
            'LOW': 4, 'low': 4,
            'INFORMATIONAL': 5, 'informational': 5, 'INFO': 5, 'info': 5
        };
        return map[severityStr] || 3;
    }

    function _buildTitle(event, sourceType) {
        var prefix = {
            'alert': '[Alert]',
            'threat': '[Threat]',
            'vulnerability': '[Vuln]'
        };
        var title = event.title || event.description || event.type || 'Cribl Security Event';
        return (prefix[sourceType] || '') + ' ' + title.substring(0, 160);
    }

    function _buildDescription(event, sourceType) {
        var parts = [];
        parts.push('Source: ' + sourceType.toUpperCase());
        parts.push('Severity: ' + (event.severity || 'Unknown'));
        if (event.resourceId) parts.push('Resource: ' + event.resourceId);
        if (event.resourceType) parts.push('Resource Type: ' + event.resourceType);
        if (event.cloudProvider) parts.push('Cloud: ' + event.cloudProvider);
        if (event.region) parts.push('Region: ' + event.region);
        if (event.cveId) parts.push('CVE: ' + event.cveId);
        if (event.cvssScore) parts.push('CVSS: ' + event.cvssScore);
        if (event.description) parts.push('\nDetails:\n' + event.description.substring(0, 2000));
        return parts.join('\n');
    }

    function _resolveEnvironment(event) {
        var tags = event.tags || event.labels || {};
        var env = tags.environment || tags.env || event.environment || '';
        env = env.toLowerCase();
        if (env.indexOf('prod') >= 0) return 'production';
        if (env.indexOf('stag') >= 0) return 'staging';
        if (env.indexOf('dev') >= 0) return 'development';
        return 'unknown';
    }

    function _logEvent(caseSysId, event, notes) {
        var log = new GlideRecord('x_cribl_event_log');
        log.initialize();
        log.setValue('alert_case', caseSysId);
        log.setValue('payload', JSON.stringify(event));
        log.setValue('received_at', new GlideDateTime());
        log.setValue('processed', true);
        log.setValue('source_type', _resolveSourceType(event));
        log.setValue('processing_notes', notes);
        log.insert();
    }

    function _validateHmac(payload, signature, secret) {
        if (!signature) return false;
        var mac = new GlideDigest();
        var computed = mac.generateHMAC256(secret, payload);
        return computed === signature;
    }

})(request, response);
