import { BottomNav } from '../../components/layout/BottomNav';

export function StatsPage() {
  return (
    <div className="min-h-screen bg-gym-bg pb-24">
      <div className="max-w-md mx-auto px-6 pt-12">
        <h1 className="text-3xl font-bold text-white text-center mb-8">Statistics</h1>

        <div className="bg-gym-card border border-gym-border rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-gym-accent mb-4">Monthly Overview</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gym-bg rounded-xl p-4">
              <div className="text-gray-400 text-sm mb-1">Total Sessions</div>
              <div className="text-3xl font-bold text-white">24</div>
            </div>

            <div className="bg-gym-bg rounded-xl p-4">
              <div className="text-gray-400 text-sm mb-1">Total Reps</div>
              <div className="text-3xl font-bold text-white">1,280</div>
            </div>

            <div className="bg-gym-bg rounded-xl p-4">
              <div className="text-gray-400 text-sm mb-1">Avg Balance</div>
              <div className="text-3xl font-bold text-white">82%</div>
            </div>

            <div className="bg-gym-bg rounded-xl p-4">
              <div className="text-gray-400 text-sm mb-1">Calories</div>
              <div className="text-3xl font-bold text-white">3,240</div>
            </div>
          </div>
        </div>

        <div className="bg-gym-card border border-gym-border rounded-2xl p-6">
          <h2 className="text-xl font-bold text-gym-accent mb-4">Personal Records</h2>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-white font-semibold">Squat</div>
                <div className="text-gray-400 text-sm">Best form</div>
              </div>
              <div className="text-2xl font-bold text-gym-accent">95%</div>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <div className="text-white font-semibold">Bench Press</div>
                <div className="text-gray-400 text-sm">Max weight</div>
              </div>
              <div className="text-2xl font-bold text-gym-accent">80kg</div>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <div className="text-white font-semibold">Deadlift</div>
                <div className="text-gray-400 text-sm">Best speed</div>
              </div>
              <div className="text-2xl font-bold text-gym-accent">52cm/s</div>
            </div>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
