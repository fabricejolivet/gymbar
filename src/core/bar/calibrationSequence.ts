import type { EKFConfig } from './ekf';

export type CalibrationPhase =
  | 'idle'
  | 'stationary'
  | 'slow_motion'
  | 'fast_motion'
  | 'verification'
  | 'complete';

export interface CalibrationSample {
  gyro_rads: [number, number, number];
  accel_ms2: [number, number, number];
  timestamp_ms: number;
  dt: number;
}

export interface PhaseData {
  samples: CalibrationSample[];
  startTime: number;
  duration: number;
}

export interface CalibrationResult {
  config: Partial<EKFConfig>;
  confidence: number;
  metrics: {
    gyroNoise: number;
    accelNoise: number;
    processNoise: number;
    measurementNoise: number;
    timingStability: number;
  };
  reason: string;
}

const MIN_PHASE_DURATION = 2000;

export class CalibrationSequence {
  private currentPhase: CalibrationPhase = 'idle';
  private phaseStartTime: number | null = null;
  private phaseData: Map<CalibrationPhase, PhaseData> = new Map();
  private lastTimestamp: number | null = null;
  private canAdvance: boolean = false;

  getPhase(): CalibrationPhase {
    return this.currentPhase;
  }

  getProgress(): number {
    if (this.currentPhase === 'idle' || this.currentPhase === 'complete') {
      return 0;
    }

    const elapsed = this.phaseStartTime ? Date.now() - this.phaseStartTime : 0;
    return this.canAdvance ? 100 : Math.min(99, (elapsed / MIN_PHASE_DURATION) * 100);
  }

  canAdvancePhase(): boolean {
    return this.canAdvance;
  }

  getPhaseInstruction(): string {
    switch (this.currentPhase) {
      case 'idle':
        return 'Ready to begin calibration';
      case 'stationary':
        return 'Hold the bar perfectly still';
      case 'slow_motion':
        return 'Move the bar slowly up and down';
      case 'fast_motion':
        return 'Perform quick, explosive movements';
      case 'verification':
        return 'Hold still again for verification';
      case 'complete':
        return 'Calibration complete!';
    }
  }

  start() {
    this.currentPhase = 'stationary';
    this.phaseStartTime = Date.now();
    this.phaseData.clear();
    this.lastTimestamp = null;
    this.phaseData.set('stationary', { samples: [], startTime: Date.now(), duration: 0 });
  }

  addSample(sample: {
    gyro_rads: [number, number, number];
    accel_ms2: [number, number, number];
    timestamp_ms: number;
  }) {
    if (this.currentPhase === 'idle' || this.currentPhase === 'complete') {
      return;
    }

    const dt = this.lastTimestamp ? (sample.timestamp_ms - this.lastTimestamp) / 1000 : 0.05;
    this.lastTimestamp = sample.timestamp_ms;

    const phaseData = this.phaseData.get(this.currentPhase);
    if (phaseData) {
      phaseData.samples.push({
        ...sample,
        dt
      });
    }

    if (this.phaseStartTime && Date.now() - this.phaseStartTime >= MIN_PHASE_DURATION) {
      this.canAdvance = true;
    }
  }

  advancePhase() {
    const phaseOrder: CalibrationPhase[] = ['stationary', 'slow_motion', 'fast_motion', 'verification', 'complete'];
    const currentIndex = phaseOrder.indexOf(this.currentPhase);

    if (currentIndex < phaseOrder.length - 1) {
      const currentData = this.phaseData.get(this.currentPhase);
      if (currentData) {
        currentData.duration = Date.now() - currentData.startTime;
      }

      this.currentPhase = phaseOrder[currentIndex + 1];
      this.phaseStartTime = Date.now();
      this.canAdvance = false;

      if (this.currentPhase !== 'complete') {
        this.phaseData.set(this.currentPhase, {
          samples: [],
          startTime: Date.now(),
          duration: 0
        });
      }
    }
  }

  isComplete(): boolean {
    return this.currentPhase === 'complete';
  }

  analyze(): CalibrationResult {
    const stationaryData = this.phaseData.get('stationary');
    const slowData = this.phaseData.get('slow_motion');
    const fastData = this.phaseData.get('fast_motion');
    const verifyData = this.phaseData.get('verification');

    if (!stationaryData || !slowData || !fastData || !verifyData) {
      return {
        config: {},
        confidence: 0,
        metrics: {
          gyroNoise: 0,
          accelNoise: 0,
          processNoise: 0,
          measurementNoise: 0,
          timingStability: 0
        },
        reason: 'Incomplete calibration data'
      };
    }

    const gyroNoise = this.calculateSensorNoise(stationaryData.samples, 'gyro_rads');
    const accelNoise = this.calculateSensorNoise(stationaryData.samples, 'accel_ms2');

    const timingStability = this.calculateTimingStability([
      ...stationaryData.samples,
      ...slowData.samples,
      ...fastData.samples,
      ...verifyData.samples
    ]);

    // ZUPT THRESHOLD CALIBRATION ONLY
    // Set thresholds based on stationary noise levels
    // Use 5x the noise floor to ensure robust detection while avoiding false positives
    const w_thr = Math.max(0.05, Math.min(0.5, gyroNoise * 5));
    const a_thr = Math.max(0.1, Math.min(1.0, accelNoise * 5));

    // minHoldMs: how long sensors must stay below thresholds before ZUPT activates
    // Lower noise = can activate faster, higher noise = need longer confirmation
    const minHoldMs = Math.max(100, Math.min(500, Math.round(200 + gyroNoise * 1000)));

    // Verify that the bar was actually stationary during stationary phases
    const stationaryGyroMax = Math.max(...stationaryData.samples.map(s =>
      Math.sqrt(s.gyro_rads[0]**2 + s.gyro_rads[1]**2 + s.gyro_rads[2]**2)
    ));
    const stationaryAccelMax = Math.max(...stationaryData.samples.map(s => {
      const mag = Math.sqrt(s.accel_ms2[0]**2 + s.accel_ms2[1]**2 + s.accel_ms2[2]**2);
      return Math.abs(mag - 9.81);
    }));

    // Verify motion phases had actual movement
    const slowMotionDetected = slowData.samples.some(s =>
      Math.sqrt(s.gyro_rads[0]**2 + s.gyro_rads[1]**2 + s.gyro_rads[2]**2) > w_thr * 2
    );
    const fastMotionDetected = fastData.samples.some(s =>
      Math.sqrt(s.gyro_rads[0]**2 + s.gyro_rads[1]**2 + s.gyro_rads[2]**2) > w_thr * 5
    );

    let confidence = 0.3;
    let reason = 'ZUPT thresholds calibrated. ';

    if (stationaryGyroMax < w_thr && stationaryAccelMax < a_thr) {
      confidence += 0.3;
      reason += 'Stationary phases clean. ';
    } else {
      reason += 'WARNING: Movement detected in stationary phases. ';
    }

    if (slowMotionDetected) {
      confidence += 0.2;
      reason += 'Slow motion detected. ';
    }

    if (fastMotionDetected) {
      confidence += 0.2;
      reason += 'Fast motion detected. ';
    }

    if (timingStability > 0.9) {
      reason += 'Timing stable.';
    } else {
      reason += 'WARNING: Unstable timing may affect accuracy.';
    }

    return {
      config: {
        w_thr,
        a_thr,
        minHoldMs
      },
      confidence: Math.min(1, confidence),
      metrics: {
        gyroNoise,
        accelNoise,
        processNoise: 0,
        measurementNoise: 0,
        timingStability
      },
      reason
    };
  }

  private calculateSensorNoise(samples: CalibrationSample[], sensor: 'gyro_rads' | 'accel_ms2'): number {
    if (samples.length === 0) return 0;

    const magnitudes = samples.map(s => {
      const vals = s[sensor];
      return Math.sqrt(vals[0] ** 2 + vals[1] ** 2 + vals[2] ** 2);
    });

    const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const variance = magnitudes.reduce((sum, val) => sum + (val - mean) ** 2, 0) / magnitudes.length;

    return Math.sqrt(variance);
  }

  private calculateTimingStability(samples: CalibrationSample[]): number {
    if (samples.length < 2) return 0;

    const dts = samples.map(s => s.dt).filter(dt => dt > 0);
    if (dts.length === 0) return 0;

    const meanDt = dts.reduce((a, b) => a + b, 0) / dts.length;
    const dtStd = Math.sqrt(
      dts.reduce((sum, dt) => sum + (dt - meanDt) ** 2, 0) / dts.length
    );

    const stability = 1 - Math.min(1, dtStd / meanDt);
    return Math.max(0, stability);
  }

  reset() {
    this.currentPhase = 'idle';
    this.phaseStartTime = null;
    this.phaseData.clear();
    this.lastTimestamp = null;
  }
}
