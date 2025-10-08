import { BottomNav } from '../../components/layout/BottomNav';
import { User } from 'lucide-react';

export function ProfilePage() {
  return (
    <div className="min-h-screen bg-gym-bg pb-24">
      <div className="max-w-md mx-auto px-6 pt-12">
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-gym-card border-4 border-gym-accent rounded-full mx-auto mb-4 flex items-center justify-center">
            <User size={48} className="text-gym-accent" />
          </div>
          <h1 className="text-3xl font-bold text-white">Jems</h1>
          <p className="text-gray-400">Gym Enthusiast</p>
        </div>

        <div className="bg-gym-card border border-gym-border rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-white mb-4">Profile Info</h2>
          <div className="space-y-3">
            <div>
              <label className="text-gray-400 text-sm">Name</label>
              <input
                type="text"
                defaultValue="Jems"
                className="w-full bg-gym-bg text-white px-4 py-2 rounded-lg border border-gym-border mt-1"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm">Email</label>
              <input
                type="email"
                placeholder="Not set"
                className="w-full bg-gym-bg text-white px-4 py-2 rounded-lg border border-gym-border mt-1"
              />
            </div>
          </div>
        </div>

        <div className="bg-gym-card border border-gym-border rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">Your Stats</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gym-accent">156</div>
              <div className="text-gray-400 text-sm">Workouts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gym-accent">24</div>
              <div className="text-gray-400 text-sm">Days</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gym-accent">82%</div>
              <div className="text-gray-400 text-sm">Avg Form</div>
            </div>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
