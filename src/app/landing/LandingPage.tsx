import { useNavigate } from 'react-router-dom';
import { Dumbbell } from 'lucide-react';

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gym-bg flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-md">
        <Dumbbell size={80} className="text-gym-accent mx-auto mb-8" />
        <h1 className="text-5xl font-bold text-white mb-4">Gym Form Coach</h1>
        <p className="text-gray-400 text-lg mb-12">
          Perfect your form with real-time motion tracking and AI-powered coaching
        </p>

        <button
          onClick={() => navigate('/home')}
          className="w-full bg-gym-accent text-gym-bg font-bold text-xl py-6 px-8 rounded-2xl shadow-lg hover:bg-gym-accent-dark transition-all transform hover:scale-105"
        >
          Do it now
        </button>

        <div className="mt-8 flex gap-4">
          <button
            disabled
            className="flex-1 bg-gym-card text-gray-500 font-semibold py-4 px-6 rounded-2xl cursor-not-allowed"
          >
            Sign in
          </button>
          <button
            disabled
            className="flex-1 bg-gym-card text-gray-500 font-semibold py-4 px-6 rounded-2xl cursor-not-allowed"
          >
            Sign up
          </button>
        </div>
      </div>
    </div>
  );
}
