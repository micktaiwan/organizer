import React from "react";
import { X } from "lucide-react";
import "./InfoPanel.css";

export interface InfoItem {
  label: string;
  value: string | React.ReactNode;
  highlight?: "green" | "orange" | "red" | "blue" | "yellow";
  mono?: boolean;
}

export interface InfoSection {
  title: string;
  items: InfoItem[];
  headerContent?: React.ReactNode;
}

interface InfoPanelProps {
  title: string;
  sections: InfoSection[];
  onClose: () => void;
  loading?: boolean;
  error?: string;
  className?: string;
  headerContent?: React.ReactNode;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
  title,
  sections,
  onClose,
  loading,
  error,
  className,
  headerContent,
}) => {
  return (
    <div className={`info-panel ${className || ''}`}>
      <div className="info-panel-header">
        <span>{title}</span>
        <button onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      {headerContent && (
        <div className="info-panel-header-content">
          {headerContent}
        </div>
      )}
      <div className="info-panel-content">
        {loading && (
          <div className="info-panel-loading">Loading...</div>
        )}
        {error && (
          <div className="info-panel-error">{error}</div>
        )}
        {!loading && !error && sections.map((section, idx) => (
          <div key={idx} className="info-panel-section">
            <div className="info-panel-section-title">{section.title}</div>
            {section.headerContent}
            {section.items.map((item, itemIdx) => (
              <div
                key={itemIdx}
                className={`info-panel-row ${item.highlight ? `highlight-${item.highlight}` : ""}`}
              >
                <span className="info-panel-label">{item.label}</span>
                <span className={`info-panel-value ${item.mono ? "mono" : ""}`}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
