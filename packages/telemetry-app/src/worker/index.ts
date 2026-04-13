import "../../dist/server/entry.mjs";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { jwtVerify, SignJWT } from "jose";
import { renderPage } from "vike/server";

type Bindings = {
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	SESSION_SECRET: string;
	ALLOWED_GITHUB_USERNAMES: string; // Comma-separated list
	TELEMETRY_SINK_URL: string;
	TELEMETRY_SINK_AUTH: string; // user:password for Basic Auth
	TELEMETRY_SINK: { fetch: typeof fetch }; // Service binding to sink worker
};

const app = new Hono<{ Bindings: Bindings }>();

// --- Session Helper ---
async function getSession(c: any) {
	const token = getCookie(c, "telemetry_session");
	if (!token) return null;
	try {
		const { payload } = await jwtVerify(
			token,
			new TextEncoder().encode(c.env.SESSION_SECRET),
		);
		return payload;
	} catch {
		return null;
	}
}

// --- GitHub Auth Routes ---
app.get("/login/github", async (c) => {
	const code = c.req.query("code");

	if (!code) {
		// Redirect to GitHub OAuth
		const params = new URLSearchParams({
			client_id: c.env.GITHUB_CLIENT_ID,
			redirect_uri: `${new URL(c.req.url).origin}/login/github`,
			scope: "read:user",
		});
		return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
	}

	// Exchange code for token
	const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			client_id: c.env.GITHUB_CLIENT_ID,
			client_secret: c.env.GITHUB_CLIENT_SECRET,
			code,
		}),
	});
	const tokenData = (await tokenRes.json()) as any;
	console.log("Token exchange status:", tokenRes.status);

	if (!tokenData.access_token) {
		console.log("Token error:", JSON.stringify(tokenData));
		return c.text(
			"GitHub login failed: " +
				(tokenData.error_description || tokenData.error || "unknown"),
			401,
		);
	}

	// Fetch user info
	const userRes = await fetch("https://api.github.com/user", {
		headers: {
			Authorization: `Bearer ${tokenData.access_token}`,
			"User-Agent": "g-telemetry",
		},
	});
	const user = (await userRes.json()) as any;

	if (!user?.login) {
		return c.text("GitHub login failed", 401);
	}

	// Check if user is allowed (optional, but recommended)
	const allowedUsers =
		c.env.ALLOWED_GITHUB_USERNAMES?.split(",")
			.filter(Boolean)
			.map((u: string) => u.trim()) || [];
	if (allowedUsers.length > 0 && !allowedUsers.includes(user.login)) {
		return c.text("User not authorized", 403);
	}

	// Create session
	const token = await new SignJWT({
		login: user.login,
		avatar: user.avatar_url,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime("24h")
		.sign(new TextEncoder().encode(c.env.SESSION_SECRET));

	setCookie(c, "telemetry_session", token, {
		httpOnly: true,
		secure: true,
		sameSite: "Lax",
		path: "/",
		maxAge: 60 * 60 * 24, // 24 hours
	});

	return c.redirect("/");
});

app.get("/logout", (c) => {
	deleteCookie(c, "telemetry_session");
	return c.redirect("/");
});

// --- API Proxy ---
app.all("/api/telemetry/*", async (c) => {
	const session = await getSession(c);
	if (!session) return c.json({ error: "Unauthorized" }, 401);

	const urlObj = new URL(c.req.url);
	const fullPath = urlObj.pathname.replace("/api/telemetry", "");
	const search = urlObj.search;
	const url = `${c.env.TELEMETRY_SINK_URL}${fullPath}${search}`;

	const headers = new Headers();
	headers.set("Authorization", `Basic ${btoa(c.env.TELEMETRY_SINK_AUTH)}`);

	const fetcher = c.env.TELEMETRY_SINK ?? globalThis.fetch;
	const response = await fetcher.fetch(url, {
		method: c.req.method,
		headers,
		body:
			c.req.method !== "GET" && c.req.method !== "HEAD"
				? await c.req.raw.blob()
				: undefined,
	});

	return new Response(response.body, {
		status: response.status,
		headers: {
			"Content-Type":
				response.headers.get("content-type") || "application/json",
		},
	});
});

// --- Vike SSR ---
app.all("*", async (c) => {
	const session = await getSession(c);

	if (!session && !c.req.path.startsWith("/login")) {
		return c.html(
			`<h1>Telemetry Dashboard</h1><p><a href="/login/github">Login with GitHub</a></p>`,
		);
	}

	if (c.env.TELEMETRY_SINK) {
		(globalThis as any).__sinkFetch = (url: string, init?: RequestInit) =>
			c.env.TELEMETRY_SINK.fetch(url, init);
	}
	const pageContextInit = {
		urlOriginal: c.req.url,
		user: session,
		env: c.env,
	};
	const pageContext = await renderPage(pageContextInit);
	const { httpResponse } = pageContext;
	if (!httpResponse) return c.notFound();

	return new Response(httpResponse.body, {
		status: httpResponse.statusCode,
		headers: httpResponse.contentType
			? { "Content-Type": httpResponse.contentType }
			: {},
	});
});

export default app;
