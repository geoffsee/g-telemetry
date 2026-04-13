import { useData } from "vike-react/useData";
import type { AppData } from "./+data";

export default function Page() {
	const data = useData<AppData>();

	return (
		<>
			<h1>Stats for {data.app_id}</h1>
			<p>Error Rate: {(data.error_rate * 100).toFixed(2)}%</p>

			<h2>Events by Name</h2>
			<ul>
				{data.by_event.map((item) => (
					<li key={item.event_name}>
						{item.event_name}: {item.count}
					</li>
				))}
			</ul>

			<h2>By Platform</h2>
			<ul>
				{data.by_platform.map((item) => (
					<li key={item.platform}>
						{item.platform || "unknown"}: {item.count}
					</li>
				))}
			</ul>

			<h2>By Version</h2>
			<ul>
				{data.by_version.map((item) => (
					<li key={item.app_version}>
						{item.app_version || "unknown"}: {item.count}
					</li>
				))}
			</ul>

			<p>
				<a href="/telemetry">Back to Applications</a>
			</p>
		</>
	);
}
