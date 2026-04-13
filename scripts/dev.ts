#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { $ } from "bun";

const ROOT = resolve(import.meta.dirname, "..");
const WORKER_DIR = resolve(ROOT, "packages/worker");
const APP_DIR = resolve(ROOT, "packages/telemetry-app");
const EXAMPLE_DIR = resolve(ROOT, "packages/examples/react-app");

const WORKER_PORT = 8787;
const APP_PORT = 3000;
const EXAMPLE_PORT = 3001;

// ── helpers ──────────────────────────────────────────────────────────

const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const _red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function log(tag: string, msg: string) {
	console.log(`${cyan(`[${tag}]`)} ${msg}`);
}

function prefixStream(tag: string, stream: ReadableStream<Uint8Array>) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const prefix = `${cyan(`[${tag}]`)} `;

	(async () => {
		let buffer = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop()!;
			for (const line of lines) {
				console.log(prefix + line);
			}
		}
		if (buffer) console.log(prefix + buffer);
	})();
}

// ── checks ───────────────────────────────────────────────────────────

function checkDevVars(dir: string, name: string) {
	const devVars = resolve(dir, ".dev.vars");
	const example = resolve(dir, ".dev.vars.example");
	if (!existsSync(devVars) && existsSync(example)) {
		console.log(
			yellow(
				`  ⚠ ${name}/.dev.vars missing — copy from .dev.vars.example and fill in values`,
			),
		);
		return false;
	}
	return true;
}

// ── install ──────────────────────────────────────────────────────────

async function install() {
	log("setup", "Installing dependencies...");
	await $`bun install`.cwd(ROOT).quiet();
}

// ── d1 local schema ──────────────────────────────────────────────────

async function initD1() {
	const schemaPath = resolve(WORKER_DIR, "schema.sql");
	if (!existsSync(schemaPath)) return;

	log("setup", "Applying D1 schema locally...");
	try {
		await $`bunx wrangler d1 execute telemetry_db --local --file=schema.sql`
			.cwd(WORKER_DIR)
			.quiet();
	} catch {
		// table already exists — fine
	}
}

// ── processes ────────────────────────────────────────────────────────

function startWorker() {
	log("worker", `Starting on port ${WORKER_PORT}...`);
	const proc = Bun.spawn(
		["bunx", "wrangler", "dev", "--port", String(WORKER_PORT)],
		{ cwd: WORKER_DIR, stdout: "pipe", stderr: "pipe" },
	);
	prefixStream("worker", proc.stdout);
	prefixStream("worker", proc.stderr);
	return proc;
}

function startApp() {
	log("app", `Starting on port ${APP_PORT}...`);
	const proc = Bun.spawn(["bun", "run", "dev", "--port", String(APP_PORT)], {
		cwd: APP_DIR,
		stdout: "pipe",
		stderr: "pipe",
	});
	prefixStream("app", proc.stdout);
	prefixStream("app", proc.stderr);
	return proc;
}

function startExample() {
	log("example", `Starting on port ${EXAMPLE_PORT}...`);
	const proc = Bun.spawn(["bun", "--hot", "src/index.ts"], {
		cwd: EXAMPLE_DIR,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			PORT: String(EXAMPLE_PORT),
			BUN_PUBLIC_TELEMETRY_ENDPOINT: `http://localhost:${WORKER_PORT}/v1/events`,
		},
	});
	prefixStream("example", proc.stdout);
	prefixStream("example", proc.stderr);
	return proc;
}

// ── main ─────────────────────────────────────────────────────────────

console.log(bold("\n  g-telemetry dev\n"));

checkDevVars(WORKER_DIR, "worker");
checkDevVars(APP_DIR, "telemetry-app");

await install();
await initD1();

const procs = [startWorker(), startApp(), startExample()];

console.log(`
${green("Ready:")}
  ${bold("Worker")}    → http://localhost:${WORKER_PORT}
  ${bold("Dashboard")} → http://localhost:${APP_PORT}
  ${bold("Example")}   → http://localhost:${EXAMPLE_PORT}

  Press ${bold("Ctrl+C")} to stop all.
`);

// clean shutdown
process.on("SIGINT", () => {
	console.log("\nShutting down...");
	for (const p of procs) p.kill();
	process.exit(0);
});

process.on("SIGTERM", () => {
	for (const p of procs) p.kill();
	process.exit(0);
});

// keep alive — wait for any to exit
await Promise.race(procs.map((p) => p.exited));
for (const p of procs) p.kill();
