import { useState, useRef, useEffect, useLayoutEffect, ReactNode } from "react";
import "./Tooltip.css";

type TooltipPosition = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: TooltipPosition;
  delay?: number;
  disabled?: boolean;
}

export function Tooltip({ content, children, position = "top", delay = 150, disabled = false }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [offset, setOffset] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const showTooltip = () => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setVisible(false);
    setReady(false);
    setOffset(0);
  };

  useEffect(() => {
    if (disabled) hideTooltip();
  }, [disabled]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!visible || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();
    const padding = 8;

    if (position === "top" || position === "bottom") {
      if (rect.left < padding) {
        setOffset(-rect.left + padding);
      } else if (rect.right > window.innerWidth - padding) {
        setOffset(window.innerWidth - padding - rect.right);
      }
    }

    setReady(true);
  }, [visible, position]);

  return (
    <div
      ref={containerRef}
      className="tooltip-container"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      {children}
      {visible && (
        <div
          ref={tooltipRef}
          className={`tooltip tooltip-${position}${ready ? ' tooltip-ready' : ''}`}
          style={{ '--tooltip-offset': `${offset}px` } as React.CSSProperties}
        >
          {content}
        </div>
      )}
    </div>
  );
}
