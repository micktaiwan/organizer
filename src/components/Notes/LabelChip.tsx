import React from 'react';
import { X } from 'lucide-react';
import { Label } from '../../services/api';

interface LabelChipProps {
  label: Label;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

export const LabelChip: React.FC<LabelChipProps> = ({
  label,
  selected = false,
  onClick,
  onRemove,
  size = 'md',
}) => {
  const sizeClasses = size === 'sm' ? 'label-chip-sm' : '';

  return (
    <span
      className={`label-chip ${sizeClasses} ${selected ? 'selected' : ''} ${onClick ? 'clickable' : ''}`}
      style={{
        backgroundColor: selected ? label.color : `${label.color}33`,
        borderColor: label.color,
      }}
      onClick={onClick}
    >
      <span className="label-chip-dot" style={{ backgroundColor: label.color }} />
      <span className="label-chip-name">{label.name}</span>
      {onRemove && (
        <button
          className="label-chip-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
};
