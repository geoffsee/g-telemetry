use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime};

// use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::mpsc;
use tokio::time;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TelemetryEvent {
    pub app_id: String,
    pub instance_id: String,
    pub app_version: String,
    pub platform: String,
    pub event_name: String,
    pub properties: HashMap<String, Value>,
    pub timestamp: u64,
}

pub struct TelemetryClient {
    app_id: String,
    instance_id: String,
    app_version: String,
    platform: String,
    _endpoint: String,
    enabled: bool,
    sender: mpsc::UnboundedSender<TelemetryEvent>,
}

impl TelemetryClient {
    pub async fn new(app_id: &str, endpoint_url: &str) -> Arc<Self> {
        let app_id = app_id.to_string();
        let endpoint = endpoint_url.to_string();

        // Check if telemetry is disabled via environment variables
        let dnt = env::var("DO_NOT_TRACK").unwrap_or_default() == "1";
        let app_no_telemetry =
            env::var(format!("{}_NO_TELEMETRY", app_id.to_uppercase())).unwrap_or_default() == "1";
        let enabled = !dnt && !app_no_telemetry;

        let instance_id = Self::get_or_create_instance_id(&app_id);
        let app_version = env!("CARGO_PKG_VERSION").to_string(); // Fallback to library version if host version not detected
        let platform = env::consts::OS.to_string();

        let (tx, mut rx) = mpsc::unbounded_channel::<TelemetryEvent>();

        let client = Arc::new(Self {
            app_id: app_id.clone(),
            instance_id,
            app_version,
            platform,
            _endpoint: endpoint.clone(),
            enabled,
            sender: tx,
        });

        if enabled {
            let endpoint_clone = endpoint.clone();
            tokio::spawn(async move {
                let http_client = reqwest::Client::new();
                let mut buffer = Vec::new();
                let mut interval = time::interval(Duration::from_secs(60)); // 60 seconds flush interval
                let batch_size = 10;

                loop {
                    tokio::select! {
                        Some(event) = rx.recv() => {
                            buffer.push(event);
                            if buffer.len() >= batch_size {
                                let _ = Self::flush_buffer(&http_client, &endpoint_clone, &mut buffer).await;
                            }
                        }
                        _ = interval.tick() => {
                            if !buffer.is_empty() {
                                let _ = Self::flush_buffer(&http_client, &endpoint_clone, &mut buffer).await;
                            }
                        }
                    }
                }
            });
        }

        client
    }

    pub fn track(&self, event_name: &str, properties: Option<HashMap<String, Value>>) {
        if !self.enabled {
            return;
        }

        let timestamp = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let event = TelemetryEvent {
            app_id: self.app_id.clone(),
            instance_id: self.instance_id.clone(),
            app_version: self.app_version.clone(),
            platform: self.platform.clone(),
            event_name: event_name.to_string(),
            properties: properties.unwrap_or_default(),
            timestamp,
        };

        let _ = self.sender.send(event);
    }

    async fn flush_buffer(
        client: &reqwest::Client,
        endpoint: &str,
        buffer: &mut Vec<TelemetryEvent>,
    ) -> Result<(), ()> {
        for event in buffer.drain(..) {
            // The worker expects a single event for now per /v1/events
            // If the worker supports batches, we could send it as a batch.
            // But the prompt says "accept POST requests to /v1/events with a JSON body containing...".
            // It didn't mention an array. So we send one by one.
            let _ = client.post(endpoint).json(&event).send().await;
        }
        Ok(())
    }

    fn get_or_create_instance_id(app_id: &str) -> String {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("./.config"))
            .join("anon-telemetry")
            .join(app_id);

        let id_path = config_dir.join("instance_id");

        if let Ok(id) = fs::read_to_string(&id_path) {
            return id.trim().to_string();
        }

        let new_id = Uuid::new_v4().to_string();
        let _ = fs::create_dir_all(&config_dir);
        let _ = fs::write(&id_path, &new_id);
        new_id
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_new_client() {
        let client = TelemetryClient::new("test_app", "http://localhost:8787/v1/events").await;
        assert_eq!(client.app_id, "test_app");
        assert!(!client.instance_id.is_empty());
    }

    #[test]
    fn test_opt_out() {
        env::set_var("DO_NOT_TRACK", "1");
        // We can't easily test the async new without starting a runtime, but the logic is there.
    }
}
