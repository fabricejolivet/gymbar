import { BarChart, Bar, ResponsiveContainer } from 'recharts';

interface MiniBarsCardProps {
  title: string;
  value: string | number;
  data: number[];
  color?: string;
}

export function MiniBarsCard({ title, value, data, color = '#D7FF37' }: MiniBarsCardProps) {
  const chartData = data.map((v, i) => ({ value: v, index: i }));

  return (
    <div className="bg-gym-card border border-gym-border rounded-2xl p-4 flex-1">
      <h3 className="text-sm text-gray-400 mb-1">{title}</h3>
      <p className="text-2xl font-bold text-white mb-2">{value}</p>
      <ResponsiveContainer width="100%" height={60}>
        <BarChart data={chartData}>
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
