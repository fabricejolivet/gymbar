import { useEKFStore } from './ekfStore';

type RawSample = {
  accel_g: [number, number, number];
  gyro_dps: [number, number, number];
  euler_deg: [number, number, number];
  timestamp_ms: number;
};

class EKFProcessor {
  private isProcessing = false;

  start() {
    if (this.isProcessing) {
      console.log('[EKFProcessor] Already running');
      return;
    }

    console.log('[EKFProcessor] Starting immediate EKF processing');
    this.isProcessing = true;
  }

  stop() {
    if (!this.isProcessing) {
      return;
    }

    console.log('[EKFProcessor] Stopping EKF processing');
    this.isProcessing = false;
  }

  addSample(sample: RawSample) {
    if (!this.isProcessing) return;

    try {
      const ekfStore = useEKFStore.getState();

      if (!ekfStore || !ekfStore.processSample) {
        console.warn('[EKFProcessor] EKF store not ready');
        return;
      }

      ekfStore.processSample(sample);
    } catch (err) {
      console.error('[EKFProcessor] Error processing sample:', err);
    }
  }

  isRunning(): boolean {
    return this.isProcessing;
  }

  getBufferSize(): number {
    return 0;
  }
}

export const ekfProcessor = new EKFProcessor();
