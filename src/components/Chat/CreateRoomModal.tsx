import React, { useState, useEffect, useRef } from "react";

interface CreateRoomModalProps {
  isLoading?: boolean;
  error?: string | null;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isLoading = false,
  error = null,
  onSubmit,
  onCancel
}) => {
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();

    // Validation
    if (!trimmedName) {
      setLocalError("Le nom ne peut pas etre vide");
      return;
    }
    if (trimmedName.length > 100) {
      setLocalError("Le nom ne peut pas depasser 100 caracteres");
      return;
    }

    setLocalError(null);
    await onSubmit(trimmedName);
  };

  const displayError = localError || error;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="contact-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Nouveau salon public</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setLocalError(null);
            }}
            placeholder="Nom du salon"
            disabled={isLoading}
            maxLength={100}
          />
          {displayError && (
            <div className="modal-error">{displayError}</div>
          )}
          <div className="modal-char-count">
            {name.length}/100
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onCancel} disabled={isLoading}>
              Annuler
            </button>
            <button type="submit" disabled={!name.trim() || isLoading}>
              {isLoading ? "Creation..." : "Creer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
