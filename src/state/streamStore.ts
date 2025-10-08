/**
 * Stream Store for Ring Buffers
 *
 * Maintains short-duration ring buffers for ZUPT detection windows.
 * At 20 Hz, we need 200-300 ms of history (4-6 samples).
 */

import { create } from 'zustand';
import type { ZuptSample } from '../core/math/zupt';

interface StreamState {
  zuptBuffer: ZuptSample[];
  maxBufferSize: number;

  addSample: (sample: ZuptSample) => void;
  getBuffer: () => ZuptSample[];
  clearBuffer: () => void;
  setMaxBufferSize: (size: number) => void;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  zuptBuffer: [],
  maxBufferSize: 6, // 300 ms at 20 Hz

  addSample: (sample: ZuptSample) => {
    set((state) => {
      const newBuffer = [...state.zuptBuffer, sample];

      // Keep only the most recent samples
      if (newBuffer.length > state.maxBufferSize) {
        newBuffer.shift();
      }

      return { zuptBuffer: newBuffer };
    });
  },

  getBuffer: () => get().zuptBuffer,

  clearBuffer: () => set({ zuptBuffer: [] }),

  setMaxBufferSize: (size: number) => set({ maxBufferSize: size })
}));
