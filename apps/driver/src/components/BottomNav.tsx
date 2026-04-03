import { useLocation, useNavigate } from 'react-router-dom';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  pathMatch?: (path: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
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
    if (item.pathMatch) {
      return item.pathMatch(location.pathname);
    }
    return location.pathname === item.path;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-3 z-30">
      <ul className="flex justify-between items-center">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.path}>
              <button
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center gap-1 transition-colors ${
                  active
                    ? 'text-primary'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
              >
                <span
                  className={`material-symbols-outlined text-2xl ${
                    active ? 'font-bold' : ''
                  }`}
                >
                  {item.icon}
                </span>
                <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
