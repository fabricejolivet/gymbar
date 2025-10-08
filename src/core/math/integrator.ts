import { KalmanFilter3D, Vec3 } from './kalman';

export type { Vec3 };

export class VelocityIntegrator {
  private velocity: Vec3 = [0, 0, 0];
  private position: Vec3 = [0, 0, 0];
  private lastTime = 0;
  private accelHistory: Vec3[] = [];
  private readonly historySize = 10;
  private kalmanAccel: KalmanFilter3D;
  private kalmanVelocity: KalmanFilter3D;
  private accelBias: Vec3 = [0, 0, 0];
  private stillCount = 0;
  private movingAvgAccel: Vec3 = [0, 0, 0];

  constructor() {
    this.kalmanAccel = new KalmanFilter3D(0.05, 0.5);
    this.kalmanVelocity = new KalmanFilter3D(0.1, 0.8);
  }

  reset() {
    this.velocity = [0, 0, 0];
    this.position = [0, 0, 0];
    this.lastTime = 0;
    this.accelHistory = [];
    this.kalmanAccel.reset();
    this.kalmanVelocity.reset();
    this.accelBias = [0, 0, 0];
    this.stillCount = 0;
    this.movingAvgAccel = [0, 0, 0];
  }

  integrate(accel_ms2: Vec3, time_ms: number): { velocity_cms: Vec3; position_cm: Vec3 } {
    if (this.lastTime === 0) {
      this.lastTime = time_ms;
      this.accelHistory.push([...accel_ms2]);
      return { velocity_cms: [0, 0, 0], position_cm: [0, 0, 0] };
    }

    const dt = (time_ms - this.lastTime) / 1000;
    this.lastTime = time_ms;

    if (dt <= 0 || dt > 0.5) {
      return { velocity_cms: this.velocity, position_cm: this.position };
    }

    this.accelHistory.push([...accel_ms2]);
    if (this.accelHistory.length > this.historySize) {
      this.accelHistory.shift();
    }

    for (let i = 0; i < 3; i++) {
      this.movingAvgAccel[i] = this.movingAvgAccel[i] * 0.98 + accel_ms2[i] * 0.02;
    }

    const biasCompensatedAccel: Vec3 = [
      accel_ms2[0] - this.accelBias[0],
      accel_ms2[1] - this.accelBias[1],
      accel_ms2[2] - this.accelBias[2],
    ];

    const filteredAccel = this.kalmanAccel.update(biasCompensatedAccel, dt);

    const accelMagnitude = Math.sqrt(
      filteredAccel[0] ** 2 + filteredAccel[1] ** 2 + filteredAccel[2] ** 2
    );

    const isStill = accelMagnitude < 0.8;

    if (isStill) {
      this.stillCount++;

      if (this.stillCount > 20) {
        for (let i = 0; i < 3; i++) {
          this.accelBias[i] += this.movingAvgAccel[i] * 0.005;
        }

        this.velocity = [
          this.velocity[0] * 0.95,
          this.velocity[1] * 0.95,
          this.velocity[2] * 0.95,
        ];

        if (Math.abs(this.velocity[0]) < 3 && Math.abs(this.velocity[1]) < 3 && Math.abs(this.velocity[2]) < 3) {
          this.velocity = [0, 0, 0];
        }
      }
    } else {
      this.stillCount = Math.max(0, this.stillCount - 2);
    }

    for (let i = 0; i < 3; i++) {
      this.velocity[i] += filteredAccel[i] * dt * 100;
    }

    const filteredVelocity = this.kalmanVelocity.update(this.velocity, dt);
    this.velocity = [...filteredVelocity];

    const velocityMagnitude = Math.sqrt(
      this.velocity[0] ** 2 + this.velocity[1] ** 2 + this.velocity[2] ** 2
    );

    if (velocityMagnitude < 5 && this.stillCount > 30) {
      this.velocity = [0, 0, 0];
    }

    for (let i = 0; i < 3; i++) {
      this.position[i] += this.velocity[i] * dt;
    }

    return { velocity_cms: [...this.velocity], position_cm: [...this.position] };
  }

  zeroBias() {
    const factor = 0.9;
    this.velocity = [
      this.velocity[0] * factor,
      this.velocity[1] * factor,
      this.velocity[2] * factor,
    ];

    if (Math.abs(this.velocity[0]) < 3) this.velocity[0] = 0;
    if (Math.abs(this.velocity[1]) < 3) this.velocity[1] = 0;
    if (Math.abs(this.velocity[2]) < 3) this.velocity[2] = 0;
  }
}
