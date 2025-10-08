import { Rep } from '../models/types';

type RepState = 'idle' | 'descent' | 'ascent' | 'lockout';
type RepMode = 'vertical' | 'horizontal';

export interface RepCounterConfig {
  minROM_cm: number;
  minDescentChange_cm: number;
  minAscentChange_cm: number;
  lockoutDuration_ms: number;
  lockoutVelocity_cms: number;
  mode: RepMode;
}

export const DEFAULT_REP_CONFIG: RepCounterConfig = {
  minROM_cm: 15,
  minDescentChange_cm: 2,
  minAscentChange_cm: 2,
  lockoutDuration_ms: 300,
  lockoutVelocity_cms: 10,
  mode: 'vertical'
};

export class BarbellRepDetector {
  private state: RepState = 'idle';
  private repCount = 0;
  private reps: Rep[] = [];

  private startTime = 0;
  private startHeight = 0;
  private bottomHeight = 0;
  private topHeight = 0;

  private speeds: number[] = [];
  private tilts: number[] = [];

  private config: RepCounterConfig;
  private lockoutStartTime = 0;

  private prevVelocity = 0;
  private prevPosition = 0;

  private peakHeight = 0;
  private valleyHeight = 0;
  private stableCount = 0;

  constructor(config: Partial<RepCounterConfig> = {}) {
    this.config = { ...DEFAULT_REP_CONFIG, ...config };
  }

  setConfig(config: Partial<RepCounterConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): RepCounterConfig {
    return { ...this.config };
  }

  update(
    verticalPos_cm: number,
    verticalVel_cms: number,
    horizontalPos_cm: number,
    horizontalVel_cms: number,
    tilt_deg: number,
    targetTilt_deg: number,
    time_ms: number
  ): Rep | null {
    const position = this.config.mode === 'vertical' ? verticalPos_cm : horizontalPos_cm;
    const velocity = this.config.mode === 'vertical' ? verticalVel_cms : horizontalVel_cms;

    this.speeds.push(Math.abs(velocity));
    this.tilts.push(Math.abs(tilt_deg - targetTilt_deg));

    const positionDelta = position - this.prevPosition;
    const movingDown = velocity < -1;
    const movingUp = velocity > 1;
    const nearlyStill = Math.abs(velocity) < 2;

    switch (this.state) {
      case 'idle':
        if (movingDown) {
          console.log('[RepDetector] 🔽 IDLE→DESCENT | pos:', position.toFixed(1), 'vel:', velocity.toFixed(1));
          this.state = 'descent';
          this.startTime = time_ms;
          this.peakHeight = position;
          this.valleyHeight = position;
          this.startHeight = position;
          this.topHeight = position;
          this.bottomHeight = position;
          this.speeds = [Math.abs(velocity)];
          this.tilts = [Math.abs(tilt_deg - targetTilt_deg)];
          this.stableCount = 0;
        }
        break;

      case 'descent':
        if (position < this.valleyHeight) {
          this.valleyHeight = position;
          this.bottomHeight = position;
        }

        const descentDistance = this.peakHeight - this.valleyHeight;

        if (movingUp && descentDistance >= this.config.minDescentChange_cm) {
          console.log('[RepDetector] 🔼 DESCENT→ASCENT | valley:', this.valleyHeight.toFixed(1), 'descent:', descentDistance.toFixed(1) + 'cm', 'vel:', velocity.toFixed(1));
          this.state = 'ascent';
          this.peakHeight = position;
        }
        break;

      case 'ascent':
        if (position > this.peakHeight) {
          this.peakHeight = position;
          this.topHeight = position;
          this.stableCount = 0;
        }

        const ascentDistance = this.peakHeight - this.valleyHeight;
        const rom = this.topHeight - this.bottomHeight;

        const positionChange = Math.abs(position - this.prevPosition);
        const isLockoutVelocity = Math.abs(velocity) < this.config.lockoutVelocity_cms;

        if (positionChange < 0.5 && isLockoutVelocity) {
          this.stableCount++;
        } else if (!movingUp) {
          this.stableCount = 0;
        }

        if (this.stableCount >= 3 && rom >= this.config.minROM_cm) {
          console.log('[RepDetector] 🔒 ASCENT→LOCKOUT | peak:', this.peakHeight.toFixed(1), 'ROM:', rom.toFixed(1) + 'cm', 'stable:', this.stableCount);
          this.state = 'lockout';
          this.lockoutStartTime = time_ms;
          this.stableCount = 0;
        } else if (movingDown && ascentDistance < this.config.minAscentChange_cm) {
          console.log('[RepDetector] ⚠️ ASCENT→IDLE | false start, ascent:', ascentDistance.toFixed(1) + 'cm');
          this.state = 'idle';
        } else if (movingDown && ascentDistance >= this.config.minAscentChange_cm) {
          console.log('[RepDetector] 🔽 ASCENT→DESCENT | bar reversal, vel:', velocity.toFixed(1));
          this.state = 'descent';
          this.valleyHeight = position;
        }
        break;

      case 'lockout':
        const lockoutTime = time_ms - this.lockoutStartTime;
        const finalROM = this.topHeight - this.bottomHeight;

        if (movingDown) {
          console.log('[RepDetector] ⚠️ LOCKOUT→DESCENT | movement during lockout, vel:', velocity.toFixed(1));
          this.state = 'descent';
          this.valleyHeight = position;
          this.lockoutStartTime = 0;
        } else if (lockoutTime >= this.config.lockoutDuration_ms) {
          if (finalROM >= this.config.minROM_cm) {
            console.log('[RepDetector] ✅ LOCKOUT→IDLE | REP COMPLETE! ROM:', finalROM.toFixed(1) + 'cm');
            const rep = this.completeRep(time_ms, finalROM, targetTilt_deg);
            this.state = 'idle';
            this.resetTracking();
            this.prevVelocity = velocity;
            this.prevPosition = position;
            return rep;
          } else {
            console.log('[RepDetector] ❌ LOCKOUT→IDLE | ROM too small:', finalROM.toFixed(1), '<', this.config.minROM_cm);
            this.state = 'idle';
            this.resetTracking();
          }
        }
        break;
    }

    this.prevVelocity = velocity;
    this.prevPosition = position;
    return null;
  }

  private resetTracking() {
    this.bottomHeight = 0;
    this.topHeight = 0;
    this.peakHeight = 0;
    this.valleyHeight = 0;
    this.stableCount = 0;
  }

  private completeRep(time_ms: number, rom_cm: number, targetTilt_deg: number): Rep {
    this.repCount++;

    const avgSpeed = this.speeds.length > 0
      ? this.speeds.reduce((a, b) => a + b, 0) / this.speeds.length
      : 0;

    const peakSpeed = this.speeds.length > 0 ? Math.max(...this.speeds) : 0;

    const avgTiltError = this.tilts.length > 0
      ? this.tilts.reduce((a, b) => a + b, 0) / this.tilts.length
      : 0;

    const balancePercent = Math.max(0, 100 - avgTiltError * 10);

    const rep: Rep = {
      number: this.repCount,
      timestamp: time_ms,
      duration_ms: time_ms - this.startTime,
      balance_percent: Math.round(balancePercent),
      avg_speed_cms: Math.round(avgSpeed),
      peak_speed_cms: Math.round(peakSpeed),
      rom_cm: Math.round(rom_cm),
      tilt_deg: Math.round(avgTiltError * 10) / 10,
    };

    this.reps.push(rep);
    return rep;
  }

  getReps(): Rep[] {
    return [...this.reps];
  }

  getRepCount(): number {
    return this.repCount;
  }

  getState(): RepState {
    return this.state;
  }

  reset() {
    this.state = 'idle';
    this.repCount = 0;
    this.reps = [];
    this.startTime = 0;
    this.startHeight = 0;
    this.bottomHeight = 0;
    this.topHeight = 0;
    this.speeds = [];
    this.tilts = [];
    this.lockoutStartTime = 0;
    this.prevVelocity = 0;
    this.prevPosition = 0;
    this.peakHeight = 0;
    this.valleyHeight = 0;
    this.stableCount = 0;
  }
}

export type { RepState };
