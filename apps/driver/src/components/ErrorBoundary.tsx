import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full max-w-md mx-auto min-h-screen bg-[#f6f8f8] flex flex-col items-center justify-center px-6 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-red-500 text-4xl">error</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">เกิดข้อผิดพลาด</h1>
          <p className="text-sm text-slate-500 mb-6">
            {this.state.error?.message || 'มีบางอย่างผิดพลาด กรุณาลองใหม่'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.href = '/home'; }}
            className="bg-primary text-white font-semibold px-6 py-3 rounded-xl"
          >
            กลับหน้าหลัก
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
