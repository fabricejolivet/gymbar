import { create } from 'zustand';
import { Rep, ExerciseType } from '../core/models/types';

interface TrainingState {
  isActive: boolean;
  exercise: ExerciseType;
  weight: number;
  targetTilt: number;
  targetReps: number;
  currentReps: number;
  reps: Rep[];
  workTime: number;
  restTime: number;
  isResting: boolean;
  sensorFlipped: boolean;

  startTraining: (exercise: ExerciseType, weight: number) => void;
  stopTraining: () => void;
  addRep: (rep: Rep) => void;
  setTargetTilt: (tilt: number) => void;
  setExercise: (exercise: ExerciseType) => void;
  setWeight: (weight: number) => void;
  toggleSensorFlip: () => void;
  reset: () => void;
  nextExercise: () => void;
}

export const useTrainingStore = create<TrainingState>((set) => ({
  isActive: false,
  exercise: 'squat',
  weight: 20,
  targetTilt: 0,
  targetReps: 10,
  currentReps: 0,
  reps: [],
  workTime: 0,
  restTime: 0,
  isResting: false,
  sensorFlipped: true,

  startTraining: (exercise, weight) => set({
    isActive: true,
    exercise,
    weight,
    currentReps: 0,
    reps: [],
    workTime: 0,
  }),

  stopTraining: () => set({ isActive: false }),

  addRep: (rep) => set((state) => ({
    reps: [...state.reps, rep],
    currentReps: state.currentReps + 1,
  })),

  setTargetTilt: (tilt) => set({ targetTilt: tilt }),

  setExercise: (exercise) => set({ exercise }),

  setWeight: (weight) => set({ weight }),

  toggleSensorFlip: () => set((state) => ({ sensorFlipped: !state.sensorFlipped })),

  nextExercise: () => set({ currentReps: 0, reps: [] }),

  reset: () => set({
    isActive: false,
    currentReps: 0,
    reps: [],
    workTime: 0,
    restTime: 0,
    isResting: false,
  }),
}));
