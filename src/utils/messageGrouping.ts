import { Message } from '../types';

export interface MessageGroupingFlags {
  isGroupedWithPrevious: boolean;
  isLastInGroup: boolean;
}

const ONE_MINUTE_MS = 60 * 1000;

/**
 * Vérifie si deux messages sont du même expéditeur.
 * Utilise senderId si disponible, sinon compare sender ("me"/"them").
 */
function isSameSender(msg1: Message, msg2: Message): boolean {
  // Si les deux ont un senderId, on compare les senderId
  if (msg1.senderId && msg2.senderId) {
    return msg1.senderId === msg2.senderId;
  }
  // Sinon, on compare sender ("me" ou "them")
  return msg1.sender === msg2.sender;
}

/**
 * Calcule les flags de groupement pour un message donné.
 * Utilisé pour afficher les messages consécutifs du même utilisateur
 * en "bulles collées" (sans répéter avatar/nom, timestamp sur le dernier).
 */
export function getMessageGroupingFlags(messages: Message[], index: number): MessageGroupingFlags {
  const msg = messages[index];
  const prev = index > 0 ? messages[index - 1] : null;
  const next = index < messages.length - 1 ? messages[index + 1] : null;

  // System messages jamais groupés
  if (msg.isSystemMessage || msg.type === 'system') {
    return { isGroupedWithPrevious: false, isLastInGroup: true };
  }

  // Vérifie si groupé avec le message précédent
  const isGroupedWithPrevious = prev !== null
    && !prev.isSystemMessage
    && prev.type !== 'system'
    && isSameSender(prev, msg)
    && (msg.timestamp.getTime() - prev.timestamp.getTime()) < ONE_MINUTE_MS;

  // Vérifie si dernier du groupe
  const isLastInGroup = next === null
    || next.isSystemMessage
    || next.type === 'system'
    || !isSameSender(msg, next)
    || (next.timestamp.getTime() - msg.timestamp.getTime()) >= ONE_MINUTE_MS;

  return { isGroupedWithPrevious, isLastInGroup };
}

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
