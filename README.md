# Anon Telemetry

A generic, anonymous telemetry ingestion sink and client libraries for Rust and TypeScript/JS.

## Features

- **Anonymous by Design**: No PII, no IP logging, random instance IDs.
- **Privacy First**: Respects `DO_NOT_TRACK=1` and app-specific opt-outs.
- **Scalable Sink**: Built on Cloudflare Workers and D1 (or Analytics Engine).
- **Graceful Clients**: Buffering, background flushing, and reliable delivery (via `sendBeacon`).
- **Multi-tenant**: Partitioned by `app_id` to support many applications.

## Project Structure

- `packages/worker`: Cloudflare Worker (Ingestion Sink)
- `packages/telemetry-app`: Vike Web Dashboard (GitHub Login Protected)
- `packages/rust-client`: Rust crate (`anon-telemetry`)
- `packages/js-client`: TypeScript/JS library (`@anon-telemetry/client`)

## Ingestion Schema

Events sent to `/v1/events` should be JSON with:

| Field | Type | Description |
|---|---|---|
| `app_id` | `string` | **Required**. Unique identifier for the application. |
| `instance_id` | `uuid` | **Required**. Random UUIDv4 persisted on the client. |
| `event_name` | `string` | **Required**. Name of the event (e.g., `app_start`, `error`). |
| `app_version` | `string` | Version of the application. |
| `platform` | `string` | Operating system or platform (e.g., `macos`, `win32`). |
| `properties` | `object` | Key-value map for app-specific dimensions. |
| `timestamp` | `number` | Unix timestamp in milliseconds. |

## Privacy & Opt-out

The telemetry system is designed to be fully anonymous:
- No IP addresses are stored.
- No PII should be sent in `properties`.
- A random `instance_id` is generated on first use and persisted locally.

Users can opt-out by:
1. Setting the environment variable `DO_NOT_TRACK=1`.
2. Setting an app-specific override: `{APP_ID}_NO_TELEMETRY=1`.
3. Disabling via the client constructor (e.g., `telemetryEnabled: false`).

## Deployment (Worker)

1. Navigate to `packages/worker`.
2. Create a D1 database and a KV namespace in your Cloudflare account.
3. Update `wrangler.toml` with your `database_id` and `kv_namespaces.id`.
4. Copy `.dev.vars.example` to `.dev.vars` and configure for local development.
5. Run migrations: `wrangler d1 execute telemetry_db --file=schema.sql`.
6. Deploy: `wrangler deploy`.
7. Set the authentication secret: `echo "admin:password" | wrangler secret put BASIC_AUTH`.

## Deployment (Dashboard)

1. Navigate to `packages/telemetry-app`.
2. Update `wrangler.toml` with `TELEMETRY_SINK_URL`.
3. Copy `.dev.vars.example` to `.dev.vars` and configure for local development.
4. Set GitHub OAuth secrets:
   - `wrangler secret put GITHUB_CLIENT_ID`
   - `wrangler secret put GITHUB_CLIENT_SECRET`
   - `wrangler secret put SESSION_SECRET` (A random string)
   - `wrangler secret put TELEMETRY_SINK_AUTH` (Must match `BASIC_AUTH` in the worker)
4. (Optional) Set `ALLOWED_GITHUB_USERNAMES` to restrict access.
5. Deploy: `bun run deploy`.

## Usage (Rust)

```rust
use anon_telemetry::TelemetryClient;
use serde_json::json;

#[tokio::main]
async fn main() {
    let client = TelemetryClient::new("my_app", "https://telemetry.example.com/v1/events").await;
    
    client.track("app_started", Some(vec![
        ("workflow".to_string(), json!("main")),
    ].into_iter().collect()));
}
```

## Usage (TypeScript/JS)

```typescript
import { TelemetryClient } from '@anon-telemetry/client';

const telemetry = new TelemetryClient({
  appId: 'my_app',
  endpoint: 'https://telemetry.example.com/v1/events'
});

telemetry.track('button_click', { buttonId: 'submit' });
```

## Internal Endpoints (Authenticated)

Access to internal reporting endpoints requires HTTP Basic Authentication using the `BASIC_AUTH` secret configured in the Worker.

- `GET /v1/health`: Returns 200 OK (Public).
- `GET /v1/apps`: Lists all known app IDs and their event volumes.
- `GET /v1/stats/:app_id`: Returns aggregate stats for a specific app (event names, platforms, versions, error rates).
