import React, { useState, useEffect } from "react";
import { Contact } from "../../types";

interface ContactModalProps {
  editingContact: Contact | null;
  initialName?: string;
  initialPeerId?: string;
  onSave: (name: string, peerId: string) => void;
  onCancel: () => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({
  editingContact,
  initialName = "",
  initialPeerId = "",
  onSave,
  onCancel
}) => {
  const [name, setName] = useState(initialName || editingContact?.name || "");
  const [peerId, setPeerId] = useState(initialPeerId || editingContact?.peerId || "");

  useEffect(() => {
    if (editingContact) {
      setName(editingContact.name);
      setPeerId(editingContact.peerId);
    }
  }, [editingContact]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && peerId.trim()) {
      onSave(name, peerId);
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
            value={peerId}
            onChange={(e) => setPeerId(e.target.value)}
            placeholder="Peer ID"
          />
          <div className="modal-actions">
            <button type="button" onClick={onCancel}>
              Annuler
            </button>
            <button type="submit" disabled={!name.trim() || !peerId.trim()}>
              {editingContact ? "Mettre à jour" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

