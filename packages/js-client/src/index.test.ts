import { describe, expect, it } from "bun:test";
import { TelemetryClient } from "./index";

describe("TelemetryClient", () => {
	it("should generate an instance_id", () => {
		const client = new TelemetryClient({
			appId: "test_app",
			endpoint: "https://localhost:8787/v1/events",
		});
		expect((client as any).instanceId).toBeDefined();
		expect((client as any).instanceId.length).toBeGreaterThan(0);
	});

	it("should respect DO_NOT_TRACK env var", () => {
		process.env.DO_NOT_TRACK = "1";
		const client = new TelemetryClient({
			appId: "test_app",
			endpoint: "https://localhost:8787/v1/events",
		});
		expect((client as any).enabled).toBe(false);
		delete process.env.DO_NOT_TRACK;
	});

	it("should respect app-specific NO_TELEMETRY env var", () => {
		process.env.TEST_APP_NO_TELEMETRY = "1";
		const client = new TelemetryClient({
			appId: "test_app",
			endpoint: "https://localhost:8787/v1/events",
		});
		expect((client as any).enabled).toBe(false);
		delete process.env.TEST_APP_NO_TELEMETRY;
	});

	it("should buffer events", () => {
		const client = new TelemetryClient({
			appId: "test_app",
			endpoint: "https://localhost:8787/v1/events",
			batchSize: 5,
		});

		client.track("test_event", { foo: "bar" });
		expect((client as any).buffer.length).toBe(1);
	});
});
