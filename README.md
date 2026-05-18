# Cribl Alert Intelligence for ServiceNow

A ServiceNow App Engine application that ingests enriched security alerts from Cribl Stream, deduplicates issues, scores likely impact, and routes cases to the appropriate resolver group.

## What This Does

```
Security Sources ──▶ Cribl Stream ──▶ ServiceNow App Engine
(any CNAPP, SIEM,     (normalize,      (deduplicate, score,
 cloud security)       enrich, filter)   route, escalate)
```

Cribl Stream collects and normalizes security telemetry from upstream sources, then pushes high-value events to this ServiceNow application via a webhook destination. The app handles:

- **Deduplication** — Consolidates repeated events into single cases with occurrence counts
- **Impact Scoring** — Computes a 0–100 composite score from severity, frequency, environment, and blast radius
- **Intelligent Routing** — Matches cases to resolver groups via configurable rules
- **Automated Workflows** — Triage with SLA timers, escalation with manager approval gates
- **Operational Dashboard** — Real-time KPIs, severity breakdown, MTTR tracking

## Project Structure

```
├── servicenow-app/
│   ├── README.md                    # Detailed installation & setup guide
│   ├── USE_CASES.md                 # Use cases, outcomes, and metrics
│   ├── manifest.json                # App Engine Studio manifest
│   ├── tables/                      # Custom table schemas (3 tables)
│   ├── scripts/                     # Script includes, REST API, scheduled jobs
│   ├── workflows/                   # Flow Designer workflow definitions
│   ├── ui/                          # Dashboard and Service Portal widget
│   └── cribl-config/               # Cribl pipeline and destination configs
├── package.json                     # Project metadata
├── LICENSE                          # Apache 2.0
└── README.md                        # This file
```

## Quick Start

1. **Get a ServiceNow instance** — [developer.servicenow.com](https://developer.servicenow.com) (free Personal Developer Instance, Vancouver+)
2. **Follow the setup guide** — See [servicenow-app/README.md](servicenow-app/README.md) for step-by-step installation
3. **Configure Cribl** — Use the configs in `servicenow-app/cribl-config/` to set up the destination and pipeline
4. **Test** — Send a sample event to the REST API endpoint and verify case creation

## Key Components

| Component | Purpose |
|-----------|---------|
| [CriblEventProcessor.js](servicenow-app/scripts/CriblEventProcessor.js) | Scripted REST API endpoint accepting events from Cribl |
| [DeduplicationEngine.js](servicenow-app/scripts/DeduplicationEngine.js) | MD5-based dedup with configurable time window |
| [ImpactScorer.js](servicenow-app/scripts/ImpactScorer.js) | Composite scoring algorithm (severity + frequency + environment + blast radius) |
| [CaseRouter.js](servicenow-app/scripts/CaseRouter.js) | Rule-based assignment to resolver groups |
| [AutoCloseStale.js](servicenow-app/scripts/AutoCloseStale.js) | Scheduled cleanup of informational/resolved cases |
| [cribl_alert_triage.json](servicenow-app/workflows/cribl_alert_triage.json) | Flow Designer triage workflow with SLA |
| [escalation_approval.json](servicenow-app/workflows/escalation_approval.json) | Approval-gated escalation to P1 incident |

## Supported Event Sources

This app is **source-agnostic** — any security tool that Cribl can collect from will work, including:

- Upwind Security (CNAPP)
- AWS GuardDuty, Security Hub
- GCP Security Command Center
- Azure Defender / Sentinel
- CrowdStrike, SentinelOne
- Prisma Cloud, Wiz, Orca
- Any tool emitting structured JSON alerts

The Cribl pipeline normalizes events into a common schema before they reach ServiceNow.

## Documentation

- [Installation & Setup Guide](servicenow-app/README.md)
- [Use Cases & Outcomes](servicenow-app/USE_CASES.md)

## License

Apache 2.0 — see [LICENSE](LICENSE).
