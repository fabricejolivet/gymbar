/**
 * Motion Constraints for Domain-Specific Tracking
 *
 * References:
 * - Wahlström & Skog (2020): "Fifteen Years of Progress at Zero Velocity"
 *   https://arxiv.org/abs/2011.09554
 *   (Constraints complement ZUPT to reduce drift in known motion patterns)
 *
 * This module provides soft measurement updates for motion patterns typical
 * in fitness tracking applications:
 * - Vertical plane: movement primarily vertical (e.g., barbell squat)
 * - Vertical line: movement along a vertical line (e.g., strict press)
 *
 * These constraints are implemented as weak pseudo-measurements that reduce
 * lateral drift while allowing vertical motion. They work synergistically
 * with ZUPT to provide robust position tracking.
 */

export type ConstraintType = 'none' | 'verticalPlane' | 'lineVertical';

export interface ConstraintConfig {
  type: ConstraintType;
  axis?: 'x' | 'y';              // For verticalPlane: which axis to constrain
  anchorXY?: [number, number];   // For lineVertical: XY anchor point
}

/**
 * Determine if constraint should be applied
 *
 * Constraints are typically applied when:
 * - Movement is detected (not stationary)
 * - Sufficient confidence in the motion pattern
 *
 * For barbell movements, constraints are most effective during
 * the concentric and eccentric phases, not during rests.
 *
 * @param isStationary Whether ZUPT is currently active
 * @param velocityMag Current velocity magnitude [m/s]
 * @returns true if constraint should be applied
 */
export function shouldApplyConstraint(
  isStationary: boolean,
  velocityMag: number
): boolean {
  // Apply constraint when moving (not during ZUPT)
  // and velocity is significant (> 5 cm/s)
  return !isStationary && velocityMag > 0.05;
}

/**
 * Validate constraint configuration
 *
 * @param config Constraint configuration
 * @returns Error message if invalid, null if valid
 */
export function validateConstraintConfig(config: ConstraintConfig): string | null {
  if (config.type === 'verticalPlane') {
    if (!config.axis) {
      return 'verticalPlane requires axis (x or y)';
    }
    if (config.axis !== 'x' && config.axis !== 'y') {
      return 'axis must be x or y';
    }
  }

  if (config.type === 'lineVertical') {
    if (!config.anchorXY) {
      return 'lineVertical requires anchorXY';
    }
    if (config.anchorXY.length !== 2) {
      return 'anchorXY must be [x, y]';
    }
  }

  return null;
}

/**
 * Estimate appropriate measurement noise for constraint
 *
 * The constraint noise determines how strongly the filter trusts
 * the pseudo-measurement. For barbell movements:
 * - Strict movements (e.g., strict press): low noise (1-2 cm std)
 * - Dynamic movements (e.g., clean): higher noise (5-10 cm std)
 *
 * @param movementType Type of exercise
 * @returns Measurement noise variance [m²]
 */
export function estimateConstraintNoise(
  movementType: 'strict' | 'dynamic' | 'general'
): number {
  switch (movementType) {
    case 'strict':
      return 2e-4;  // 1.4 cm std - tight constraint
    case 'dynamic':
      return 1e-2;  // 10 cm std - loose constraint
    case 'general':
    default:
      return 5e-3;  // 7 cm std - moderate constraint
  }
}

/**
 * Create vertical plane constraint configuration
 *
 * Useful for movements that are primarily vertical with minimal
 * lateral displacement in one direction (e.g., barbell squat
 * facing north/south).
 *
 * @param axis Which lateral axis to constrain ('x' for East, 'y' for North)
 * @returns Constraint configuration
 */
export function createVerticalPlaneConstraint(axis: 'x' | 'y'): ConstraintConfig {
  return {
    type: 'verticalPlane',
    axis
  };
}

/**
 * Create vertical line constraint configuration
 *
 * Useful for movements along a strict vertical line (e.g., strict
 * overhead press, pull-ups). Constrains both X and Y to anchor point.
 *
 * @param anchorXY Initial XY position [East, North]
 * @returns Constraint configuration
 */
export function createLineVerticalConstraint(
  anchorXY: [number, number]
): ConstraintConfig {
  return {
    type: 'lineVertical',
    anchorXY
  };
}

/**
 * Estimate anchor point from position history
 *
 * When initializing a lineVertical constraint during a session,
 * estimate the anchor point from recent stationary positions.
 *
 * @param positions Recent position samples [x, y]
 * @returns Median XY position as anchor
 */
export function estimateAnchorFromHistory(
  positions: [number, number][]
): [number, number] {
  if (positions.length === 0) {
    return [0, 0];
  }

  // Use median to be robust to outliers
  const xs = positions.map(p => p[0]).sort((a, b) => a - b);
  const ys = positions.map(p => p[1]).sort((a, b) => a - b);

  const medianX = xs[Math.floor(xs.length / 2)];
  const medianY = ys[Math.floor(ys.length / 2)];

  return [medianX, medianY];
}

/**
 * Compute constraint effectiveness metric
 *
 * Evaluates how well the constraint is reducing lateral drift
 * compared to unconstrained operation.
 *
 * @param lateralDriftWithConstraint RMS lateral position with constraint [m]
 * @param lateralDriftWithoutConstraint RMS lateral position without constraint [m]
 * @returns Effectiveness ratio (>1 means constraint is helping)
 */
export function computeConstraintEffectiveness(
  lateralDriftWithConstraint: number,
  lateralDriftWithoutConstraint: number
): number {
  if (lateralDriftWithConstraint === 0) return Infinity;
  return lateralDriftWithoutConstraint / lateralDriftWithConstraint;
}
