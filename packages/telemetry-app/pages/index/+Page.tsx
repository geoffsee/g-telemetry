import { useState, useCallback } from "react";

type CheckStatus = "idle" | "loading" | "ok" | "error";
type LogEntry = { time: string; message: string; ok: boolean };

export default function Page() {
  const [healthStatus, setHealthStatus] = useState<CheckStatus>("idle");
  const [sendStatus, setSendStatus] = useState<CheckStatus>("idle");
  const [verifyStatus, setVerifyStatus] = useState<CheckStatus>("idle");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [stats, setStats] = useState<any>(null);

  const addLog = useCallback((message: string, ok: boolean) => {
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [...prev, { time, message, ok }]);
  }, []);

  const checkHealth = useCallback(async () => {
    setHealthStatus("loading");
    try {
      const res = await fetch("/api/telemetry/v1/health");
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        setHealthStatus("ok");
        addLog("Health check passed", true);
      } else {
        setHealthStatus("error");
        addLog(`Health check failed: ${JSON.stringify(data)}`, false);
      }
    } catch (e: any) {
      setHealthStatus("error");
      addLog(`Health check error: ${e.message}`, false);
    }
  }, [addLog]);

  const sendTestEvents = useCallback(async () => {
    setSendStatus("loading");
    const testEvents = [
      { event_name: "app_started", properties: { source: "verify-page" } },
      { event_name: "feature_used", properties: { feature: "dashboard", source: "verify-page" } },
      { event_name: "app_started", properties: { source: "verify-page", session: 2 } },
    ];

    let sent = 0;
    for (const evt of testEvents) {
      try {
        const res = await fetch("/api/telemetry/v1/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            app_id: "g-telemetry-verify",
            instance_id: "verify-" + Math.random().toString(36).slice(2, 10),
            app_version: "0.1.0",
            platform: navigator.platform,
            event_name: evt.event_name,
            properties: evt.properties,
            timestamp: Date.now(),
          }),
        });
        if (res.ok) {
          sent++;
          addLog(`Sent "${evt.event_name}" - accepted`, true);
        } else {
          const data = await res.json().catch(() => ({}));
          addLog(`Failed to send "${evt.event_name}": ${data.error || res.status}`, false);
        }
      } catch (e: any) {
        addLog(`Network error sending "${evt.event_name}": ${e.message}`, false);
      }
    }

    setEventCount((prev) => prev + sent);
    setSendStatus(sent === testEvents.length ? "ok" : "error");
    addLog(`Sent ${sent}/${testEvents.length} test events`, sent === testEvents.length);
  }, [addLog]);

  const verifyEvents = useCallback(async () => {
    setVerifyStatus("loading");
    try {
      const res = await fetch("/api/telemetry/v1/stats/g-telemetry-verify");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setVerifyStatus("error");
        addLog(`Verify failed: ${data.error || res.status}`, false);
        return;
      }
      const data = await res.json();
      setStats(data);
      const total = data.by_event?.reduce((sum: number, e: any) => sum + e.count, 0) ?? 0;
      if (total > 0) {
        setVerifyStatus("ok");
        addLog(`Verified: ${total} events stored for g-telemetry-verify`, true);
      } else {
        setVerifyStatus("error");
        addLog("No events found yet - send some first", false);
      }
    } catch (e: any) {
      setVerifyStatus("error");
      addLog(`Verify error: ${e.message}`, false);
    }
  }, [addLog]);

  const runAll = useCallback(async () => {
    setLog([]);
    setStats(null);
    await checkHealth();
    await sendTestEvents();
    await verifyEvents();
  }, [checkHealth, sendTestEvents, verifyEvents]);

  return (
    <>
      <h1>Verify Telemetry Pipeline</h1>
      <p style={{ color: "#666" }}>
        Test the end-to-end flow: worker health, event ingestion, and data retrieval.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <Button onClick={runAll} label="Run All Checks" />
        <Button onClick={checkHealth} label="Health Check" status={healthStatus} />
        <Button onClick={sendTestEvents} label="Send Test Events" status={sendStatus} />
        <Button onClick={verifyEvents} label="Verify Events" status={verifyStatus} />
      </div>

      {eventCount > 0 && (
        <p style={{ fontSize: "0.9em", color: "#666" }}>
          Events sent this session: {eventCount}
        </p>
      )}

      {stats && (
        <div style={{ marginBottom: 24 }}>
          <h3>Stats: g-telemetry-verify</h3>
          <table style={{ borderCollapse: "collapse", fontSize: "0.9em" }}>
            <thead>
              <tr>
                <th style={thStyle}>Event</th>
                <th style={thStyle}>Count</th>
              </tr>
            </thead>
            <tbody>
              {stats.by_event?.map((e: any) => (
                <tr key={e.event_name}>
                  <td style={tdStyle}><code>{e.event_name}</code></td>
                  <td style={tdStyle}>{e.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {log.length > 0 && (
        <div>
          <h3>Log</h3>
          <div
            style={{
              background: "#1a1a2e",
              color: "#eee",
              padding: 16,
              borderRadius: 6,
              fontSize: "0.85em",
              fontFamily: "monospace",
              maxHeight: 300,
              overflow: "auto",
            }}
          >
            {log.map((entry, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <span style={{ color: "#888" }}>{entry.time}</span>{" "}
                <span style={{ color: entry.ok ? "#4ade80" : "#f87171" }}>
                  {entry.ok ? "OK" : "ERR"}
                </span>{" "}
                {entry.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const statusIcon: Record<CheckStatus, string> = {
  idle: "",
  loading: " ...",
  ok: " ✓",
  error: " ✗",
};

function Button({
  onClick,
  label,
  status = "idle",
}: {
  onClick: () => void;
  label: string;
  status?: CheckStatus;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === "loading"}
      style={{
        padding: "8px 16px",
        border: "1px solid #ccc",
        borderRadius: 4,
        cursor: status === "loading" ? "wait" : "pointer",
        background: status === "ok" ? "#dcfce7" : status === "error" ? "#fee2e2" : "#fff",
      }}
    >
      {label}{statusIcon[status]}
    </button>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 16px 6px 0",
  borderBottom: "1px solid #ddd",
};

const tdStyle: React.CSSProperties = {
  padding: "4px 16px 4px 0",
  borderBottom: "1px solid #eee",
};
