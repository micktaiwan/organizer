import React, { useState, useEffect } from "react";
import { Contact } from "../../types";

interface ContactModalProps {
  editingContact: Contact | null;
  initialName?: string;
  initialUserId?: string;
  onSave: (name: string, userId: string) => void;
  onCancel: () => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({
  editingContact,
  initialName = "",
  initialUserId = "",
  onSave,
  onCancel
}) => {
  const [name, setName] = useState(initialName || editingContact?.name || "");
  const [userId, setUserId] = useState(initialUserId || editingContact?.userId || editingContact?.peerId || "");

  useEffect(() => {
    if (editingContact) {
      setName(editingContact.name);
      setUserId(editingContact.userId || editingContact.peerId || "");
    }
  }, [editingContact]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && userId.trim()) {
      onSave(name, userId);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="contact-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{editingContact ? "Modifier le contact" : "Ajouter un contact"}</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du contact"
            autoFocus
          />
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="User ID"
          />
          <div className="modal-actions">
            <button type="button" onClick={onCancel}>
              Annuler
            </button>
            <button type="submit" disabled={!name.trim() || !userId.trim()}>
              {editingContact ? "Mettre à jour" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

