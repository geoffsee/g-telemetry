import type { IRequest } from "itty-router";
import { AutoRouter } from "itty-router";

type Bindings = {
	DB: D1Database;
	TELEMETRY_KV: KVNamespace;
	RATE_LIMIT_RPM: number;
	MAX_PAYLOAD_SIZE: number;
	BASIC_AUTH: string;
};

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

const router = AutoRouter<IRequest, [Bindings, ExecutionContext]>();

// CORS preflight
router.options(
	"/v1/events",
	() => new Response(null, { status: 204, headers: corsHeaders }),
);

// Rate limiter implementation
async function checkRateLimit(kv: KVNamespace, appId: string, limit: number) {
	const minute = Math.floor(Date.now() / 60000);
	const key = `rl:${appId}:${minute}`;
	const count = await kv.get(key);
	const currentCount = count ? parseInt(count, 10) : 0;

	if (currentCount >= limit) {
		return false;
	}

	await kv.put(key, (currentCount + 1).toString(), { expirationTtl: 60 });
	return true;
}

// Basic Auth Middleware
async function basicAuth(req: IRequest, env: Bindings) {
	const authHeader = req.headers.get("Authorization");
	if (!authHeader?.startsWith("Basic ")) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: {
				"Content-Type": "application/json",
				"WWW-Authenticate": 'Basic realm="Telemetry"',
			},
		});
	}

	const base64 = authHeader.split(" ")[1];
	if (!base64) {
		return new Response(
			JSON.stringify({ error: "Invalid Authorization header" }),
			{
				status: 401,
				headers: {
					"Content-Type": "application/json",
					"WWW-Authenticate": 'Basic realm="Telemetry"',
				},
			},
		);
	}

	const decoded = atob(base64);

	if (decoded !== env.BASIC_AUTH) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: {
				"Content-Type": "application/json",
				"WWW-Authenticate": 'Basic realm="Telemetry"',
			},
		});
	}
}

// Health check
router.get("/v1/health", () => ({ status: "ok" }));

// Stats by App ID
router.get(
	"/v1/stats/:app_id",
	basicAuth,
	async (req: IRequest, env: Bindings) => {
		const { app_id } = req.params;
		const db = env.DB;

		try {
			const eventsByEventName = await db
				.prepare(
					"SELECT event_name, COUNT(*) as count FROM events WHERE app_id = ? GROUP BY event_name",
				)
				.bind(app_id)
				.all();

			const eventsByPlatform = await db
				.prepare(
					"SELECT platform, COUNT(*) as count FROM events WHERE app_id = ? GROUP BY platform",
				)
				.bind(app_id)
				.all();

			const eventsByVersion = await db
				.prepare(
					"SELECT app_version, COUNT(*) as count FROM events WHERE app_id = ? GROUP BY app_version",
				)
				.bind(app_id)
				.all();

			const errorRates = await db
				.prepare(
					`SELECT 
        (SELECT COUNT(*) FROM events WHERE app_id = ? AND event_name = 'error') * 1.0 / 
        (SELECT COUNT(*) FROM events WHERE app_id = ?) as rate`,
				)
				.bind(app_id, app_id)
				.first();

			return {
				app_id,
				by_event: eventsByEventName.results,
				by_platform: eventsByPlatform.results,
				by_version: eventsByVersion.results,
				error_rate: (errorRates as any)?.rate || 0,
			};
		} catch (e: any) {
			console.error(e);
			return new Response(JSON.stringify({ error: "Failed to fetch stats" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}
	},
);

// List known apps and volumes
router.get("/v1/apps", basicAuth, async (_req, env: Bindings) => {
	const db = env.DB;
	try {
		const apps = await db
			.prepare(
				"SELECT app_id, COUNT(*) as total_events FROM events GROUP BY app_id",
			)
			.all();
		return { apps: apps.results };
	} catch (e: any) {
		console.error(e);
		return new Response(JSON.stringify({ error: "Failed to fetch apps" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
});

// Ingestion endpoint
router.post("/v1/events", async (req, env: Bindings) => {
	const { DB, TELEMETRY_KV, RATE_LIMIT_RPM, MAX_PAYLOAD_SIZE } = env;

	const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
	if (contentLength > (MAX_PAYLOAD_SIZE || 102400)) {
		return new Response(JSON.stringify({ error: "Payload too large" }), {
			status: 413,
			headers: { "Content-Type": "application/json", ...corsHeaders },
		});
	}

	let body: any;
	try {
		body = await req.json();
	} catch (_e) {
		return new Response(JSON.stringify({ error: "Invalid JSON" }), {
			status: 400,
			headers: { "Content-Type": "application/json", ...corsHeaders },
		});
	}

	// Schema Validation
	const {
		app_id,
		instance_id,
		app_version,
		platform,
		event_name,
		properties,
		timestamp,
	} = body;
	if (!app_id || !instance_id || !event_name) {
		return new Response(
			JSON.stringify({
				error: "Missing required fields: app_id, instance_id, event_name",
			}),
			{
				status: 400,
				headers: { "Content-Type": "application/json", ...corsHeaders },
			},
		);
	}

	// Rate Limiting
	const allowed = await checkRateLimit(
		TELEMETRY_KV,
		app_id,
		RATE_LIMIT_RPM || 1000,
	);
	if (!allowed) {
		return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
			status: 429,
			headers: { "Content-Type": "application/json", ...corsHeaders },
		});
	}

	// Durable Storage in D1
	try {
		await DB.prepare(
			`INSERT INTO events (app_id, instance_id, app_version, platform, event_name, properties, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
			.bind(
				app_id,
				instance_id,
				app_version || null,
				platform || null,
				event_name,
				properties ? JSON.stringify(properties) : null,
				timestamp || Date.now(),
			)
			.run();

		return new Response(JSON.stringify({ status: "accepted" }), {
			status: 202,
			headers: { "Content-Type": "application/json", ...corsHeaders },
		});
	} catch (e: any) {
		console.error(e);
		return new Response(JSON.stringify({ error: "Failed to store event" }), {
			status: 500,
			headers: { "Content-Type": "application/json", ...corsHeaders },
		});
	}
});

export default {
	fetch: (request: Request, env: Bindings, ctx: ExecutionContext) =>
		router.fetch(request, env, ctx),
};
