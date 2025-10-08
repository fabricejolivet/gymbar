# ZUPT & Kalman Filter Architecture

## Data Flow (Clean & Unified)

```
BLE Sensor (WT9011)
  ↓ parse0x61()
  ├─ accel_g: raw accelerometer [x,y,z] in g units
  ├─ gyro_dps: raw gyroscope [x,y,z] in deg/s
  └─ euler_deg: orientation [roll,pitch,yaw] in degrees

  ↓ ekfStore.processSample()

1. Convert units:
   - accel_g → accel_ms2 (multiply by 9.80665)
   - gyro_dps → gyro_rads (multiply by π/180)
   - euler_deg → euler_rad (multiply by π/180)

2. Transform to ENU frame:
   - a_enu = bodyToEnuAccelEuler(accel_ms2, euler_rad)
   - a_enu_filtered = accelFilter.filter(a_enu)  // Low-pass filter

3. Update gravity estimate:
   - updatedGravity = gravityEstimator.update(a_enu_filtered, gyro_rads, dt, false)

4. Calculate zero-g acceleration:
   - a_enu_0g = a_enu_filtered - updatedGravity
   - accelMag_0g = ||a_enu_0g||
   - gyroMag = ||gyro_rads||

5. ZUPT Detection (Simple, Clean):
   - isStationary = (accelMag_0g < config.a_thr) AND (gyroMag < config.w_thr)
   - Hold timer: requires stationary for config.minHoldMs before triggering

6. Kalman Filter Update:
   - predictEKF(state, a_enu_0g, dt) → new position & velocity
   - IF (stationary for minHoldMs): updateZUPT(state) → zero velocity
   - updateConstraint(state) → enforce vertical plane constraint

7. Graph Updates:
   - __updateSensorDebug(gyro_rads, a_enu_0g)
   - Graphs display EXACTLY what ZUPT uses
```

## Code Organization

### Backend (Core Logic)

**`src/core/bar/ekf.ts`**
- Pure Kalman filter implementation
- Functions: `createEKF()`, `predictEKF()`, `updateZUPT()`, `updateConstraint()`
- Matrix operations: multiply, transpose, add, subtract, inverse
- State: `{p: position, v: velocity, ba: bias, P: covariance}`

**`src/core/bar/orientation.ts`**
- Coordinate transformations (body → ENU)
- Low-pass filter implementation
- Functions: `bodyToEnuAccelEuler()`, `AccelLowPassFilter`

**`src/core/bar/gravityEstimator.ts`**
- Adaptive gravity estimation
- Updates gravity vector when stationary
- Prevents drift from gravity component

**`src/core/bar/autoInit.ts`**
- Auto-initialization logic
- Detects when sensor is ready to start tracking
- Establishes initial anchor point

### State Management

**`src/state/ekfStore.ts`**
- Central orchestrator - combines all backend logic
- Manages EKF state, configuration, gravity, filters
- Processes sensor samples in single pipeline
- **NO duplicate logic** - single source of truth for ZUPT

**`src/state/barStore.ts`**
- UI state for bar tracking page
- Position history for graphing

### Frontend (UI Components)

**`src/components/charts/LiveSensorStreams.tsx`**
- Real-time graphs for ZUPT tuning
- Shows gyroscope & accelerometer magnitude
- Displays threshold bands and STATIONARY/MOVING status
- Receives data via `__updateSensorDebug` callback

**`src/components/controls/TuningPanel.tsx`**
- ZUPT parameter controls (sliders)
- Auto-tune functionality
- Status display (Init, ZUPT, Loop Hz, dt Jitter)

**`src/app/settings/SettingsPage.tsx`**
- Settings page container
- BLE connection management
- Routes sensor data to ekfStore.processSample()

## Key Design Principles

### ✅ SINGLE SOURCE OF TRUTH
- ZUPT detection: **ONLY** in ekfStore.processSample()
- NO duplicate detection in UI components
- Graphs receive EXACT data used by ZUPT

### ✅ CLEAN SEPARATION
- **Backend (core/)**: Pure functions, no UI dependencies
- **State (state/)**: Orchestration, combines backend logic
- **Frontend (components/)**: Display only, receives data via callbacks

### ✅ CONSISTENT DATA
- Gravity updated BEFORE calculating zero-g acceleration
- Same gravity used for ZUPT detection and EKF prediction
- Graphs use same zero-g values as ZUPT

### ✅ NO UNUSED CODE
- Removed: `AdaptiveZUPTDetector` (complex, unused)
- Removed: `StancePhaseDetector` (walking detection, not needed)
- Removed: Duplicate ZUPT calculation paths

## ZUPT Logic (Simplified)

```typescript
// Calculate magnitudes
const accelMag_0g = ||a_enu_0g||  // Zero-g accelerometer
const gyroMag = ||gyro_rads||     // Raw gyroscope

// Simple threshold detection
const isStationary = accelMag_0g < config.a_thr && gyroMag < config.w_thr

// Hold timer (prevents flickering)
if (isStationary) {
  if (holdTimer_start == null) {
    holdTimer_start = now
  } else if (now - holdTimer_start >= config.minHoldMs) {
    // Apply ZUPT: set velocity to zero
    state = updateZUPT(state, config)
  }
} else {
  holdTimer_start = null
}
```

## Configuration

**Default ZUPT Parameters:**
- `a_thr = 0.5 m/s²` - acceleration threshold
- `w_thr = 0.4 rad/s` - gyroscope threshold
- `minHoldMs = 200ms` - minimum hold time

**Default Kalman Parameters:**
- `Qv = 5e-4` - velocity process noise
- `Qba = 1e-6` - bias process noise
- `Rv = 1e-4` - ZUPT measurement noise
- `Ry = 2e-3` - constraint measurement noise

**Constraint:**
- `constraint = 'verticalPlane'` - restricts to 2D motion
- `planeAxis = 'y'` - Y-axis is perpendicular to movement plane

## Troubleshooting

### Graph shows "MOVING" but sensor is stationary
- Check gravity estimate in console: `[ZUPT] gravity: [x, y, z]`
- Gravity should be ~[0, 0, -9.81] when calibrated
- If gravity is wrong, reset and hold sensor still for 3 seconds

### ZUPT shows "OFF" but graphs show "STATIONARY"
- Check hold timer in console: `[ZUPT] Hold duration: X ms, need: Y ms`
- Increase `minHoldMs` if still flickering
- Sensor must be continuously stationary for hold period

### Position drifts over time
- Lower `Rv` (more aggressive ZUPT correction)
- Increase `Qv` (allows faster velocity changes)
- Ensure ZUPT is triggering regularly during rests

### Accelerometer shows huge values (>100 m/s²)
- **FIXED**: This was a bug where raw accel was sent instead of zero-g
- Graphs now receive `a_enu_0g` which should be <2 m/s² when stationary
