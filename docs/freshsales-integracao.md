# Freshsales Integration Map

## Base URL and Auth

- Base URL: `https://hmadv-7b725ea101eff55.freshsales.io`
- Working auth mode: `Authorization: Token token=<FRESHSALES_API_KEY>`

## Working Read Patterns

- Selectors:
  - `/api/selector/owners`
  - `/api/selector/sales_activity_types`
  - `/api/selector/deal_reasons`
- Field metadata:
  - `/api/settings/contacts/fields`
  - `/api/settings/sales_accounts/fields`
  - `/api/settings/deals/fields`
  - `/api/settings/sales_activities/fields`
  - `/api/settings/leads/fields`
- Filters:
  - `/api/contacts/filters`
  - `/api/sales_accounts/filters`
  - `/api/deals/filters`
  - `/api/leads/filters`
- View by filter:
  - `/api/contacts/view/{filter_id}?page=1`
  - `/api/sales_accounts/view/{filter_id}?page=1`
  - `/api/deals/view/{filter_id}?page=1`
- Entity detail by ID:
  - `/api/contacts/{id}`
  - `/api/sales_accounts/{id}`
- Direct activity/task reads:
  - `/api/sales_activities?page=1`
  - `/api/tasks?page=1`

## Current Access Limits

- `contacts`, `sales_accounts`, `deals`, `sales_activities`, `leads` expose schema metadata.
- `contacts` and `sales_accounts` allow detail-by-id reads.
- `sales_activities` can be enriched with owners and target records.
- `leads` expose fields and filters, but list/view is currently returning `403`.
- `tasks` data read works, but `tasks` field metadata endpoint returned `404`.
- `deals` list by filter works, but detail-by-id may fail depending on record permissions.

## Published Supabase Probes

- `freshsalesWhoamiProbe`
- `freshsalesFilteredViewProbe`
- `freshsalesInventoryProbe`
- `freshsalesRecordsProbe`
- `freshsalesEntityDetailProbe`
- `freshsalesSchemaProbe`
- `freshsalesEnrichedActivitiesProbe`
- `freshsalesEntityBundleProbe`
- `freshsalesCanonicalAdapterProbe`
- `freshsalesSyncSnapshotsProbe`
- `freshsalesBatchSyncProbe`
- `freshsalesSnapshotsReadProbe`

## Sync Storage

- Migration: `007_create_freshsales_sync_storage.sql`
- Tables:
  - `public.freshsales_sync_runs`
  - `public.freshsales_sync_snapshots`

## Current Snapshot Coverage

- `contacts`
- `sales_accounts`
- `deals`

## Recommended Integration Path

1. Use `freshsalesSchemaProbe` to build field catalogs and choice maps.
2. Use `freshsalesEntityBundleProbe` to fetch schema + records together for integration-safe payloads.
3. Use `freshsalesEntityDetailProbe` for drill-down on contacts and sales accounts.
4. Use `freshsalesEnrichedActivitiesProbe` as the operational event feed.
5. Use `freshsalesCanonicalAdapterProbe` when the consuming system needs a stable internal shape with `attributes` and `custom_attributes` preserved.
6. Use `freshsalesSyncSnapshotsProbe` for isolated per-entity sync runs into Supabase.
7. Use `freshsalesBatchSyncProbe` to refresh multiple entities in sequence.
8. Use `freshsalesSnapshotsReadProbe` when internal dashboards or agents should read local snapshots instead of hitting Freshsales directly.

## AgentLab Inputs

The internal `AgentLab` dashboard should consume:

- `workspace_ai_agents` for agent registry and ownership
- `freshsales_sync_runs` for sync health and recency
- `freshsales_sync_snapshots` for CRM coverage and sample records
- `conversas` for channel footprint and recent conversation context
