import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';

type RepPhase = 'idle' | 'descent' | 'ascent' | 'lockout';

interface VerticalSpeedGraphProps {
  velocityData: Array<{ time: number; vz: number; vy: number; phase?: RepPhase }>;
  velocityThreshold: number;
  lockoutVelocity: number;
  mode: 'vertical' | 'horizontal';
}

export function VerticalSpeedGraph({ velocityData, velocityThreshold, lockoutVelocity, mode }: VerticalSpeedGraphProps) {
  const chartData = useMemo(() => {
    const maxPoints = 150;
    const data = velocityData.slice(-maxPoints);

    if (data.length === 0) return [];

    const firstTime = data[0].time;
    return data.map(d => ({
      time: ((d.time - firstTime) / 1000).toFixed(1),
      velocity: mode === 'vertical' ? d.vz : d.vy,
      phase: d.phase || 'idle'
    }));
  }, [velocityData, mode]);

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
        r={2}
        fill={colors[payload.phase as keyof typeof colors]}
        opacity={0.6}
      />
    );
  };

  return (
    <div className="bg-gym-bg border border-gym-border rounded-lg p-2">
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="time"
            stroke="#6B7280"
            style={{ fontSize: '9px' }}
            tick={{ fill: '#6B7280' }}
          />
          <YAxis
            stroke="#6B7280"
            style={{ fontSize: '9px' }}
            tick={{ fill: '#6B7280' }}
            domain={[-60, 60]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '6px',
              fontSize: '10px',
              padding: '4px 8px'
            }}
            labelStyle={{ color: '#9CA3AF', fontSize: '9px' }}
          />

          <ReferenceArea y1={-lockoutVelocity} y2={lockoutVelocity} fill="#10b981" fillOpacity={0.1} />

          <ReferenceLine y={velocityThreshold} stroke="#BFFF00" strokeDasharray="3 3" strokeWidth={1.5} />
          <ReferenceLine y={-velocityThreshold} stroke="#BFFF00" strokeDasharray="3 3" strokeWidth={1.5} />

          <ReferenceLine y={lockoutVelocity} stroke="#10b981" strokeDasharray="2 2" strokeWidth={1} />
          <ReferenceLine y={-lockoutVelocity} stroke="#10b981" strokeDasharray="2 2" strokeWidth={1} />

          <ReferenceLine y={0} stroke="#4B5563" strokeWidth={1} />

          <Line
            type="monotone"
            dataKey="velocity"
            stroke="#BFFF00"
            strokeWidth={2}
            dot={<CustomDot />}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-3 mt-1 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-400"></div>
          <span className="text-gray-500">Down</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-400"></div>
          <span className="text-gray-500">Up</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-400"></div>
          <span className="text-gray-500">Lock</span>
        </div>
      </div>
    </div>
  );
}
