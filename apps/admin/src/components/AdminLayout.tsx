import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { IMG } from '@/lib/assets';
import NotificationBell from '@/components/NotificationBell';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const menuItems = [
    { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { label: 'Users', path: '/dashboard/users', icon: 'people' },
    { label: 'Drivers', path: '/dashboard/drivers', icon: 'drive_eta' },
    { label: 'Trips', path: '/dashboard/trips', icon: 'route' },
    { label: 'Monitoring', path: '/dashboard/monitoring', icon: 'monitor_heart' },
    { label: 'Pricing', path: '/dashboard/pricing', icon: 'payments' },
    { label: 'Disputes', path: '/dashboard/disputes', icon: 'support_agent' },
    { label: 'Analytics', path: '/dashboard/analytics', icon: 'bar_chart' },
    { label: 'Promos', path: '/dashboard/promos', icon: 'local_offer' },
    { label: 'OTP Logs', path: '/dashboard/otp-logs', icon: 'sms' },
    { label: 'Audit Logs', path: '/dashboard/audit-logs', icon: 'history' },
  ];

  const isActive = (path: string) => location.pathname === path;

  const getPageTitle = () => {
    const item = menuItems.find((m) => isActive(m.path));
    return item?.label || 'Dashboard';
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen font-sans bg-bg-light dark:bg-bg-dark text-text-primary dark:text-white">
      {/* Sidebar */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 z-20 bg-white dark:bg-bg-dark border-r border-border-light dark:border-slate-800 transition-all duration-300 flex flex-col ${
          sidebarOpen ? 'w-64' : 'w-0 md:w-64'
        }`}
      >
        {/* Logo Section */}
        <div className="p-6 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800">
          <svg fill="none" height="40" viewBox="0 0 100 100" width="40" xmlns="http://www.w3.org/2000/svg"><path d="M25 80V25C25 19.4772 29.4772 15 35 15H75C80.5228 15 85 19.4772 85 25V30C85 35.5228 80.5228 40 75 40H45V45H65C70.5228 45 75 49.4772 75 55V60C75 65.5228 70.5228 70 65 70H45V80C45 85.5228 40.5228 90 35 90H35C29.4772 90 25 85.5228 25 80Z" fill="#13c8ec"/><path d="M45 27.5H65" stroke="white" stroke-linecap="round" stroke-width="4"/><path d="M45 57.5H55" stroke="white" stroke-linecap="round" stroke-width="4"/></svg>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">
              FAIRGO
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Admin Portal
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium ${
                isActive(item.path)
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="material-symbols-outlined text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            <img src={IMG.adminAvatar} className="w-10 h-10 rounded-full object-cover" alt="admin" />
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-bold truncate text-slate-900 dark:text-white">
                {user?.name || 'Admin'}
              </p>
              <p className="text-xs text-slate-500 truncate capitalize">{user?.role || 'User'}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-x-hidden min-h-screen">
        {/* Top Header */}
        <header className="h-20 bg-white/80 dark:bg-bg-dark/80 backdrop-blur-md border-b border-border-light dark:border-slate-800 flex items-center justify-between px-8 sticky top-0 z-10 transition-colors">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 hover:bg-bg-light dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <h2 className="text-xl font-bold tracking-tight text-text-primary dark:text-white">
              {getPageTitle()}
            </h2>
          </div>

          <div className="flex items-center gap-6">
            {/* Notification Bell */}
            <NotificationBell />

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-danger transition-colors"
              title="Logout"
            >
              <span className="material-symbols-outlined text-base">logout</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-8">{children}</div>
        </div>
      </main>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-10"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
