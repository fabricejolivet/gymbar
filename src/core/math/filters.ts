/**
 * Second-order Butterworth low-pass filter (biquad)
 *
 * Single stable implementation for acceleration filtering.
 * Cutoff frequency should be tuned based on movement tempo:
 * - 20 Hz sampling: 3-4 Hz cutoff for slow movements, 4-5 Hz for fast
 * - 50+ Hz sampling: 6-10 Hz cutoff
 */
export class ButterworthLowPassFilter {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  private a0: number;
  private a1: number;
  private a2: number;
  private b1: number;
  private b2: number;

  constructor(sampleRate: number, cutoffFreq: number) {
    const ff = cutoffFreq / sampleRate;
    const ita = 1.0 / Math.tan(Math.PI * ff);
    const q = Math.sqrt(2.0);

    this.a0 = 1.0 / (1.0 + q * ita + ita * ita);
    this.a1 = 2.0 * this.a0;
    this.a2 = this.a0;
    this.b1 = 2.0 * (ita * ita - 1.0) * this.a0;
    this.b2 = -(1.0 - q * ita + ita * ita) * this.a0;
  }

  filter(x: number): number {
    if (!isFinite(x)) return 0;

    const y = this.a0 * x + this.a1 * this.x1 + this.a2 * this.x2
              - this.b1 * this.y1 - this.b2 * this.y2;

    if (!isFinite(y)) {
      this.reset();
      return x;
    }

    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;

    return y;
  }

  reset() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}
