interface PolarPlotProps {
  title: string;
  data: Array<{ angle: number; value: number }>;
  size?: number;
}

export function PolarPlot({ title, data, size = 150 }: PolarPlotProps) {
  const centerX = size / 2;
  const centerY = size / 2;
  const maxRadius = size / 2 - 20;

  const points = data.map((point, i) => {
    const angle = (point.angle * Math.PI) / 180;
    const radius = (point.value / 100) * maxRadius;
    const x = centerX + radius * Math.cos(angle - Math.PI / 2);
    const y = centerY + radius * Math.sin(angle - Math.PI / 2);
    return { x, y };
  });

  const pathD = points.length > 0
    ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') + ' Z'
    : '';

  return (
    <div className="flex flex-col items-center">
      <h3 className="text-sm text-gray-400 mb-2">{title}</h3>
      <svg width={size} height={size} className="bg-gym-card rounded-lg border border-gym-border">
        <circle
          cx={centerX}
          cy={centerY}
          r={maxRadius * 0.33}
          fill="none"
          stroke="#2a2a2a"
          strokeWidth="1"
        />
        <circle
          cx={centerX}
          cy={centerY}
          r={maxRadius * 0.66}
          fill="none"
          stroke="#2a2a2a"
          strokeWidth="1"
        />
        <circle
          cx={centerX}
          cy={centerY}
          r={maxRadius}
          fill="none"
          stroke="#2a2a2a"
          strokeWidth="1"
        />
        <line x1={centerX} y1={10} x2={centerX} y2={size - 10} stroke="#2a2a2a" strokeWidth="1" />
        <line x1={10} y1={centerY} x2={size - 10} y2={centerY} stroke="#2a2a2a" strokeWidth="1" />

        {points.length > 0 && (
          <path d={pathD} fill="#D7FF37" fillOpacity="0.3" stroke="#D7FF37" strokeWidth="2" />
        )}
      </svg>
    </div>
  );
}
