import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

type RepPhase = 'idle' | 'descent' | 'ascent' | 'lockout';

interface RepDisplacementGraphProps {
  displacementData: Array<{ time: number; position: number; velocity: number; phase: RepPhase }>;
  minROM: number;
  minDescent: number;
  minAscent: number;
  mode: 'vertical' | 'horizontal';
}

export function RepDisplacementGraph({
  displacementData,
  minROM,
  minDescent,
  minAscent,
  mode
}: RepDisplacementGraphProps) {
  const chartData = useMemo(() => {
    const maxPoints = 200;
    const data = displacementData.slice(-maxPoints);

    if (data.length === 0) return [];

    const firstTime = data[0].time;
    return data.map(d => ({
      time: ((d.time - firstTime) / 1000).toFixed(2),
      position: d.position,
      velocity: d.velocity,
      phase: d.phase
    }));
  }, [displacementData]);

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [-80, 80];

    const positions = chartData.map(d => d.position);
    const min = Math.min(...positions);
    const max = Math.max(...positions);
    const range = max - min;
    const padding = Math.max(20, range * 0.3);

    return [
      Math.floor(min - padding),
      Math.ceil(max + padding)
    ];
  }, [chartData]);

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload.phase || payload.phase === 'idle') return null;

    const colors = {
      descent: '#f87171',
      ascent: '#60a5fa',
      lockout: '#10b981'
    };

    return (
      <circle
        cx={cx}
        cy={cy}
        r={2.5}
        fill={colors[payload.phase as keyof typeof colors]}
        opacity={0.8}
      />
    );
  };

  return (
    <div className="bg-gym-bg border border-gym-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-400">Displacement ({mode === 'vertical' ? 'Z' : 'Y'} axis)</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">ROM: {minROM}cm</span>
          <span className="text-gray-500">↓{minDescent}cm</span>
          <span className="text-gray-500">↑{minAscent}cm</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="time"
            stroke="#6B7280"
            style={{ fontSize: '10px' }}
            tick={{ fill: '#6B7280' }}
            label={{ value: 'Time (s)', position: 'insideBottom', offset: -5, style: { fontSize: '10px', fill: '#9CA3AF' } }}
          />
          <YAxis
            stroke="#6B7280"
            style={{ fontSize: '10px' }}
            tick={{ fill: '#6B7280' }}
            domain={yDomain}
            label={{ value: 'Position (cm)', angle: -90, position: 'insideLeft', style: { fontSize: '10px', fill: '#9CA3AF' } }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '6px',
              fontSize: '11px',
              padding: '6px 10px'
            }}
            labelStyle={{ color: '#9CA3AF', fontSize: '10px' }}
            formatter={(value: any, name: string) => {
              if (name === 'position') return [`${value.toFixed(1)} cm`, 'Position'];
              if (name === 'velocity') return [`${value.toFixed(1)} cm/s`, 'Velocity'];
              return [value, name];
            }}
          />

          <ReferenceLine y={0} stroke="#4B5563" strokeWidth={1.5} />

          <Line
            type="monotone"
            dataKey="position"
            stroke="#BFFF00"
            strokeWidth={2.5}
            dot={<CustomDot />}
            isAnimationActive={false}
          />

          <Line
            type="monotone"
            dataKey="velocity"
            stroke="#9333EA"
            strokeWidth={1.5}
            strokeOpacity={0.3}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-center gap-4 mt-2 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
          <span className="text-gray-400 font-medium">Descent</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-400"></div>
          <span className="text-gray-400 font-medium">Ascent</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
          <span className="text-gray-400 font-medium">Lockout</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-purple-600 opacity-30"></div>
          <span className="text-gray-500">Velocity</span>
        </div>
      </div>
    </div>
  );
}
