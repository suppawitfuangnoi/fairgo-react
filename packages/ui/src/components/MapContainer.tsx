import React from 'react';

interface MapContainerProps {
  children?: React.ReactNode;
  className?: string;
  height?: string;
}

// Wrapper — actual map implementation is per-app (google-maps or leaflet)
export function MapContainer({ children, className = '', height = '100%' }: MapContainerProps) {
  return (
    <div className={`relative bg-bg-light overflow-hidden ${className}`} style={{ height }}>
      {children}
    </div>
  );
}
