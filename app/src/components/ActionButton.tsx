import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
}

export const ActionButton = ({
  children,
  variant = 'outline',
  className = '',
  ...props
}: ActionButtonProps) => {
  const variantClass =
    variant === 'primary' ? 'mg-btn-primary' :
    variant === 'secondary' ? 'mg-btn-secondary' :
    variant === 'danger' ? 'mg-btn-danger' :
    'mg-btn-ghost';

  return (
    <button className={`mg-btn ${variantClass} ${className}`} {...props}>
      {children}
    </button>
  );
};
