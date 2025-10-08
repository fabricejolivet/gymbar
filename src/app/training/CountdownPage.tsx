import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../../components/layout/BottomNav';
import { useEKFStore } from '../../state/ekfStore';

export function CountdownPage() {
  const navigate = useNavigate();
  const { initStatus } = useEKFStore();
  const [count, setCount] = useState(5);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = 5 - elapsed;

      if (remaining <= 0) {
        console.log('[Countdown] Complete, EKF status:', initStatus);
        navigate('/training/live');
        return;
      }

      setCount(remaining);
    }, 50);

    return () => clearInterval(interval);
  }, [navigate, startTime, initStatus]);

  const handleSkip = () => {
    console.log('[Countdown] Skipped, EKF status:', initStatus);
    navigate('/training/live');
  };

  const elapsed = Math.min(5, Math.floor((Date.now() - startTime) / 1000));
  const progress = (elapsed / 5) * 100;

  return (
    <div
      className="min-h-screen bg-gym-bg pb-24 flex items-center justify-center cursor-pointer"
      onClick={handleSkip}
    >
      <div className="flex flex-col items-center">
        <div className="relative w-64 h-64">
          <svg className="transform -rotate-90 w-full h-full">
            <circle
              cx="128"
              cy="128"
              r="110"
              stroke="white"
              strokeWidth="16"
              fill="none"
            />
            <circle
              cx="128"
              cy="128"
              r="110"
              stroke="#D7FF37"
              strokeWidth="16"
              fill="none"
              strokeDasharray={691.15}
              strokeDashoffset={691.15 - (691.15 * progress) / 100}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.05s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-6xl font-bold text-white mb-2">{count}</div>
            <div className="text-lg text-white">Be ready</div>
            {initStatus === 'waiting' && (
              <div className="text-xs text-yellow-500 mt-2">Calibrating...</div>
            )}
            {initStatus === 'initialized' && (
              <div className="text-xs text-gym-accent mt-2">Ready!</div>
            )}
          </div>
        </div>
        <div className="mt-8 text-gray-400 text-sm">Tap to skip</div>
      </div>

      <BottomNav />
    </div>
  );
}
