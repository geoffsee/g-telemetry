#!/usr/bin/env bun

/**
 * Wrangler wrapper that injects resource IDs from .env.resources
 * into wrangler.toml {{PLACEHOLDER}} tokens before forwarding to wrangler.
 *
 * Usage: ./scripts/wrangler.ts deploy --env dev
 *        ./scripts/wrangler.ts dev --port 8787
 *
 * Transparently passes all arguments through to wrangler.
 * Looks for wrangler.toml in the current directory.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const RESOURCES_FILE = resolve(ROOT, ".env.resources");
const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

// ── Parse .env.resources ────────────────────────────────────────────

function loadResources(path: string): Map<string, string> {
	if (!existsSync(path)) {
		console.error(`Error: ${path} not found.`);
		console.error(
			`Copy .env.resources.example to .env.resources and fill in your IDs.`,
		);
		process.exit(1);
	}

	const vars = new Map<string, string>();
	const text = require("fs").readFileSync(path, "utf-8") as string;

	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		const value = trimmed.slice(eq + 1).trim();
		if (key && value) vars.set(key, value);
	}

	return vars;
}

// ── Resolve wrangler.toml with substitutions ────────────────────────

function resolveConfig(configPath: string, vars: Map<string, string>): string {
	const text = require("fs").readFileSync(configPath, "utf-8") as string;
	const missing: string[] = [];

	const resolved = text.replace(PLACEHOLDER_RE, (match, key) => {
		const value = vars.get(key);
		if (!value) {
			missing.push(key);
			return match;
		}
		return value;
	});

	if (missing.length > 0) {
		console.error(`Error: Missing resource IDs in .env.resources:`);
		for (const key of missing) {
			console.error(`  ${key}`);
		}
		process.exit(1);
	}

	return resolved;
}

// ── Main ────────────────────────────────────────────────────────────

const configPath = resolve(process.cwd(), "wrangler.toml");

if (!existsSync(configPath)) {
	// No wrangler.toml in cwd — just pass through to wrangler directly
	const proc = Bun.spawnSync(["bunx", "wrangler", ...process.argv.slice(2)], {
		stdio: ["inherit", "inherit", "inherit"],
		cwd: process.cwd(),
	});
	process.exit(proc.exitCode ?? 1);
}

// Check if config has placeholders
const configText = require("fs").readFileSync(configPath, "utf-8") as string;
if (!PLACEHOLDER_RE.test(configText)) {
	// No placeholders — pass through
	const proc = Bun.spawnSync(["bunx", "wrangler", ...process.argv.slice(2)], {
		stdio: ["inherit", "inherit", "inherit"],
		cwd: process.cwd(),
	});
	process.exit(proc.exitCode ?? 1);
}

// Resolve placeholders
const vars = loadResources(RESOURCES_FILE);
const resolved = resolveConfig(configPath, vars);

// Write resolved config next to the original so relative paths still work
const tmpConfig = configPath.replace(/\.toml$/, `.resolved.toml`);
require("fs").writeFileSync(tmpConfig, resolved);

const proc = Bun.spawnSync(
	["bunx", "wrangler", ...process.argv.slice(2), "--config", tmpConfig],
	{
		stdio: ["inherit", "inherit", "inherit"],
		cwd: process.cwd(),
	},
);

try {
	require("fs").unlinkSync(tmpConfig);
} catch {}

process.exit(proc.exitCode ?? 1);
