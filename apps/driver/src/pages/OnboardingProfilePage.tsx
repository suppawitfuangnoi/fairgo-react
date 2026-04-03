import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { apiFetch } from '@/lib/api';

type Step = 1 | 2 | 3;

export default function OnboardingProfilePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState(user?.email || '');
  const [vehicleType, setVehicleType] = useState<'TAXI' | 'MOTORCYCLE' | 'TUKTUK'>('TAXI');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const handleNextStep = async () => {
    if (step === 1) {
      if (!email) {
        setError('Please enter your email');
        return;
      }
      setError('');
      setStep(2);
    } else if (step === 2) {
      if (!make || !model || !color || !plateNumber) {
        setError('Please fill in all vehicle fields');
        return;
      }
      setError('');
      setLoading(true);

      try {
        await apiFetch('/vehicles', {
          method: 'POST',
          body: {
            type: vehicleType,
            make,
            model,
            color,
            plateNumber,
            year,
          },
        });

        updateUser({ email });
        setStep(3);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save vehicle');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      await apiFetch('/users/me/driver-profile', {
        method: 'PATCH',
        body: { profileComplete: true },
      });

      navigate('/home', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete profile');
    } finally {
      setLoading(false);
    }
  };

  const progress = (step / 3) * 100;

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-display flex items-center justify-center">
      <div className="max-w-md w-full max-h-[850px] mx-auto bg-white dark:bg-slate-900 shadow-2xl rounded-3xl overflow-hidden flex flex-col">
        <div className="h-12 flex items-end justify-between px-6 pb-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">9:41</span>
          <div className="flex gap-1.5 items-center text-xs text-slate-900 dark:text-white">
            <span className="material-symbols-outlined">signal_cellular_alt</span>
            <span className="material-symbols-outlined">wifi</span>
            <span className="material-symbols-outlined">battery_full</span>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Complete Your Profile</h1>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Step {step}/3
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8">
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-primary text-2xl">person</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Basic Information</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Update your contact details</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={user?.name || ''}
                  disabled
                  className="w-full bg-slate-100 dark:bg-slate-800 px-4 py-3 rounded-lg text-slate-900 dark:text-white opacity-50 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-background-light dark:bg-slate-800 px-4 py-3 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-primary text-2xl">directions_car</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Vehicle Information</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Tell us about your vehicle</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Vehicle Type
                </label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as any)}
                  className="w-full bg-background-light dark:bg-slate-800 px-4 py-3 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="TAXI">Taxi</option>
                  <option value="MOTORCYCLE">Motorcycle</option>
                  <option value="TUKTUK">TukTuk</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                    Make
                  </label>
                  <input
                    type="text"
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                    placeholder="Toyota"
                    className="w-full bg-background-light dark:bg-slate-800 px-4 py-3 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                    Model
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Altis"
                    className="w-full bg-background-light dark:bg-slate-800 px-4 py-3 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                    Color
                  </label>
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="White"
                    className="w-full bg-background-light dark:bg-slate-800 px-4 py-3 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                    Year
                  </label>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value))}
                    min="1990"
                    max={new Date().getFullYear()}
                    className="w-full bg-background-light dark:bg-slate-800 px-4 py-3 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Plate Number
                </label>
                <input
                  type="text"
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  placeholder="ABC 1234"
                  className="w-full bg-background-light dark:bg-slate-800 px-4 py-3 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-primary text-2xl">description</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Upload Documents</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Required for verification</p>
              </div>

              <div className="bg-primary/5 dark:bg-primary/10 border-2 border-dashed border-primary/30 rounded-lg p-6 text-center cursor-pointer hover:border-primary/60 transition">
                <input
                  type="file"
                  onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="doc-upload"
                  accept=".pdf,.jpg,.jpeg,.png"
                />
                <label htmlFor="doc-upload" className="cursor-pointer block">
                  <span className="material-symbols-outlined text-primary text-4xl mb-2 block">
                    cloud_upload
                  </span>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {documentFile ? documentFile.name : 'Click to upload documents'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    License, registration, or insurance
                  </p>
                </label>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-900 dark:text-blue-300">
                  You can upload documents at our office later. Complete your profile to get started now.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm mt-4">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep((step - 1) as Step)}
              disabled={loading}
              className="flex-1 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
            >
              Back
            </button>
          )}
          <button
            onClick={() => {
              if (step === 3) {
                handleSubmit();
              } else {
                handleNextStep();
              }
            }}
            disabled={loading}
            className="flex-1 bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                Loading...
              </>
            ) : (
              <>
                <span>{step === 3 ? 'Complete' : 'Next'}</span>
                <span className="material-symbols-outlined">arrow_forward</span>
              </>
            )}
          </button>
        </div>

        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-1/3 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
      </div>
    </div>
  );
}
