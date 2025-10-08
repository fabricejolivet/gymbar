import { useState } from 'react';
import { BottomNav } from '../../components/layout/BottomNav';
import { PolarPlot } from '../../components/charts/PolarPlot';
import { SparklineCard } from '../../components/charts/SparklineCard';
import { MiniBarsCard } from '../../components/charts/MiniBarsCard';
import { Dumbbell } from 'lucide-react';

export function ReportPage() {
  const [selectedDate, setSelectedDate] = useState(4);

  const dates = [
    { day: 1, month: 'Feb' },
    { day: 2, month: 'Feb' },
    { day: 2, month: 'Feb' },
    { day: 4, month: 'Feb' },
    { day: 5, month: 'Feb' },
    { day: 6, month: 'Feb' },
    { day: 7, month: 'Feb' },
  ];

  const exercises = [
    { weight: '20kg', name: 'Squat', cal: '58 CAL', balance: '78%', active: true },
    { weight: '40kg', name: 'Push up', cal: '95 CAL', balance: '79%', active: false },
    { weight: '40kg', name: 'Chest', cal: '118 CAL', balance: '93%', active: false },
    { weight: '40kg', name: 'Exercise 4', cal: '103 CAL', balance: '88%', active: false },
    { weight: '20kg', name: 'Exercise 5', cal: '48 CAL', balance: '80%', active: false },
    { weight: '10kg', name: 'Exercise 6', cal: '27 CAL', balance: '98%', active: false },
  ];

  const mockBalance = [70, 75, 78, 80, 78, 82, 85, 83, 78, 80];
  const mockSpeed = [25, 28, 30, 32, 35, 33, 31, 30, 28, 31];

  const mockTiltData = Array.from({ length: 16 }, (_, i) => ({
    angle: (i * 360) / 16,
    value: 50 + Math.random() * 30,
  }));

  const mockPathData = Array.from({ length: 16 }, (_, i) => ({
    angle: (i * 360) / 16,
    value: 40 + Math.random() * 40,
  }));

  return (
    <div className="min-h-screen bg-gym-bg pb-24">
      <div className="max-w-md mx-auto px-6 pt-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">PROGRESS RESULT</h1>
          <h2 className="text-xl text-gym-accent">Full report</h2>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {dates.map((date, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedDate(idx)}
              className={`flex-shrink-0 w-16 py-3 rounded-xl font-semibold transition-all ${
                selectedDate === idx
                  ? 'bg-gym-accent text-gym-bg'
                  : 'bg-gym-card text-gray-400'
              }`}
            >
              <div className="text-2xl">{date.day}</div>
              <div className="text-xs">{date.month}</div>
            </button>
          ))}
        </div>

        <div className="bg-gym-card border border-gym-border rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Dumbbell size={48} className="text-gym-accent" />
            <div className="flex-1">
              <div className="text-sm text-gray-400">Repetitions</div>
              <div className="h-2 bg-gym-bg rounded-full overflow-hidden mb-1">
                <div className="h-full bg-gym-accent" style={{ width: '90%' }} />
              </div>
              <div className="text-2xl font-bold text-white text-right">90</div>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Balance</span>
              <div className="flex-1 mx-4 h-2 bg-gym-bg rounded-full overflow-hidden">
                <div className="h-full bg-gym-accent" style={{ width: '85%' }} />
              </div>
              <span className="text-white font-semibold">85%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Average speed</span>
              <div className="flex-1 mx-4 h-2 bg-gym-bg rounded-full overflow-hidden">
                <div className="h-full bg-gym-accent" style={{ width: '90%' }} />
              </div>
              <span className="text-white font-semibold">45cm/s</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-6">
          <div className="text-center text-xs text-gray-400 font-semibold">WEIGHT</div>
          <div className="text-center text-xs text-gray-400 font-semibold">EXERCISE</div>
          <div className="text-center text-xs text-gray-400 font-semibold">CAL</div>
          <div className="text-center text-xs text-gray-400 font-semibold">BALANCE</div>
        </div>

        <div className="space-y-2 mb-6">
          {exercises.map((ex, idx) => (
            <div
              key={idx}
              className={`grid grid-cols-4 gap-2 py-3 px-4 rounded-xl ${
                ex.active ? 'bg-gym-accent text-gym-bg' : 'bg-gym-card text-white'
              }`}
            >
              <div className="text-center font-semibold">{ex.weight}</div>
              <div className="text-center font-semibold">{ex.name}</div>
              <div className="text-center font-semibold">{ex.cal}</div>
              <div className="text-center font-semibold">{ex.balance}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <SparklineCard title="Balance" value="78%" data={mockBalance} />
          <MiniBarsCard title="Speed" value="31cm/s" data={mockSpeed} />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <PolarPlot title="Up" data={mockTiltData} size={160} />
          <PolarPlot title="Front" data={mockPathData} size={160} />
        </div>

        <button className="w-full bg-gym-accent text-gym-bg font-bold text-lg py-4 rounded-2xl hover:bg-gym-accent-dark transition-all">
          Save
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
