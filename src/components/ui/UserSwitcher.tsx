import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Plus, AlertCircle, Check } from 'lucide-react';
import { useAuth, SavedAccount } from '../../contexts/AuthContext';
import './UserSwitcher.css';

interface UserSwitcherProps {
  username: string;
}

export const UserSwitcher: React.FC<UserSwitcherProps> = ({ username }) => {
  const { user, savedAccounts, switchToAccount, removeAccountFromSwitcher, addAccountToSwitcher } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
  const [errorAccountId, setErrorAccountId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSwitch = async (account: SavedAccount) => {
    if (switchingAccountId) return; // Prevent double-click
    if (user && account.userId === user.id) return; // Already current user

    setSwitchingAccountId(account.id);
    setErrorAccountId(null);

    const result = await switchToAccount(account.id);

    if (result.success) {
      setIsOpen(false);
    } else {
      setErrorAccountId(account.id);
      // Clear error after 3 seconds
      setTimeout(() => setErrorAccountId(null), 3000);
    }
    setSwitchingAccountId(null);
  };

  const handleRemove = async (e: React.MouseEvent, accountId: string) => {
    e.stopPropagation(); // Prevent triggering switch
    await removeAccountFromSwitcher(accountId);
  };

  const handleAddAccount = async () => {
    setIsOpen(false);
    await addAccountToSwitcher();
  };

  const isCurrentAccount = (account: SavedAccount) => user && account.userId === user.id;

  return (
    <div className="user-switcher" ref={dropdownRef}>
      <button
        className="user-switcher-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="user-switcher-username">{username}</span>
        <ChevronDown size={14} className={`user-switcher-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="user-switcher-dropdown">
          <div className="user-switcher-accounts">
            {savedAccounts.map((account) => (
              <div
                key={account.id}
                className={`user-switcher-account ${isCurrentAccount(account) ? 'current' : ''} ${switchingAccountId === account.id ? 'switching' : ''} ${errorAccountId === account.id ? 'error' : ''}`}
                onClick={() => handleSwitch(account)}
              >
                <div className="user-switcher-account-indicator">
                  {isCurrentAccount(account) ? (
                    <Check size={14} className="current-icon" />
                  ) : errorAccountId === account.id ? (
                    <AlertCircle size={14} className="error-icon" />
                  ) : (
                    <div className="empty-indicator" />
                  )}
                </div>
                <div className="user-switcher-account-info">
                  <span className="user-switcher-display-name">{account.displayName}</span>
                  {account.displayName !== account.username && (
                    <span className="user-switcher-account-username">@{account.username}</span>
                  )}
                  {errorAccountId === account.id && (
                    <span className="user-switcher-error-text">Session expirée</span>
                  )}
                </div>
                {!isCurrentAccount(account) && (
                  <button
                    className="user-switcher-remove"
                    onClick={(e) => handleRemove(e, account.id)}
                    title="Retirer du switcher"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="user-switcher-divider" />

          <button className="user-switcher-add" onClick={handleAddAccount}>
            <Plus size={16} />
            <span>Ajouter un compte</span>
          </button>
        </div>
      )}
    </div>
  );
};
