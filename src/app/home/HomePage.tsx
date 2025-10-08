import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../../components/layout/BottomNav';
import { BLEConnectButton } from '../../components/ble/BLEConnectButton';
import { useBTStore } from '../../state/btStore';
import { useEffect } from 'react';

export function HomePage() {
  const navigate = useNavigate();
  const { initialize, client } = useBTStore();

  useEffect(() => {
    if (!client) {
      initialize('0000ffe5-0000-1000-8000-00805f9a34fb', '0000ffe4-0000-1000-8000-00805f9a34fb', '0000ffe9-0000-1000-8000-00805f9a34fb');
    }
  }, []);

  return (
    <div className="min-h-screen bg-gym-bg pb-24">
      <div className="max-w-md mx-auto px-6 pt-12">
        <h1 className="text-3xl font-bold text-white text-center mb-12">
          Hello Jems
        </h1>

        <div className="flex justify-center mb-8">
          <BLEConnectButton />
        </div>

        <div className="space-y-4">
          <button
            onClick={() => navigate('/training')}
            className="w-full bg-gym-accent text-gym-bg font-bold text-xl py-6 rounded-2xl shadow-lg hover:bg-gym-accent-dark transition-all"
          >
            Start Training
          </button>

          <button
            onClick={() => navigate('/report')}
            className="w-full bg-gym-accent text-gym-bg font-bold text-xl py-6 rounded-2xl shadow-lg hover:bg-gym-accent-dark transition-all"
          >
            Report
          </button>

          <button
            onClick={() => navigate('/stats')}
            className="w-full bg-gym-accent text-gym-bg font-bold text-xl py-6 rounded-2xl shadow-lg hover:bg-gym-accent-dark transition-all"
          >
            Statistics
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
