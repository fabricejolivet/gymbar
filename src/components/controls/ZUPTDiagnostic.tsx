import { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { useEKFStore } from '../../state/ekfStore';
import { dataRouter } from '../../state/dataRouter';

export function ZUPTDiagnostic() {
  const { zuptParams, zuptActive, state } = useEKFStore();
  const [accelMag, setAccelMag] = useState(0);
  const [gyroMag, setGyroMag] = useState(0);
  const [velocity, setVelocity] = useState(0);
  const [position, setPosition] = useState(0);
  const [isStationary, setIsStationary] = useState(false);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const handleSample = async () => {
      const now = Date.now();
      if (now - lastUpdateRef.current < 100) return;
      lastUpdateRef.current = now;

      const ekfState = useEKFStore.getState().state;
      const { useStreamStore } = await import('../../state/streamStore');
      const buffer = useStreamStore.getState().getBuffer();

      if (buffer.length > 0) {
        const latest = buffer[buffer.length - 1];
        const aMag = Math.sqrt(
          latest.a_enu[0] ** 2 + latest.a_enu[1] ** 2 + latest.a_enu[2] ** 2
        );
        const gMag = Math.sqrt(
          latest.gyro[0] ** 2 + latest.gyro[1] ** 2 + latest.gyro[2] ** 2
        );

        setAccelMag(aMag);
        setGyroMag(gMag);
        setIsStationary(aMag < zuptParams.a_thr && gMag < zuptParams.w_thr);
      }

      const vel = Math.sqrt(
        ekfState.v[0] ** 2 + ekfState.v[1] ** 2 + ekfState.v[2] ** 2
      );
      setVelocity(vel * 100);
      setPosition(ekfState.p[2] * 100);
    };

    const unsubscribe = dataRouter.subscribe(handleSample);
    return () => unsubscribe();
  }, [zuptParams]);

  return (
    <div className="bg-gym-card border border-gym-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle size={16} className="text-gym-accent" />
        <h3 className="text-sm font-bold text-white">ZUPT Diagnostic</h3>
      </div>

      <div className="space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gym-bg rounded-lg p-2">
            <div className="text-gray-500 mb-1">Accel Mag</div>
            <div className={`font-mono font-bold ${accelMag < zuptParams.a_thr ? 'text-gym-accent' : 'text-white'}`}>
              {accelMag.toFixed(4)} m/s²
            </div>
            <div className="text-gray-500 text-xs mt-0.5">
              Threshold: {zuptParams.a_thr.toFixed(3)}
            </div>
          </div>

          <div className="bg-gym-bg rounded-lg p-2">
            <div className="text-gray-500 mb-1">Gyro Mag</div>
            <div className={`font-mono font-bold ${gyroMag < zuptParams.w_thr ? 'text-gym-accent' : 'text-white'}`}>
              {gyroMag.toFixed(4)} rad/s
            </div>
            <div className="text-gray-500 text-xs mt-0.5">
              Threshold: {zuptParams.w_thr.toFixed(3)}
            </div>
          </div>
        </div>

        <div className="bg-gym-bg rounded-lg p-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-500">ZUPT Status:</span>
            <span className={`font-mono font-bold ${zuptActive ? 'text-gym-accent' : 'text-yellow-500'}`}>
              {zuptActive ? 'ACTIVE ✓' : isStationary ? 'WAITING...' : 'MOVING'}
            </span>
          </div>
        </div>

        <div className="bg-gym-bg rounded-lg p-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-gray-500">Velocity:</span>
            <span className="text-white font-mono font-bold">{velocity.toFixed(2)} cm/s</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Position Z:</span>
            <span className="text-white font-mono font-bold">{position.toFixed(2)} cm</span>
          </div>
        </div>

        {!zuptActive && isStationary && (
          <div className="bg-yellow-500 bg-opacity-10 border border-yellow-500 border-opacity-30 rounded-lg p-2">
            <p className="text-yellow-400 text-xs">
              Sensor is below thresholds but ZUPT not active. Check minHoldMs setting ({zuptParams.minHoldMs}ms).
            </p>
          </div>
        )}

        {zuptActive && velocity > 1 && (
          <div className="bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg p-2">
            <p className="text-red-400 text-xs">
              ZUPT active but velocity still {velocity.toFixed(1)} cm/s! Position drift likely. Decrease Rv parameter.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
