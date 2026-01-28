import { MessageCircle, StickyNote, Images, Bug, Settings } from "lucide-react";

export type AppTab = 'chat' | 'notes' | 'gallery' | 'pet' | 'settings';

interface AppTabsNavigationProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const tabs: { id: AppTab; label: string; icon: typeof MessageCircle }[] = [
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'pet', label: 'Eko', icon: Bug },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function AppTabsNavigation({ activeTab, onTabChange }: AppTabsNavigationProps) {
  const activeIndex = tabs.findIndex(t => t.id === activeTab);

  return (
    <div className="app-tabs">
      <div className="app-tabs-track">
        {/* Sliding pill indicator */}
        <div
          className="app-tabs-indicator"
          style={{
            transform: `translateX(${activeIndex * 100}%)`,
            width: `${100 / tabs.length}%`
          }}
        />

        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              className={`app-tab ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
