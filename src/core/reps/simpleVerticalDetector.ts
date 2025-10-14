/**
 * Simple Vertical Rep Detector
 *
 * Detects reps based on vertical movement pattern:
 * 1. Bar moves down (descent)
 * 2. Bar reaches bottom
 * 3. Bar moves up (ascent)
 * 4. Bar returns to top and stops
 * 5. Rep complete → RESET ALL FILTERS to prevent drift
 *
 * This approach treats each rep independently, eliminating cumulative drift.
 */

import { Rep } from '../models/types';

type SimpleRepState = 'waiting' | 'descending' | 'ascending' | 'lockout';

export interface SimpleRepConfig {
  minROM_cm: number;              // Minimum range of motion (e.g., 15cm)
  descentVelocity_cms: number;    // Velocity threshold for descent detection (e.g., -3 cm/s)
  ascentVelocity_cms: number;     // Velocity threshold for ascent detection (e.g., +3 cm/s)
  lockoutVelocity_cms: number;    // Velocity threshold for lockout (near zero, e.g., 2 cm/s)
  lockoutDuration_ms: number;     // How long to hold at top (e.g., 300ms)
}

export const DEFAULT_SIMPLE_REP_CONFIG: SimpleRepConfig = {
  minROM_cm: 15,
  descentVelocity_cms: -3,
  ascentVelocity_cms: 3,
  lockoutVelocity_cms: 2,
  lockoutDuration_ms: 300
};

export class SimpleVerticalRepDetector {
  private state: SimpleRepState = 'waiting';
  private repCount = 0;

  // Track current rep metrics
  private repStartTime = 0;
  private topPosition = 0;
  private bottomPosition = 0;
  private currentPosition = 0;

  // Lockout tracking
  private lockoutStartTime = 0;
  private lockoutStableCount = 0;

  // Metrics collection
  private speeds: number[] = [];
  private tilts: number[] = [];

  private config: SimpleRepConfig;

  // Callback for when rep completes and filters should reset
  private onRepComplete: (() => void) | null = null;

  constructor(config: Partial<SimpleRepConfig> = {}) {
    this.config = { ...DEFAULT_SIMPLE_REP_CONFIG, ...config };
  }

  setConfig(config: Partial<SimpleRepConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): SimpleRepConfig {
    return { ...this.config };
  }

  /**
   * Set callback to be called when rep completes
   * This is where you should reset EKF, filters, etc.
   */
  setOnRepComplete(callback: () => void) {
    this.onRepComplete = callback;
  }

  /**
   * Update detector with new sample
   *
   * @param verticalPos_cm Current vertical position (cm)
   * @param verticalVel_cms Current vertical velocity (cm/s)
   * @param tilt_deg Current bar tilt (degrees)
   * @param targetTilt_deg Target tilt (degrees)
   * @param time_ms Current timestamp (ms)
   * @returns Rep object if rep completed, null otherwise
   */
  update(
    verticalPos_cm: number,
    verticalVel_cms: number,
    tilt_deg: number,
    targetTilt_deg: number,
    time_ms: number
  ): Rep | null {
    this.currentPosition = verticalPos_cm;

    // Collect metrics for this sample
    this.speeds.push(Math.abs(verticalVel_cms));
    this.tilts.push(Math.abs(tilt_deg - targetTilt_deg));

    // State machine
    switch (this.state) {
      case 'waiting':
        // Wait for descent to begin
        if (verticalVel_cms < this.config.descentVelocity_cms) {
          console.log('[SimpleRep] 🔽 WAITING→DESCENDING | vel:', verticalVel_cms.toFixed(1));
          this.state = 'descending';
          this.repStartTime = time_ms;
          this.topPosition = verticalPos_cm;
          this.bottomPosition = verticalPos_cm;
          this.speeds = [Math.abs(verticalVel_cms)];
          this.tilts = [Math.abs(tilt_deg - targetTilt_deg)];
        }
        break;

      case 'descending':
        // Track lowest point
        if (verticalPos_cm < this.bottomPosition) {
          this.bottomPosition = verticalPos_cm;
        }

        // Check for ascent
        if (verticalVel_cms > this.config.ascentVelocity_cms) {
          const rom = this.topPosition - this.bottomPosition;
          console.log('[SimpleRep] 🔼 DESCENDING→ASCENDING | ROM:', rom.toFixed(1), 'cm, vel:', verticalVel_cms.toFixed(1));
          this.state = 'ascending';
        }
        break;

      case 'ascending':
        // Track highest point during ascent
        if (verticalPos_cm > this.topPosition) {
          this.topPosition = verticalPos_cm;
        }

        // Check for lockout (near top and slow velocity)
        const distanceFromTop = this.topPosition - verticalPos_cm;
        const isNearTop = distanceFromTop < 5; // Within 5cm of top
        const isSlowEnough = Math.abs(verticalVel_cms) < this.config.lockoutVelocity_cms;

        if (isNearTop && isSlowEnough) {
          this.lockoutStableCount++;
        } else {
          this.lockoutStableCount = 0;
        }

        // Need 3 consecutive stable samples (60ms at 20Hz)
        if (this.lockoutStableCount >= 3) {
          console.log('[SimpleRep] 🔒 ASCENDING→LOCKOUT | pos:', verticalPos_cm.toFixed(1));
          this.state = 'lockout';
          this.lockoutStartTime = time_ms;
          this.lockoutStableCount = 0;
        }

        // Check for failed rep (bar moving down again without reaching top)
        if (verticalVel_cms < this.config.descentVelocity_cms) {
          const rom = this.topPosition - this.bottomPosition;
          if (rom < this.config.minROM_cm) {
            console.log('[SimpleRep] ❌ ASCENDING→WAITING | Failed rep, ROM too small:', rom.toFixed(1));
            this.state = 'waiting';
            this.resetTracking();
          } else {
            console.log('[SimpleRep] 🔽 ASCENDING→DESCENDING | Another descent');
            this.state = 'descending';
            this.bottomPosition = verticalPos_cm;
          }
        }
        break;

      case 'lockout':
        const lockoutDuration = time_ms - this.lockoutStartTime;

        // Check if bar is still stable
        const isStillStable = Math.abs(verticalVel_cms) < this.config.lockoutVelocity_cms;

        if (!isStillStable) {
          // Movement detected during lockout
          if (verticalVel_cms < this.config.descentVelocity_cms) {
            console.log('[SimpleRep] ⚠️ LOCKOUT→DESCENDING | Movement detected');
            this.state = 'descending';
            this.bottomPosition = verticalPos_cm;
          } else {
            console.log('[SimpleRep] ⚠️ LOCKOUT→WAITING | Unstable lockout');
            this.state = 'waiting';
            this.resetTracking();
          }
        } else if (lockoutDuration >= this.config.lockoutDuration_ms) {
          // Lockout complete, check ROM
          const finalROM = this.topPosition - this.bottomPosition;

          if (finalROM >= this.config.minROM_cm) {
            console.log('[SimpleRep] ✅ LOCKOUT→WAITING | REP COMPLETE! ROM:', finalROM.toFixed(1));
            const rep = this.completeRep(time_ms, finalROM, targetTilt_deg);

            // CRITICAL: Trigger filter reset callback
            if (this.onRepComplete) {
              console.log('[SimpleRep] 🔄 Triggering filter reset');
              this.onRepComplete();
            }

            this.state = 'waiting';
            this.resetTracking();
            return rep;
          } else {
            console.log('[SimpleRep] ❌ LOCKOUT→WAITING | ROM too small:', finalROM.toFixed(1));
            this.state = 'waiting';
            this.resetTracking();
          }
        }
        break;
    }

    return null;
  }

  private resetTracking() {
    this.topPosition = 0;
    this.bottomPosition = 0;
    this.lockoutStableCount = 0;
  }

  private completeRep(time_ms: number, rom_cm: number, targetTilt_deg: number): Rep {
    this.repCount++;

    // Calculate metrics
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
      duration_ms: time_ms - this.repStartTime,
      balance_percent: Math.round(balancePercent),
      avg_speed_cms: Math.round(avgSpeed),
      peak_speed_cms: Math.round(peakSpeed),
      rom_cm: Math.round(rom_cm),
      tilt_deg: Math.round(avgTiltError * 10) / 10,
    };

    return rep;
  }

  getState(): SimpleRepState {
    return this.state;
  }

  getRepCount(): number {
    return this.repCount;
  }

  getCurrentROM(): number {
    if (this.state === 'waiting') return 0;
    return this.topPosition - this.bottomPosition;
  }

  reset() {
    this.state = 'waiting';
    this.repCount = 0;
    this.resetTracking();
    this.repStartTime = 0;
    this.speeds = [];
    this.tilts = [];
    this.lockoutStartTime = 0;
  }
}
