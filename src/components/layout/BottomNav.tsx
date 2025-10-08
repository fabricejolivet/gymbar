import { Home, BarChart3, Search, Settings, User } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: BarChart3, label: 'Statistics', path: '/stats' },
    { icon: Search, label: 'Report', path: '/report' },
    { icon: Home, label: 'Home', path: '/home' },
    { icon: Settings, label: 'Settings', path: '/settings' },
    { icon: User, label: 'Profile', path: '/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gym-card border-t border-gym-border">
      <div className="flex justify-around items-center h-20 max-w-md mx-auto px-4">
        {navItems.map(({ icon: Icon, label, path }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                isActive ? 'text-gym-accent' : 'text-gray-400'
              }`}
            >
              <Icon size={24} />
              <span className="text-xs">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
