import { useLocation, useNavigate } from 'react-router-dom';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  pathMatch?: (path: string) => boolean;
}

const LEFT_ITEMS: NavItem[] = [
  {
    path: '/home',
    icon: 'home',
    label: 'Home',
    pathMatch: (path) => path === '/home',
  },
  {
    path: '/history',
    icon: 'history',
    label: 'History',
    pathMatch: (path) => path === '/history',
  },
];

const RIGHT_ITEMS: NavItem[] = [
  {
    path: '/earnings',
    icon: 'account_balance_wallet',
    label: 'Earnings',
    pathMatch: (path) => path === '/earnings',
  },
  {
    path: '/profile',
    icon: 'person',
    label: 'Profile',
    pathMatch: (path) => path === '/profile',
  },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (item: NavItem) => {
    if (item.pathMatch) return item.pathMatch(location.pathname);
    return location.pathname === item.path;
  };

  const renderItem = (item: NavItem) => {
    const active = isActive(item);
    return (
      <li key={item.path}>
        <button
          onClick={() => navigate(item.path)}
          className={`flex flex-col items-center gap-0.5 min-w-[52px] transition-colors ${
            active
              ? 'text-primary'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
          }`}
        >
          <span className={`material-symbols-outlined text-[22px] ${active ? 'font-bold' : ''}`}>
            {item.icon}
          </span>
          <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>
            {item.label}
          </span>
        </button>
      </li>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white dark:bg-bg-dark border-t border-slate-100 dark:border-slate-800 z-30">
      <ul className="flex justify-around items-end h-16 px-4">
        {/* Left items */}
        {LEFT_ITEMS.map(renderItem)}

        {/* Center elevated action button */}
        <li className="flex flex-col items-center -mt-5">
          <button
            onClick={() => navigate('/home')}
            className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/40 active:scale-95 transition-transform hover:bg-primary/90"
            aria-label="New trip"
          >
            <span className="material-symbols-outlined text-white text-2xl font-bold">add</span>
          </button>
          <span className="text-[10px] font-medium text-slate-400 mt-1">New Trip</span>
        </li>

        {/* Right items */}
        {RIGHT_ITEMS.map(renderItem)}
      </ul>
      {/* iOS home indicator space */}
      <div className="h-safe-bottom bg-white dark:bg-bg-dark" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
    </nav>
  );
}
