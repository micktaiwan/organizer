import React from "react";
import { Contact } from "../../types";

interface ContactListProps {
  contacts: Contact[];
  onConnect: (contact: Contact) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (id: string) => void;
}

export const ContactList: React.FC<ContactListProps> = ({
  contacts,
  onConnect,
  onEdit,
  onDelete
}) => {
  if (contacts.length === 0) {
    return <p className="no-contacts">Aucun contact sauvegardé</p>;
  }

  const getContactId = (contact: Contact) => contact.userId || contact.peerId || "";

  return (
    <div className="contacts-list">
      {contacts.map((contact) => (
        <div key={contact.id} className="contact-item">
          <div className="contact-info">
            <span className="contact-name">{contact.name}</span>
            <span className="contact-peer-id">{getContactId(contact).slice(0, 12)}...</span>
          </div>
          <div className="contact-actions">
            <button
              className="connect-contact-btn"
              onClick={() => onConnect(contact)}
            >
              Connecter
            </button>
            <button
              className="edit-contact-btn"
              onClick={() => onEdit(contact)}
            >
              Modifier
            </button>
            <button
              className="delete-contact-btn"
              onClick={() => onDelete(contact.id)}
            >
              Suppr.
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

