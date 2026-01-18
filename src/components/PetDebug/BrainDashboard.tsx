import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Trash2, ChevronDown, ChevronRight, Search, Zap } from 'lucide-react';
import './BrainDashboard.css';

interface MemoryPayload {
  type: string;
  content: string;
  timestamp: string;
  selfCategory?: string;
  goalCategory?: string;
  subjects?: string[];
  authorName?: string;
}

interface MemoryItem {
  id: string;
  payload: MemoryPayload;
}

interface LivePreview {
  id: string;
  author: string;
  content: string;
  timestamp: string;
}

interface Counts {
  self: number;
  goals: number;
  facts: number;
  live: number;
}

type TabType = 'self' | 'goals' | 'facts' | 'live';

interface BrainDashboardProps {
  serverUrl: string;
  getAuthHeaders: () => Record<string, string>;
}

// Category display names
const SELF_CATEGORIES: Record<string, string> = {
  context: 'Context',
  capability: 'Capability',
  limitation: 'Limitation',
  preference: 'Preference',
  relation: 'Relation',
};

const GOAL_CATEGORIES: Record<string, string> = {
  capability_request: 'Capability Request',
  understanding: 'Understanding',
  connection: 'Connection',
};

export function BrainDashboard({ serverUrl, getAuthHeaders }: BrainDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('self');
  const [counts, setCounts] = useState<Counts>({ self: 0, goals: 0, facts: 0, live: 0 });
  const [selfItems, setSelfItems] = useState<MemoryItem[]>([]);
  const [goalsItems, setGoalsItems] = useState<MemoryItem[]>([]);
  const [facts, setFacts] = useState<MemoryItem[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [livePreview, setLivePreview] = useState<LivePreview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set([...Object.keys(SELF_CATEGORIES), ...Object.keys(GOAL_CATEGORIES)])
  );
  const [selfSearch, setSelfSearch] = useState('');
  const [goalsSearch, setGoalsSearch] = useState('');
  const [factsSearch, setFactsSearch] = useState('');
  const [isDigesting, setIsDigesting] = useState(false);

  // Sort items by timestamp DESC (most recent first)
  const sortByDateDesc = (a: MemoryItem, b: MemoryItem) => {
    const timeA = new Date(a.payload.timestamp).getTime();
    const timeB = new Date(b.payload.timestamp).getTime();
    return timeB - timeA;
  };

  // Filter and group self items by category
  const selfByCategory = useMemo(() => {
    const grouped: Record<string, MemoryItem[]> = {};
    const search = selfSearch.toLowerCase();
    for (const item of selfItems) {
      // Filter by search
      if (search && !item.payload.content.toLowerCase().includes(search)) {
        continue;
      }
      const category = item.payload.selfCategory || 'unknown';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(item);
    }
    // Sort items within each group by date DESC
    for (const category of Object.keys(grouped)) {
      grouped[category].sort(sortByDateDesc);
    }
    return grouped;
  }, [selfItems, selfSearch]);

  // Filter and group goals by category
  const goalsByCategory = useMemo(() => {
    const grouped: Record<string, MemoryItem[]> = {};
    const search = goalsSearch.toLowerCase();
    for (const item of goalsItems) {
      // Filter by search
      if (search && !item.payload.content.toLowerCase().includes(search)) {
        continue;
      }
      const category = item.payload.goalCategory || 'unknown';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(item);
    }
    // Sort items within each group by date DESC
    for (const category of Object.keys(grouped)) {
      grouped[category].sort(sortByDateDesc);
    }
    return grouped;
  }, [goalsItems, goalsSearch]);

  // Filter facts by search
  const filteredFacts = useMemo(() => {
    if (!factsSearch.trim()) return facts;
    const search = factsSearch.toLowerCase();
    return facts.filter(
      (f) =>
        f.payload.content.toLowerCase().includes(search) ||
        f.payload.subjects?.some((s) => s.toLowerCase().includes(search))
    );
  }, [facts, factsSearch]);

  const loadCounts = async () => {
    try {
      const response = await fetch(`${serverUrl}/agent/brain/counts`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setCounts(data);
      }
    } catch (error) {
      console.error('[Brain] Failed to load counts:', error);
    }
  };

  const loadSelf = async () => {
    try {
      const response = await fetch(`${serverUrl}/agent/brain/self`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setSelfItems(data.items);
      }
    } catch (error) {
      console.error('[Brain] Failed to load self:', error);
    }
  };

  const loadGoals = async () => {
    try {
      const response = await fetch(`${serverUrl}/agent/brain/goals`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setGoalsItems(data.items);
      }
    } catch (error) {
      console.error('[Brain] Failed to load goals:', error);
    }
  };

  const loadFacts = async () => {
    try {
      const response = await fetch(`${serverUrl}/agent/brain/facts`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setFacts(data.items);
      }
    } catch (error) {
      console.error('[Brain] Failed to load facts:', error);
    }
  };

  const loadLive = async () => {
    try {
      const response = await fetch(`${serverUrl}/agent/brain/live`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setLiveCount(data.count);
        setLivePreview(data.preview);
      }
    } catch (error) {
      console.error('[Brain] Failed to load live:', error);
    }
  };

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([loadCounts(), loadSelf(), loadGoals(), loadFacts(), loadLive()]);
    } finally {
      setIsLoading(false);
    }
  };

  const runDigest = async () => {
    if (isDigesting) return;
    setIsDigesting(true);
    try {
      const response = await fetch(`${serverUrl}/admin/digest`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        // Reload all data after digest
        await loadAllData();
      }
    } catch (error) {
      console.error('[Brain] Digest failed:', error);
    } finally {
      setIsDigesting(false);
    }
  };

  const clearLive = async () => {
    try {
      const response = await fetch(`${serverUrl}/agent/brain/live`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        setLiveCount(0);
        setLivePreview([]);
        setCounts((prev) => ({ ...prev, live: 0 }));
      }
    } catch (error) {
      console.error('[Brain] Clear live failed:', error);
    }
  };

  const deleteLiveMessage = async (id: string) => {
    try {
      const response = await fetch(`${serverUrl}/agent/brain/live/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        setLivePreview((prev) => prev.filter((m) => m.id !== id));
        setLiveCount((prev) => prev - 1);
        setCounts((prev) => ({ ...prev, live: prev.live - 1 }));
      }
    } catch (error) {
      console.error('[Brain] Delete live message failed:', error);
    }
  };

  const deleteItem = async (type: 'self' | 'goals' | 'facts', id: string) => {
    try {
      const response = await fetch(`${serverUrl}/agent/brain/${type}/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        // Refresh data
        if (type === 'self') {
          setSelfItems((prev) => prev.filter((i) => i.id !== id));
          setCounts((prev) => ({ ...prev, self: prev.self - 1 }));
        } else if (type === 'goals') {
          setGoalsItems((prev) => prev.filter((i) => i.id !== id));
          setCounts((prev) => ({ ...prev, goals: prev.goals - 1 }));
        } else if (type === 'facts') {
          setFacts((prev) => prev.filter((i) => i.id !== id));
          setCounts((prev) => ({ ...prev, facts: prev.facts - 1 }));
        }
      }
    } catch (error) {
      console.error(`[Brain] Failed to delete ${type} item:`, error);
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Load data on mount
  useEffect(() => {
    loadAllData();
  }, [serverUrl]);

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderCategoryGroup = (
    category: string,
    items: MemoryItem[],
    displayName: string,
    type: 'self' | 'goals'
  ) => {
    const isExpanded = expandedCategories.has(category);

    return (
      <div key={category} className="category-group">
        <button className="category-header" onClick={() => toggleCategory(category)}>
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="category-name">{displayName}</span>
          <span className="category-count">({items.length})</span>
        </button>
        {isExpanded && (
          <div className="category-items">
            {items.map((item) => (
              <div key={item.id} className="brain-item">
                <div className="item-content">{item.payload.content}</div>
                <div className="item-meta">
                  <span className="item-date">{formatDate(item.payload.timestamp)}</span>
                  <button
                    className="item-delete"
                    onClick={() => deleteItem(type, item.id)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="brain-dashboard">
      {/* Header */}
      <div className="brain-header">
        <h3>Brain</h3>
        <button onClick={loadAllData} disabled={isLoading} title="Reload all data">
          <RefreshCw size={16} className={isLoading ? 'spinning' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="brain-tabs">
        <button
          className={`brain-tab ${activeTab === 'self' ? 'active' : ''}`}
          onClick={() => setActiveTab('self')}
        >
          Self ({counts.self})
        </button>
        <button
          className={`brain-tab ${activeTab === 'goals' ? 'active' : ''}`}
          onClick={() => setActiveTab('goals')}
        >
          Goals ({counts.goals})
        </button>
        <button
          className={`brain-tab ${activeTab === 'facts' ? 'active' : ''}`}
          onClick={() => setActiveTab('facts')}
        >
          Facts ({counts.facts})
        </button>
        <button
          className={`brain-tab ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => setActiveTab('live')}
        >
          Live ({counts.live})
        </button>
      </div>

      {/* Content */}
      <div className="brain-content">
        {activeTab === 'self' && (
          <div className="tab-content">
            <div className="facts-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search self..."
                value={selfSearch}
                onChange={(e) => setSelfSearch(e.target.value)}
              />
            </div>
            {Object.keys(SELF_CATEGORIES).map((category) => {
              const items = selfByCategory[category] || [];
              if (items.length === 0) return null;
              return renderCategoryGroup(category, items, SELF_CATEGORIES[category], 'self');
            })}
            {selfItems.length === 0 && (
              <div className="empty-state">No self items</div>
            )}
            {selfItems.length > 0 && Object.keys(selfByCategory).length === 0 && (
              <div className="empty-state">No matching items</div>
            )}
          </div>
        )}

        {activeTab === 'goals' && (
          <div className="tab-content">
            <div className="facts-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search goals..."
                value={goalsSearch}
                onChange={(e) => setGoalsSearch(e.target.value)}
              />
            </div>
            {Object.keys(GOAL_CATEGORIES).map((category) => {
              const items = goalsByCategory[category] || [];
              if (items.length === 0) return null;
              return renderCategoryGroup(category, items, GOAL_CATEGORIES[category], 'goals');
            })}
            {goalsItems.length === 0 && (
              <div className="empty-state">No goals</div>
            )}
            {goalsItems.length > 0 && Object.keys(goalsByCategory).length === 0 && (
              <div className="empty-state">No matching goals</div>
            )}
          </div>
        )}

        {activeTab === 'facts' && (
          <div className="tab-content">
            <div className="facts-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search facts..."
                value={factsSearch}
                onChange={(e) => setFactsSearch(e.target.value)}
              />
            </div>
            <div className="facts-list">
              {filteredFacts.map((item) => (
                <div key={item.id} className="brain-item fact-item">
                  <div className="item-content">{item.payload.content}</div>
                  <div className="item-meta">
                    {item.payload.subjects && item.payload.subjects.length > 0 && (
                      <span className="item-subjects">
                        {item.payload.subjects.join(', ')}
                      </span>
                    )}
                    <span className="item-date">{formatDate(item.payload.timestamp)}</span>
                    <button
                      className="item-delete"
                      onClick={() => deleteItem('facts', item.id)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {filteredFacts.length === 0 && (
                <div className="empty-state">
                  {factsSearch ? 'No matching facts' : 'No facts'}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'live' && (
          <div className="tab-content">
            <div className="live-stat">
              <span className="live-count">{liveCount}</span>
              <span className="live-label">messages waiting for digest</span>
              <div className="live-actions">
                <button
                  className="digest-button"
                  onClick={runDigest}
                  disabled={isDigesting || liveCount === 0}
                >
                  <Zap size={16} />
                  {isDigesting ? 'Digesting...' : 'Digest now'}
                </button>
                <button
                  className="clear-live-button"
                  onClick={clearLive}
                  disabled={liveCount === 0}
                >
                  <Trash2 size={16} />
                  Clear
                </button>
              </div>
            </div>
            {livePreview.length > 0 && (
              <div className="live-preview">
                <h4>Recent messages</h4>
                {livePreview.map((msg) => (
                  <div key={msg.id} className="preview-item">
                    <div className="preview-main">
                      <span className="preview-author">{msg.author}</span>
                      <span className="preview-content">{msg.content}</span>
                    </div>
                    <button
                      className="item-delete"
                      onClick={() => deleteLiveMessage(msg.id)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {liveCount === 0 && (
              <div className="empty-state">Live buffer is empty</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
