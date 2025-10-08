import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../../components/layout/BottomNav';
import { useBTStore } from '../../state/btStore';
import { useTrainingStore } from '../../state/trainingStore';
import { useSessionStore } from '../../state/sessionStore';
import { useEKFStore } from '../../state/ekfStore';
import { dataRouter } from '../../state/dataRouter';
import { BarbellRepDetector } from '../../core/reps/barbell';

export function LiveTrainingPage() {
  const navigate = useNavigate();
  const { client } = useBTStore();
  const { currentReps, targetTilt, addRep, sensorFlipped, toggleSensorFlip } = useTrainingStore();
  const { getCurrentExercise, nextExercise: nextExerciseInSession, exercises, currentExerciseIndex } = useSessionStore();
  const { state: ekfState, initStatus, processSample, reset: resetEKF, zuptActive, setPositionOffset } = useEKFStore();

  const currentExercise = getCurrentExercise();

  if (!currentExercise) {
    navigate('/training');
    return null;
  }

  const MAX_ANGLE = parseFloat(localStorage.getItem('maxAngle') || '25');
  const HISTORY_SIZE = 100;

  const [timeElapsed, setTimeElapsed] = useState(0);
  const [currentTilt, setCurrentTilt] = useState(0);
  const [balance, setBalance] = useState(0);
  const [speed, setSpeed] = useState(0);

  const [balanceHistory, setBalanceHistory] = useState<number[]>([]);
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);

  const [barPath, setBarPath] = useState<Array<{ x: number; y: number }>>([]);
  const [tiltPath, setTiltPath] = useState<Array<{ x: number; y: number }>>([]);

  const repDetectorRef = useRef(new BarbellRepDetector(30));
  const startTimeRef = useRef(Date.now());
  const lastEulerRef = useRef<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    console.log('[LiveTraining] Page mounted, EKF init status:', initStatus);
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
      processSample(sample);
    };

    const unsubscribe = dataRouter.subscribe(handleSample);

    return () => {
      console.log('[LiveTraining] Unsubscribing from data router');
      unsubscribe();
    };
  }, [processSample]);

  useEffect(() => {
    if (initStatus !== 'initialized') {
      return;
    }

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

    setBalanceHistory(prev => [...prev.slice(-(HISTORY_SIZE - 1)), currentBalance]);
    setSpeedHistory(prev => [...prev.slice(-(HISTORY_SIZE - 1)), Math.abs(verticalSpeed)]);

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
      adjustedTilt,
      targetTilt,
      Date.now()
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
      <div className="max-w-md mx-auto px-4 pt-4">
        <div className="bg-gym-card border border-gym-border rounded-2xl p-4 mb-3">
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="text-gray-400">Exercise {currentExerciseIndex + 1} of {exercises.length}</span>
            <span className="text-gray-400">Target: {currentExercise.targetReps}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-xl font-bold text-gym-accent capitalize">{currentExercise.exercise}</div>
              <div className="text-lg text-white">{currentExercise.weight}kg</div>
            </div>
            <div className="flex flex-col items-end">
              <div className="text-3xl font-bold text-white">{currentReps}</div>
              <div className="text-xs text-gray-400">{formatTime(timeElapsed)}</div>
            </div>
          </div>
        </div>

        {initStatus === 'waiting' && (
          <div className="bg-yellow-900/10 border border-yellow-500/30 rounded-2xl p-4 mb-4">
            <p className="text-yellow-400/80 text-sm text-center">
              Place bar at rest for 1.5s to initialize...
            </p>
          </div>
        )}

        <div className="bg-gym-card border border-gym-border rounded-2xl p-3 mb-4">
          <div className="flex justify-between items-center text-xs">
            <div className="flex gap-3">
              <span className="text-gray-400">Pos: <span className="text-white font-mono">{(ekfState.p[2] * 100).toFixed(1)}cm</span></span>
              <span className="text-gray-400">Vel: <span className="text-white font-mono">{(ekfState.v[2] * 100).toFixed(1)}cm/s</span></span>
            </div>
            <div className={`px-2 py-1 rounded text-xs font-bold ${zuptActive ? 'bg-gym-accent text-gym-bg' : 'bg-gym-bg text-gray-500'}`}>
              {zuptActive ? 'ZUPT' : 'DRIFT'}
            </div>
          </div>
        </div>

        <div className="bg-gym-card border border-gym-border rounded-2xl p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Bar Level</span>
              <button
                onClick={toggleSensorFlip}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  sensorFlipped
                    ? 'bg-gym-accent text-gym-bg'
                    : 'bg-gym-bg text-gray-400 border border-gym-border'
                }`}
              >
                Flip
              </button>
            </div>
            <span className="text-white font-bold text-lg">{currentTilt >= 0 ? '+' : ''}{currentTilt.toFixed(1)}°</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-400 w-12 text-left">-{MAX_ANGLE}°</span>
            <div className="relative flex-1 h-10 bg-gym-bg border border-gym-border rounded-full">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />
              <div
                className="absolute top-1/2 w-7 h-7 bg-gym-accent rounded-full shadow-lg transform -translate-y-1/2 -translate-x-1/2 transition-all duration-100 border-2 border-white"
                style={{ left: `${Math.max(0, Math.min(100, tiltPercentage))}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-12 text-right">+{MAX_ANGLE}°</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-gym-card border border-gym-border rounded-2xl p-3">
            <div className="h-12 mb-2">
              <MiniSparkline data={balanceHistory} />
            </div>
            <div className="flex items-end justify-between">
              <h3 className="text-sm font-bold text-white">Balance</h3>
              <div className="text-xl font-bold text-white">{balance}%</div>
            </div>
          </div>

          <div className="bg-gym-card border border-gym-border rounded-2xl p-3">
            <div className="h-12 mb-2">
              <MiniBars data={speedHistory} />
            </div>
            <div className="flex items-end justify-between">
              <h3 className="text-sm font-bold text-white">Speed</h3>
              <div className="text-xl font-bold text-white">{speed}cm/s</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <PolarTrackingPlot
            title="Left/Right vs Up/Down"
            xLabel="L/R"
            yLabel="Up/Down"
            data={tiltPath}
            size={160}
          />
          <PolarTrackingPlot
            title="Left/Right vs Front/Back"
            xLabel="L/R"
            yLabel="F/B"
            data={barPath}
            size={160}
          />
        </div>

        <div className="space-y-3">
          {currentExerciseIndex < exercises.length - 1 ? (
            <button
              onClick={() => {
                if (nextExerciseInSession()) {
                  repDetectorRef.current.reset();
                  resetEKF();
                  navigate('/training/countdown');
                }
              }}
              className="w-full bg-gym-card text-gym-accent border-2 border-gym-accent font-bold text-lg py-4 rounded-2xl hover:bg-gym-accent hover:text-gym-bg transition-all"
            >
              Next exercise
            </button>
          ) : null}

          <button
            onClick={() => navigate('/report')}
            className="w-full bg-gym-accent text-gym-bg font-bold text-lg py-4 rounded-2xl hover:bg-gym-accent-dark transition-all"
          >
            Finish
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

function PolarTrackingPlot({
  title,
  xLabel,
  yLabel,
  data,
  size,
}: {
  title: string;
  xLabel: string;
  yLabel: string;
  data: Array<{ x: number; y: number }>;
  size: number;
}) {
  const padding = 20;
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
    <div className="flex flex-col">
      <svg
        width={size}
        height={size}
        className="bg-gym-card rounded-lg border border-gym-border"
      >
        <circle cx={centerX} cy={centerY} r={maxRadius * 0.33} fill="none" stroke="#2a2a2a" strokeWidth="1" />
        <circle cx={centerX} cy={centerY} r={maxRadius * 0.66} fill="none" stroke="#2a2a2a" strokeWidth="1" />
        <circle cx={centerX} cy={centerY} r={maxRadius} fill="none" stroke="#2a2a2a" strokeWidth="1" />

        <line x1={centerX} y1={padding} x2={centerX} y2={size - padding} stroke="#3a3a3a" strokeWidth="1" />
        <line x1={padding} y1={centerY} x2={size - padding} y2={centerY} stroke="#3a3a3a" strokeWidth="1" />

        <text x={centerX} y={padding - 5} fontSize="10" fill="#666" textAnchor="middle">{yLabel}+</text>
        <text x={centerX} y={size - padding + 12} fontSize="10" fill="#666" textAnchor="middle">{yLabel}-</text>
        <text x={padding - 5} y={centerY + 3} fontSize="10" fill="#666" textAnchor="end">{xLabel}-</text>
        <text x={size - padding + 5} y={centerY + 3} fontSize="10" fill="#666" textAnchor="start">{xLabel}+</text>

        <text x={centerX + maxRadius * 0.33 + 3} y={centerY - 3} fontSize="8" fill="#555" textAnchor="start">10cm</text>
        <text x={centerX + maxRadius * 0.66 + 3} y={centerY - 3} fontSize="8" fill="#555" textAnchor="start">20cm</text>
        <text x={centerX + maxRadius + 3} y={centerY - 3} fontSize="8" fill="#555" textAnchor="start">30cm</text>

        {normalizedData.length > 1 && (
          <polyline
            points={normalizedData.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#D7FF37"
            strokeWidth="2"
            strokeOpacity="0.8"
          />
        )}

        {currentPoint && (
          <circle cx={currentPoint.x} cy={currentPoint.y} r="4" fill="#D7FF37" stroke="white" strokeWidth="2" />
        )}
      </svg>
    </div>
  );
}

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length === 0) return null;

  const max = Math.max(...data, 100);
  const average = data.reduce((sum, v) => sum + v, 0) / data.length;
  const avgY = 100 - (average / max) * 100;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - (v / max) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <line
        x1="0"
        y1={avgY}
        x2="100"
        y2={avgY}
        stroke="#888"
        strokeWidth="1"
        strokeDasharray="2,2"
        vectorEffect="non-scaling-stroke"
      />
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
  const average = data.reduce((sum, v) => sum + v, 0) / data.length;
  const avgY = 100 - (average / max) * 100;

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
      <line
        x1="0"
        y1={avgY}
        x2="100"
        y2={avgY}
        stroke="#888"
        strokeWidth="1"
        strokeDasharray="2,2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
