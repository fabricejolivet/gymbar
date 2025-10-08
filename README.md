# Gym Form Coach

A production-ready web application for real-time barbell form analysis using the WT9011DCL-BT5.0 IMU sensor.

## Features

- **Web Bluetooth Integration**: Connect directly to WT9011DCL-BT5.0 IMU sensor via Web Bluetooth API
- **Real-time Motion Tracking**: Stream and decode acceleration, gyroscope, and orientation data
- **ENU Frame Conversion**: Transform body-frame data to East-North-Up earth frame using quaternions
- **Rep Detection**: Intelligent state machine for detecting clean repetitions with configurable ROM
- **Form Analysis**:
  - Balance percentage (symmetry tracking)
  - Speed metrics (average and peak concentric speed)
  - Bar path visualization with polar plots
  - Tilt monitoring with adjustable target
- **Multi-Exercise Sessions**: Plan full workouts with multiple exercises
- **Session Management**: Store and review workout history in Supabase
- **Modern UI**: Neon lime on black theme, mobile-first responsive design
- **Smart Countdown**: 5-second countdown before each exercise (tap to skip)

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript (strict)
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Charts**: Recharts
- **Routing**: React Router
- **Database**: Supabase (PostgreSQL with RLS)
- **Sensor Communication**: Web Bluetooth API

## Architecture

```
src/
  app/              # Page components
    landing/        # Landing page
    home/           # Home dashboard
    training/       # Training setup, countdown, and live tracking
    report/         # Session reports
    stats/          # Monthly statistics
    settings/       # App settings
    profile/        # User profile
  components/       # Reusable UI components
    ble/            # Bluetooth components
    charts/         # Chart components (sparklines, bars, polar plots)
    controls/       # UI controls (timer, slider)
    layout/         # Layout components (nav)
  core/             # Framework-agnostic business logic
    bt/             # Web Bluetooth client
    decode/         # WT9011DCL packet parser
    math/           # Quaternion operations, ENU transforms, integrators
    reps/           # Rep detection state machine
    models/         # TypeScript types
    storage/        # Data persistence interfaces
  state/            # Zustand stores
  theme/            # Design tokens
```

## Getting Started

### Prerequisites

- Node.js 18+
- Modern browser with Web Bluetooth support (Chrome, Edge, Opera)
- WT9011DCL-BT5.0 IMU sensor
- Supabase account

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your Supabase credentials.

4. Start the development server:
   ```bash
   npm run dev
   ```

### Building for Production

```bash
npm run build
npm run preview
```

## Sensor Configuration

The WT9011DCL-BT5.0 sensor uses the following communication protocol:

### Default Data (0x61 frames)
- **Header**: `0x55 0x61`
- **Data**: 18 bytes (Accel XYZ, Gyro XYZ, Euler XYZ)
- **Scaling**:
  - Accel: `raw / 32768 * 16g`
  - Gyro: `raw / 32768 * 2000°/s`
  - Angles: `raw / 32768 * 180°`

### Single-return Data (0x71 frames)
Request specific data:
- **Magnetometer**: `FF AA 27 3A 00`
- **Quaternion**: `FF AA 27 51 00`
- **Temperature**: `FF AA 27 40 00`
- **Battery**: `FF AA 27 64 00`

### Commands
- **Sample rate**: `FF AA 03 <RATE> 00` (0x06 = 10Hz, 0x08 = 50Hz, 0x09 = 100Hz)
- **Calibrate accel**: `FF AA 01 01 00`
- **Calibrate mag**: `FF AA 01 07 00` (rotate 3x) → `FF AA 01 00 00`
- **Save settings**: `FF AA 00 00 00`

## Database Schema

### Tables
- **profiles**: User information
- **sessions**: Training sessions
- **sets**: Exercise sets within sessions
- **reps**: Individual repetition data with metrics

All tables have Row Level Security (RLS) enabled with user-scoped policies.

## Key Algorithms

### ENU Transformation
```typescript
// Convert body-frame acceleration to ENU earth frame
accel_enu = R(quaternion) * accel_body - gravity_enu
```

### Velocity Integration
- 2nd-order Butterworth low-pass filter on acceleration
- Zero-velocity updates at rep endpoints
- Windowed bias correction

### Rep Detection State Machine
1. **Idle** → detect downward velocity threshold → **Descent**
2. **Descent** → track minimum height → detect upward velocity → **Ascent**
3. **Ascent** → near start height + low velocity → **Lockout**
4. **Lockout** → hold duration satisfied + ROM check → **Complete** → Idle

## Design System

- **Background**: `#0f0f0f`
- **Accent**: `#D7FF37` (neon lime)
- **Card Background**: `#1a1a1a`
- **Border**: `#2a2a2a`
- **Font**: Inter
- **Spacing**: 8px base unit
- **Radius**: rounded-2xl (16px)

## Browser Support

- Chrome 89+
- Edge 89+
- Opera 75+

**Note**: Safari and Firefox do not support Web Bluetooth API.

## Demo Mode

The app includes mock data for demonstration without hardware:
- Simulated sensor readings
- Pre-generated rep sequences
- Sample balance and speed metrics

## License

MIT

## Credits

Built with Claude Code by Anthropic
