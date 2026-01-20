import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';
import { api } from '../../services/api';
import './SearchOverlay.css';

interface SearchResult {
  _id: string;
  content: string;
  senderId: {
    _id: string;
    username: string;
    displayName?: string;
  };
  createdAt: string;
  type: string;
}

interface SearchOverlayProps {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (timestamp: string, messageId: string) => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  roomId,
  isOpen,
  onClose,
  onSelectResult,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when overlay opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setResults([]);
      setTotal(0);
      setError(null);
    }
  }, [isOpen]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const response = await api.searchRoomMessages(roomId, searchQuery, 20);
      // Server returns results already sorted: text matches first, then regex-only, each by date DESC
      setResults(response.results as unknown as SearchResult[]);
      setTotal(response.total);
    } catch (err) {
      console.error('Search error:', err);
      setError('Erreur lors de la recherche');
      setResults([]);
      setTotal(0);
    } finally {
      setIsSearching(false);
    }
  }, [roomId]);

  // Handle input change with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  // Handle result click
  const handleResultClick = (result: SearchResult) => {
    onSelectResult(result.createdAt, result._id);
    onClose();
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return `Aujourd'hui ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (isYesterday) {
      return `Hier ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Highlight search terms in content
  const highlightContent = (content: string) => {
    if (!query.trim()) return content;

    const terms = query.trim().split(/\s+/);
    let highlighted = content;

    terms.forEach(term => {
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark>$1</mark>');
    });

    return highlighted;
  };

  // Truncate content
  const truncateContent = (content: string, maxLength = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  if (!isOpen) return null;

  return (
    <div className="search-overlay">
      <div className="search-overlay__backdrop" onClick={onClose} />
      <div className="search-overlay__panel">
        <div className="search-overlay__header">
          <div className="search-overlay__input-wrapper">
            <Search size={18} className="search-overlay__icon" />
            <input
              ref={inputRef}
              type="text"
              className="search-overlay__input"
              placeholder="Rechercher dans les messages..."
              value={query}
              onChange={handleInputChange}
            />
            {query && (
              <button
                className="search-overlay__clear"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  setTotal(0);
                  inputRef.current?.focus();
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button className="search-overlay__close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="search-overlay__body">
          {isSearching && (
            <div className="search-overlay__loading">
              <div className="search-overlay__spinner" />
              <span>Recherche en cours...</span>
            </div>
          )}

          {error && (
            <div className="search-overlay__error">
              {error}
            </div>
          )}

          {!isSearching && !error && query && results.length === 0 && (
            <div className="search-overlay__empty">
              Aucun message trouvé pour "{query}"
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <>
              <div className="search-overlay__count">
                {total} résultat{total > 1 ? 's' : ''}
              </div>
              <ul className="search-overlay__results">
                {results.map(result => (
                  <li key={result._id}>
                    <button
                      className="search-overlay__result"
                      onClick={() => handleResultClick(result)}
                    >
                      <div className="search-overlay__result-header">
                        <span className="search-overlay__result-author">
                          {result.senderId.displayName || result.senderId.username}
                        </span>
                        <span className="search-overlay__result-date">
                          {formatDate(result.createdAt)}
                        </span>
                      </div>
                      <div
                        className="search-overlay__result-content"
                        dangerouslySetInnerHTML={{
                          __html: highlightContent(truncateContent(result.content))
                        }}
                      />
                      <ArrowRight size={14} className="search-overlay__result-arrow" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!query && (
            <div className="search-overlay__hint">
              Tapez un mot ou une phrase pour rechercher dans les messages
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
