import {
  Terminal,
  LayoutDashboard,
  Brain,
  Calendar,
  Timer,
  TriangleAlert,
  TrendingUp,
  CheckCircle2,
  Settings,
  Zap,
  Keyboard,
  HelpCircle,
  Home
} from 'lucide-react';
import { ScreenType } from '../types';

interface SidebarProps {
  activeScreen: ScreenType;
  onScreenChange: (screen: ScreenType) => void;
  session?: any;
  onSignOut?: () => void;
}

export default function Sidebar({
  activeScreen,
  onScreenChange,
  session,
  onSignOut
}: SidebarProps) {
  const navItems = [
    { id: 'dashboard' as ScreenType, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'intelligence' as ScreenType, label: 'Intelligence', icon: Brain },
    { id: 'architect' as ScreenType, label: 'Architect', icon: Calendar },
    { id: 'focus' as ScreenType, label: 'Focus', icon: Timer },
    { id: 'analytics' as ScreenType, label: 'Analytics', icon: TrendingUp },
    { id: 'habits' as ScreenType, label: 'Habits', icon: CheckCircle2 },
    { id: 'settings' as ScreenType, label: 'Settings', icon: Settings }
  ];

  return (
    <nav className="w-64 h-screen fixed left-0 top-0 border-r border-outline bg-surface-container-low flex flex-col py-6 z-50 select-none">
      {/* Brand Logo & Name */}
      <div className="px-6 mb-8 cursor-pointer" onClick={() => onScreenChange('landing')}>
        <div className="flex items-center gap-3">
          <Terminal className="text-primary w-6 h-6" />
          <h1 className="font-sans text-xl font-bold tracking-tight text-white">
            Task<span className="text-primary">Jerker</span>
          </h1>
        </div>
        <p className="font-mono text-[10px] text-on-surface-variant tracking-wider uppercase mt-1 opacity-70 px-1">
          AI Chief of Staff
        </p>
      </div>

      {/* Main Navigation Links */}
      <div className="flex-grow px-4 space-y-1 overflow-y-auto no-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onScreenChange(item.id)}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg font-sans font-medium text-[13px] transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'text-primary bg-surface-container-high border-r-2 border-primary font-semibold shadow-inner'
                  : 'text-on-surface-variant hover:text-white hover:bg-surface-container-high/50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-on-surface-variant'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sidebar Footer Utilities */}
      <div className="px-4 mt-auto pt-6 border-t border-outline/30 space-y-2">
        {/* Home / Marketing view button */}
        <button
          onClick={() => onScreenChange('landing')}
          className="w-full flex items-center gap-4 px-4 py-2.5 rounded-lg text-on-surface-variant hover:text-white hover:bg-surface-container-high/40 font-sans font-medium text-[12px] transition-colors cursor-pointer"
        >
          <Home className="w-4 h-4 text-on-surface-variant" />
          <span>Exit to Website</span>
        </button>

        {/* Profile Card */}
        {session && session.user ? (
          <div className="mt-4 pt-4 border-t border-outline/20 flex flex-col gap-3 px-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                <span className="font-sans font-bold text-xs text-primary">
                  {session.user.email?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex flex-col overflow-hidden flex-1">
                <span className="font-sans font-semibold text-xs text-white truncate">
                  {session.user.email?.split('@')[0] || 'User'}
                </span>
                <span className="font-sans text-[9px] text-on-surface-variant truncate">
                  {session.user.email}
                </span>
              </div>
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="w-full py-2 border border-outline hover:bg-surface-container-highest/20 hover:text-white rounded-lg font-sans font-medium text-[11px] transition-colors cursor-pointer text-on-surface-variant text-center"
              >
                Sign Out
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-outline/20 flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-surface-container-highest border border-outline flex items-center justify-center shrink-0">
              <span className="font-sans font-bold text-xs text-on-surface-variant">G</span>
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="font-sans font-semibold text-xs text-white truncate">
                Guest Account
              </span>
              <span className="font-sans text-[10px] text-on-surface-variant truncate">
                Not signed in
              </span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
