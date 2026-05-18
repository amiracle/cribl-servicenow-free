# Cribl Alert Intelligence — Use Cases & Outcomes

## Overview

Cribl Alert Intelligence bridges the gap between high-volume security telemetry (collected and normalized by Cribl Stream) and actionable incident management (powered by ServiceNow App Engine). The integration leverages Cribl's strengths in data reduction and enrichment upstream, while ServiceNow handles workflow orchestration, approval gates, SLA management, and resolver group coordination downstream.

---

## Use Case 1: Alert Fatigue Reduction

### Problem
Security teams receive thousands of raw alerts daily from cloud-native security tools. Most are duplicates, low-severity, or affect non-production resources. Analysts waste hours triaging noise instead of investigating real threats.

### Solution
Cribl Stream reduces event volume by 60–80% before data reaches ServiceNow. The Deduplication Engine further consolidates repeated alerts into single cases with occurrence counts. The Impact Scorer automatically classifies cases so analysts focus only on the 10–20% that require human action.

### Outcome
| Metric | Before | After |
|--------|--------|-------|
| Daily alerts requiring human review | 2,000+ | 150–300 |
| Mean time to acknowledge critical alert | 45 min | 3 min (auto-assigned) |
| Analyst hours spent on triage/day | 6 hrs | 1.5 hrs |
| False positive investigation rate | 70% | 15% |

---

## Use Case 2: Intelligent Case Routing

### Problem
Security events span multiple domains — cloud infrastructure, container runtime, vulnerability management. Different teams own different blast areas, but events arrive through a single funnel. Manual routing causes delays, misroutes, and dropped cases.

### Solution
The Case Router evaluates configurable rules against event attributes (source type, severity, cloud provider, resource type, environment) and assigns cases to the correct resolver group automatically. Rules are maintained by security operations leads via a simple ServiceNow table — no code changes required.

### Outcome
| Metric | Before | After |
|--------|--------|-------|
| Cases routed to wrong team | 25% | <3% |
| Average time to correct assignment | 2 hrs | 0 (auto-routed) |
| Cases requiring manual re-assignment | 40%/week | 5%/week |

### Example Routing Scenarios

| Event | Routed To | Reason |
|-------|-----------|--------|
| Critical runtime threat in production K8s cluster | Security Incident Response | Rule: threat + severity 1 + production |
| High-severity alert from AWS GuardDuty | Cloud Security Operations | Rule: alert + severity 2 + AWS |
| CVE-2024-XXXXX (CVSS 9.8) in production image | Vulnerability Management | Rule: vulnerability + severity 1 + production |
| Low-severity alert in dev environment | Security Operations (batch queue) | Default catch-all |

---

## Use Case 3: Automated Escalation with Approval Gates

### Problem
Critical security issues need immediate escalation to incident management, but false escalations waste expensive on-call time. Teams need a balance between speed (auto-escalate) and accuracy (human approval).

### Solution
The escalation workflow triggers when a case's impact score exceeds the critical threshold (default 80) and remains unresolved past the SLA window. It requests approval from the security lead (with a 15-minute timeout and auto-approve), then creates a P1 Incident record and pages the on-call responder via PagerDuty.

### Outcome
| Metric | Before | After |
|--------|--------|-------|
| Time from detection to P1 incident creation | 2–4 hrs (manual) | 30–45 min (automated) |
| False P1 escalations | N/A (too slow to escalate) | <5% (approval gate) |
| Critical issues that miss escalation window | 30% | 0% (auto-approve on timeout) |

---

## Use Case 4: Cross-Cloud Blast Radius Awareness

### Problem
A vulnerability or threat may affect resources across multiple cloud providers, regions, or clusters. Siloed alerting creates separate tickets for each affected resource, preventing teams from seeing the full scope of an incident.

### Solution
The Impact Scorer's blast radius component detects when the same `source_id` appears across multiple regions or clusters. This elevates the impact score significantly, surfacing multi-region events to the top of the triage queue. Deduplication consolidates repeated occurrences while tracking the full breadth via occurrence counts and the raw payload log.

### Outcome
| Metric | Before | After |
|--------|--------|-------|
| Multi-region incidents detected within 15 min | 20% | 95% |
| Duplicate cases for same incident | 5–15 per event | 1 (deduplicated) |
| Time to understand full blast radius | Hours (manual correlation) | Immediate (auto-scored) |

---

## Use Case 5: Compliance and Audit Trail

### Problem
Security and compliance teams need to demonstrate that critical vulnerabilities are acknowledged, triaged, and resolved within defined SLA windows. Manual tracking via spreadsheets or email chains is error-prone and fails audits.

### Solution
Every event received from Cribl is logged in `x_cribl_event_log` with full payload and timestamp. Cases track state transitions via ServiceNow's built-in audit history. SLA timers are set automatically by the triage workflow. The dashboard provides real-time visibility into mean time to resolve (MTTR) and SLA compliance.

### Outcome
| Metric | Before | After |
|--------|--------|-------|
| Audit preparation time | 2 weeks/quarter | 1 day (dashboard export) |
| SLA compliance visibility | Quarterly (manual) | Real-time |
| Evidence of acknowledgement for critical CVEs | Email search | Timestamped case record |
| Data retention for forensics | Varies | Configurable (ServiceNow retention policies) |

---

## Use Case 6: Self-Service Visibility for Engineering Teams

### Problem
Application teams want to know if their services have active security issues without filing a ticket to the security team. They need filtered, contextual visibility without full access to security tooling.

### Solution
The Service Portal widget shows teams only the cases assigned to their resolver group, filtered by their group membership. They can see severity, impact score, and status without accessing the full security console.

### Outcome
| Metric | Before | After |
|--------|--------|-------|
| "Do we have any security issues?" inquiries to SecOps | 15/week | 2/week |
| Time for team lead to check security posture | 30 min (ask and wait) | 10 sec (portal widget) |
| Engineering awareness of active critical issues | Low | Immediate (self-service) |

---

## Use Case 7: Noise Reduction Economics

### Problem
Sending all security telemetry directly to ServiceNow would create unsustainable case volume, license cost, and storage growth. ITSM tools are designed for human-actioned work items, not raw telemetry.

### Solution
Cribl Stream sits upstream and performs:
- **Volume reduction**: Drops low-value events, aggregates repetitive ones
- **Enrichment**: Adds context (environment tags, asset criticality) before reaching ServiceNow
- **Filtering**: Only high-value events (Critical/High severity, CVSS >= 7.0, all threats) flow to ServiceNow

The ServiceNow app then further reduces via deduplication, creating cases only when truly new issues arrive.

### Outcome
| Metric | Without Cribl | With Cribl + Dedup |
|--------|---------------|-------------------|
| Events/day hitting ServiceNow | 50,000+ | 200–500 |
| Cases created/day | 50,000+ | 50–150 |
| ServiceNow storage growth/month | 10+ GB | <500 MB |
| ServiceNow custom table license impact | Prohibitive | Manageable |

---

## Implementation Priorities

For organizations adopting this integration, we recommend phasing the deployment:

### Phase 1 (Week 1–2): Foundation
- Deploy the ServiceNow app with tables and REST API
- Configure Cribl pipeline and destination
- Enable for one event source (e.g., alerts only)
- Validate deduplication and basic routing

### Phase 2 (Week 3–4): Automation
- Enable all event sources (threats, vulnerabilities)
- Activate triage workflow with notifications
- Configure routing rules for your team structure
- Enable the dashboard and portal widget

### Phase 3 (Week 5–6): Optimization
- Activate escalation workflow with approval gates
- Tune impact scoring weights for your environment
- Connect notification channels (Slack, PagerDuty)
- Establish SLA targets and monitor compliance

### Phase 4 (Ongoing): Refinement
- Adjust dedup window based on observed patterns
- Add routing rules as team structure evolves
- Review auto-close policy effectiveness
- Export compliance reports quarterly
