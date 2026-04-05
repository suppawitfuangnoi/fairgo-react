import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { IMG, avatarUrl } from '@/lib/assets';

interface UserProfile {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  totalTrips: number;
  averageRating: number;
  joinDate: string;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const setLoggedIn = useAuthStore((state) => state.setLoggedIn);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await apiFetch<UserProfile>('/users/me');
        setUser(response);
        setNewName(response.name);
      } catch (err) {
        console.error('Failed to fetch user:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const handleSaveName = async () => {
    if (!user || !newName.trim()) return;

    try {
      await apiFetch('/users/me', {
        method: 'PATCH',
        body: { name: newName },
      });

      setUser({ ...user, name: newName });
      setEditingName(false);
    } catch (err) {
      console.error('Failed to update name:', err);
      alert('ไม่สามารถอัปเดตชื่อได้');
      setNewName(user.name);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('fg_access_token');
    localStorage.removeItem('fg_refresh_token');
    localStorage.removeItem('fg_user');
    setLoggedIn(false);
    navigate('/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="w-full max-w-md mx-auto h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <p className="text-slate-600 dark:text-slate-400">ไม่สามารถโหลดโปรไฟล์ได้</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-background-light dark:bg-background-dark overflow-hidden font-display">
      {/* Header with Avatar */}
      <div className="bg-gradient-to-b from-primary/20 to-transparent pt-8 pb-6 px-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-white dark:border-background-dark shadow-lg">
            <img src={user.avatar ? user.avatar : IMG.userProfile} className="w-full h-full object-cover rounded-full" alt="profile" />
          </div>

          <div className="flex-1">
            {editingName ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 px-3 py-2 border border-primary rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  className="px-4 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark transition-colors"
                >
                  บันทึก
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {user.name}
                </h1>
                <button
                  onClick={() => setEditingName(true)}
                  className="p-1 rounded-full hover:bg-white dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="material-icons-round text-lg text-slate-500">
                    edit
                  </span>
                </button>
              </div>
            )}
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {user.phone}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-6 py-6 grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 text-center shadow-sm border border-slate-100 dark:border-slate-700">
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">
            ทั้งหมด
          </p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {user.totalTrips}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            การเดินทาง
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 text-center shadow-sm border border-slate-100 dark:border-slate-700">
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">
            คะแนนเฉลี่ย
          </p>
          <div className="flex items-center justify-center gap-1">
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {user.averageRating.toFixed(1)}
            </p>
            <span className="material-icons-round text-yellow-400">star</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            คะแนน
          </p>
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-6 py-4">
        <button
          onClick={() => navigate('/history')}
          className="w-full flex items-center gap-4 py-4 px-4 bg-white dark:bg-slate-800 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors mb-3 shadow-sm border border-slate-100 dark:border-slate-700"
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="material-icons-round text-primary">history</span>
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-slate-900 dark:text-white">
              ประวัติการเดินทาง
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ดูการเดินทางทั้งหมดของคุณ
            </p>
          </div>
          <span className="material-icons-round text-slate-400">
            arrow_forward
          </span>
        </button>

        <button className="w-full flex items-center gap-4 py-4 px-4 bg-white dark:bg-slate-800 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors mb-3 shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="material-icons-round text-primary">payment</span>
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-slate-900 dark:text-white">
              วิธีการชำระเงิน
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              จัดการวิธีชำระเงิน
            </p>
          </div>
          <span className="material-icons-round text-slate-400">
            arrow_forward
          </span>
        </button>

        <button className="w-full flex items-center gap-4 py-4 px-4 bg-white dark:bg-slate-800 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors mb-3 shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="material-icons-round text-primary">
              settings
            </span>
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-slate-900 dark:text-white">
              ตั้งค่า
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              การตั้งค่าแอปพลิเคชัน
            </p>
          </div>
          <span className="material-icons-round text-slate-400">
            arrow_forward
          </span>
        </button>

        <button className="w-full flex items-center gap-4 py-4 px-4 bg-white dark:bg-slate-800 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors mb-3 shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="material-icons-round text-primary">help</span>
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-slate-900 dark:text-white">
              ความช่วยเหลือ
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ศูนย์ช่วยเหลือและคำถามที่พบบ่อย
            </p>
          </div>
          <span className="material-icons-round text-slate-400">
            arrow_forward
          </span>
        </button>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-4 py-4 px-4 bg-red-50 dark:bg-red-900/20 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-red-600 dark:text-red-400 shadow-sm border border-red-200 dark:border-red-800"
        >
          <div className="w-10 h-10 rounded-full bg-red-200 dark:bg-red-900/40 flex items-center justify-center">
            <span className="material-icons-round">logout</span>
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold">ออกจากระบบ</p>
            <p className="text-xs">ปลดปล่อยบัญชีของคุณ</p>
          </div>
          <span className="material-icons-round">arrow_forward</span>
        </button>
      </div>

      {/* Footer */}
      <div className="px-6 py-8 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          เข้าร่วมเมื่อ {new Date(user.joinDate).toLocaleDateString('th-TH')}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          FAIRGO v1.0.2
        </p>
      </div>
    </div>
  );
}
