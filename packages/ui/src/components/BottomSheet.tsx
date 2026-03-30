import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  snapPoints?: string; // e.g. '60vh'
  showHandle?: boolean;
}

export function BottomSheet({ open, onClose, children, snapPoints = '70vh', showHandle = true }: BottomSheetProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-float animate-slide-up overflow-y-auto"
        style={{ maxHeight: snapPoints }}
      >
        {showHandle && (
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-border-light rounded-full" />
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
