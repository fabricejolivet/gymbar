export type Vec3 = [number, number, number];

export class KalmanFilter1D {
  private x: number;
  private P: number;
  private Q: number;
  private R: number;

  constructor(processNoise: number = 0.001, measurementNoise: number = 0.1) {
    this.x = 0;
    this.P = 1;
    this.Q = processNoise;
    this.R = measurementNoise;
  }

  update(measurement: number, dt: number = 1): number {
    this.P += this.Q * dt;

    const K = this.P / (this.P + this.R);
    this.x = this.x + K * (measurement - this.x);
    this.P = (1 - K) * this.P;

    return this.x;
  }

  reset() {
    this.x = 0;
    this.P = 1;
  }
}

export class KalmanFilter3D {
  private filters: [KalmanFilter1D, KalmanFilter1D, KalmanFilter1D];

  constructor(processNoise: number = 0.001, measurementNoise: number = 0.1) {
    this.filters = [
      new KalmanFilter1D(processNoise, measurementNoise),
      new KalmanFilter1D(processNoise, measurementNoise),
      new KalmanFilter1D(processNoise, measurementNoise),
    ];
  }

  update(measurement: Vec3, dt: number = 1): Vec3 {
    return [
      this.filters[0].update(measurement[0], dt),
      this.filters[1].update(measurement[1], dt),
      this.filters[2].update(measurement[2], dt),
    ];
  }

  reset() {
    this.filters.forEach(f => f.reset());
  }
}
