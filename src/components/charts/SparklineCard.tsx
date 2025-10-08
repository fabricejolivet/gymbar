import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface SparklineCardProps {
  title: string;
  value: string | number;
  data: number[];
  color?: string;
}

export function SparklineCard({ title, value, data, color = '#D7FF37' }: SparklineCardProps) {
  const chartData = data.map((v, i) => ({ value: v, index: i }));

  return (
    <div className="bg-gym-card border border-gym-border rounded-2xl p-4 flex-1">
      <h3 className="text-sm text-gray-400 mb-1">{title}</h3>
      <p className="text-2xl font-bold text-white mb-2">{value}</p>
      <ResponsiveContainer width="100%" height={60}>
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
