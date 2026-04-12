export interface TelemetryConfig {
  appId: string;
  endpoint: string;
  appVersion?: string;
  platform?: string;
  flushInterval?: number;
  batchSize?: number;
  telemetryEnabled?: boolean;
}

export interface TelemetryEvent {
  app_id: string;
  instance_id: string;
  app_version: string;
  platform: string;
  event_name: string;
  properties: Record<string, any>;
  timestamp: number;
}

export class TelemetryClient {
  private appId: string;
  private endpoint: string;
  private appVersion: string;
  private platform: string;
  private instanceId: string;
  private enabled: boolean;
  private buffer: TelemetryEvent[] = [];
  private flushInterval: number;
  private batchSize: number;
  private timer: any = null;

  constructor(config: TelemetryConfig) {
    this.appId = config.appId;
    this.endpoint = config.endpoint;
    this.flushInterval = config.flushInterval || 60000;
    this.batchSize = config.batchSize || 10;

    // Check opt-out
    const dnt = typeof process !== 'undefined' ? process.env?.DO_NOT_TRACK === '1' : false;
    const appNoTelemetry = typeof process !== 'undefined' ? process.env?.[`${this.appId.toUpperCase()}_NO_TELEMETRY`] === '1' : false;
    const telemetryEnabledFlag = config.telemetryEnabled !== false;
    
    this.enabled = telemetryEnabledFlag && !dnt && !appNoTelemetry;

    this.instanceId = this.getOrCreateInstanceId();
    this.appVersion = config.appVersion || '0.0.0';
    this.platform = config.platform || this.detectPlatform();

    if (this.enabled) {
      this.startTimer();
      if (typeof window !== 'undefined') {
        window.addEventListener('unload', () => this.flushSync());
      }
    }
  }

  public track(eventName: string, properties: Record<string, any> = {}) {
    if (!this.enabled) return;

    const event: TelemetryEvent = {
      app_id: this.appId,
      instance_id: this.instanceId,
      app_version: this.appVersion,
      platform: this.platform,
      event_name: eventName,
      properties,
      timestamp: Date.now(),
    };

    this.buffer.push(event);

    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  private async flush() {
    if (this.buffer.length === 0) return;

    const eventsToFlush = [...this.buffer];
    this.buffer = [];

    try {
      await Promise.all(
        eventsToFlush.map(event =>
          fetch(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
          })
        )
      );
    } catch (e) {
      // Gracefully no-op on network failure
      console.warn('Telemetry flush failed', e);
    }
  }

  private flushSync() {
    if (this.buffer.length === 0) return;
    
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      for (const event of this.buffer) {
        navigator.sendBeacon(this.endpoint, JSON.stringify(event));
      }
      this.buffer = [];
    } else {
      this.flush();
    }
  }

  private startTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.flush(), this.flushInterval);
  }

  private getOrCreateInstanceId(): string {
    const key = this.appId;
    if (typeof localStorage !== 'undefined') {
      let id = localStorage.getItem(key);
      if (!id) {
        id = this.generateUuid();
        localStorage.setItem(key, id);
      }
      return id;
    }
    return this.generateUuid();
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private detectPlatform(): string {
    if (typeof window !== 'undefined' && window.navigator) {
      return window.navigator.platform;
    }
    if (typeof process !== 'undefined') {
      return process.platform;
    }
    return 'unknown';
  }
}
