interface TiltSliderProps {
  value: number;
  onChange: (value: number) => void;
  currentTilt?: number;
  min?: number;
  max?: number;
}

export function TiltSlider({ value, onChange, currentTilt = 0, min = -10, max = 10 }: TiltSliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;
  const currentPercentage = ((currentTilt - min) / (max - min)) * 100;

  return (
    <div className="w-full px-4">
      <div className="flex justify-between text-sm text-gray-400 mb-2">
        <span>{min}°</span>
        <span className="text-white font-semibold">Target: {value}°</span>
        <span>{max}°</span>
      </div>
      <div className="relative h-12 bg-gym-card rounded-full border border-gym-border">
        <div
          className="absolute top-0 bottom-0 w-1 bg-gym-accent rounded-full transition-all duration-200"
          style={{ left: `${percentage}%`, transform: 'translateX(-50%)' }}
        />
        {currentTilt !== undefined && (
          <div
            className="absolute top-1 bottom-1 w-2 bg-white rounded-full opacity-60"
            style={{ left: `${currentPercentage}%`, transform: 'translateX(-50%)' }}
          />
        )}
        <input
          type="range"
          min={min}
          max={max}
          step={0.5}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}
