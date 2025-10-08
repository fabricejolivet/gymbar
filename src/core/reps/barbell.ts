import { Rep } from '../models/types';

type RepState = 'idle' | 'descent' | 'ascent' | 'lockout';

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

  private readonly minROM_cm: number;
  private readonly velocityThreshold = 5;
  private readonly lockoutDuration_ms = 200;
  private lockoutStartTime = 0;

  constructor(minROM_cm = 30) {
    this.minROM_cm = minROM_cm;
  }

  update(
    verticalPos_cm: number,
    verticalVel_cms: number,
    tilt_deg: number,
    targetTilt_deg: number,
    time_ms: number
  ): Rep | null {
    this.speeds.push(Math.abs(verticalVel_cms));
    this.tilts.push(Math.abs(tilt_deg - targetTilt_deg));

    switch (this.state) {
      case 'idle':
        if (verticalVel_cms < -this.velocityThreshold) {
          console.log('[RepDetector] Starting descent - pos:', verticalPos_cm.toFixed(1), 'vel:', verticalVel_cms.toFixed(1));
          this.state = 'descent';
          this.startTime = time_ms;
          this.startHeight = verticalPos_cm;
          this.topHeight = verticalPos_cm;
          this.bottomHeight = verticalPos_cm;
          this.speeds = [];
          this.tilts = [];
        }
        break;

      case 'descent':
        if (verticalPos_cm < this.bottomHeight) {
          this.bottomHeight = verticalPos_cm;
        }
        if (verticalVel_cms > this.velocityThreshold) {
          console.log('[RepDetector] Switching to ascent - bottom:', this.bottomHeight.toFixed(1), 'ROM so far:', (this.topHeight - this.bottomHeight).toFixed(1));
          this.state = 'ascent';
        }
        break;

      case 'ascent':
        if (verticalVel_cms < 2 && verticalPos_cm >= this.startHeight * 0.9) {
          console.log('[RepDetector] Entering lockout - pos:', verticalPos_cm.toFixed(1), 'start:', this.startHeight.toFixed(1));
          this.state = 'lockout';
          this.lockoutStartTime = time_ms;
        }
        break;

      case 'lockout':
        if (time_ms - this.lockoutStartTime >= this.lockoutDuration_ms) {
          const rom = this.topHeight - this.bottomHeight;
          console.log('[RepDetector] Lockout complete - ROM:', rom.toFixed(1), 'min:', this.minROM_cm);

          if (rom >= this.minROM_cm) {
            const rep = this.completeRep(time_ms, rom, targetTilt_deg);
            this.state = 'idle';
            this.bottomHeight = 0;
            return rep;
          } else {
            console.log('[RepDetector] ROM too small, rejecting rep');
            this.state = 'idle';
            this.bottomHeight = 0;
          }
        } else if (verticalVel_cms < -this.velocityThreshold) {
          console.log('[RepDetector] Motion during lockout, restarting descent');
          this.state = 'descent';
          this.lockoutStartTime = 0;
        }
        break;
    }

    return null;
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
  }
}
