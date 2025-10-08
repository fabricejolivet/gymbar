import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, CheckCircle, ArrowLeft } from 'lucide-react';
import { CalibrationSequence, type CalibrationPhase, type CalibrationResult } from '../../core/bar/calibrationSequence';
import { useBTStore } from '../../state/btStore';
import { useEKFStore } from '../../state/ekfStore';
import { parse0x61 } from '../../core/decode/wt9011';

const MIN_PHASE_DURATION = 2000;

export function CalibratePage() {
  const navigate = useNavigate();
  const { client } = useBTStore();
  const { setConfig, reset, state: ekfState } = useEKFStore();
  const calibrationRef = useRef(new CalibrationSequence());
  const [phase, setPhase] = useState<CalibrationPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [canAdvance, setCanAdvance] = useState(false);

  useEffect(() => {
    if (!client?.isConnected()) {
      return;
    }

    const interval = setInterval(() => {
      const currentPhase = calibrationRef.current.getPhase();
      const currentProgress = calibrationRef.current.getProgress();
      const currentInstruction = calibrationRef.current.getPhaseInstruction();
      const advanceAllowed = calibrationRef.current.canAdvancePhase();

      setPhase(currentPhase);
      setProgress(currentProgress);
      setInstruction(currentInstruction);
      setCanAdvance(advanceAllowed);

      if (calibrationRef.current.isComplete() && !result) {
        const analysisResult = calibrationRef.current.analyze();
        setResult(analysisResult);
        setIsCalibrating(false);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [client, result]);

  useEffect(() => {
    if (!client?.isConnected() || !isCalibrating) return;

    const unsubscribe = client.onData((data: Uint8Array) => {
      const sample = parse0x61(data);
      if (sample) {
        const gyro_rads: [number, number, number] = [
          sample.gyro_dps[0] * (Math.PI / 180),
          sample.gyro_dps[1] * (Math.PI / 180),
          sample.gyro_dps[2] * (Math.PI / 180)
        ];
        const accel_ms2: [number, number, number] = [
          sample.accel_g[0] * 9.80665,
          sample.accel_g[1] * 9.80665,
          sample.accel_g[2] * 9.80665
        ];

        calibrationRef.current.addSample({
          gyro_rads,
          accel_ms2,
          timestamp_ms: sample.timestamp_ms
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [client, isCalibrating]);

  const handleStartCalibration = () => {
    calibrationRef.current.start();
    setIsCalibrating(true);
    setResult(null);
  };

  const handleApplyCalibration = () => {
    if (result) {
      setConfig(result.config);
      reset();
      navigate('/settings');
    }
  };

  const handleCancel = () => {
    calibrationRef.current.reset();
    setIsCalibrating(false);
    setResult(null);
  };

  const handleNextPhase = () => {
    if (canAdvance) {
      calibrationRef.current.advancePhase();
      setCanAdvance(false);
    }
  };

  if (!client?.isConnected()) {
    return (
      <div className="min-h-screen bg-gym-bg flex items-center justify-center p-6">
        <div className="bg-gym-card border border-gym-border rounded-2xl p-8 max-w-md text-center">
          <Activity size={48} className="mx-auto mb-4 text-gray-500" />
          <h2 className="text-xl font-bold text-white mb-2">Device Not Connected</h2>
          <p className="text-gray-400 mb-6">Please connect to your sensor device before calibrating.</p>
          <button
            onClick={() => navigate('/home')}
            className="px-6 py-3 bg-gym-accent text-gym-bg rounded-xl font-bold hover:opacity-90 transition-opacity"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gym-bg pb-20">
      <div className="max-w-2xl mx-auto p-6">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={20} />
          <span>Back to Settings</span>
        </button>

        <div className="bg-gym-card border border-gym-border rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <Activity size={32} className="text-gym-accent" />
            <h1 className="text-2xl font-bold text-white">ZUPT Calibration</h1>
          </div>

          <p className="text-gray-400 mb-8">
            This calibration determines the optimal thresholds for Zero Velocity Update (ZUPT) detection.
            ZUPT eliminates velocity drift when the bar is stationary by detecting when gyro and accelerometer
            readings fall below noise thresholds.
          </p>

          {!isCalibrating && !result && (
            <div className="space-y-4">
              <div className="bg-gym-bg border border-gym-border rounded-xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Calibration Steps</h3>
                <ol className="space-y-3 text-gray-400">
                  <li className="flex items-start gap-3">
                    <span className="text-gym-accent font-bold">1.</span>
                    <span>Hold the bar perfectly still for 3 seconds</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-gym-accent font-bold">2.</span>
                    <span>Move the bar slowly up and down for 3 seconds</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-gym-accent font-bold">3.</span>
                    <span>Perform quick, explosive movements for 3 seconds</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-gym-accent font-bold">4.</span>
                    <span>Hold still again for verification (3 seconds)</span>
                  </li>
                </ol>
              </div>

              <button
                onClick={handleStartCalibration}
                className="w-full py-4 bg-gym-accent text-gym-bg rounded-xl font-bold text-lg hover:opacity-90 transition-opacity"
              >
                Start Calibration
              </button>
            </div>
          )}

          {isCalibrating && !result && (
            <div className="space-y-6">
              <div className="bg-gym-bg border border-gym-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white capitalize">
                    Phase: {phase.replace('_', ' ')}
                  </h3>
                  <span className="text-gym-accent font-bold">{Math.round(progress)}%</span>
                </div>

                <div className="w-full bg-gym-border rounded-full h-3 mb-4 overflow-hidden">
                  <div
                    className="h-full bg-gym-accent transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <p className="text-xl text-center text-white font-bold py-4">
                  {instruction}
                </p>

                <div className="mt-4 bg-gym-card border border-gym-border rounded-lg p-4">
                  <h4 className="text-sm font-bold text-gray-400 mb-2">Live Velocity (cm/s)</h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xs text-gray-500">X</div>
                      <div className="text-white font-mono text-lg">
                        {(ekfState.v[0] * 100).toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Y</div>
                      <div className="text-white font-mono text-lg">
                        {(ekfState.v[1] * 100).toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Z</div>
                      <div className="text-white font-mono text-lg">
                        {(ekfState.v[2] * 100).toFixed(1)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-center">
                    <span className="text-xs text-gray-500">Magnitude: </span>
                    <span className="text-gym-accent font-bold">
                      {(Math.sqrt(ekfState.v[0]**2 + ekfState.v[1]**2 + ekfState.v[2]**2) * 100).toFixed(1)} cm/s
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleCancel}
                  className="flex-1 py-3 bg-gym-bg border border-gym-border text-white rounded-xl font-bold hover:bg-gym-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleNextPhase}
                  disabled={!canAdvance}
                  className="flex-1 py-4 bg-gym-accent text-gym-bg rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {canAdvance ? 'Next Step' : `Wait ${Math.ceil((MIN_PHASE_DURATION - (progress * MIN_PHASE_DURATION / 100)) / 1000)}s...`}
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-6">
              <div className="bg-gym-bg border border-gym-accent rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle size={32} className="text-gym-accent" />
                  <h3 className="text-xl font-bold text-white">Calibration Complete!</h3>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Confidence:</span>
                    <span className="text-white font-bold">{Math.round(result.confidence * 100)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Gyro Noise:</span>
                    <span className="text-white font-mono">{result.metrics.gyroNoise.toFixed(4)} rad/s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Accel Noise:</span>
                    <span className="text-white font-mono">{result.metrics.accelNoise.toFixed(4)} m/s²</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Timing Stability:</span>
                    <span className="text-white font-bold">{Math.round(result.metrics.timingStability * 100)}%</span>
                  </div>
                </div>

                <p className="text-sm text-gray-400 border-t border-gym-border pt-4">
                  {result.reason}
                </p>
              </div>

              <div className="bg-gym-bg border border-gym-border rounded-xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">ZUPT Detection Parameters</h3>
                <p className="text-xs text-gray-400 mb-4">
                  These thresholds determine when the bar is considered stationary (zero velocity update).
                </p>
                <div className="space-y-3">
                  <div className="bg-gym-card rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-sm text-gray-400">Gyro Threshold</div>
                        <div className="text-xs text-gray-500">Max angular velocity for stationary</div>
                      </div>
                      <span className="text-white font-mono text-lg">{result.config.w_thr?.toFixed(3)} rad/s</span>
                    </div>
                  </div>
                  <div className="bg-gym-card rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-sm text-gray-400">Accel Threshold</div>
                        <div className="text-xs text-gray-500">Max acceleration deviation for stationary</div>
                      </div>
                      <span className="text-white font-mono text-lg">{result.config.a_thr?.toFixed(3)} m/s²</span>
                    </div>
                  </div>
                  <div className="bg-gym-card rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-sm text-gray-400">Min Hold Time</div>
                        <div className="text-xs text-gray-500">Duration before ZUPT activates</div>
                      </div>
                      <span className="text-white font-mono text-lg">{result.config.minHoldMs} ms</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-gym-accent/10 border border-gym-accent/30 rounded-lg">
                  <p className="text-xs text-gray-300">
                    <span className="font-bold text-gym-accent">Note:</span> EKF process noise, measurement noise, and filter parameters remain at their default values and are not modified by this calibration.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleApplyCalibration}
                  className="flex-1 py-4 bg-gym-accent text-gym-bg rounded-xl font-bold hover:opacity-90 transition-opacity"
                >
                  Apply & Save
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 py-4 bg-gym-bg border border-gym-border text-white rounded-xl font-bold hover:bg-gym-border transition-colors"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
