import type { PageContextServer } from "vike/types";
export type Data = {
	apps: { app_id: string; total_events: number }[];
};

export async function data(pageContext: PageContextServer): Promise<Data> {
	const { env } = pageContext as any;
	const url = `${env.TELEMETRY_SINK_URL}/v1/apps`;

	const doFetch = (globalThis as any).__sinkFetch ?? fetch;
	const response = await doFetch(url, {
		headers: {
			Authorization: `Basic ${btoa(env.TELEMETRY_SINK_AUTH)}`,
		},
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		console.error(`Fetch apps failed: ${response.status} ${body}, url: ${url}`);
		throw new Error("Failed to fetch telemetry apps");
	}

	return (await response.json()) as Data;
}
