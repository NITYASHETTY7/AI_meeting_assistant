import type { ReactNode, ButtonHTMLAttributes } from 'react';

interface QuickActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  label: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
}

export const QuickActionButton = ({
  icon,
  label,
  variant = 'outline',
  className = '',
  ...props
}: QuickActionButtonProps) => {
  const variantClass =
    variant === 'primary' ? 'mg-btn-primary' :
    variant === 'secondary' ? 'mg-btn-secondary' :
    variant === 'danger' ? 'mg-btn-danger' :
    'mg-btn-ghost';

  return (
    <button className={`mg-btn ${variantClass} ${className}`} {...props}>
      {icon && <span className="w-3.5 h-3.5 flex items-center justify-center">{icon}</span>}
      <span>{label}</span>
    </button>
  );
};
