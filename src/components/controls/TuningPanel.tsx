import { useState, useCallback, memo } from 'react';
import { Info } from 'lucide-react';
import { useBarStore } from '../../state/barStore';
import { useEKFStore } from '../../state/ekfStore';
import type { MountPreset } from '../../core/bar/mountPresets';
import { LiveSensorStreams } from '../charts/LiveSensorStreams';

const PARAM_INFO: Record<string, string> = {
  accelCutoffHz: 'Low-pass filter frequency for accelerometer data. Lower values = smoother but slower response. Higher values = more responsive but noisier.',
  a_thr: 'ZUPT acceleration threshold. Bar must have acceleration below this value to be considered stationary. Higher = less sensitive.',
  w_thr: 'ZUPT gyroscope threshold. Bar must have rotation rate below this value to be considered stationary. Higher = less sensitive.',
  minHoldMs: 'Minimum time the bar must remain stationary before ZUPT activates. Higher = requires longer stillness period.',
  Qv: 'Process noise for velocity. Controls how much the filter trusts velocity predictions. Higher = more responsive to motion changes.',
  Qba: 'Process noise for accelerometer bias. Controls how quickly bias estimates can change. Higher = adapts faster to bias changes.',
  Rv: 'Measurement noise for ZUPT velocity updates. Lower = trusts ZUPT more when stationary. Higher = less aggressive drift correction.',
  Ry: 'Measurement noise for constraint updates. Lower = enforces constraints more strictly. Higher = allows more deviation from constraints.',
  constraint: 'Motion constraint type. Vertical Plane: restricts to 2D motion. Vertical Line: restricts to 1D vertical motion. None: full 3D motion.',
  planeAxis: 'Which axis perpendicular to the vertical plane is restricted (only for Vertical Plane constraint).'
};

const InfoButton = memo(function InfoButton({ param }: { param: string }) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="relative inline-block ml-2">
      <button
        onMouseEnter={() => setShowInfo(true)}
        onMouseLeave={() => setShowInfo(false)}
        className="text-gray-500 hover:text-gym-accent transition-colors"
      >
        <Info size={14} />
      </button>
      {showInfo && (
        <div className="absolute z-50 w-64 p-3 bg-gym-bg border border-gym-border rounded-lg shadow-xl text-xs text-gray-300 left-0 top-6">
          {PARAM_INFO[param]}
        </div>
      )}
    </div>
  );
});

export function TuningPanel() {
  const { preset, calibrationless, setPreset, setCalibrationless } = useBarStore();
  const { ekfParams, zuptParams, constraint, setEkfParams, setZuptParams, setConstraint, zuptActive, loopHz, dtJitter, reset, isInitialized } = useEKFStore();
  const [autoTuneResult] = useState<string | null>(null);

  // Combine params for backward compatibility with UI
  const config = {
    ...ekfParams,
    ...zuptParams,
    accelCutoffHz: 3.5, // Fixed in mechanization
    constraint: constraint.type,
    planeAxis: constraint.axis || 'y'
  };

  const handleConfigChange = useCallback((newConfig: any) => {
    // Split config updates between EKF and ZUPT params
    const ekfUpdates: any = {};
    const zuptUpdates: any = {};

    if ('Qv' in newConfig) ekfUpdates.Qv = newConfig.Qv;
    if ('Qba' in newConfig) ekfUpdates.Qba = newConfig.Qba;
    if ('Rv' in newConfig) ekfUpdates.Rv = newConfig.Rv;
    if ('Ry' in newConfig) ekfUpdates.Ry = newConfig.Ry;

    if ('a_thr' in newConfig) zuptUpdates.a_thr = newConfig.a_thr;
    if ('w_thr' in newConfig) zuptUpdates.w_thr = newConfig.w_thr;
    if ('minHoldMs' in newConfig) zuptUpdates.minHoldMs = newConfig.minHoldMs;

    // Handle constraint changes
    if ('constraint' in newConfig || 'planeAxis' in newConfig) {
      const newConstraint = { ...constraint };
      if ('constraint' in newConfig) {
        newConstraint.type = newConfig.constraint;
      }
      if ('planeAxis' in newConfig) {
        newConstraint.axis = newConfig.planeAxis;
      }
      setConstraint(newConstraint);
    }

    if (Object.keys(ekfUpdates).length > 0) setEkfParams(ekfUpdates);
    if (Object.keys(zuptUpdates).length > 0) setZuptParams(zuptUpdates);

    reset();
  }, [setEkfParams, setZuptParams, setConstraint, constraint, reset]);

  return (
    <div className="space-y-4">
      <div className="bg-gym-card border border-gym-border rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Calibrationless Mode</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Enable Calibrationless</span>
            <button
              onClick={() => setCalibrationless(!calibrationless)}
              className={`px-4 py-2 rounded-lg font-bold transition-all ${
                calibrationless
                  ? 'bg-gym-accent text-gym-bg'
                  : 'bg-gym-bg text-gray-400 border border-gym-border'
              }`}
            >
              {calibrationless ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-400">Mount Preset</span>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as MountPreset)}
              className="bg-gym-bg text-white px-4 py-2 rounded-lg border border-gym-border"
            >
              <option value="X_along_bar_Z_up">X along bar, Z up</option>
              <option value="Y_along_bar_Z_up">Y along bar, Z up</option>
              <option value="Z_along_bar_X_forward">Z along bar, X forward</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-gym-card border border-gym-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Status</h2>
          <button
            onClick={reset}
            className="px-3 py-1 text-sm bg-gym-accent text-gym-bg rounded-lg font-bold hover:opacity-80 transition-opacity"
          >
            Reset Position
          </button>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Init Status:</span>
            <span className={`font-mono font-bold ${
              isInitialized ? 'text-gym-accent' : 'text-yellow-500'
            }`}>
              {isInitialized ? 'Initialized' : 'Waiting...'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">ZUPT:</span>
            <span className={`font-mono font-bold ${
              zuptActive ? 'text-gym-accent' : 'text-gray-500'
            }`}>
              {zuptActive ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Loop Hz:</span>
            <span className="text-white font-mono">{loopHz.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">dt Jitter:</span>
            <span className="text-white font-mono">{(dtJitter * 1000).toFixed(1)} ms</span>
          </div>
        </div>
      </div>

      <div className="bg-gym-card border border-gym-border rounded-2xl p-4">
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-white">ZUPT Parameters</h2>
            </div>

            {autoTuneResult && (
              <div className={`text-xs p-2 rounded mb-3 ${
                autoTuneResult.startsWith('✓') ? 'bg-gym-accent/20 text-gym-accent' : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {autoTuneResult}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-gray-400 text-xs flex items-center mb-1">
                  Accel Threshold (m/s²): <span className="font-mono ml-1">{config.a_thr.toFixed(2)}</span>
                  <InfoButton param="a_thr" />
                </label>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={config.a_thr}
                  onChange={(e) => handleConfigChange({ a_thr: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs flex items-center mb-1">
                  Gyro Threshold (rad/s): <span className="font-mono ml-1">{config.w_thr.toFixed(2)}</span>
                  <InfoButton param="w_thr" />
                </label>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={config.w_thr}
                  onChange={(e) => handleConfigChange({ w_thr: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs flex items-center mb-1">
                  Min Hold Time (ms): <span className="font-mono ml-1">{config.minHoldMs}</span>
                  <InfoButton param="minHoldMs" />
                </label>
                <input
                  type="range"
                  min="100"
                  max="2000"
                  step="100"
                  value={config.minHoldMs}
                  onChange={(e) => handleConfigChange({ minHoldMs: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div className="w-full">
            <LiveSensorStreams />
          </div>
        </div>
      </div>

      <div className="bg-gym-card border border-gym-border rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Kalman Filter Parameters</h2>
        <div className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm flex items-center mb-2">
              Accel Cutoff (Hz): {config.accelCutoffHz.toFixed(1)}
              <InfoButton param="accelCutoffHz" />
            </label>
            <input
              type="range"
              min="1"
              max="10"
              step="0.5"
              value={config.accelCutoffHz}
              onChange={(e) => handleConfigChange({ accelCutoffHz: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm flex items-center mb-2">
              Process Noise Velocity (Qv): {config.Qv.toExponential(1)}
              <InfoButton param="Qv" />
            </label>
            <input
              type="range"
              min="-6"
              max="-2"
              step="0.1"
              value={Math.log10(config.Qv)}
              onChange={(e) => handleConfigChange({ Qv: Math.pow(10, parseFloat(e.target.value)) })}
              className="w-full"
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm flex items-center mb-2">
              Process Noise Bias (Qba): {config.Qba.toExponential(1)}
              <InfoButton param="Qba" />
            </label>
            <input
              type="range"
              min="-8"
              max="-4"
              step="0.1"
              value={Math.log10(config.Qba)}
              onChange={(e) => handleConfigChange({ Qba: Math.pow(10, parseFloat(e.target.value)) })}
              className="w-full"
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm flex items-center mb-2">
              ZUPT Measurement Noise (Rv): {config.Rv.toExponential(1)}
              <InfoButton param="Rv" />
            </label>
            <input
              type="range"
              min="-6"
              max="-2"
              step="0.1"
              value={Math.log10(config.Rv)}
              onChange={(e) => handleConfigChange({ Rv: Math.pow(10, parseFloat(e.target.value)) })}
              className="w-full"
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm flex items-center mb-2">
              Constraint Noise (Ry): {config.Ry.toExponential(1)}
              <InfoButton param="Ry" />
            </label>
            <input
              type="range"
              min="-5"
              max="-1"
              step="0.1"
              value={Math.log10(config.Ry)}
              onChange={(e) => handleConfigChange({ Ry: Math.pow(10, parseFloat(e.target.value)) })}
              className="w-full"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-gray-400">Constraint</span>
              <InfoButton param="constraint" />
            </div>
            <select
              value={config.constraint}
              onChange={(e) => handleConfigChange({ constraint: e.target.value as 'none' | 'verticalPlane' | 'lineVertical' })}
              className="bg-gym-bg text-white px-4 py-2 rounded-lg border border-gym-border"
            >
              <option value="none">None</option>
              <option value="verticalPlane">Vertical Plane</option>
              <option value="lineVertical">Vertical Line</option>
            </select>
          </div>

          {config.constraint === 'verticalPlane' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-gray-400">Plane Axis</span>
                <InfoButton param="planeAxis" />
              </div>
              <select
                value={config.planeAxis}
                onChange={(e) => handleConfigChange({ planeAxis: e.target.value as 'x' | 'y' | 'z' })}
                className="bg-gym-bg text-white px-4 py-2 rounded-lg border border-gym-border"
              >
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="z">Z</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
