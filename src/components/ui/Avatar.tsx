import React from 'react';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'busy';
  showStatus?: boolean;
  className?: string;
}

const sizeMap = {
  sm: 24,
  md: 32,
  lg: 40,
  xl: 64,
};

const colorPalette = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA07A',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E2',
  '#F8B88B',
  '#A29BFE',
];

// Generate consistent color from name
function getColorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colorPalette[Math.abs(hash) % colorPalette.length];
}

// Generate initials from name
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(p => p.length > 0);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  size = 'md',
  status,
  showStatus = true,
  className = '',
}) => {
  const sizePixels = sizeMap[size];
  const initials = getInitials(name);
  const backgroundColor = getColorFromName(name);

  const statusDotSize = {
    sm: 6,
    md: 8,
    lg: 10,
    xl: 14,
  }[size];

  const statusColorMap = {
    online: '#34c759',
    offline: '#999999',
    busy: '#ff9500',
  };

  return (
    <div
      className={`avatar avatar-${size} ${className}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: sizePixels,
        height: sizePixels,
        borderRadius: '50%',
        backgroundColor,
        color: 'white',
        fontWeight: 600,
        fontSize: sizePixels * 0.4,
        flexShrink: 0,
      }}
      title={name}
    >
      {initials}
      {status && showStatus && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: statusDotSize,
            height: statusDotSize,
            borderRadius: '50%',
            backgroundColor: statusColorMap[status],
            border: '2px solid white',
          }}
        />
      )}
    </div>
  );
};
