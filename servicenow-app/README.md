# Cribl Alert Intelligence — ServiceNow App Engine Application

A custom ServiceNow App Engine application that ingests enriched security events from Cribl Stream, deduplicates issues, scores likely impact, and routes cases to the appropriate resolver group.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────────────────┐
│  Upwind Security│────▶│   Cribl Stream    │────▶│  ServiceNow App Engine          │
│  (CNAPP)        │     │  (normalize,      │     │  ┌─────────────────────────┐    │
│                 │     │   enrich, reduce)  │     │  │ Scripted REST API       │    │
│  - Alerts       │     │                   │     │  │ (POST /api/x_cribl/     │    │
│  - Threats      │     │  Pipeline:        │     │  │       v1/ingest)        │    │
│  - Vulns        │     │  enrich_for_snow  │     │  └──────────┬──────────────┘    │
│  - Inventory    │     │                   │     │             │                    │
└─────────────────┘     │  Destination:     │     │  ┌──────────▼──────────────┐    │
                        │  servicenow_dest  │     │  │ Deduplication Engine     │    │
                        └──────────────────┘     │  └──────────┬──────────────┘    │
                                                  │             │                    │
                                                  │  ┌──────────▼──────────────┐    │
                                                  │  │ Impact Scorer            │    │
                                                  │  │ (0-100 composite score)  │    │
                                                  │  └──────────┬──────────────┘    │
                                                  │             │                    │
                                                  │  ┌──────────▼──────────────┐    │
                                                  │  │ Case Router              │    │
                                                  │  │ (rule-based assignment)  │    │
                                                  │  └──────────┬──────────────┘    │
                                                  │             │                    │
                                                  │  ┌──────────▼──────────────┐    │
                                                  │  │ Flow Designer Workflows  │    │
                                                  │  │ - Triage                 │    │
                                                  │  │ - Escalation + Approval  │    │
                                                  │  └─────────────────────────┘    │
                                                  └─────────────────────────────────┘
```

## Prerequisites

| Component | Requirement |
|-----------|-------------|
| ServiceNow | Vancouver release or later |
| ServiceNow License | App Engine license (includes Flow Designer, custom tables) |
| Cribl Stream | 4.17.0 or later |
| Cribl Pack | `cribl-upwind-rest-io` (this repo) installed and collecting data |
| Network | Cribl workers can reach `<instance>.service-now.com` on port 443 |

## Installation

### Step 1: Deploy the ServiceNow Application

1. Log into your ServiceNow instance as an admin.
2. Navigate to **App Engine Studio** (or **System Applications > Studio**).
3. Click **Create Application** and select **Start from scratch**.
4. Set:
   - **Name**: Cribl Alert Intelligence
   - **Scope**: `x_cribl_alert_intel`
   - **Description**: Ingests security events from Cribl, deduplicates, scores impact, and routes to resolver groups.
5. Click **Create**.

### Step 2: Create Custom Tables

Import or manually create the three custom tables defined in `tables/`:

#### x_cribl_alert_case (extends Task)

1. In App Engine Studio, go to **Data > Tables > Add**.
2. Choose **Extend an existing table** and select `Task [task]`.
3. Set label to "Cribl Alert Case" and name to `x_cribl_alert_case`.
4. Add columns as defined in `tables/x_cribl_alert_case.json`.
5. Set up auto-numbering with prefix `CRIBL`.

#### x_cribl_event_log

1. Create a standalone table: "Cribl Event Log" (`x_cribl_event_log`).
2. Add columns per `tables/x_cribl_event_log.json`.

#### x_cribl_routing_rules

1. Create a standalone table: "Cribl Routing Rule" (`x_cribl_routing_rules`).
2. Add columns per `tables/x_cribl_routing_rules.json`.
3. Insert the default routing rules from `default_data` in the schema file.

### Step 3: Create Script Includes

Navigate to **System Definition > Script Includes** and create:

| Name | Script File | Client Callable |
|------|-------------|-----------------|
| DeduplicationEngine | `scripts/DeduplicationEngine.js` | No |
| ImpactScorer | `scripts/ImpactScorer.js` | No |
| CaseRouter | `scripts/CaseRouter.js` | No |

Set the **Application** to "Cribl Alert Intelligence" for each.

### Step 4: Create Scripted REST API

1. Navigate to **System Web Services > Scripted REST APIs > New**.
2. Set:
   - **Name**: Cribl Ingest API
   - **API ID**: `x_cribl`
   - **API Namespace**: `x_cribl`
3. Under **Resources**, create a new resource:
   - **Name**: ingest
   - **HTTP Method**: POST
   - **Relative Path**: `/ingest`
   - **Script**: Paste contents of `scripts/CriblEventProcessor.js`
4. Under **Security**, require the role `x_cribl_alert_intel.api`.

### Step 5: Create Scheduled Job

1. Navigate to **System Definition > Scheduled Jobs > New**.
2. Set:
   - **Name**: Cribl Auto-Close Stale Cases
   - **Run**: Daily at 02:00
   - **Script**: Paste contents of `scripts/AutoCloseStale.js`

### Step 6: Configure Flows (Flow Designer)

1. Navigate to **Process Automation > Flow Designer**.
2. Create flows matching the definitions in `workflows/`.
3. The triage flow triggers on new case insert with `impact_score >= 50`.
4. The escalation flow triggers on update when SLA is breached or score >= 80.

### Step 7: Set System Properties

Navigate to **sys_properties** and create:

| Property | Type | Value |
|----------|------|-------|
| `x_cribl.dedup_window_hours` | integer | `4` |
| `x_cribl.auto_close_days` | integer | `7` |
| `x_cribl.escalation_threshold` | integer | `80` |
| `x_cribl.hmac_secret` | password2 | *(generate a random 32+ char secret)* |

### Step 8: Create ServiceNow API User

1. Navigate to **User Administration > Users > New**.
2. Create a user (e.g., `cribl.api.user`) with:
   - **Active**: true
   - **Web service access only**: true
   - **Roles**: `x_cribl_alert_intel.api`
3. Set a strong password and note the credentials for Cribl configuration.

### Step 9: Configure Cribl Stream

#### Add Pipeline

1. In Cribl Stream, navigate to **Processing > Pipelines > Add Pipeline**.
2. Import or recreate the pipeline from `cribl-config/pipeline_enrich_for_snow.yml`.
3. This pipeline normalizes event fields for the ServiceNow schema.

#### Add Destination

1. Navigate to **Data > Destinations > Webhook > Add Destination**.
2. Configure per `cribl-config/servicenow_destination.yml`:
   - **URL**: `https://<instance>.service-now.com/api/x_cribl/v1/ingest`
   - **Method**: POST
   - **Auth**: Basic (using the API user created in Step 8)
   - **Headers**: Include `X-Cribl-Signature` HMAC header
3. Set the Pack variables:
   - `snow_instance`: Your ServiceNow instance name
   - `snow_api_credentials`: Base64-encoded `username:password`
   - `snow_hmac_secret`: Same secret as `x_cribl.hmac_secret`

#### Configure Route

1. Navigate to **Data > Routes**.
2. Add a route that sends events matching your filter to the ServiceNow destination.
3. Apply the `enrich_for_servicenow` pipeline on the route.

### Step 10: Test the Integration

1. Send a test event using curl:

```bash
curl -X POST "https://<instance>.service-now.com/api/x_cribl/v1/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic <base64-credentials>" \
  -H "X-Cribl-Signature: <hmac-of-body>" \
  -d '[{
    "alertId": "test-001",
    "severity": "HIGH",
    "title": "Test Alert from Cribl",
    "description": "Integration test event",
    "resourceId": "pod/test-app-xyz",
    "resourceType": "Pod",
    "cloudProvider": "AWS",
    "region": "us-east-1",
    "createdAt": "2024-01-15T10:00:00Z"
  }]'
```

2. Verify a new case `CRIBL0000001` appears in **x_cribl_alert_case**.
3. Send the same event again and verify `occurrence_count` increments (dedup).
4. Check the dashboard at **Cribl Alert Intelligence Dashboard**.

## Configuration Reference

### Impact Scoring Formula

| Factor | Weight | Details |
|--------|--------|---------|
| Severity | 0–40 pts | Critical=40, High=30, Medium=20, Low=10, Info=0 |
| Frequency | 0–30 pts | log2(occurrence_count) x 10, capped at 30 |
| Environment | 0–20 pts | Production=20, Staging=10, Dev/Unknown=5 |
| Blast Radius | 0–10 pts | Multi-region=10, Multi-cluster=5 |

**Score Bands:**
- **80–100 (Critical)**: Auto-escalate, page on-call
- **50–79 (Standard)**: Assign to group, standard SLA
- **20–49 (Low)**: Queue for batch review
- **0–19 (Informational)**: Auto-close after 7 days

### Routing Rules

Rules are evaluated in `order` (ascending). First match wins. Configure via the `x_cribl_routing_rules` table. Default rules ship with the app:

| Order | Rule | Condition | Assignment |
|-------|------|-----------|------------|
| 10 | Critical Production Threats | threat + severity 1 + production | Security Incident Response |
| 20 | High Severity Alerts | alert + severity <=2 | Cloud Security Operations |
| 30 | Critical Vulnerabilities | vulnerability + severity 1 + production | Vulnerability Management |
| 999 | Default Catch-All | any | Security Operations |

### Deduplication

Events are deduplicated by computing an MD5 hash of `source_type|source_id|resource_id`. If a matching open case exists within the configured time window (default 4 hours), the existing case is updated rather than creating a new one.

## Roles

| Role | Permissions |
|------|-------------|
| `x_cribl_alert_intel.admin` | Full CRUD on all tables, configure routing rules, manage flows |
| `x_cribl_alert_intel.analyst` | Read all tables, update case state/assignment, add work notes |
| `x_cribl_alert_intel.api` | Create events and cases via REST API (service accounts only) |

## Troubleshooting

**Events not arriving in ServiceNow**
- Check Cribl destination health in **Data > Destinations > Monitoring**.
- Verify the ServiceNow API user has `x_cribl_alert_intel.api` role.
- Check for 401/403 errors in Cribl job logs.
- Verify HMAC secret matches on both sides.

**Cases not being deduplicated**
- Confirm `dedup_window_hours` system property is set.
- Check that `source_id` and `resource_id` are consistent across events.
- Review the `x_cribl_event_log` for processing notes.

**Routing not working as expected**
- Check `x_cribl_routing_rules` table — ensure rules are active and ordered correctly.
- Verify the referenced `assignment_group` sys_ids exist.
- Lower-order rules take priority — check for broad rules that match first.

**Workflows not triggering**
- Confirm flows are activated in Flow Designer.
- Check that the case `impact_score` meets the trigger threshold.
- Review **Process Automation > Flow Executions** for errors.

## Uninstallation

1. Deactivate the Cribl route sending to ServiceNow.
2. In ServiceNow, navigate to **System Applications > Applications**.
3. Find "Cribl Alert Intelligence" and click **Uninstall**.
4. Remove the API user created in Step 8.
