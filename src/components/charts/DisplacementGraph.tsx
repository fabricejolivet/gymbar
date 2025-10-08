import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { RotateCcw } from 'lucide-react';
import { useEKFStore } from '../../state/ekfStore';

export function DisplacementGraph() {
  const { getRelativePosition } = useEKFStore();
  const [history, setHistory] = useState<Array<{ time: number; x: number; y: number; z: number }>>([]);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const pos = getRelativePosition();
      const time = (Date.now() - startTime) / 1000;

      setHistory(prev => {
        const updated = [...prev, {
          time,
          x: pos[0] * 100,
          y: pos[1] * 100,
          z: pos[2] * 100
        }];
        return updated.slice(-200);
      });
    }, 50);

    return () => clearInterval(interval);
  }, [getRelativePosition, startTime]);

  const handleReset = () => {
    setHistory([]);
    useEKFStore.getState().reset();
  };

  return (
    <div className="bg-gym-card border border-gym-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Displacement Debug</h2>
        <button
          onClick={handleReset}
          className="px-3 py-1.5 text-sm bg-gym-accent text-gym-bg rounded-lg font-bold hover:opacity-80 transition-opacity flex items-center gap-1.5"
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      <div className="space-y-2 text-sm mb-4">
        <div className="flex justify-between">
          <span className="text-gray-400">X (cm):</span>
          <span className="text-white font-mono">
            {history.length > 0 ? history[history.length - 1].x.toFixed(1) : '0.0'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Y (cm):</span>
          <span className="text-white font-mono">
            {history.length > 0 ? history[history.length - 1].y.toFixed(1) : '0.0'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Z (cm):</span>
          <span className="text-white font-mono">
            {history.length > 0 ? history[history.length - 1].z.toFixed(1) : '0.0'}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={history}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="time"
            stroke="#888"
            tick={{ fill: '#888', fontSize: 12 }}
            label={{ value: 'Time (s)', position: 'insideBottom', offset: -5, fill: '#888' }}
          />
          <YAxis
            stroke="#888"
            tick={{ fill: '#888', fontSize: 12 }}
            label={{ value: 'Position (cm)', angle: -90, position: 'insideLeft', fill: '#888' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              color: '#fff'
            }}
            formatter={(value: number) => value.toFixed(2)}
          />
          <Legend
            wrapperStyle={{ paddingTop: '10px' }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="x"
            stroke="#ff6b6b"
            dot={false}
            strokeWidth={2}
            name="X"
          />
          <Line
            type="monotone"
            dataKey="y"
            stroke="#4ecdc4"
            dot={false}
            strokeWidth={2}
            name="Y"
          />
          <Line
            type="monotone"
            dataKey="z"
            stroke="#95e1d3"
            dot={false}
            strokeWidth={2}
            name="Z"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
