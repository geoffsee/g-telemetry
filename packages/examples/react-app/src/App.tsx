import { useState, useEffect, useRef } from "react";
import { TelemetryClient } from "../../../js-client/src/index";

const ENDPOINT = process.env.BUN_PUBLIC_TELEMETRY_ENDPOINT || "http://localhost:8787/v1/events";

export function App() {
  const clientRef = useRef<TelemetryClient | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [clickCount, setClickCount] = useState(0);

  useEffect(() => {
    const client = new TelemetryClient({
      appId: "example-react-app",
      endpoint: ENDPOINT,
      appVersion: "0.1.0",
      flushInterval: 5000,
      batchSize: 5,
    });
    clientRef.current = client;

    client.track("app_started", { page: window.location.pathname });
    addEvent("app_started");
  }, []);

  const addEvent = (name: string) => {
    const ts = new Date().toLocaleTimeString();
    setEvents((prev) => [...prev, `${ts} - ${name}`]);
  };

  const trackClick = () => {
    const next = clickCount + 1;
    setClickCount(next);
    clientRef.current?.track("button_clicked", { count: next });
    addEvent(`button_clicked (count: ${next})`);
  };

  const trackFeature = (feature: string) => {
    clientRef.current?.track("feature_used", { feature });
    addEvent(`feature_used (${feature})`);
  };

  return (
    <div className="app">
      <h1>Telemetry Example</h1>
      <p className="subtitle">
        This app demonstrates <code>@anon-telemetry/client</code> integration.
        Events are sent to <code>{ENDPOINT}</code>.
      </p>

      <div className="actions">
        <button type="button" onClick={trackClick}>
          Click Me ({clickCount})
        </button>
        <button type="button" onClick={() => trackFeature("search")}>
          Use Search
        </button>
        <button type="button" onClick={() => trackFeature("export")}>
          Use Export
        </button>
        <button type="button" onClick={() => {
          clientRef.current?.track("error", { message: "simulated error" });
          addEvent("error (simulated)");
        }}>
          Simulate Error
        </button>
      </div>

      <div className="event-log">
        <h2>Tracked Events</h2>
        {events.length === 0 ? (
          <p className="empty">No events yet</p>
        ) : (
          <ul>
            {events.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default App;
