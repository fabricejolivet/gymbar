import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../../components/layout/BottomNav';
import { useBTStore } from '../../state/btStore';
import { useTrainingStore } from '../../state/trainingStore';
import { useSessionStore } from '../../state/sessionStore';
import { useEKFStore } from '../../state/ekfStore';
import { dataRouter } from '../../state/dataRouter';
import { BarbellRepDetector } from '../../core/reps/barbell';
import { loadUserPreferences } from '../../core/services/preferencesService';
import { DebugDataViewer } from '../../components/debug/DebugDataViewer';

export function LiveTrainingPage() {
  const navigate = useNavigate();
  const { currentReps, targetTilt, addRep, sensorFlipped } = useTrainingStore();
  const { getCurrentExercise } = useSessionStore();
  const ekfState = useEKFStore(state => state.state);
  const initStatus = useEKFStore(state => state.initStatus);
  const setPositionOffset = useEKFStore(state => state.setPositionOffset);
  const resetEKF = useEKFStore(state => state.reset);

  const currentExercise = getCurrentExercise();

  if (!currentExercise) {
    navigate('/training');
    return null;
  }

  const MAX_ANGLE = parseFloat(localStorage.getItem('maxAngle') || '25');

  const [timeElapsed, setTimeElapsed] = useState(0);
  const [currentTilt, setCurrentTilt] = useState(0);
  const [balance, setBalance] = useState(0);
  const [speed, setSpeed] = useState(0);

  const [balanceHistory, setBalanceHistory] = useState<number[]>([]);
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);

  const [barPath, setBarPath] = useState<Array<{ x: number; y: number }>>([]);
  const [tiltPath, setTiltPath] = useState<Array<{ x: number; y: number }>>([]);

  const repDetectorRef = useRef(new BarbellRepDetector());
  const startTimeRef = useRef(Date.now());
  const lastEulerRef = useRef<[number, number, number]>([0, 0, 0]);
  const lastUIUpdateRef = useRef(0);

  useEffect(() => {
    console.log('[LiveTraining] Page mounted, EKF init status:', initStatus);

    loadUserPreferences().then(prefs => {
      if (prefs.rep_counter_config) {
        repDetectorRef.current.setConfig(prefs.rep_counter_config);
      }
    });

    repDetectorRef.current.reset();
    startTimeRef.current = Date.now();
    setTimeElapsed(0);
    setBalanceHistory([]);
    setSpeedHistory([]);
    setBarPath([]);
    setTiltPath([]);
    setPositionOffset(ekfState.p);

    const timer = setInterval(() => {
      setTimeElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 100);

    return () => {
      console.log('LiveTrainingPage unmounting');
      clearInterval(timer);
    };
  }, [currentExercise?.id, resetEKF]);

  useEffect(() => {
    console.log('[LiveTraining] Subscribing to data router');

    const handleSample = (sample: {
      accel_g: [number, number, number];
      gyro_dps: [number, number, number];
      euler_deg: [number, number, number];
      timestamp_ms: number;
    }) => {
      lastEulerRef.current = sample.euler_deg;
    };

    const unsubscribe = dataRouter.subscribe(handleSample);

    return () => {
      console.log('[LiveTraining] Unsubscribing from data router');
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (initStatus !== 'initialized') {
      return;
    }

    const now = Date.now();
    if (now - lastUIUpdateRef.current < 50) {
      return;
    }
    lastUIUpdateRef.current = now;

    const velocity_cms: [number, number, number] = [
      ekfState.v[0] * 100,
      ekfState.v[1] * 100,
      ekfState.v[2] * 100
    ];

    const position_cm: [number, number, number] = [
      ekfState.p[0] * 100,
      ekfState.p[1] * 100,
      ekfState.p[2] * 100
    ];

    const euler_rad = lastEulerRef.current.map(deg => deg * Math.PI / 180) as [number, number, number];
    const [roll, pitch, yaw] = euler_rad;

    const barVector: [number, number, number] = [1, 0, 0];
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);

    const R = [
      [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
      [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
      [-sp, cp * sr, cp * cr]
    ];

    const barInENU: [number, number, number] = [
      R[0][0] * barVector[0] + R[0][1] * barVector[1] + R[0][2] * barVector[2],
      R[1][0] * barVector[0] + R[1][1] * barVector[1] + R[1][2] * barVector[2],
      R[2][0] * barVector[0] + R[2][1] * barVector[1] + R[2][2] * barVector[2]
    ];

    const barTiltFromHorizontal = Math.atan2(barInENU[2], Math.sqrt(barInENU[0] ** 2 + barInENU[1] ** 2)) * 180 / Math.PI;

    const adjustedTilt = sensorFlipped ? -barTiltFromHorizontal : barTiltFromHorizontal;
    setCurrentTilt(adjustedTilt);

    const tiltError = Math.abs(adjustedTilt - targetTilt);
    const currentBalance = Math.max(0, 100 - (tiltError / MAX_ANGLE) * 100);
    setBalance(Math.round(currentBalance));

    const verticalSpeed = velocity_cms[2];
    setSpeed(Math.round(Math.abs(verticalSpeed)));

    setBalanceHistory(prev => [...prev.slice(-99), currentBalance]);
    setSpeedHistory(prev => [...prev.slice(-99), Math.abs(verticalSpeed)]);

    setBarPath(prev => {
      const newPath = [...prev, { x: position_cm[0], y: position_cm[1] }];
      return newPath.slice(-60);
    });

    setTiltPath(prev => {
      const newPath = [...prev, { x: position_cm[0], y: position_cm[2] }];
      return newPath.slice(-60);
    });

    const rep = repDetectorRef.current.update(
      position_cm[2],
      velocity_cms[2],
      position_cm[1],
      velocity_cms[1],
      adjustedTilt,
      targetTilt,
      now
    );

    if (rep) {
      console.log('[LiveTraining] Rep detected:', rep);
      addRep(rep);
    }
  }, [ekfState, initStatus, sensorFlipped, targetTilt, addRep]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}"`;
  };

  const tiltPercentage = ((currentTilt + MAX_ANGLE) / (MAX_ANGLE * 2)) * 100;

  return (
    <div className="min-h-screen bg-gym-bg pb-24">
      <div className="max-w-md mx-auto px-4 pt-8">
        <div className="flex flex-col items-center mb-6">
          <CircularProgress
            timeElapsed={formatTime(timeElapsed)}
            repCount={currentReps}
          />
        </div>

        <div className="flex items-center justify-between mb-4 px-2">
          <span className="text-sm text-gray-400">Left</span>
          <span className="text-white font-bold">{currentTilt >= 0 ? '+' : ''}{currentTilt.toFixed(0)}°</span>
          <span className="text-sm text-gray-400">Right</span>
        </div>

        <div className="relative h-12 bg-gym-accent rounded-full mb-6 overflow-hidden">
          <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-green-400 transform -translate-x-1/2" />
          <div
            className="absolute top-1/2 w-8 h-8 bg-gray-900 rounded-full shadow-lg transition-all duration-100 transform -translate-y-1/2 -translate-x-1/2"
            style={{ left: `${Math.max(0, Math.min(100, tiltPercentage))}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gym-card border border-gym-border rounded-2xl p-4">
            <div className="h-16 mb-3">
              <MiniSparkline data={balanceHistory} />
            </div>
            <div className="flex items-end justify-between">
              <h3 className="text-base font-bold text-white">Balance</h3>
              <div className="text-2xl font-bold text-white">{balance}%</div>
            </div>
          </div>

          <div className="bg-gym-card border border-gym-border rounded-2xl p-4">
            <div className="h-16 mb-3">
              <MiniBars data={speedHistory} />
            </div>
            <div className="flex items-end justify-between">
              <h3 className="text-base font-bold text-white">Speed</h3>
              <div className="text-2xl font-bold text-white">{speed}cm/s</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <PolarTrackingPlot
            title="Up"
            yLabel="Down"
            data={tiltPath}
            size={160}
          />
          <PolarTrackingPlot
            title="Front"
            yLabel="Back"
            data={barPath}
            size={160}
          />
        </div>

        <button
          onClick={() => navigate('/report')}
          className="w-full bg-gym-accent text-gym-bg font-bold text-lg py-4 rounded-2xl hover:bg-gym-accent-dark transition-all"
        >
          Finish
        </button>
      </div>

      <BottomNav />

      {/* Debug Data Viewer - Floating button */}
      <DebugDataViewer />
    </div>
  );
}

function CircularProgress({ timeElapsed, repCount }: { timeElapsed: string; repCount: number }) {
  const size = 200;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#3a3a3a"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#D7FF37"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round"
          className="transition-all duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm text-gray-400">{timeElapsed}</span>
        <span className="text-5xl font-bold text-white">{repCount}</span>
      </div>
    </div>
  );
}

function PolarTrackingPlot({
  title,
  yLabel,
  data,
  size,
}: {
  title: string;
  yLabel: string;
  data: Array<{ x: number; y: number }>;
  size: number;
}) {
  const padding = 25;
  const centerX = size / 2;
  const centerY = size / 2;
  const maxRadius = size / 2 - padding;
  const maxCm = 30;

  const normalizedData = data.map(point => ({
    x: centerX + (point.x / maxCm) * maxRadius,
    y: centerY - (point.y / maxCm) * maxRadius,
  }));

  const currentPoint = normalizedData[normalizedData.length - 1];

  return (
    <div className="flex flex-col bg-gym-card border border-gym-border rounded-2xl overflow-hidden">
      <svg
        width={size}
        height={size}
        className="bg-gym-card"
      >
        <circle cx={centerX} cy={centerY} r={maxRadius * 0.33} fill="none" stroke="#2a2a2a" strokeWidth="1" />
        <circle cx={centerX} cy={centerY} r={maxRadius * 0.66} fill="none" stroke="#2a2a2a" strokeWidth="1" />
        <circle cx={centerX} cy={centerY} r={maxRadius} fill="none" stroke="#2a2a2a" strokeWidth="1" />

        <line x1={centerX} y1={padding} x2={centerX} y2={size - padding} stroke="#3a3a3a" strokeWidth="1.5" />
        <line x1={padding} y1={centerY} x2={size - padding} y2={centerY} stroke="#3a3a3a" strokeWidth="1.5" />

        <text x={centerX} y={padding - 8} fontSize="11" fill="#888" textAnchor="middle" fontWeight="600">{title}</text>
        {yLabel && <text x={centerX} y={size - padding + 15} fontSize="10" fill="#666" textAnchor="middle">{yLabel}</text>}

        {normalizedData.length > 1 && (
          <polyline
            points={normalizedData.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#D7FF37"
            strokeWidth="2.5"
            strokeOpacity="0.9"
          />
        )}

        {currentPoint && (
          <circle cx={currentPoint.x} cy={currentPoint.y} r="5" fill="#D7FF37" stroke="white" strokeWidth="2" />
        )}
      </svg>
    </div>
  );
}

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length === 0) return null;

  const max = Math.max(...data, 100);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - (v / max) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="#D7FF37"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MiniBars({ data }: { data: number[] }) {
  if (data.length === 0) return null;

  const max = Math.max(...data, 50);
  const barWidth = 100 / data.length;

  return (
    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      {data.map((v, i) => {
        const height = (v / max) * 100;
        return (
          <rect
            key={i}
            x={i * barWidth}
            y={100 - height}
            width={barWidth * 0.8}
            height={height}
            fill="#D7FF37"
            rx="1"
          />
        );
      })}
    </svg>
  );
}
