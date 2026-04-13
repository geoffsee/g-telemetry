import type { PageContextServer } from "vike/types";

export type AppData = {
	app_id: string;
	by_event: { event_name: string; count: number }[];
	by_platform: { platform: string; count: number }[];
	by_version: { app_version: string; count: number }[];
	error_rate: number;
};

export async function data(pageContext: PageContextServer): Promise<AppData> {
	const { env } = pageContext as any;
	const { appId } = pageContext.routeParams;
	const url = `${env.TELEMETRY_SINK_URL}/v1/stats/${appId}`;

	const response = await fetch(url, {
		headers: {
			Authorization: `Basic ${btoa(env.TELEMETRY_SINK_AUTH)}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch stats for ${appId}`);
	}

	return (await response.json()) as AppData;
}
