import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../../components/layout/BottomNav';
import { useSessionStore, ExerciseConfig } from '../../state/sessionStore';
import { ExerciseType } from '../../core/models/types';
import { Dumbbell, Plus, Trash2 } from 'lucide-react';

export function TrainingPage() {
  const navigate = useNavigate();
  const { exercises, addExercise, removeExercise, updateExercise, startSession } = useSessionStore();

  const [exercise, setExercise] = useState<ExerciseType>('squat');
  const [weight, setWeight] = useState(20);
  const [targetReps, setTargetReps] = useState(10);

  const exerciseOptions: ExerciseType[] = ['squat', 'bench', 'deadlift', 'press', 'row'];

  const handleAddExercise = () => {
    const newExercise: ExerciseConfig = {
      id: Date.now().toString(),
      exercise,
      weight,
      targetReps,
    };
    addExercise(newExercise);
  };

  const handleStartTraining = () => {
    if (exercises.length === 0) {
      handleAddExercise();
    }
    startSession();
    navigate('/training/countdown');
  };

  return (
    <div className="min-h-screen bg-gym-bg pb-24">
      <div className="max-w-md mx-auto px-4 pt-8">
        <h1 className="text-2xl font-bold text-white text-center mb-6">
          Setup Training
        </h1>

        <div className="bg-gym-card border border-gym-border rounded-2xl p-4 mb-4">
          <div className="mb-4">
            <label className="text-sm text-gray-400 block mb-2">Exercise</label>
            <select
              value={exercise}
              onChange={(e) => setExercise(e.target.value as ExerciseType)}
              className="w-full bg-gym-bg text-white px-4 py-3 rounded-lg border border-gym-border font-semibold capitalize"
            >
              {exerciseOptions.map(ex => (
                <option key={ex} value={ex} className="capitalize">
                  {ex}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="text-sm text-gray-400 block mb-2">Weight (kg)</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setWeight(Math.max(0, weight - 5))}
                className="w-10 h-10 bg-gym-bg text-gym-accent text-xl font-bold rounded-lg border border-gym-border hover:bg-gym-accent hover:text-gym-bg transition-all flex items-center justify-center"
              >
                -
              </button>
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="flex-1 bg-gym-bg text-white text-center text-2xl font-bold py-2.5 rounded-lg border border-gym-border"
              />
              <button
                onClick={() => setWeight(weight + 5)}
                className="w-10 h-10 bg-gym-bg text-gym-accent text-xl font-bold rounded-lg border border-gym-border hover:bg-gym-accent hover:text-gym-bg transition-all flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-sm text-gray-400 block mb-2">Target Reps</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTargetReps(Math.max(1, targetReps - 1))}
                className="w-10 h-10 bg-gym-bg text-gym-accent text-xl font-bold rounded-lg border border-gym-border hover:bg-gym-accent hover:text-gym-bg transition-all flex items-center justify-center"
              >
                -
              </button>
              <input
                type="number"
                value={targetReps}
                onChange={(e) => setTargetReps(Number(e.target.value))}
                className="flex-1 bg-gym-bg text-white text-center text-2xl font-bold py-2.5 rounded-lg border border-gym-border"
              />
              <button
                onClick={() => setTargetReps(targetReps + 1)}
                className="w-10 h-10 bg-gym-bg text-gym-accent text-xl font-bold rounded-lg border border-gym-border hover:bg-gym-accent hover:text-gym-bg transition-all flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>

          <button
            onClick={handleAddExercise}
            className="w-full bg-gym-bg text-gym-accent border border-gym-accent font-bold py-3 rounded-lg hover:bg-gym-accent hover:text-gym-bg transition-all flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            Add Exercise
          </button>
        </div>

        {exercises.length > 0 && (
          <div className="mb-4">
            <h2 className="text-base font-bold text-white mb-3">Session Plan ({exercises.length})</h2>
            <div className="space-y-2">
              {exercises.map((ex, index) => (
                <div
                  key={ex.id}
                  className="bg-gym-card border border-gym-border rounded-xl p-4 flex items-center gap-4"
                >
                  <div className="w-8 h-8 bg-gym-accent rounded-full flex items-center justify-center text-gym-bg font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-bold capitalize">{ex.exercise}</div>
                    <div className="text-gray-400 text-sm">{ex.weight}kg × {ex.targetReps} reps</div>
                  </div>
                  <button
                    onClick={() => removeExercise(ex.id)}
                    className="text-red-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleStartTraining}
          className="w-full bg-gym-accent text-gym-bg font-bold text-xl py-6 rounded-2xl hover:bg-gym-accent-dark transition-all shadow-lg"
        >
          Start Training
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
