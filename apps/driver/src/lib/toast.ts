type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  type?: ToastType;
  duration?: number;
}

type ToastListener = (msg: string, opts: ToastOptions) => void;

let listener: ToastListener | null = null;

export const toast = {
  subscribe(fn: ToastListener) {
    listener = fn;
    return () => { listener = null; };
  },
  show(msg: string, opts: ToastOptions = {}) {
    listener?.(msg, opts);
  },
  success(msg: string) { this.show(msg, { type: 'success' }); },
  error(msg: string) { this.show(msg, { type: 'error' }); },
  info(msg: string) { this.show(msg, { type: 'info' }); },
  warning(msg: string) { this.show(msg, { type: 'warning' }); },
};
