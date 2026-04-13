import { useData } from "vike-react/useData";
import type { Data } from "./+data";

export default function Page() {
	const data = useData<Data>();

	return (
		<>
			<h1>Telemetry Applications</h1>
			<p>List of applications sending telemetry data.</p>
			<ul>
				{data.apps.map((app) => (
					<li key={app.app_id}>
						<a href={`/telemetry/${app.app_id}`}>{app.app_id}</a> (
						{app.total_events} events)
					</li>
				))}
			</ul>
			{data.apps.length === 0 && <p>No applications found.</p>}
		</>
	);
}
