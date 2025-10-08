import { useEffect, useState, useRef, useMemo, memo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useEKFStore } from '../../state/ekfStore';

interface LiveSensorStreamsProps {
  gyroThreshold?: number;
  accelThreshold?: number;
}

const WINDOW_DURATION = 5;

export const LiveSensorStreams = memo(function LiveSensorStreams({ gyroThreshold, accelThreshold }: LiveSensorStreamsProps) {
  const { zuptParams } = useEKFStore();
  const [gyroHistory, setGyroHistory] = useState<Array<{ t: number; x: number; y: number; z: number; mag: number }>>([]);
  const [accelHistory, setAccelHistory] = useState<Array<{ t: number; x: number; y: number; z: number; mag: number }>>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const startTimeRef = useRef(Date.now());
  const batchBufferRef = useRef<Array<{ gyro: [number, number, number]; accel: [number, number, number]; time: number }>>([]);
  const lastUpdateRef = useRef(0);

  const gyroThr = useMemo(() => gyroThreshold ?? zuptParams.w_thr, [gyroThreshold, zuptParams.w_thr]);
  const accelThr = useMemo(() => accelThreshold ?? zuptParams.a_thr, [accelThreshold, zuptParams.a_thr]);

  useEffect(() => {
    startTimeRef.current = Date.now();
    setGyroHistory([]);
    setAccelHistory([]);

    const flushBatch = () => {
      const batch = batchBufferRef.current;
      if (batch.length === 0) return;

      const latestTime = batch[batch.length - 1].time;
      setCurrentTime(latestTime);

      setGyroHistory(prev => {
        const filtered = prev.filter(item => item.t >= latestTime - WINDOW_DURATION);
        const newPoints = batch.map(({ gyro, time }) => {
          const gyroMag = Math.sqrt(gyro[0] ** 2 + gyro[1] ** 2 + gyro[2] ** 2);
          return { t: time, x: gyro[0], y: gyro[1], z: gyro[2], mag: gyroMag };
        });
        return [...filtered, ...newPoints];
      });

      setAccelHistory(prev => {
        const filtered = prev.filter(item => item.t >= latestTime - WINDOW_DURATION);
        const newPoints = batch.map(({ accel, time }) => {
          const accelMag = Math.sqrt(accel[0] ** 2 + accel[1] ** 2 + accel[2] ** 2);
          return { t: time, x: accel[0], y: accel[1], z: accel[2], mag: accelMag };
        });
        return [...filtered, ...newPoints];
      });

      batchBufferRef.current = [];
    };

    const updateData = (gyro: [number, number, number], accel: [number, number, number]) => {
      const now = Date.now();
      const time = (now - startTimeRef.current) / 1000;

      batchBufferRef.current.push({ gyro, accel, time });

      if (now - lastUpdateRef.current >= 100) {
        flushBatch();
        lastUpdateRef.current = now;
      }
    };

    (window as any).__updateSensorDebug = updateData;

    const intervalId = setInterval(flushBatch, 100);

    return () => {
      clearInterval(intervalId);
      delete (window as any).__updateSensorDebug;
      batchBufferRef.current = [];
    };
  }, []);

  const gyroExceedsThreshold = useMemo(
    () => gyroHistory.length > 0 && gyroHistory[gyroHistory.length - 1].mag > gyroThr,
    [gyroHistory, gyroThr]
  );
  const accelExceedsThreshold = useMemo(
    () => accelHistory.length > 0 && accelHistory[accelHistory.length - 1].mag > accelThr,
    [accelHistory, accelThr]
  );

  const minTime = useMemo(() => Math.max(0, currentTime - WINDOW_DURATION), [currentTime]);
  const maxTime = currentTime;

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3">
        <h2 className="text-base font-bold text-white mb-1">Live Sensor Data for ZUPT Tuning</h2>
        <p className="text-xs text-gray-400">
          <span className="font-bold text-gym-accent">Yellow line</span> shows magnitude √(x²+y²+z²) used for ZUPT detection. Keep within yellow threshold bands for stationary detection.
        </p>
      </div>

      <div className="space-y-4 flex-1">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-bold text-gray-300">Gyroscope (rad/s)</h3>
            <div className={`text-xs font-bold px-2 py-0.5 rounded ${
              gyroExceedsThreshold ? 'bg-red-500/20 text-red-400' : 'bg-gym-accent/20 text-gym-accent'
            }`}>
              {gyroExceedsThreshold ? 'MOVING' : 'STATIONARY'}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={gyroHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="t"
                stroke="#888"
                tick={{ fill: '#888', fontSize: 9 }}
                domain={[minTime, maxTime]}
                type="number"
              />
              <YAxis
                stroke="#888"
                tick={{ fill: '#888', fontSize: 9 }}
                domain={[-3.7, 3.7]}
                allowDataOverflow={false}
                tickFormatter={(value) => value.toFixed(1)}
              />
              <ReferenceLine y={gyroThr} stroke="#D7FF37" strokeDasharray="3 3" strokeWidth={1.5} />
              <ReferenceLine y={-gyroThr} stroke="#D7FF37" strokeDasharray="3 3" strokeWidth={1.5} />
              <Line
                type="stepAfter"
                dataKey="mag"
                stroke={gyroExceedsThreshold ? "#D7FF37" : "#D7FF37"}
                dot={false}
                strokeWidth={2.5}
                name="Magnitude"
                isAnimationActive={false}
              />
              <Line
                type="stepAfter"
                dataKey="x"
                stroke="#ff6b6b"
                dot={false}
                strokeWidth={1}
                strokeOpacity={0.3}
                name="X"
                isAnimationActive={false}
              />
              <Line
                type="stepAfter"
                dataKey="y"
                stroke="#4ecdc4"
                dot={false}
                strokeWidth={1}
                strokeOpacity={0.3}
                name="Y"
                isAnimationActive={false}
              />
              <Line
                type="stepAfter"
                dataKey="z"
                stroke="#95e1d3"
                dot={false}
                strokeWidth={1}
                strokeOpacity={0.3}
                name="Z"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-bold text-gray-300">Accelerometer (m/s² - Zero-G)</h3>
            <div className={`text-xs font-bold px-2 py-0.5 rounded ${
              accelExceedsThreshold ? 'bg-red-500/20 text-red-400' : 'bg-gym-accent/20 text-gym-accent'
            }`}>
              {accelExceedsThreshold ? 'MOVING' : 'STATIONARY'}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={accelHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="t"
                stroke="#888"
                tick={{ fill: '#888', fontSize: 9 }}
                domain={[minTime, maxTime]}
                type="number"
              />
              <YAxis
                stroke="#888"
                tick={{ fill: '#888', fontSize: 9 }}
                domain={[-2.8, 2.8]}
                allowDataOverflow={false}
                tickFormatter={(value) => value.toFixed(1)}
              />
              <ReferenceLine y={accelThr} stroke="#D7FF37" strokeDasharray="3 3" strokeWidth={1.5} />
              <ReferenceLine y={-accelThr} stroke="#D7FF37" strokeDasharray="3 3" strokeWidth={1.5} />
              <ReferenceLine y={0} stroke="#666" strokeWidth={1} />
              <Line
                type="stepAfter"
                dataKey="mag"
                stroke={accelExceedsThreshold ? "#D7FF37" : "#D7FF37"}
                dot={false}
                strokeWidth={2.5}
                name="Magnitude"
                isAnimationActive={false}
              />
              <Line
                type="stepAfter"
                dataKey="x"
                stroke="#ff6b6b"
                dot={false}
                strokeWidth={1}
                strokeOpacity={0.3}
                name="X"
                isAnimationActive={false}
              />
              <Line
                type="stepAfter"
                dataKey="y"
                stroke="#4ecdc4"
                dot={false}
                strokeWidth={1}
                strokeOpacity={0.3}
                name="Y"
                isAnimationActive={false}
              />
              <Line
                type="stepAfter"
                dataKey="z"
                stroke="#95e1d3"
                dot={false}
                strokeWidth={1}
                strokeOpacity={0.3}
                name="Z"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
});
