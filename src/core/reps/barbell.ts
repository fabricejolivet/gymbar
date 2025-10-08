import { Rep } from '../models/types';

type RepState = 'lockout' | 'down' | 'up';
type RepMode = 'vertical' | 'horizontal';

export interface RepCounterConfig {
  mode: RepMode;

  // velocity thresholds (cm/s), with hysteresis
  v_enter_cms: number;   // must exceed to leave lockout
  v_exit_cms: number;    // near-zero band to consider “still”

  // timing guards
  minLockMs: number;     // min ZUPT/lockout hold to close a rep
  minPhaseMs: number;    // min time for down or up phase
  minRepMs: number;
  maxRepMs: number;

  // quality gates
  minPeakDown_cms: number; // most negative velocity magnitude
  minPeakUp_cms: number;   // most positive velocity magnitude
  minROM_cm: number;       // estimated ROM (see below)
  tiltMax_deg?: number;    // optional: reject if |tilt error| too large

  // adaptive noise (optional): during ZUPT, learn noise and raise v_enter
  adaptiveNoise: boolean;
  adaptiveFactor: number;   // v_enter = max(v_enter_cms, adaptiveFactor * velRmsDuringZUPT)
}

export const DEFAULT_REP_CONFIG: RepCounterConfig = {
  mode: 'vertical',
  v_enter_cms: 12,
  v_exit_cms: 4,
  minLockMs: 220,
  minPhaseMs: 140,
  minRepMs: 350,
  maxRepMs: 6000,
  minPeakDown_cms: 25,
  minPeakUp_cms: 25,
  minROM_cm: 12,
  tiltMax_deg: 12,
  adaptiveNoise: true,
  adaptiveFactor: 6
};

export class BarbellRepDetector {
  private cfg: RepCounterConfig;

  private state: RepState = 'lockout';
  private repCount = 0;
  private reps: Rep[] = [];

  // per-rep accumulators
  private t0 = 0;
  private tPhaseStart = 0;
  private distAbs_cm = 0; // ∫ |v| dt  (cm)
  private vNegPeak = 0;
  private vPosPeak = 0;
  private sawDown = false;
  private sawUp = false;

  // smoothing + adaptive noise
  private vFilt_cms = 0;
  private emaAlpha = 0.25;
  private zuptVelSquares: number[] = []; // for RMS
  private lastTime = 0;

  constructor(config: Partial<RepCounterConfig> = {}) {
    this.cfg = { ...DEFAULT_REP_CONFIG, ...config };
  }

  setConfig(p: Partial<RepCounterConfig>) { this.cfg = { ...this.cfg, ...p }; }
  getConfig(): RepCounterConfig { return { ...this.cfg }; }

  /**
   * Update with one sample.
   * - verticalPos_cm / horizontalPos_cm are ignored (we don’t need absolute height)
   * - verticalVel_cms / horizontalVel_cms: signed axis velocity
   * - tilt_deg / targetTilt_deg: optional technique gating
   * - zuptActive: true when lockout/still (from your detector)
   */
  update(
    verticalPos_cm: number,
    verticalVel_cms: number,
    horizontalPos_cm: number,
    horizontalVel_cms: number,
    tilt_deg: number,
    targetTilt_deg: number,
    time_ms: number,
    zuptActive: boolean
  ): Rep | null {
    // choose working velocity and low-pass it a bit
    const vRaw = this.cfg.mode === 'vertical' ? verticalVel_cms : horizontalVel_cms;
    const v = this.vFilt_cms = this.emaAlpha * vRaw + (1 - this.emaAlpha) * this.vFilt_cms;

    // dt for integration
    let dt = 0;
    if (this.lastTime > 0) dt = Math.min(Math.max((time_ms - this.lastTime) / 1000, 1e-4), 0.25);
    this.lastTime = time_ms;

    // update adaptive noise during ZUPT
    let vEnter = this.cfg.v_enter_cms;
    if (this.cfg.adaptiveNoise && zuptActive && dt > 0) {
      this.zuptVelSquares.push(v * v);
      if (this.zuptVelSquares.length > 60) this.zuptVelSquares.shift(); // ~3s at 20 Hz
      const rms = Math.sqrt(this.zuptVelSquares.reduce((s, x) => s + x, 0) / this.zuptVelSquares.length || 1);
      vEnter = Math.max(vEnter, this.cfg.adaptiveFactor * rms);
    }

    const nearStill = Math.abs(v) <= this.cfg.v_exit_cms;
    const bigNeg = v < -vEnter;
    const bigPos = v > +vEnter;
    const tiltErr = Math.abs((tilt_deg ?? 0) - (targetTilt_deg ?? 0));

    // optional technique gate
    if (this.cfg.tiltMax_deg != null && tiltErr > this.cfg.tiltMax_deg) {
      // too tilted: if we were mid-rep, abort it cleanly
      if (this.state !== 'lockout') this.resetRep();
      this.state = 'lockout';
      return null;
    }

    // integrate abs velocity for ROM estimate (only while moving)
    if (dt > 0 && this.state !== 'lockout') {
      this.distAbs_cm += Math.abs(v) * dt; // v is in cm/s → cm
    }

    switch (this.state) {
      case 'lockout': {
        // Start a rep when we leave ZUPT and exceed the enter threshold
        if (!zuptActive && (bigNeg || bigPos)) {
          this.startRep(time_ms);
          if (bigNeg) {
            this.state = 'down';
            this.vNegPeak = Math.min(this.vNegPeak, v);
          } else {
            this.state = 'up';
            this.vPosPeak = Math.max(this.vPosPeak, v);
          }
        }
        break;
      }

      case 'down': {
        // track negative peak
        this.vNegPeak = Math.min(this.vNegPeak, v);

        // must spend some minimal time in phase to avoid bounce counts
        const phaseMs = time_ms - this.tPhaseStart;

        // reversal to up when we cross through near-zero and then exceed positive enter
        if (phaseMs >= this.cfg.minPhaseMs && bigPos) {
          this.sawDown = true;
          this.state = 'up';
          this.tPhaseStart = time_ms;
          this.vPosPeak = Math.max(0, v);
        }

        // safety: timeouts
        if ((time_ms - this.t0) > this.cfg.maxRepMs) {
          this.resetRep();
          this.state = 'lockout';
        }
        break;
      }

      case 'up': {
        // track positive peak
        this.vPosPeak = Math.max(this.vPosPeak, v);

        // Finish when we re-enter ZUPT and hold briefly (lockout), with quality gates met
        const repDur = time_ms - this.t0;

        if (zuptActive && nearStill) {
          // ensure lockout hold
          if (this.lockoutHeldLongEnough(time_ms)) {
            const ok =
              repDur >= this.cfg.minRepMs &&
              repDur <= this.cfg.maxRepMs &&
              this.sawDown &&
              this.vNegPeak <= -this.cfg.minPeakDown_cms &&
              this.vPosPeak >= +this.cfg.minPeakUp_cms &&
              this.estimatedROMcm() >= this.cfg.minROM_cm;

            const rep = ok ? this.makeRep(time_ms) : null;
            this.resetRep();
            this.state = 'lockout';
            return rep;
          }
        }

        // if we unexpectedly drop again (v << 0) we can allow another cycle,
        // but enforce max duration to avoid infinite run
        if ((time_ms - this.t0) > this.cfg.maxRepMs) {
          this.resetRep();
          this.state = 'lockout';
        }
        break;
      }
    }

    return null;
  }

  // ---------- helpers ----------

  private startRep(now: number) {
    this.t0 = now;
    this.tPhaseStart = now;
    this.distAbs_cm = 0;
    this.vNegPeak = 0;
    this.vPosPeak = 0;
    this.sawDown = false;
    this.sawUp = false;
  }

  private resetRep() {
    this.t0 = 0;
    this.tPhaseStart = 0;
    this.distAbs_cm = 0;
    this.vNegPeak = 0;
    this.vPosPeak = 0;
    this.sawDown = false;
    this.sawUp = false;
  }

  // true if we stayed in ZUPT for cfg.minLockMs since entering near-still
  private lockoutHeldLongEnough(now: number): boolean {
    // If lockout was just hit, we want at least minLockMs quiet
    // We approximate using phase start (entered 'up' earlier) plus minLockMs.
    return (now - this.tPhaseStart) >= this.cfg.minLockMs;
  }

  // ROM estimate from speed integral
  // For a down+up cycle, ∫|v| dt ≈ 2 * ROM  ⇒ ROM ≈ 0.5 * distance
  private estimatedROMcm(): number {
    return 0.5 * this.distAbs_cm;
  }

  private makeRep(time_ms: number): Rep {
    this.repCount++;

    const rom = Math.round(this.estimatedROMcm());
    const duration_ms = time_ms - this.t0;

    return {
      number: this.repCount,
      timestamp: time_ms,
      duration_ms,
      // simple summaries; you can enrich with more telemetry you track elsewhere
      balance_percent: 100,             // keep your tilt logic if you want
      avg_speed_cms: Math.round(this.distAbs_cm / (duration_ms / 1000)),
      peak_speed_cms: Math.round(Math.max(Math.abs(this.vNegPeak), Math.abs(this.vPosPeak))),
      rom_cm: rom,
      tilt_deg: 0
    };
  }

  getReps(): Rep[] { return [...this.reps]; }  // if you want to store them locally, push in makeRep
  getRepCount(): number { return this.repCount; }
  getState(): RepState { return this.state; }
}
