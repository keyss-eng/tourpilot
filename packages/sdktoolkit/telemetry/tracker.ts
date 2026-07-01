import { ApiClient } from '../api/client';
import { SessionManager } from './session';
import type { TelemetryPayload } from '../api/types';

export class Tracker {
  private apiClient: ApiClient;
  private userId: string;
  private sessionId: string;
  private queue: TelemetryPayload[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  // ✅ Store handler reference so destroy() can remove it — previously the
  // anonymous () => this.flush(true) lambda was never removable, causing each
  // Tracker instance (one per tour) to leak a beforeunload listener permanently.
  private unloadHandler: () => void;
  private failureCount = 0;

  constructor(apiClient: ApiClient, userId: string) {
    this.apiClient = apiClient;
    this.userId = userId;
    this.sessionId = SessionManager.getSessionId();
    this.unloadHandler = () => this.flush(true);
    this.startBatching();
  }

  public track(
    eventType: TelemetryPayload['eventType'],
    tourId: string,
    metadata: Record<string, any> = {}
  ) {
    const { stepIndex, ...restMetadata } = metadata;
    const payload: TelemetryPayload = {
      sessionId: this.sessionId,
      userId: this.userId,
      tourId,
      stepIndex,
      eventType,
      metadata: { ...restMetadata, timestamp: Date.now() }
    };
    this.queue.push(payload);
  }

  private startBatching() {
    if (typeof window === 'undefined') return;

    this.flushInterval = setInterval(() => this.flush(), 5000);

    // FIX BUG 13: Replaced sendBeacon with fetch + keepalive:true.
    window.addEventListener('beforeunload', this.unloadHandler);
  }

  private flush(isUnloading = false) {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];

    fetch(`${this.apiClient.baseUrl}/analytics/batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiClient.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ events: batch }),
      keepalive: isUnloading
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        this.failureCount = 0;
      })
      .catch((err) => {
        this.queue = [...batch, ...this.queue]; // requeue, keep newer events first
        if (this.queue.length > 500) {
          this.queue = this.queue.slice(-500); // keep newest 500 events
        }
        this.failureCount++;
        if (this.failureCount > 5) {
          if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
          }
          this.apiClient.config.onError?.(new Error(`AITour analytics failed ${this.failureCount} times, batching disabled: ${err.message}`));
        }
      });
  }

  public destroy() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    window.removeEventListener('beforeunload', this.unloadHandler);
    this.flush();
  }
}