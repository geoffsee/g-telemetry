import type { PageContextServer } from 'vike/types';

export type Data = {
  apps: { app_id: string; total_events: number }[];
};

export async function data(pageContext: PageContextServer): Promise<Data> {
  const { env } = pageContext as any;
  const url = `${env.TELEMETRY_SINK_URL}/v1/apps`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Basic ${btoa(env.TELEMETRY_SINK_AUTH)}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch telemetry apps');
  }

  return response.json();
}
