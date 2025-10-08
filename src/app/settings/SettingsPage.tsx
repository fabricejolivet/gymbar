import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { BottomNav } from '../../components/layout/BottomNav';
import { useBTStore } from '../../state/btStore';
import { useEKFStore } from '../../state/ekfStore';
import { Commands, parseRateResponse, parseTempResponse, parseBatteryResponse } from '../../core/decode/wt9011';
import { dataRouter } from '../../state/dataRouter';
import { TuningPanel } from '../../components/controls/TuningPanel';
import { DebugPolarPlots } from '../../components/charts/DebugPolarPlots';

export function SettingsPage() {
  const navigate = useNavigate();
  const { client } = useBTStore();
  const [sampleRate, setSampleRate] = useState('20');
  const [maxAngle, setMaxAngle] = useState(() => {
    const stored = localStorage.getItem('maxAngle');
    return stored ? parseFloat(stored) : 25;
  });

  useEffect(() => {
    localStorage.setItem('maxAngle', maxAngle.toString());
  }, [maxAngle]);
  return (
    <div className="min-h-screen bg-gym-bg pb-24">
      <div className="max-w-md mx-auto px-6 pt-12">
        <h1 className="text-3xl font-bold text-white text-center mb-8">Settings</h1>

        <div className="space-y-4">
          <div className="bg-gym-card border border-gym-border rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">ZUPT Calibration</h2>
            <p className="text-gray-400 text-sm mb-4">
              Calibrate Zero Velocity Update thresholds to eliminate drift when the bar is stationary.
            </p>
            <button
              onClick={() => navigate('/calibrate')}
              disabled={!client?.isConnected()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gym-accent text-gym-bg rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Activity size={20} />
              <span>Calibrate ZUPT Thresholds</span>
            </button>
          </div>

          <div className="bg-gym-card border border-gym-border rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Device Settings</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Sample Rate</span>
                <select
                  value={sampleRate}
                  onChange={async (e) => {
                    const rate = e.target.value;
                    setSampleRate(rate);
                    if (client?.isConnected()) {
                      try {
                        if (rate === '10') {
                          await client.write(Commands.RATE_10HZ);
                        } else if (rate === '20') {
                          await client.write(Commands.RATE_20HZ);
                        } else if (rate === '50') {
                          await client.write(Commands.RATE_50HZ);
                        } else if (rate === '100') {
                          await client.write(Commands.RATE_100HZ);
                        } else if (rate === '200') {
                          await client.write(Commands.RATE_200HZ);
                        }
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await client.write(Commands.SAVE_SETTINGS);
                        console.log('Sample rate changed to', rate, 'Hz');
                      } catch (err) {
                        console.error('Failed to change sample rate:', err);
                      }
                    }
                  }}
                  className="bg-gym-bg text-white px-4 py-2 rounded-lg border border-gym-border"
                  disabled={!client?.isConnected()}
                >
                  <option value="10">10 Hz</option>
                  <option value="20">20 Hz</option>
                  <option value="50">50 Hz</option>
                  <option value="100">100 Hz</option>
                  <option value="200">200 Hz</option>
                </select>
              </div>
              {!client?.isConnected() && (
                <p className="text-xs text-yellow-500 mt-1">Connect device to change settings</p>
              )}
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Auto-calibrate</span>
                <input type="checkbox" className="w-6 h-6" defaultChecked />
              </div>
            </div>
          </div>

          <div className="bg-gym-card border border-gym-border rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Workout Preferences</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Max Tilt Angle (°)</span>
                <input
                  type="number"
                  value={maxAngle}
                  onChange={(e) => setMaxAngle(parseFloat(e.target.value) || 25)}
                  min="5"
                  max="90"
                  step="5"
                  className="bg-gym-bg text-white px-4 py-2 rounded-lg border border-gym-border w-24"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Min ROM (cm)</span>
                <input
                  type="number"
                  defaultValue={30}
                  className="bg-gym-bg text-white px-4 py-2 rounded-lg border border-gym-border w-24"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Rest Timer</span>
                <input type="checkbox" className="w-6 h-6" defaultChecked />
              </div>
            </div>
          </div>

          <TuningPanel />

          {client?.isConnected() && <DebugPolarPlots />}

          <SensorDataView client={client} />
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

function SensorDataView({ client }: { client: any }) {
  const { batteryPercent, batteryVoltage, temperature: globalTemp, sensorRate, setBattery, setTemperature, setSensorRate } = useBTStore();
  const [imuData, setImuData] = useState<any>(null);
  const [liveRate, setLiveRate] = useState<number | null>(null);
  const [sampleTimes, setSampleTimes] = useState<number[]>([]);

  useEffect(() => {
    console.log('[Settings] Subscribing to data router for display');

    const handleSample = (sample: {
      accel_g: [number, number, number];
      gyro_dps: [number, number, number];
      euler_deg: [number, number, number];
      timestamp_ms: number;
    }) => {
      setImuData(sample);

      const now = Date.now();
      setSampleTimes(prev => {
        const updated = [...prev, now].slice(-20);
        if (updated.length >= 2) {
          const timeSpan = (updated[updated.length - 1] - updated[0]) / 1000;
          const calculatedRate = Math.round((updated.length - 1) / timeSpan);
          setLiveRate(calculatedRate);
        }
        return updated;
      });
    };

    const unsubscribe = dataRouter.subscribe(handleSample);

    return () => {
      console.log('[Settings] Unsubscribing from data router');
      unsubscribe();
    };
  }, []);

  if (!client?.isConnected()) {
    return (
      <div className="bg-gym-card border border-gym-border rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Sensor Data</h2>
        <p className="text-sm text-gray-400 text-center py-8">
          Connect device to view sensor data
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gym-card border border-gym-border rounded-2xl p-6">
      <h2 className="text-lg font-bold text-white mb-4">Sensor Data</h2>

      <div className="space-y-4">
        <div className="bg-gym-bg border border-gym-border rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-3">Device Info</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Configured Rate:</span>
              <span className="text-white font-mono">{sensorRate !== null ? `${sensorRate} Hz` : '...'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Live Rate:</span>
              <span className="text-gym-accent font-mono font-bold">{liveRate !== null ? `${liveRate} Hz` : '...'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Temperature:</span>
              <span className="text-white font-mono">{globalTemp !== null ? `${globalTemp.toFixed(1)} °C` : '...'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Battery:</span>
              <span className="text-white font-mono">
                {batteryVoltage !== null ? (
                  <span>
                    {batteryVoltage.toFixed(2)} V
                    {batteryPercent !== null && (
                      <span className="ml-2 text-gym-accent">({batteryPercent}%)</span>
                    )}
                  </span>
                ) : '...'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gym-bg border border-gym-border rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-3">Accelerometer (g)</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-gray-500">X</div>
              <div className="text-white font-mono">{imuData?.accel_g[0].toFixed(3) ?? '...'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Y</div>
              <div className="text-white font-mono">{imuData?.accel_g[1].toFixed(3) ?? '...'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Z</div>
              <div className="text-white font-mono">{imuData?.accel_g[2].toFixed(3) ?? '...'}</div>
            </div>
          </div>
        </div>

        <div className="bg-gym-bg border border-gym-border rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-3">Gyroscope (dps)</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-gray-500">X</div>
              <div className="text-white font-mono">{imuData?.gyro_dps[0].toFixed(1) ?? '...'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Y</div>
              <div className="text-white font-mono">{imuData?.gyro_dps[1].toFixed(1) ?? '...'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Z</div>
              <div className="text-white font-mono">{imuData?.gyro_dps[2].toFixed(1) ?? '...'}</div>
            </div>
          </div>
        </div>

        <div className="bg-gym-bg border border-gym-border rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-3">Euler Angles (deg)</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-gray-500">Roll</div>
              <div className="text-white font-mono">{imuData?.euler_deg[0].toFixed(1) ?? '...'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Pitch</div>
              <div className="text-white font-mono">{imuData?.euler_deg[1].toFixed(1) ?? '...'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Yaw</div>
              <div className="text-white font-mono">{imuData?.euler_deg[2].toFixed(1) ?? '...'}</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
