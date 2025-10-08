import { parse0x61 } from '../core/decode/wt9011';
import { ekfProcessor } from './ekfProcessor';

type DataCallback = (sample: {
  accel_g: [number, number, number];
  gyro_dps: [number, number, number];
  euler_deg: [number, number, number];
  timestamp_ms: number;
}) => void;

class DataRouter {
  private callbacks = new Set<DataCallback>();
  private unsubscribe: (() => void) | null = null;
  private isStreaming = false;

  subscribe(callback: DataCallback): () => void {
    this.callbacks.add(callback);
    console.log(`[DataRouter] Subscriber added (${this.callbacks.size} total)`);

    return () => {
      this.callbacks.delete(callback);
      console.log(`[DataRouter] Subscriber removed (${this.callbacks.size} remaining)`);
    };
  }

  startRouting(client: any) {
    if (this.isStreaming) {
      console.log('[DataRouter] Already routing data');
      return;
    }

    console.log('[DataRouter] Starting data routing');
    client.startStreaming();
    this.isStreaming = true;

    // Start EKF background processing thread
    ekfProcessor.start();

    const handleData = (data: Uint8Array) => {
      try {
        const sample = parse0x61(data);
        if (sample) {
          const parsedSample = {
            accel_g: sample.accel_g,
            gyro_dps: sample.gyro_dps,
            euler_deg: sample.euler_deg,
            timestamp_ms: sample.t
          };

          // Send to EKF processor (immediate processing)
          ekfProcessor.addSample(parsedSample);

          // Notify UI subscribers
          this.callbacks.forEach(callback => {
            try {
              callback(parsedSample);
            } catch (err) {
              console.error('[DataRouter] Callback error:', err);
            }
          });
        }
      } catch (err) {
        console.error('[DataRouter] Error handling data:', err);
      }
    };

    this.unsubscribe = client.onData(handleData);
  }

  stopRouting(client: any) {
    if (!this.isStreaming) {
      return;
    }

    console.log('[DataRouter] Stopping data routing');

    // Stop EKF background processing thread
    ekfProcessor.stop();

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // NOTE: Do NOT call client.stopStreaming() here!
    // BLE streaming should remain active for the entire connection lifetime
    // The dataRouter only manages its own subscription to the data

    this.isStreaming = false;
    this.callbacks.clear();
  }

  getSubscriberCount(): number {
    return this.callbacks.size;
  }
}

export const dataRouter = new DataRouter();
