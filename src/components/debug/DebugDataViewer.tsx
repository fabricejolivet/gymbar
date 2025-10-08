import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { X, TrendingUp } from 'lucide-react';
import { useEKFStore } from '../../state/ekfStore';
import { useStreamStore } from '../../state/streamStore';
import { dataRouter } from '../../state/dataRouter';

type DataChannel = {
  id: string;
  label: string;
  category: 'raw' | 'fusion' | 'ekf' | 'zupt' | 'metrics';
  type: 'vector' | 'scalar' | 'boolean';
  unit: string;
  color?: string;
};

const AVAILABLE_CHANNELS: DataChannel[] = [
  // Raw IMU data
  { id: 'accel_x', label: 'Accel X', category: 'raw', type: 'scalar', unit: 'g', color: '#ef4444' },
  { id: 'accel_y', label: 'Accel Y', category: 'raw', type: 'scalar', unit: 'g', color: '#3b82f6' },
  { id: 'accel_z', label: 'Accel Z', category: 'raw', type: 'scalar', unit: 'g', color: '#10b981' },
  { id: 'accel_mag', label: 'Accel Magnitude', category: 'raw', type: 'scalar', unit: 'g', color: '#f59e0b' },
  { id: 'gyro_x', label: 'Gyro X', category: 'raw', type: 'scalar', unit: 'rad/s', color: '#ef4444' },
  { id: 'gyro_y', label: 'Gyro Y', category: 'raw', type: 'scalar', unit: 'rad/s', color: '#3b82f6' },
  { id: 'gyro_z', label: 'Gyro Z', category: 'raw', type: 'scalar', unit: 'rad/s', color: '#10b981' },
  { id: 'gyro_mag', label: 'Gyro Magnitude', category: 'raw', type: 'scalar', unit: 'rad/s', color: '#f59e0b' },

  // Fusion (ENU acceleration)
  { id: 'a_enu_x', label: 'ENU Accel X', category: 'fusion', type: 'scalar', unit: 'm/s²', color: '#ef4444' },
  { id: 'a_enu_y', label: 'ENU Accel Y', category: 'fusion', type: 'scalar', unit: 'm/s²', color: '#3b82f6' },
  { id: 'a_enu_z', label: 'ENU Accel Z', category: 'fusion', type: 'scalar', unit: 'm/s²', color: '#10b981' },
  { id: 'a_enu_mag', label: 'ENU Accel Magnitude', category: 'fusion', type: 'scalar', unit: 'm/s²', color: '#f59e0b' },

  // EKF state
  { id: 'pos_x', label: 'Position X (East)', category: 'ekf', type: 'scalar', unit: 'm', color: '#ef4444' },
  { id: 'pos_y', label: 'Position Y (North)', category: 'ekf', type: 'scalar', unit: 'm', color: '#3b82f6' },
  { id: 'pos_z', label: 'Position Z (Up)', category: 'ekf', type: 'scalar', unit: 'm', color: '#10b981' },
  { id: 'vel_x', label: 'Velocity X (East)', category: 'ekf', type: 'scalar', unit: 'm/s', color: '#ef4444' },
  { id: 'vel_y', label: 'Velocity Y (North)', category: 'ekf', type: 'scalar', unit: 'm/s', color: '#3b82f6' },
  { id: 'vel_z', label: 'Velocity Z (Up)', category: 'ekf', type: 'scalar', unit: 'm/s', color: '#10b981' },
  { id: 'vel_mag', label: 'Velocity Magnitude', category: 'ekf', type: 'scalar', unit: 'm/s', color: '#f59e0b' },
  { id: 'bias_x', label: 'Accel Bias X', category: 'ekf', type: 'scalar', unit: 'm/s²', color: '#ef4444' },
  { id: 'bias_y', label: 'Accel Bias Y', category: 'ekf', type: 'scalar', unit: 'm/s²', color: '#3b82f6' },
  { id: 'bias_z', label: 'Accel Bias Z', category: 'ekf', type: 'scalar', unit: 'm/s²', color: '#10b981' },

  // ZUPT/ZARU diagnostics
  { id: 'zupt_active', label: 'ZUPT Active', category: 'zupt', type: 'boolean', unit: '', color: '#10b981' },
  { id: 'mean_a_enu_z', label: 'Mean ENU Accel Z (1s)', category: 'zupt', type: 'scalar', unit: 'm/s²', color: '#f59e0b' },
  { id: 'residual_z', label: 'Residual Z (a_enu - bias)', category: 'zupt', type: 'scalar', unit: 'm/s²', color: '#ec4899' },

  // Metrics
  { id: 'loop_hz', label: 'Loop Rate', category: 'metrics', type: 'scalar', unit: 'Hz', color: '#8b5cf6' },
  { id: 'dt_jitter', label: 'dt Jitter', category: 'metrics', type: 'scalar', unit: 's', color: '#ec4899' },
];

interface DataPoint {
  time: number;
  [key: string]: number;
}

export function DebugDataViewer() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['vel_z', 'zupt_active']);
  const [dataBuffer, setDataBuffer] = useState<DataPoint[]>([]);
  const [category, setCategory] = useState<string>('all');
  const lastUpdateRef = useRef(0);
  const UPDATE_INTERVAL = 50; // 20 Hz update rate

  useEffect(() => {
    if (!isOpen) return;

    const handleSample = (sample: any) => {
      const now = Date.now();
      if (now - lastUpdateRef.current < UPDATE_INTERVAL) return;
      lastUpdateRef.current = now;

      const ekfStore = useEKFStore.getState();
      const streamStore = useStreamStore.getState();

      // Build data point with all available channels
      const dataPoint: DataPoint = {
        time: now,
      };

      // Raw IMU
      if (sample?.accel_g) {
        dataPoint.accel_x = sample.accel_g[0];
        dataPoint.accel_y = sample.accel_g[1];
        dataPoint.accel_z = sample.accel_g[2];
        dataPoint.accel_mag = Math.sqrt(
          sample.accel_g[0] ** 2 +
          sample.accel_g[1] ** 2 +
          sample.accel_g[2] ** 2
        );
      }

      if (sample?.gyro_dps) {
        const gyro_rads = [
          sample.gyro_dps[0] * Math.PI / 180,
          sample.gyro_dps[1] * Math.PI / 180,
          sample.gyro_dps[2] * Math.PI / 180,
        ];
        dataPoint.gyro_x = gyro_rads[0];
        dataPoint.gyro_y = gyro_rads[1];
        dataPoint.gyro_z = gyro_rads[2];
        dataPoint.gyro_mag = Math.sqrt(
          gyro_rads[0] ** 2 +
          gyro_rads[1] ** 2 +
          gyro_rads[2] ** 2
        );
      }

      // Get latest buffer sample for ENU accel
      const buffer = streamStore.getBuffer();
      if (buffer.length > 0) {
        const latest = buffer[buffer.length - 1];
        dataPoint.a_enu_x = latest.a_enu[0];
        dataPoint.a_enu_y = latest.a_enu[1];
        dataPoint.a_enu_z = latest.a_enu[2];
        dataPoint.a_enu_mag = Math.sqrt(
          latest.a_enu[0] ** 2 +
          latest.a_enu[1] ** 2 +
          latest.a_enu[2] ** 2
        );
      }

      // EKF state
      if (ekfStore.isInitialized) {
        dataPoint.pos_x = ekfStore.state.p[0];
        dataPoint.pos_y = ekfStore.state.p[1];
        dataPoint.pos_z = ekfStore.state.p[2];
        dataPoint.vel_x = ekfStore.state.v[0];
        dataPoint.vel_y = ekfStore.state.v[1];
        dataPoint.vel_z = ekfStore.state.v[2];
        dataPoint.vel_mag = Math.sqrt(
          ekfStore.state.v[0] ** 2 +
          ekfStore.state.v[1] ** 2 +
          ekfStore.state.v[2] ** 2
        );
        dataPoint.bias_x = ekfStore.state.x[6];
        dataPoint.bias_y = ekfStore.state.x[7];
        dataPoint.bias_z = ekfStore.state.x[8];
      }

      // ZUPT
      dataPoint.zupt_active = ekfStore.zuptActive ? 1 : 0;

      // ZARU diagnostics
      if (buffer.length > 0 && ekfStore.isInitialized) {
        const latest = buffer[buffer.length - 1];

        // Mean ENU accel Z over last 1 second (20 samples at 20 Hz)
        const window1s = buffer.slice(-20);
        const meanAenuZ = window1s.reduce((sum, s) => sum + s.a_enu[2], 0) / window1s.length;
        dataPoint.mean_a_enu_z = meanAenuZ;

        // Residual: a_enu_z - bias_z
        dataPoint.residual_z = latest.a_enu[2] - ekfStore.state.x[8];
      }

      // Metrics
      dataPoint.loop_hz = ekfStore.loopHz;
      dataPoint.dt_jitter = ekfStore.dtJitter;

      setDataBuffer(prev => {
        const newData = [...prev, dataPoint];
        return newData.slice(-500); // Keep last 500 points (25 seconds at 20 Hz)
      });
    };

    const unsubscribe = dataRouter.subscribe(handleSample);
    return () => unsubscribe();
  }, [isOpen]);

  const toggleChannel = (channelId: string) => {
    setSelectedChannels(prev => {
      if (prev.includes(channelId)) {
        return prev.filter(id => id !== channelId);
      } else {
        return [...prev, channelId];
      }
    });
  };

  const filteredChannels = AVAILABLE_CHANNELS.filter(ch =>
    category === 'all' || ch.category === category
  );

  const selectedChannelData = AVAILABLE_CHANNELS.filter(ch =>
    selectedChannels.includes(ch.id)
  );

  const chartData = dataBuffer.map(point => {
    const firstTime = dataBuffer[0]?.time || 0;
    return {
      time: ((point.time - firstTime) / 1000).toFixed(2),
      ...selectedChannels.reduce((acc, channelId) => {
        acc[channelId] = point[channelId] ?? null;
        return acc;
      }, {} as Record<string, number | null>)
    };
  });

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all"
      >
        <TrendingUp className="w-5 h-5" />
        <span className="font-medium">Debug Plot</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gym-bg border-2 border-gym-border rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gym-border bg-gradient-to-r from-purple-900/20 to-blue-900/20">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-gym-primary" />
            <h2 className="text-xl font-bold text-white">Debug Data Viewer</h2>
            <span className="text-sm text-gray-400">
              {dataBuffer.length > 0 ? `${dataBuffer.length} samples` : 'Waiting for data...'}
            </span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gym-card rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - Channel selector */}
          <div className="w-72 border-r border-gym-border bg-gym-card/30 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Category filter */}
              <div>
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gym-bg border border-gym-border rounded-lg text-white text-sm focus:outline-none focus:border-gym-primary"
                >
                  <option value="all">All Channels</option>
                  <option value="raw">Raw IMU</option>
                  <option value="fusion">Fusion (ENU)</option>
                  <option value="ekf">EKF State</option>
                  <option value="zupt">ZUPT</option>
                  <option value="metrics">Metrics</option>
                </select>
              </div>

              {/* Channel list */}
              <div>
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Select Channels ({selectedChannels.length})
                </label>
                <div className="mt-2 space-y-1">
                  {filteredChannels.map(channel => (
                    <button
                      key={channel.id}
                      onClick={() => toggleChannel(channel.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedChannels.includes(channel.id)
                          ? 'bg-gym-primary/20 border border-gym-primary text-white'
                          : 'bg-gym-bg border border-gym-border text-gray-400 hover:bg-gym-card'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: channel.color || '#6b7280' }}
                        />
                        <span>{channel.label}</span>
                      </div>
                      <span className="text-xs opacity-60">{channel.unit}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedChannels(AVAILABLE_CHANNELS.map(ch => ch.id))}
                  className="flex-1 px-3 py-2 bg-gym-card border border-gym-border rounded-lg text-xs text-gray-400 hover:bg-gym-bg transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedChannels([])}
                  className="flex-1 px-3 py-2 bg-gym-card border border-gym-border rounded-lg text-xs text-gray-400 hover:bg-gym-bg transition-colors"
                >
                  Clear
                </button>
              </div>

              <button
                onClick={() => setDataBuffer([])}
                className="w-full px-3 py-2 bg-red-600/20 border border-red-600/50 rounded-lg text-sm text-red-400 hover:bg-red-600/30 transition-colors"
              >
                Clear Buffer
              </button>
            </div>
          </div>

          {/* Main chart area */}
          <div className="flex-1 p-4 overflow-y-auto">
            {selectedChannels.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg">Select channels to plot</p>
                  <p className="text-sm mt-2 opacity-60">Choose from the list on the left</p>
                </div>
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-30 animate-pulse" />
                  <p className="text-lg">Waiting for data...</p>
                  <p className="text-sm mt-2 opacity-60">Connect sensor to start streaming</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Chart */}
                <div className="bg-gym-card border border-gym-border rounded-xl p-4">
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis
                        dataKey="time"
                        stroke="#6B7280"
                        label={{ value: 'Time (s)', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
                      />
                      <YAxis
                        stroke="#6B7280"
                        label={{ value: 'Value', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1F2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: '#9CA3AF' }}
                      />
                      <Legend
                        wrapperStyle={{ paddingTop: '20px' }}
                        iconType="line"
                      />
                      {selectedChannelData.map(channel => (
                        <Line
                          key={channel.id}
                          type="monotone"
                          dataKey={channel.id}
                          stroke={channel.color || '#6b7280'}
                          name={`${channel.label} (${channel.unit})`}
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  {selectedChannelData.map(channel => {
                    const values = dataBuffer.map(p => p[channel.id]).filter(v => v !== undefined && v !== null);
                    if (values.length === 0) return null;

                    const latest = values[values.length - 1];
                    const min = Math.min(...values);
                    const max = Math.max(...values);
                    const mean = values.reduce((a, b) => a + b, 0) / values.length;

                    return (
                      <div key={channel.id} className="bg-gym-card border border-gym-border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: channel.color || '#6b7280' }}
                          />
                          <h4 className="text-sm font-medium text-white">{channel.label}</h4>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Current:</span>
                            <span className="text-white font-mono">{latest.toFixed(4)} {channel.unit}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Min:</span>
                            <span className="text-white font-mono">{min.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Max:</span>
                            <span className="text-white font-mono">{max.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Mean:</span>
                            <span className="text-white font-mono">{mean.toFixed(4)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
