# EKF Implementation Analysis & Recommendations

## Current Implementation Issues

### 1. **Accelerometer Usage - CRITICAL ISSUE**

**Problem**: You're using raw accelerometer data that includes gravity (NOT 0g).

**Evidence** (`ekfStore.ts:133-134`):
```typescript
const a_enu = bodyToEnuAccelEuler(accel_ms2, euler_rad);
const a_enu_filtered = accelFilter.filter(a_enu);
```

**Why This is Bad**:
- Raw accelerometer reads 1g when stationary (gravity vector)
- Your prediction integrates this directly: `p = p + v*dt + 0.5*a*dt²`
- This causes **massive position drift** because you're integrating gravity as if it's motion
- For accurate positioning, you MUST subtract gravity first

**Solution**:
```typescript
// You need to subtract gravity in ENU frame before prediction
const g_enu: [number, number, number] = [0, 0, -9.80665];  // Gravity points down
const a_enu_0g: [number, number, number] = [
  a_enu[0] - g_enu[0],
  a_enu[1] - g_enu[1],
  a_enu[2] - g_enu[2]
];
// Then use a_enu_0g in prediction
```

### 2. **Bias Removal - IMPLEMENTED CORRECTLY ✓**

**Status**: YES, you're estimating and removing accelerometer bias.

**Evidence** (`ekf.ts:137`):
```typescript
const a_corr: [number, number, number] = [ax - bax, ay - bay, az - baz];
```

**How it works**:
- State includes `ba: [number, number, number]` (bias estimate)
- Bias is estimated through Kalman filter state variables 6-8
- Process noise `Qba` allows bias to slowly change over time
- ZUPT updates help refine bias estimates when stationary

### 3. **Timing Instability - NEEDS IMPROVEMENT**

**Problem**: Variable dt causes integration errors.

**Current Stats** (from UI):
- Loop Hz varies (should be constant ~20 Hz)
- dt Jitter shows timing variations
- This affects prediction accuracy

**Why Unstable Timing is Bad**:
- Kalman filter assumes process noise scales with dt
- Variable dt causes irregular covariance growth
- Integration errors accumulate differently each cycle
- Can cause filter divergence over time

**Solutions**:
1. **dt Smoothing** (exponential moving average):
```typescript
const alpha = 0.9;
smoothedDt = alpha * smoothedDt + (1 - alpha) * dt;
```

2. **Reject Outliers**:
```typescript
if (dt > 0.1 || dt < 0.01) {  // Reject if outside 10-100 Hz
  return;  // Skip this sample
}
```

3. **Timestamp Interpolation** (if sensor provides it):
```typescript
// Use sensor's hardware timestamp instead of system time
```

### 4. **Position Prediction - IMPLEMENTED BUT FLAWED**

**Status**: YES, you're predicting position.

**Evidence** (`ekf.ts:139-143`):
```typescript
const p_new: [number, number, number] = [
  state.p[0] + state.v[0] * dt + 0.5 * a_corr[0] * dt * dt,
  state.p[1] + state.v[1] * dt + 0.5 * a_corr[1] * dt * dt,
  state.p[2] + state.v[2] * dt + 0.5 * a_corr[2] * dt * dt
];
```

**The Problem**:
- Using `a_enu` which includes gravity
- This will integrate gravity as acceleration → massive drift
- Even with bias estimation, gravity is too large (~9.8 m/s²)

**Example of Error**:
- If you integrate 0.1 m/s² error for 1 second: `Δp = 0.5 * 0.1 * 1² = 0.05m = 5cm`
- If you integrate 9.8 m/s² (gravity): `Δp = 0.5 * 9.8 * 1² = 4.9m` in 1 second!

## Auto-Tuning All EKF Parameters

### Parameters That Can Be Auto-Tuned:

1. **ZUPT Thresholds** (w_thr, a_thr) - ✓ Already implemented
2. **Process Noise** (Qv, Qba)
3. **Measurement Noise** (Rv, Ry)
4. **Filter Cutoff** (accelCutoffHz)
5. **Timing** (minHoldMs)

### Auto-Tune Strategy:

#### Phase 1: Collect Data During Calibration
```
1. Stationary period (3s) → Measure sensor noise
2. Slow movement (3s) → Measure motion characteristics
3. Fast movement (3s) → Measure dynamic range
4. Return to stationary (3s) → Verify convergence
```

#### Phase 2: Analyze Collected Data

**A. Process Noise (Qv, Qba)**:
- Higher sensor noise → Higher Qv needed
- Measure acceleration variance during stationary periods
- `Qv = k * var(accel)` where k ≈ 1e-3

**B. Measurement Noise (Rv)**:
- From velocity variance during ZUPT
- Measure how much velocity drifts before ZUPT correction
- `Rv = var(velocity_at_zupt)`

**C. Accel Cutoff Frequency**:
- Analyze frequency content of acceleration
- Find frequency where signal power drops below noise
- Typical: 2-5 Hz for barbell movements

#### Phase 3: Validation
```
1. Apply new parameters
2. Run for 10 seconds
3. Check if position drift < threshold
4. Check if ZUPT activates correctly
5. If failed → Increase conservatism, retry
```

### Advanced: Gravity Compensation Auto-Calibration

**Problem**: You need to subtract gravity, but orientation might drift.

**Solution**: Use ZUPT periods to recalibrate gravity vector:
```typescript
// During ZUPT (bar is stationary):
// 1. True acceleration should be zero
// 2. Any measured accel is gravity + bias
// 3. Use this to refine gravity direction

if (zuptActive) {
  const measured_a = a_enu_filtered;
  // This should be gravity + bias
  gravity_estimate = 0.99 * gravity_estimate + 0.01 * measured_a;
}

// Then in prediction:
const a_0g = [
  a_enu[0] - gravity_estimate[0],
  a_enu[1] - gravity_estimate[1],
  a_enu[2] - gravity_estimate[2]
];
```

## Recommended Implementation Priority

1. **CRITICAL**: Fix gravity compensation (remove gravity before integration)
2. **HIGH**: Add dt smoothing to handle timing jitter
3. **MEDIUM**: Enhance auto-tune to include Qv, Qba, Rv parameters
4. **LOW**: Add comprehensive auto-calibration sequence

## Quick Wins

### Fix #1: Remove Gravity (5 minutes)
In `ekfStore.ts`, before calling `predictEKF`:
```typescript
const g_enu: [number, number, number] = [0, 0, -9.80665];
const a_enu_0g: [number, number, number] = [
  a_enu_filtered[0] - g_enu[0],
  a_enu_filtered[1] - g_enu[1],
  a_enu_filtered[2] - g_enu[2]
];

let newState = predictEKF(state, a_enu_0g, dt, config);  // Use 0g accel
```

### Fix #2: dt Smoothing (2 minutes)
Add to ekfStore state:
```typescript
smoothedDt: 0.05,  // Initialize to expected 20Hz
```

Then before prediction:
```typescript
const alpha = 0.9;
const smoothedDt = alpha * get().smoothedDt + (1 - alpha) * dt;
set({ smoothedDt });

// Use smoothedDt instead of raw dt
let newState = predictEKF(state, a_enu_0g, smoothedDt, config);
```

These two fixes will dramatically improve positioning accuracy!
