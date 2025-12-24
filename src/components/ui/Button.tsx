import React from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';
type IconPosition = 'left' | 'right';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: IconPosition;
  isLoading?: boolean;
  children?: React.ReactNode;
}

const variantStyles = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

const sizeStyles = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      icon,
      iconPosition = 'left',
      isLoading = false,
      className = '',
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const buttonClassName = `btn ${variantStyles[variant]} ${sizeStyles[size]} ${className}`.trim();

    const showLoader = isLoading;

    return (
      <button
        ref={ref}
        className={buttonClassName}
        disabled={disabled || isLoading}
        {...props}
      >
        {showLoader && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
        {!showLoader && icon && iconPosition === 'left' && (
          <span className="btn-icon" style={{ marginRight: children ? '0.5rem' : '0' }}>
            {icon}
          </span>
        )}
        {children && <span className="btn-text">{children}</span>}
        {!showLoader && icon && iconPosition === 'right' && (
          <span className="btn-icon" style={{ marginLeft: children ? '0.5rem' : '0' }}>
            {icon}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
