/**
 * Tests for Motion Constraints
 *
 * References:
 * - Wahlström & Skog (2020): constraints complement ZUPT
 */

import { describe, it, expect } from 'vitest';
import {
  shouldApplyConstraint,
  validateConstraintConfig,
  estimateConstraintNoise,
  createVerticalPlaneConstraint,
  createLineVerticalConstraint,
  estimateAnchorFromHistory,
  computeConstraintEffectiveness
} from '../core/math/constraints';

describe('Motion Constraints', () => {
  describe('shouldApplyConstraint', () => {
    it('should apply constraint when moving (not stationary)', () => {
      const result = shouldApplyConstraint(false, 0.1); // not stationary, 10 cm/s
      expect(result).toBe(true);
    });

    it('should NOT apply constraint when stationary', () => {
      const result = shouldApplyConstraint(true, 0.1);
      expect(result).toBe(false);
    });

    it('should NOT apply constraint when velocity is too low', () => {
      const result = shouldApplyConstraint(false, 0.01); // 1 cm/s - too slow
      expect(result).toBe(false);
    });

    it('should apply constraint at threshold velocity (5 cm/s)', () => {
      const result = shouldApplyConstraint(false, 0.06);
      expect(result).toBe(true);
    });
  });

  describe('validateConstraintConfig', () => {
    it('should validate none constraint', () => {
      const error = validateConstraintConfig({ type: 'none' });
      expect(error).toBeNull();
    });

    it('should validate verticalPlane with axis', () => {
      const error = validateConstraintConfig({ type: 'verticalPlane', axis: 'x' });
      expect(error).toBeNull();
    });

    it('should reject verticalPlane without axis', () => {
      const error = validateConstraintConfig({ type: 'verticalPlane' });
      expect(error).not.toBeNull();
      expect(error).toContain('axis');
    });

    it('should reject verticalPlane with invalid axis', () => {
      const error = validateConstraintConfig({ type: 'verticalPlane', axis: 'z' as any });
      expect(error).not.toBeNull();
    });

    it('should validate lineVertical with anchorXY', () => {
      const error = validateConstraintConfig({
        type: 'lineVertical',
        anchorXY: [0.1, 0.2]
      });
      expect(error).toBeNull();
    });

    it('should reject lineVertical without anchorXY', () => {
      const error = validateConstraintConfig({ type: 'lineVertical' });
      expect(error).not.toBeNull();
      expect(error).toContain('anchorXY');
    });
  });

  describe('estimateConstraintNoise', () => {
    it('should return tight noise for strict movements', () => {
      const noise = estimateConstraintNoise('strict');
      expect(noise).toBeLessThan(1e-3); // < 1 mm²
      expect(noise).toBeGreaterThan(0);
    });

    it('should return loose noise for dynamic movements', () => {
      const noise = estimateConstraintNoise('dynamic');
      expect(noise).toBeGreaterThan(1e-3);
      expect(noise).toBeLessThan(0.1);
    });

    it('should return moderate noise for general movements', () => {
      const strict = estimateConstraintNoise('strict');
      const dynamic = estimateConstraintNoise('dynamic');
      const general = estimateConstraintNoise('general');

      expect(general).toBeGreaterThan(strict);
      expect(general).toBeLessThan(dynamic);
    });
  });

  describe('createVerticalPlaneConstraint', () => {
    it('should create X-axis constraint', () => {
      const config = createVerticalPlaneConstraint('x');

      expect(config.type).toBe('verticalPlane');
      expect(config.axis).toBe('x');
    });

    it('should create Y-axis constraint', () => {
      const config = createVerticalPlaneConstraint('y');

      expect(config.type).toBe('verticalPlane');
      expect(config.axis).toBe('y');
    });
  });

  describe('createLineVerticalConstraint', () => {
    it('should create line constraint with anchor', () => {
      const anchor: [number, number] = [0.5, 1.2];
      const config = createLineVerticalConstraint(anchor);

      expect(config.type).toBe('lineVertical');
      expect(config.anchorXY).toEqual(anchor);
    });
  });

  describe('estimateAnchorFromHistory', () => {
    it('should return median of position history', () => {
      const positions: [number, number][] = [
        [0.1, 0.2],
        [0.3, 0.4],
        [0.2, 0.3],
        [0.15, 0.25],
        [0.25, 0.35]
      ];

      const anchor = estimateAnchorFromHistory(positions);

      // Median of X: [0.1, 0.15, 0.2, 0.25, 0.3] = 0.2
      // Median of Y: [0.2, 0.25, 0.3, 0.35, 0.4] = 0.3
      expect(anchor[0]).toBeCloseTo(0.2, 2);
      expect(anchor[1]).toBeCloseTo(0.3, 2);
    });

    it('should handle empty history', () => {
      const anchor = estimateAnchorFromHistory([]);
      expect(anchor).toEqual([0, 0]);
    });

    it('should handle single position', () => {
      const positions: [number, number][] = [[0.5, 1.0]];
      const anchor = estimateAnchorFromHistory(positions);
      expect(anchor).toEqual([0.5, 1.0]);
    });

    it('should be robust to outliers', () => {
      const positions: [number, number][] = [
        [0.1, 0.1],
        [0.12, 0.11],
        [0.11, 0.12],
        [0.13, 0.13],
        [5.0, 5.0] // outlier
      ];

      const anchor = estimateAnchorFromHistory(positions);

      // Median should be around 0.12, 0.12 (not affected by outlier)
      expect(anchor[0]).toBeCloseTo(0.12, 1);
      expect(anchor[1]).toBeCloseTo(0.12, 1);
    });
  });

  describe('computeConstraintEffectiveness', () => {
    it('should compute effectiveness ratio', () => {
      const withConstraint = 0.1; // 10 cm RMS drift
      const withoutConstraint = 0.3; // 30 cm RMS drift

      const effectiveness = computeConstraintEffectiveness(withConstraint, withoutConstraint);

      expect(effectiveness).toBeCloseTo(3.0, 1);
    });

    it('should return high value when constraint eliminates drift', () => {
      const withConstraint = 0.001;
      const withoutConstraint = 0.5;

      const effectiveness = computeConstraintEffectiveness(withConstraint, withoutConstraint);

      expect(effectiveness).toBeGreaterThan(100);
    });

    it('should return 1 when constraint has no effect', () => {
      const drift = 0.2;

      const effectiveness = computeConstraintEffectiveness(drift, drift);

      expect(effectiveness).toBe(1.0);
    });

    it('should return Infinity when drift is completely eliminated', () => {
      const effectiveness = computeConstraintEffectiveness(0, 0.5);

      expect(effectiveness).toBe(Infinity);
    });
  });
});
