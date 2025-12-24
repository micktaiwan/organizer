import { Message } from '../types';

export interface MessageGroup {
  senderId: string;
  senderName: string;
  sender: 'me' | 'them';
  messages: Message[];
  timestamp: Date;
}

export function groupConsecutiveMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentGroup: MessageGroup | null = null;

  for (const msg of messages) {
    const timeDiffMs = currentGroup ? msg.timestamp.getTime() - currentGroup.timestamp.getTime() : 0;
    const fiveMinutesMs = 5 * 60 * 1000;

    const shouldGroup =
      currentGroup &&
      currentGroup.senderId === msg.senderId &&
      currentGroup.sender === msg.sender &&
      timeDiffMs < fiveMinutesMs;

    if (shouldGroup && currentGroup) {
      currentGroup.messages.push(msg);
    } else {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = {
        senderId: msg.senderId || '',
        senderName: msg.senderName || (msg.sender === 'me' ? 'You' : 'User'),
        sender: msg.sender,
        messages: [msg],
        timestamp: msg.timestamp,
      };
    }
  }

  if (currentGroup) groups.push(currentGroup);
  return groups;
}
