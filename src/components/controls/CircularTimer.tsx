interface CircularTimerProps {
  current: number;
  total: number;
  label: string;
  size?: number;
}

export function CircularTimer({ current, total, label, size = 200 }: CircularTimerProps) {
  const progress = total > 0 ? (current / total) * 100 : 0;
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#2a2a2a"
            strokeWidth="10"
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#D7FF37"
            strokeWidth="10"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-white">{current}</span>
          <span className="text-sm text-gray-400">{label}</span>
        </div>
      </div>
    </div>
  );
}
