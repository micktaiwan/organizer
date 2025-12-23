import React, { useState } from "react";

interface UsernameScreenProps {
  initialUsername: string;
  onSave: (username: string) => void;
}

export const UsernameScreen: React.FC<UsernameScreenProps> = ({ initialUsername, onSave }) => {
  const [username, setUsername] = useState(initialUsername);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onSave(username.trim());
    }
  };

  return (
    <main className="container">
      <h1>Organizer Chat</h1>
      <div className="connection-box">
        <div className="username-section">
          <p>Choisis ton pseudo :</p>
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ton pseudo..."
              autoFocus
            />
            <button type="submit" disabled={!username.trim()}>
              Continuer
            </button>
          </form>
        </div>
      </div>
    </main>
  );
};

