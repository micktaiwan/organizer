import { MessageCircle, StickyNote, Bug, Settings } from "lucide-react";

export type AppTab = 'chat' | 'notes' | 'pet' | 'settings';

interface AppTabsNavigationProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export function AppTabsNavigation({ activeTab, onTabChange }: AppTabsNavigationProps) {
  return (
    <div className="app-tabs">
      <button
        className={`app-tab ${activeTab === 'chat' ? 'active' : ''}`}
        onClick={() => onTabChange('chat')}
      >
        <MessageCircle size={18} />
        <span>Chat</span>
      </button>
      <button
        className={`app-tab ${activeTab === 'notes' ? 'active' : ''}`}
        onClick={() => onTabChange('notes')}
      >
        <StickyNote size={18} />
        <span>Notes</span>
      </button>
      <button
        className={`app-tab ${activeTab === 'pet' ? 'active' : ''}`}
        onClick={() => onTabChange('pet')}
      >
        <Bug size={18} />
        <span>Eko</span>
      </button>
      <button
        className={`app-tab ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
      >
        <Settings size={18} />
        <span>Settings</span>
      </button>
    </div>
  );
}
