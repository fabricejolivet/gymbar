import { useEKFStore } from './ekfStore';

type RawSample = {
  accel_g: [number, number, number];
  gyro_dps: [number, number, number];
  euler_deg: [number, number, number];
  timestamp_ms: number;
};

class EKFProcessor {
  private sampleBuffer: RawSample[] = [];
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private maxBufferSize = 100;

  start() {
    if (this.isProcessing) {
      console.log('[EKFProcessor] Already running');
      return;
    }

    console.log('[EKFProcessor] Starting background EKF processing thread');
    this.isProcessing = true;
    this.sampleBuffer = [];

    this.processingInterval = setInterval(() => {
      this.processBufferedSamples();
    }, 20);
  }

  stop() {
    if (!this.isProcessing) {
      return;
    }

    console.log('[EKFProcessor] Stopping background EKF processing thread');
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.isProcessing = false;
    this.sampleBuffer = [];
  }

  addSample(sample: RawSample) {
    if (!this.isProcessing) return;

    this.sampleBuffer.push(sample);

    if (this.sampleBuffer.length > this.maxBufferSize) {
      this.sampleBuffer.shift();
    }
  }

  private processBufferedSamples() {
    if (this.sampleBuffer.length === 0) return;

    const samplesToProcess = [...this.sampleBuffer];
    this.sampleBuffer = [];

    const ekfStore = useEKFStore.getState();

    samplesToProcess.forEach(sample => {
      try {
        ekfStore.processSample(sample);
      } catch (err) {
        console.error('[EKFProcessor] Error processing sample:', err);
      }
    });
  }

  isRunning(): boolean {
    return this.isProcessing;
  }

  getBufferSize(): number {
    return this.sampleBuffer.length;
  }
}

export const ekfProcessor = new EKFProcessor();
