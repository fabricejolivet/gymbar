import { useState, useEffect, useRef } from 'react';

export function useThrottledState<T>(value: T, refreshRateMs: number = 50): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdateRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    if (timeSinceLastUpdate >= refreshRateMs) {
      setThrottledValue(value);
      lastUpdateRef.current = now;
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setThrottledValue(value);
        lastUpdateRef.current = Date.now();
      }, refreshRateMs - timeSinceLastUpdate);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, refreshRateMs]);

  return throttledValue;
}
