import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);

  const menuItems = [
    { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { label: 'Users', path: '/dashboard/users', icon: 'people' },
    { label: 'Drivers', path: '/dashboard/drivers', icon: 'local_shipping' },
    { label: 'Trips', path: '/dashboard/trips', icon: 'route' },
    { label: 'Pricing', path: '/dashboard/pricing', icon: 'price_check' },
    { label: 'Disputes', path: '/dashboard/disputes', icon: 'warning' },
    { label: 'Analytics', path: '/dashboard/analytics', icon: 'analytics' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex h-screen bg-bg-light">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-border-light shadow-card">
        <div className="p-6 border-b border-border-light">
          <h1 className="text-2xl font-bold text-primary">FairGo Admin</h1>
        </div>

        <nav className="mt-6">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                isActive(item.path)
                  ? 'bg-primary-light text-primary border-r-4 border-primary'
                  : 'text-text-primary hover:bg-bg-light'
              }`}
            >
              <span className="material-symbols-outlined text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-border-light shadow-card px-8 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-text-primary">Admin Dashboard</h2>
          <button
            onClick={logout}
            className="px-4 py-2 text-sm font-medium text-white bg-danger rounded-lg hover:bg-red-600 transition-colors"
          >
            Logout
          </button>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
