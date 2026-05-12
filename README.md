# Upwind Security REST Collector IO

A Cribl Stream Pack for collecting security data from the [Upwind Security](https://upwind.io) platform via its REST API.

## Overview

Upwind is a Cloud Native Application Protection Platform (CNAPP) that provides inside-out security by correlating runtime sensor data with cloud platform signals. This pack collects the following data types:

| Collector | Data Type | Schedule | Sourcetype |
|---|---|---|---|
| `in_upwind_alerts` | Security alerts | Every 5 minutes | `upwind:alert` |
| `in_upwind_threats` | Runtime threat detections | Every 5 minutes | `upwind:threat` |
| `in_upwind_vulnerabilities` | Vulnerability findings | Every 15 minutes | `upwind:vulnerability` |
| `in_upwind_inventory` | Asset inventory | Every 6 hours | `upwind:asset` |
| `in_upwind_identities` | Users & service accounts | Every 6 hours | `upwind:identity` |

## Prerequisites

- Cribl Stream 4.17.0 or later
- An active Upwind Security account with API access
- An Upwind API Key (generated from **Settings > API Keys** in the Upwind console)
- Your Upwind Organization ID (found in **Settings > Organization**)

## Authentication

This pack uses Bearer token authentication. You will need:

- **API Key**: A long-lived API key generated from the Upwind console. Navigate to **Settings > API Keys > Generate New Key**. Copy the key immediately — it will not be shown again.
- **Organization ID**: Your Upwind organization identifier. Found in **Settings > Organization** or in the URL when logged into the Upwind console.

> **Note**: OAuth2 client credentials (`upwind_client_id` / `upwind_client_secret`) are defined as variables for future OAuth2 support. If your Upwind environment requires OAuth2 authentication, contact Upwind support for the token endpoint URL and update the collector jobs accordingly.

## Installation

1. In Cribl Stream, navigate to **Packs > Add Pack > Install from File** (or from the Cribl Pack Dispensary).
2. Upload or reference this pack.
3. Configure the required variables (see below).
4. Enable the collectors you need.

## Configuration

### Required Variables

Navigate to **Packs > cribl-upwind-rest-io > Variables** and set the following:

| Variable | Type | Description |
|---|---|---|
| `upwind_api_key` | Encrypted String | **REQUIRED** — Your Upwind API Key |
| `upwind_organization_id` | String | **REQUIRED** — Your Upwind Organization ID |

### Optional Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `upwind_client_id` | String | `YOUR_UPWIND_CLIENT_ID` | OAuth2 Client ID (reserved for future use) |
| `upwind_client_secret` | Encrypted String | `YOUR_UPWIND_CLIENT_SECRET` | OAuth2 Client Secret (reserved for future use) |
| `default_splunk_index` | String | `upwind` | Default Splunk index for all collected data |
| `default_splunk_sourcetype` | String | `upwind:security` | Default Splunk sourcetype (overridden per-collector) |

### Enabling Collectors

All collectors are **disabled by default**. To enable a collector:

1. Navigate to **Data > Sources > Collector Jobs** in Cribl Stream.
2. Locate the desired `in_upwind_*` job.
3. Click **Edit** and toggle **Enabled** to `on`.
4. Save the configuration.

### Routing Data

By default, all collectors send data to **Worker Group Routes** (`sendToRoutes: true`). You can configure routing in your Cribl Stream pipeline to send data to:
- Splunk (via HEC)
- Elastic
- S3
- Any other configured Cribl output

## Data Schema

### Alerts (`upwind:alert`)
```json
{
  "alertId": "...",
  "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFORMATIONAL",
  "title": "...",
  "description": "...",
  "resourceId": "...",
  "resourceType": "...",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z",
  "status": "OPEN|RESOLVED|SUPPRESSED"
}
```

### Vulnerabilities (`upwind:vulnerability`)
```json
{
  "vulnerabilityId": "...",
  "cveId": "CVE-XXXX-XXXXX",
  "cvssScore": 9.8,
  "severity": "CRITICAL|HIGH|MEDIUM|LOW",
  "packageName": "...",
  "packageVersion": "...",
  "fixedVersion": "...",
  "resourceId": "...",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### Assets (`upwind:asset`)
```json
{
  "assetId": "...",
  "resourceType": "Container|Pod|Node|Function|...",
  "name": "...",
  "cloudProvider": "AWS|GCP|Azure",
  "region": "...",
  "cluster": "...",
  "namespace": "...",
  "lastSeen": "2024-01-01T00:00:00Z"
}
```

### Threats (`upwind:threat`)
```json
{
  "threatId": "...",
  "type": "...",
  "severity": "CRITICAL|HIGH|MEDIUM|LOW",
  "description": "...",
  "resourceId": "...",
  "processName": "...",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Identities (`upwind:identity`)
```json
{
  "identityId": "...",
  "type": "User|ServiceAccount|Role",
  "name": "...",
  "cloudProvider": "AWS|GCP|Azure",
  "permissions": ["..."],
  "lastActivity": "2024-01-01T00:00:00Z"
}
```

## API Endpoints Used

All requests target `https://api.upwind.io/v1/organizations/{organizationId}/`:

| Endpoint | Method | Description |
|---|---|---|
| `/alerts` | GET | Security alerts with time-range filtering |
| `/vulnerabilities` | GET | Vulnerability findings |
| `/inventory/assets` | GET | Asset inventory |
| `/threats` | GET | Runtime threat detections |
| `/identities` | GET | Identity and access data |

### Pagination

Upwind's API uses cursor-based pagination via a `nextPage` field in the response body. The collectors are configured to follow up to 100 pages per run with a page size of 500 records.

### Rate Limiting

The pack implements exponential backoff retry logic for HTTP `429` (Too Many Requests) and `503` (Service Unavailable) responses, with:
- Initial retry interval: 1 second
- Multiplier: 2x
- Maximum interval: 20 seconds
- Maximum retries: 5

## Troubleshooting

**Collector returns 401 Unauthorized**
- Verify `upwind_api_key` is set correctly and has not expired.
- Ensure the API key has the necessary permissions in the Upwind console.

**Collector returns 403 Forbidden**
- Verify `upwind_organization_id` is correct.
- Confirm your API key belongs to the specified organization.

**No data collected**
- Check that the collector is enabled.
- Review the Cribl Stream job logs for error messages.
- Verify network connectivity from Cribl workers to `api.upwind.io`.

**Duplicate events**
- State tracking is enabled for time-series collectors (alerts, threats). If state is reset, events within the overlap window may be re-collected.

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Support

- Upwind documentation: https://docs.upwind.io
- Cribl community: https://cribl.io/community
- Pack issues: https://github.com/criblpacks/cribl-upwind-rest-io/issues
