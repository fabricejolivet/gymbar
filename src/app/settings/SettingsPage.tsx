import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ChevronDown, ChevronRight, Info, RotateCcw } from 'lucide-react';
import { BottomNav } from '../../components/layout/BottomNav';
import { useBTStore } from '../../state/btStore';
import { useEKFStore } from '../../state/ekfStore';
import { Commands } from '../../core/decode/wt9011';
import { dataRouter } from '../../state/dataRouter';
import { DebugPolarPlots } from '../../components/charts/DebugPolarPlots';
import { RepCounterTuning } from '../../components/controls/RepCounterTuning';
import { LiveSensorStreams } from '../../components/charts/LiveSensorStreams';
import { ZUPTDiagnostic } from '../../components/controls/ZUPTDiagnostic';
import { DebugDataViewer } from '../../components/debug/DebugDataViewer';
import { loadUserPreferences, updateWorkoutPreferences, updateDeviceSettings, updateRepCounterConfig, updateConstraintSettings, updateAccelCutoff } from '../../core/services/preferencesService';
import { DEFAULT_SIMPLE_REP_CONFIG, type SimpleRepConfig } from '../../core/reps/simpleVerticalDetector';
import type { EkfParams } from '../../core/math/eskf';
import type { ZuptParams } from '../../core/math/zupt';
import type { ConstraintConfig } from '../../core/math/constraints';

export function SettingsPage() {
  const navigate = useNavigate();
  const { client } = useBTStore();
  const { ekfParams, zuptParams, setEkfParams, setZuptParams, reset, zuptActive, loopHz, isInitialized } = useEKFStore();

  const [sampleRate, setSampleRate] = useState('20');
  const [restTimer, setRestTimer] = useState(true);
  const [autoCalibrate, setAutoCalibrate] = useState(true);
  const [repConfig, setRepConfig] = useState<SimpleRepConfig>(DEFAULT_SIMPLE_REP_CONFIG);
  const [constraintSettings, setConstraintSettings] = useState<ConstraintConfig>({ type: 'verticalPlane', axis: 'y' });
  const [accelCutoff, setAccelCutoff] = useState(3.5);
  const [mounted, setMounted] = useState(false);

  const [expandedSections, setExpandedSections] = useState({
    ekf: false,
    zupt: false,
    device: false,
    advanced: false
  });

  useEffect(() => {
    loadUserPreferences().then(prefs => {
      setRestTimer(prefs.workout_preferences.restTimer);
      setSampleRate(prefs.device_settings.sampleRate);
      setAutoCalibrate(prefs.device_settings.autoCalibrate);
      if (prefs.rep_counter_config) {
        // Convert old config to new SimpleRepConfig if needed
        const simpleConfig: SimpleRepConfig = {
          minROM_cm: prefs.rep_counter_config.minROM_cm || 15,
          descentVelocity_cms: prefs.rep_counter_config.descentVelocity_cms ?? -3,
          ascentVelocity_cms: prefs.rep_counter_config.ascentVelocity_cms ?? 3,
          lockoutVelocity_cms: prefs.rep_counter_config.lockoutVelocity_cms ?? 2,
          lockoutDuration_ms: prefs.rep_counter_config.lockoutDuration_ms || 300,
        };
        setRepConfig(simpleConfig);
      }
      setConstraintSettings(prefs.constraint_settings);
      setAccelCutoff(prefs.accel_cutoff);
      setMounted(true);
    });
  }, []);

  const handleRepConfigChange = (newConfig: Partial<SimpleRepConfig>) => {
    const updated = { ...repConfig, ...newConfig };
    setRepConfig(updated);
    if (mounted) {
      updateRepCounterConfig(updated as any).catch(err => console.error('Failed to save rep config:', err));
    }
  };

  useEffect(() => {
    if (mounted) updateWorkoutPreferences({ restTimer });
  }, [restTimer, mounted]);

  useEffect(() => {
    if (mounted) updateDeviceSettings({ sampleRate, autoCalibrate });
  }, [sampleRate, autoCalibrate, mounted]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleEkfChange = (param: keyof EkfParams, value: number) => {
    setEkfParams({ [param]: value });
  };

  const handleZuptChange = (param: keyof ZuptParams, value: number) => {
    setZuptParams({ [param]: value });
  };

  const handleConstraintChange = (newSettings: ConstraintConfig) => {
    setConstraintSettings(newSettings);
    if (mounted) {
      updateConstraintSettings(newSettings).catch(err => console.error('Failed to save constraint settings:', err));
    }
  };

  const handleAccelCutoffChange = (value: number) => {
    setAccelCutoff(value);
    if (mounted) {
      updateAccelCutoff(value).catch(err => console.error('Failed to save accel cutoff:', err));
    }
  };

  const formatScientific = (value: number): string => {
    if (value >= 0.001) return value.toFixed(4);
    return value.toExponential(1);
  };

  return (
    <div className="min-h-screen bg-gym-bg pb-24">
      <div className="max-w-md mx-auto px-6 pt-12">
        <h1 className="text-3xl font-bold text-white text-center mb-8">Settings</h1>

        <div className="space-y-4">
          {/* Status Card */}
          <div className="bg-gym-card border border-gym-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-white">System Status</h2>
              <button
                onClick={reset}
                className="px-3 py-1 text-sm bg-gym-accent text-gym-bg rounded-lg font-bold hover:opacity-80 transition-opacity flex items-center gap-1"
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-gym-bg rounded-lg p-2 text-center">
                <div className="text-xs text-gray-500 mb-1">EKF</div>
                <div className={`font-mono font-bold ${isInitialized ? 'text-gym-accent' : 'text-yellow-500'}`}>
                  {isInitialized ? 'Ready' : 'Wait'}
                </div>
              </div>
              <div className="bg-gym-bg rounded-lg p-2 text-center">
                <div className="text-xs text-gray-500 mb-1">ZUPT</div>
                <div className={`font-mono font-bold ${zuptActive ? 'text-gym-accent' : 'text-gray-500'}`}>
                  {zuptActive ? 'ON' : 'OFF'}
                </div>
              </div>
              <div className="bg-gym-bg rounded-lg p-2 text-center">
                <div className="text-xs text-gray-500 mb-1">Rate</div>
                <div className="text-white font-mono font-bold">{sampleRate} Hz</div>
              </div>
            </div>
          </div>

          {/* Rep Counter Tuning with Graph */}
          <RepCounterTuning config={repConfig} onChange={handleRepConfigChange} />

          {/* EKF Parameters */}
          <div className="bg-gym-card border border-gym-border rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('ekf')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gym-bg transition-colors"
            >
              <h2 className="text-base font-bold text-white">EKF Noise Tuning</h2>
              {expandedSections.ekf ? (
                <ChevronDown size={18} className="text-gray-400" />
              ) : (
                <ChevronRight size={18} className="text-gray-400" />
              )}
            </button>

            {expandedSections.ekf && (
              <div className="px-4 pb-4 space-y-3 border-t border-gym-border">
                <div className="bg-gym-bg rounded-lg p-3 mt-3">
                  <div className="flex items-start gap-2 mb-2">
                    <Info size={14} className="text-gym-accent mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-400">
                      Controls how the filter balances measurements vs predictions. If position drifts, increase Qv. If position lags, decrease Qv.
                    </p>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gym-border flex justify-between text-xs">
                    <span className="text-gray-500">Live processing rate:</span>
                    <span className="text-white font-mono">{loopHz.toFixed(1)} Hz</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-400">Qv (Velocity Process)</label>
                    <span className="text-white font-mono text-xs">{formatScientific(ekfParams.Qv)}</span>
                  </div>
                  <input
                    type="range"
                    min="-7"
                    max="-2"
                    step="0.1"
                    value={Math.log10(ekfParams.Qv)}
                    onChange={(e) => handleEkfChange('Qv', Math.pow(10, parseFloat(e.target.value)))}
                    className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
                  />
                  <p className="text-xs text-gray-500 mt-1">↑ = More responsive, less smooth</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-400">Rv (ZUPT Measurement)</label>
                    <span className="text-white font-mono text-xs">{formatScientific(ekfParams.Rv)}</span>
                  </div>
                  <input
                    type="range"
                    min="-6"
                    max="-2"
                    step="0.1"
                    value={Math.log10(ekfParams.Rv)}
                    onChange={(e) => handleEkfChange('Rv', Math.pow(10, parseFloat(e.target.value)))}
                    className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
                  />
                  <p className="text-xs text-gray-500 mt-1">↓ = Stronger velocity reset at lockout</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-400">Ry (Constraint Strength)</label>
                    <span className="text-white font-mono text-xs">{formatScientific(ekfParams.Ry)}</span>
                  </div>
                  <input
                    type="range"
                    min="-5"
                    max="-1"
                    step="0.1"
                    value={Math.log10(ekfParams.Ry)}
                    onChange={(e) => handleEkfChange('Ry', Math.pow(10, parseFloat(e.target.value)))}
                    className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
                  />
                  <p className="text-xs text-gray-500 mt-1">↓ = Lock tighter to vertical plane</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-400">Qba (Bias Drift)</label>
                    <span className="text-white font-mono text-xs">{formatScientific(ekfParams.Qba)}</span>
                  </div>
                  <input
                    type="range"
                    min="-9"
                    max="-4"
                    step="0.1"
                    value={Math.log10(ekfParams.Qba)}
                    onChange={(e) => handleEkfChange('Qba', Math.pow(10, parseFloat(e.target.value)))}
                    className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Sensor bias adaptation rate (rarely needs tuning)</p>
                </div>
              </div>
            )}
          </div>

          {/* ZUPT Parameters with Graph */}
          <div className="bg-gym-card border border-gym-border rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('zupt')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gym-bg transition-colors"
            >
              <h2 className="text-base font-bold text-white">ZUPT Detection</h2>
              {expandedSections.zupt ? (
                <ChevronDown size={18} className="text-gray-400" />
              ) : (
                <ChevronRight size={18} className="text-gray-400" />
              )}
            </button>

            {expandedSections.zupt && (
              <div className="px-4 pb-4 space-y-3 border-t border-gym-border">
                <div className="bg-gym-bg rounded-lg p-3 mt-3">
                  <div className="flex items-start gap-2 mb-2">
                    <Info size={14} className="text-gym-accent mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-400">
                      Detects when bar is still to reset velocity drift. Watch live sensors below to see when thresholds are met.
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-400">Accel Threshold</label>
                    <span className="text-white font-mono text-xs">{zuptParams.a_thr.toFixed(3)} m/s²</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="1.0"
                    step="0.01"
                    value={zuptParams.a_thr}
                    onChange={(e) => handleZuptChange('a_thr', parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Max acceleration when still</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-400">Gyro Threshold</label>
                    <span className="text-white font-mono text-xs">{zuptParams.w_thr.toFixed(3)} rad/s</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="1.5"
                    step="0.01"
                    value={zuptParams.w_thr}
                    onChange={(e) => handleZuptChange('w_thr', parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Max rotation when still</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-400">Min Hold Time</label>
                    <span className="text-white font-mono text-xs">{zuptParams.minHoldMs} ms</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    step="50"
                    value={zuptParams.minHoldMs}
                    onChange={(e) => handleZuptChange('minHoldMs', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Duration to confirm stillness</p>
                </div>

                {/* Live Sensor Streams */}
                <div className="pt-2">
                  <LiveSensorStreams />
                </div>

                {/* ZUPT Diagnostic */}
                <div className="pt-2">
                  <ZUPTDiagnostic />
                </div>
              </div>
            )}
          </div>

          {/* Device Settings */}
          <div className="bg-gym-card border border-gym-border rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('device')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gym-bg transition-colors"
            >
              <h2 className="text-base font-bold text-white">Device & Calibration</h2>
              {expandedSections.device ? (
                <ChevronDown size={18} className="text-gray-400" />
              ) : (
                <ChevronRight size={18} className="text-gray-400" />
              )}
            </button>

            {expandedSections.device && (
              <div className="px-4 pb-4 space-y-3 border-t border-gym-border">
                <div className="flex justify-between items-center pt-3">
                  <span className="text-sm text-gray-400">Sample Rate</span>
                  <select
                    value={sampleRate}
                    onChange={async (e) => {
                      const rate = e.target.value;
                      setSampleRate(rate);
                      if (client?.isConnected()) {
                        try {
                          const commands: Record<string, Uint8Array> = {
                            '10': Commands.RATE_10HZ,
                            '20': Commands.RATE_20HZ,
                            '50': Commands.RATE_50HZ,
                            '100': Commands.RATE_100HZ,
                            '200': Commands.RATE_200HZ
                          };
                          await client.write(commands[rate]);
                          await new Promise(resolve => setTimeout(resolve, 500));
                          await client.write(Commands.SAVE_SETTINGS);
                        } catch (err) {
                          console.error('Failed to change sample rate:', err);
                        }
                      }
                    }}
                    className="bg-gym-bg text-white px-3 py-1.5 rounded-lg border border-gym-border text-sm"
                    disabled={!client?.isConnected()}
                  >
                    <option value="10">10 Hz</option>
                    <option value="20">20 Hz</option>
                    <option value="50">50 Hz</option>
                    <option value="100">100 Hz</option>
                    <option value="200">200 Hz</option>
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Auto-calibrate</span>
                  <input
                    type="checkbox"
                    className="w-5 h-5"
                    checked={autoCalibrate}
                    onChange={(e) => setAutoCalibrate(e.target.checked)}
                  />
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Rest Timer</span>
                  <input
                    type="checkbox"
                    className="w-5 h-5"
                    checked={restTimer}
                    onChange={(e) => setRestTimer(e.target.checked)}
                  />
                </div>

                {!client?.isConnected() && (
                  <p className="text-xs text-yellow-500 text-center pt-2">Connect device to change settings</p>
                )}
              </div>
            )}
          </div>

          {/* Advanced Tuning */}
          <div className="bg-gym-card border border-gym-border rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('advanced')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gym-bg transition-colors"
            >
              <h2 className="text-base font-bold text-white">Advanced Tuning</h2>
              {expandedSections.advanced ? (
                <ChevronDown size={18} className="text-gray-400" />
              ) : (
                <ChevronRight size={18} className="text-gray-400" />
              )}
            </button>

            {expandedSections.advanced && (
              <div className="px-4 pb-4 space-y-3 border-t border-gym-border">
                <div className="bg-gym-bg rounded-lg p-3 mt-3">
                  <div className="flex items-start gap-2 mb-2">
                    <Info size={14} className="text-gym-accent mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-400">
                      Motion constraints and signal processing tuning for specific movement patterns.
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-400">Constraint Type</label>
                  </div>
                  <select
                    value={constraintSettings.type}
                    onChange={(e) => handleConstraintChange({ ...constraintSettings, type: e.target.value as ConstraintConfig['type'] })}
                    className="w-full bg-gym-bg text-white px-3 py-2 rounded-lg border border-gym-border text-sm"
                  >
                    <option value="none">None - No constraints</option>
                    <option value="verticalPlane">Vertical Plane - Squat/Press pattern</option>
                    <option value="lineVertical">Vertical Line - Strict vertical only</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Reduce lateral drift for known movement patterns</p>
                </div>

                {constraintSettings.type === 'verticalPlane' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-gray-400">Constrain Axis</label>
                    </div>
                    <select
                      value={constraintSettings.axis || 'y'}
                      onChange={(e) => handleConstraintChange({ ...constraintSettings, axis: e.target.value as 'x' | 'y' })}
                      className="w-full bg-gym-bg text-white px-3 py-2 rounded-lg border border-gym-border text-sm"
                    >
                      <option value="x">X-axis (East-West)</option>
                      <option value="y">Y-axis (North-South)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Which horizontal axis to constrain</p>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-400">Accel Filter Cutoff</label>
                    <span className="text-white font-mono text-xs">{accelCutoff.toFixed(1)} Hz</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={accelCutoff}
                    onChange={(e) => handleAccelCutoffChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
                  />
                  <p className="text-xs text-gray-500 mt-1">↑ = Less smoothing, more responsive</p>
                </div>
              </div>
            )}
          </div>

          {/* Debug Polar Plots */}
          {client?.isConnected() && <DebugPolarPlots />}
        </div>
      </div>

      <BottomNav />

      {/* Debug Data Viewer - Floating button */}
      <DebugDataViewer />
    </div>
  );
}
