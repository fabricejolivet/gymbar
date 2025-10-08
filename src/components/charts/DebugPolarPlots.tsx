import { useEffect, useState } from 'react';
import { useEKFStore } from '../../state/ekfStore';

export function DebugPolarPlots() {
  const { getRelativePosition } = useEKFStore();
  const [leftRightUpDown, setLeftRightUpDown] = useState<Array<{ x: number; y: number }>>([]);
  const [frontBackUpDown, setFrontBackUpDown] = useState<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const pos = getRelativePosition();
      const x_cm = pos[0] * 100;
      const y_cm = pos[1] * 100;
      const z_cm = pos[2] * 100;

      setLeftRightUpDown(prev => {
        const updated = [...prev, { x: x_cm, y: z_cm }];
        return updated.slice(-100);
      });

      setFrontBackUpDown(prev => {
        const updated = [...prev, { x: y_cm, y: z_cm }];
        return updated.slice(-100);
      });
    }, 50);

    return () => clearInterval(interval);
  }, [getRelativePosition]);

  return (
    <div className="bg-gym-card border border-gym-border rounded-2xl p-6">
      <h2 className="text-lg font-bold text-white mb-4">Position Debug</h2>
      <div className="grid grid-cols-2 gap-4">
        <PolarDebugPlot
          title="Up/Down+"
          xLabel="L/R"
          yLabel="Up/Down"
          data={leftRightUpDown}
        />
        <PolarDebugPlot
          title="F/B+"
          xLabel="F/B"
          yLabel="Up/Down"
          data={frontBackUpDown}
        />
      </div>
    </div>
  );
}

function PolarDebugPlot({
  title,
  xLabel,
  yLabel,
  data,
}: {
  title: string;
  xLabel: string;
  yLabel: string;
  data: Array<{ x: number; y: number }>;
}) {
  const size = 160;
  const padding = 20;
  const centerX = size / 2;
  const centerY = size / 2;
  const maxRadius = size / 2 - padding;
  const maxCm = 30;

  const normalizedData = data.map(point => ({
    x: centerX + (point.x / maxCm) * maxRadius,
    y: centerY - (point.y / maxCm) * maxRadius,
  }));

  const currentPoint = normalizedData[normalizedData.length - 1];

  return (
    <div className="flex flex-col items-center">
      <div className="text-sm text-gray-400 mb-2">{title}</div>
      <svg
        width={size}
        height={size}
        className="bg-gym-bg rounded-lg border border-gym-border"
      >
        <circle cx={centerX} cy={centerY} r={maxRadius * 0.33} fill="none" stroke="#2a2a2a" strokeWidth="1" />
        <circle cx={centerX} cy={centerY} r={maxRadius * 0.66} fill="none" stroke="#2a2a2a" strokeWidth="1" />
        <circle cx={centerX} cy={centerY} r={maxRadius} fill="none" stroke="#2a2a2a" strokeWidth="1" />

        <line x1={centerX} y1={padding} x2={centerX} y2={size - padding} stroke="#3a3a3a" strokeWidth="1" />
        <line x1={padding} y1={centerY} x2={size - padding} y2={centerY} stroke="#3a3a3a" strokeWidth="1" />

        <text x={centerX} y={padding - 5} fontSize="10" fill="#666" textAnchor="middle">{yLabel}+</text>
        <text x={centerX} y={size - padding + 12} fontSize="10" fill="#666" textAnchor="middle">{yLabel}-</text>
        <text x={padding - 5} y={centerY + 3} fontSize="10" fill="#666" textAnchor="end">{xLabel}-</text>
        <text x={size - padding + 5} y={centerY + 3} fontSize="10" fill="#666" textAnchor="start">{xLabel}+</text>

        <text x={centerX + maxRadius * 0.33 + 3} y={centerY - 3} fontSize="8" fill="#555" textAnchor="start">10cm</text>
        <text x={centerX + maxRadius * 0.66 + 3} y={centerY - 3} fontSize="8" fill="#555" textAnchor="start">20cm</text>
        <text x={centerX + maxRadius + 3} y={centerY - 3} fontSize="8" fill="#555" textAnchor="start">30cm</text>

        {normalizedData.length > 1 && (
          <polyline
            points={normalizedData.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#D7FF37"
            strokeWidth="2"
            strokeOpacity="0.8"
          />
        )}

        {currentPoint && (
          <circle cx={currentPoint.x} cy={currentPoint.y} r="4" fill="#D7FF37" stroke="white" strokeWidth="2" />
        )}
      </svg>
    </div>
  );
}
