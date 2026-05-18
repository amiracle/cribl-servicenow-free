var CaseRouter = Class.create();
CaseRouter.prototype = {
    initialize: function() {
        this.defaultGroup = 'Security Operations';
    },

    route: function(caseGr) {
        var rules = this._getActiveRules();
        var sourceType = caseGr.getValue('source_type');
        var severity = parseInt(caseGr.getValue('severity')) || 3;
        var cloudProvider = caseGr.getValue('cloud_provider') || 'other';
        var resourceType = caseGr.getValue('resource_type') || '';
        var environment = caseGr.getValue('environment') || 'unknown';

        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            if (this._matches(rule, sourceType, severity, cloudProvider, resourceType, environment)) {
                return {
                    groupSysId: rule.assignment_group,
                    groupName: rule.assignment_group_name,
                    ruleName: rule.name,
                    priorityBoost: rule.priority_boost
                };
            }
        }

        return {
            groupSysId: this._getDefaultGroupSysId(),
            groupName: this.defaultGroup,
            ruleName: 'Default Fallback',
            priorityBoost: 0
        };
    },

    routeByValues: function(sourceType, severity, cloudProvider, resourceType, environment) {
        var mockGr = {
            getValue: function(field) {
                var values = {
                    'source_type': sourceType,
                    'severity': severity,
                    'cloud_provider': cloudProvider,
                    'resource_type': resourceType,
                    'environment': environment
                };
                return values[field] || '';
            }
        };
        return this.route(mockGr);
    },

    _getActiveRules: function() {
        var rules = [];
        var gr = new GlideRecord('x_cribl_routing_rules');
        gr.addQuery('active', true);
        gr.orderBy('order');
        gr.query();

        while (gr.next()) {
            rules.push({
                name: gr.getValue('name'),
                source_type: gr.getValue('source_type'),
                min_severity: parseInt(gr.getValue('min_severity')) || 5,
                cloud_provider: gr.getValue('cloud_provider'),
                resource_type_pattern: gr.getValue('resource_type_pattern'),
                environment: gr.getValue('environment'),
                assignment_group: gr.getValue('assignment_group'),
                assignment_group_name: gr.getDisplayValue('assignment_group'),
                priority_boost: parseInt(gr.getValue('priority_boost')) || 0
            });
        }

        return rules;
    },

    _matches: function(rule, sourceType, severity, cloudProvider, resourceType, environment) {
        if (rule.source_type !== 'any' && rule.source_type !== sourceType) {
            return false;
        }

        if (severity > rule.min_severity) {
            return false;
        }

        if (rule.cloud_provider !== 'any' && rule.cloud_provider !== cloudProvider) {
            return false;
        }

        if (rule.environment !== 'any' && rule.environment !== environment) {
            return false;
        }

        if (rule.resource_type_pattern) {
            try {
                var regex = new RegExp(rule.resource_type_pattern, 'i');
                if (!regex.test(resourceType)) {
                    return false;
                }
            } catch (e) {
                // Invalid regex pattern, skip this filter
            }
        }

        return true;
    },

    _getDefaultGroupSysId: function() {
        var gr = new GlideRecord('sys_user_group');
        gr.addQuery('name', this.defaultGroup);
        gr.setLimit(1);
        gr.query();
        if (gr.next()) {
            return gr.getUniqueValue();
        }
        return '';
    },

    type: 'CaseRouter'
};
