import React from "react";
import { Contact } from "../../types";
import { ContactList } from "../Contact/ContactList";

interface ConnectionScreenProps {
  peerId: string;
  remotePeerId: string;
  setRemotePeerId: (id: string) => void;
  onConnect: (id?: string) => void;
  onCopyPeerId: () => void;
  copied: boolean;
  contacts: Contact[];
  onAddContact: () => void;
  onEditContact: (contact: Contact) => void;
  onDeleteContact: (id: string) => void;
  onSkip: () => void;
}

export const ConnectionScreen: React.FC<ConnectionScreenProps> = ({
  peerId,
  remotePeerId,
  setRemotePeerId,
  onConnect,
  onCopyPeerId,
  copied,
  contacts,
  onAddContact,
  onEditContact,
  onDeleteContact,
  onSkip
}) => {
  return (
    <main className="container">
      <h1>Organizer Chat</h1>
      <div className="connection-box">
        <div className="peer-id-section">
          <p>Your ID:</p>
          <div className="peer-id-display">
            <code>{peerId || "Connecting..."}</code>
            <button onClick={onCopyPeerId} disabled={!peerId} className={copied ? "copied" : ""}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div className="connect-section">
          <p>Connect to peer:</p>
          <form onSubmit={(e) => { e.preventDefault(); onConnect(remotePeerId); }}>
            <input
              type="text"
              value={remotePeerId}
              onChange={(e) => setRemotePeerId(e.target.value)}
              placeholder="Paste peer ID here..."
            />
            <button type="submit" disabled={!remotePeerId.trim()}>
              Connect
            </button>
          </form>
        </div>

        <div className="contacts-section">
          <div className="contacts-header">
            <p>Contacts sauvegardés :</p>
            <button className="add-contact-btn" onClick={onAddContact}>
              + Ajouter
            </button>
          </div>
          <ContactList
            contacts={contacts}
            onConnect={(c) => onConnect(c.peerId)}
            onEdit={onEditContact}
            onDelete={onDeleteContact}
          />
        </div>

        <div className="skip-section">
          <button className="skip-button" onClick={onSkip}>
            Skip for now
          </button>
        </div>
      </div>
    </main>
  );
};

