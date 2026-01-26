import { RefObject } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'pet' | 'system';
  content: string;
  expression?: string;
  timestamp: Date;
}

export type MessageGroup =
  | { type: 'single'; message: Message }
  | { type: 'system-group'; messages: Message[]; id: string };

interface EkoChatMessagesProps {
  groupedMessages: MessageGroup[];
  isLoading: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}

export function EkoChatMessages({ groupedMessages, isLoading, messagesEndRef }: EkoChatMessagesProps) {
  return (
    <div className="pet-debug-messages">
      {groupedMessages.map(group => {
        if (group.type === 'single') {
          const msg = group.message;
          return (
            <div key={msg.id} className={`debug-message ${msg.role}`}>
              <div className="message-header">
                <span className="role">
                  {msg.role === 'user' ? 'You' : msg.role === 'pet' ? 'Eko' : 'System'}
                </span>
                {msg.expression && (
                  <span className="expression">{msg.expression}</span>
                )}
                <span className="time">
                  {msg.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="message-content">{msg.content}</div>
            </div>
          );
        } else {
          // System group - single bubble with all messages
          const lastMsg = group.messages[group.messages.length - 1];
          return (
            <div key={group.id} className="debug-message system">
              <div className="message-header">
                <span className="role">System</span>
                <span className="time">
                  {lastMsg.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="message-content">
                {group.messages.map((msg, idx) => (
                  <div key={msg.id} className={idx > 0 ? 'grouped-line' : ''}>
                    {msg.content}
                  </div>
                ))}
              </div>
            </div>
          );
        }
      })}
      {isLoading && (
        <div className="debug-message pet loading">
          <div className="message-content">...</div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
