import React from "react";
import { LucideIcon } from "lucide-react";
import "./ConfirmModal.css";

interface ConfirmModalProps {
  icon?: LucideIcon;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  icon: Icon,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "default",
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        {Icon && (
          <div className={`confirm-modal__icon confirm-modal__icon--${variant}`}>
            <Icon size={24} />
          </div>
        )}
        <h3 className="confirm-modal__title">{title}</h3>
        <p className="confirm-modal__text">{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel}>{cancelLabel}</button>
          <button
            className={variant === "danger" ? "confirm-modal__danger" : ""}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
