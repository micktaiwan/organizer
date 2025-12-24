import React from 'react';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  className?: string;
}

const variantStyles = {
  default: 'badge-default',
  primary: 'badge-primary',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
};

const sizeStyles = {
  sm: 'badge-sm',
  md: 'badge-md',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  className = '',
}) => {
  const badgeClassName = `badge ${variantStyles[variant]} ${sizeStyles[size]} ${className}`.trim();

  if (dot) {
    return (
      <span className={`${badgeClassName} badge-dot`} title={String(children)}>
        <span className="dot" />
      </span>
    );
  }

  return <span className={badgeClassName}>{children}</span>;
};
