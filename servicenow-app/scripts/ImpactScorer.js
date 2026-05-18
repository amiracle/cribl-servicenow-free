var ImpactScorer = Class.create();
ImpactScorer.prototype = {
    initialize: function() {
        this.severityWeights = { 1: 40, 2: 30, 3: 20, 4: 10, 5: 0 };
        this.environmentWeights = { 'production': 20, 'staging': 10, 'development': 5, 'unknown': 5 };
        this.frequencyCap = 30;
        this.blastRadiusMax = 10;
    },

    compute: function(caseGr) {
        var severity = parseInt(caseGr.getValue('severity')) || 3;
        var occurrenceCount = parseInt(caseGr.getValue('occurrence_count')) || 1;
        var environment = caseGr.getValue('environment') || 'unknown';

        var score = 0;
        score += this._severityScore(severity);
        score += this._frequencyScore(occurrenceCount);
        score += this._environmentScore(environment);
        score += this._blastRadiusScore(caseGr);

        return Math.min(100, Math.max(0, Math.round(score)));
    },

    computeFromEvent: function(event, sourceType, occurrenceCount) {
        var severity = this._mapSeverityString(event.severity);
        var environment = this._resolveEnvironment(event);

        var score = 0;
        score += this._severityScore(severity);
        score += this._frequencyScore(occurrenceCount || 1);
        score += this._environmentScore(environment);
        score += this._eventBlastRadius(event);

        if (sourceType === 'vulnerability' && event.cvssScore) {
            score += Math.round(parseFloat(event.cvssScore));
        }

        return Math.min(100, Math.max(0, Math.round(score)));
    },

    getScoreBand: function(score) {
        if (score >= 80) return 'critical';
        if (score >= 50) return 'standard';
        if (score >= 20) return 'low';
        return 'informational';
    },

    getRecommendedAction: function(score) {
        var band = this.getScoreBand(score);
        var actions = {
            'critical': 'Auto-escalate to incident management, page on-call responder',
            'standard': 'Assign to resolver group at standard priority',
            'low': 'Queue for batch review during next triage cycle',
            'informational': 'Auto-close after 7 days if no activity'
        };
        return actions[band];
    },

    _severityScore: function(severity) {
        return this.severityWeights[severity] || 0;
    },

    _frequencyScore: function(occurrenceCount) {
        if (occurrenceCount <= 1) return 0;
        var score = Math.log2(occurrenceCount) * 10;
        return Math.min(this.frequencyCap, Math.round(score));
    },

    _environmentScore: function(environment) {
        return this.environmentWeights[environment] || 5;
    },

    _blastRadiusScore: function(caseGr) {
        var score = 0;
        var region = caseGr.getValue('region') || '';
        var cluster = caseGr.getValue('cluster') || '';

        var relatedRegions = new GlideAggregate('x_cribl_alert_case');
        relatedRegions.addQuery('source_id', caseGr.getValue('source_id'));
        relatedRegions.addQuery('state', '!=', 7);
        relatedRegions.groupBy('region');
        relatedRegions.query();

        var regionCount = 0;
        while (relatedRegions.next()) {
            regionCount++;
        }
        if (regionCount > 1) score += 10;

        var relatedClusters = new GlideAggregate('x_cribl_alert_case');
        relatedClusters.addQuery('source_id', caseGr.getValue('source_id'));
        relatedClusters.addQuery('state', '!=', 7);
        relatedClusters.groupBy('cluster');
        relatedClusters.query();

        var clusterCount = 0;
        while (relatedClusters.next()) {
            clusterCount++;
        }
        if (clusterCount > 1 && score < 10) score += 5;

        return Math.min(this.blastRadiusMax, score);
    },

    _eventBlastRadius: function(event) {
        var score = 0;
        if (event.affectedRegions && event.affectedRegions.length > 1) score += 10;
        else if (event.affectedClusters && event.affectedClusters.length > 1) score += 5;
        return Math.min(this.blastRadiusMax, score);
    },

    _mapSeverityString: function(severityStr) {
        if (!severityStr) return 3;
        var map = {
            'CRITICAL': 1, 'critical': 1,
            'HIGH': 2, 'high': 2,
            'MEDIUM': 3, 'medium': 3,
            'LOW': 4, 'low': 4,
            'INFORMATIONAL': 5, 'informational': 5
        };
        return map[severityStr] || 3;
    },

    _resolveEnvironment: function(event) {
        var tags = event.tags || event.labels || {};
        var env = (tags.environment || tags.env || event.environment || '').toLowerCase();
        if (env.indexOf('prod') >= 0) return 'production';
        if (env.indexOf('stag') >= 0) return 'staging';
        if (env.indexOf('dev') >= 0) return 'development';
        return 'unknown';
    },

    type: 'ImpactScorer'
};
