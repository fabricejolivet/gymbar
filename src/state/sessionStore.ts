import { create } from 'zustand';
import { ExerciseType } from '../core/models/types';

export type ExerciseConfig = {
  id: string;
  exercise: ExerciseType;
  weight: number;
  targetReps: number;
};

interface SessionState {
  exercises: ExerciseConfig[];
  currentExerciseIndex: number;
  sessionStartTime: number | null;

  addExercise: (exercise: ExerciseConfig) => void;
  removeExercise: (id: string) => void;
  updateExercise: (id: string, updates: Partial<ExerciseConfig>) => void;
  clearExercises: () => void;

  getCurrentExercise: () => ExerciseConfig | null;
  nextExercise: () => boolean;
  startSession: () => void;
  resetSession: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  exercises: [],
  currentExerciseIndex: 0,
  sessionStartTime: null,

  addExercise: (exercise) => set((state) => ({
    exercises: [...state.exercises, exercise],
  })),

  removeExercise: (id) => set((state) => ({
    exercises: state.exercises.filter(e => e.id !== id),
  })),

  updateExercise: (id, updates) => set((state) => ({
    exercises: state.exercises.map(e =>
      e.id === id ? { ...e, ...updates } : e
    ),
  })),

  clearExercises: () => set({ exercises: [], currentExerciseIndex: 0 }),

  getCurrentExercise: () => {
    const { exercises, currentExerciseIndex } = get();
    return exercises[currentExerciseIndex] || null;
  },

  nextExercise: () => {
    const { exercises, currentExerciseIndex } = get();
    if (currentExerciseIndex < exercises.length - 1) {
      set({ currentExerciseIndex: currentExerciseIndex + 1 });
      return true;
    }
    return false;
  },

  startSession: () => set({ sessionStartTime: Date.now(), currentExerciseIndex: 0 }),

  resetSession: () => set({
    exercises: [],
    currentExerciseIndex: 0,
    sessionStartTime: null,
  }),
}));
