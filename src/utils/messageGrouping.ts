import { Message } from '../types';

export interface MessageGroupingFlags {
  isGroupedWithPrevious: boolean;
  isLastInGroup: boolean;
}

const ONE_MINUTE_MS = 60 * 1000;

/**
 * Check if two messages are from the same sender.
 * Uses senderId if available, otherwise compares sender ("me"/"them").
 */
function isSameSender(msg1: Message, msg2: Message): boolean {
  // If both have senderId, compare senderIds
  if (msg1.senderId && msg2.senderId) {
    return msg1.senderId === msg2.senderId;
  }
  // Otherwise, compare sender ("me" or "them")
  return msg1.sender === msg2.sender;
}

/**
 * Calculate grouping flags for a given message.
 * Used to display consecutive messages from the same user
 * as "attached bubbles" (without repeating avatar/name, timestamp on last).
 */
export function getMessageGroupingFlags(messages: Message[], index: number): MessageGroupingFlags {
  const msg = messages[index];
  const prev = index > 0 ? messages[index - 1] : null;
  const next = index < messages.length - 1 ? messages[index + 1] : null;

  // System messages are never grouped
  if (msg.isSystemMessage || msg.type === 'system') {
    return { isGroupedWithPrevious: false, isLastInGroup: true };
  }

  // Check if grouped with previous message
  // A message with reactions CAN group with previous (it just must be the last in group)
  // But we can't group after a message that has reactions (it must stay last)
  const isGroupedWithPrevious = prev !== null
    && !prev.isSystemMessage
    && prev.type !== 'system'
    && isSameSender(prev, msg)
    && (msg.timestamp.getTime() - prev.timestamp.getTime()) < ONE_MINUTE_MS
    && !hasMedia(msg)
    && !hasMedia(prev)
    && !hasReactions(prev);

  // Check if last message in group
  const isLastInGroup = next === null
    || next.isSystemMessage
    || next.type === 'system'
    || !isSameSender(msg, next)
    || (next.timestamp.getTime() - msg.timestamp.getTime()) >= ONE_MINUTE_MS
    || hasMedia(msg)
    || hasMedia(next)
    || hasReactions(msg);

  return { isGroupedWithPrevious, isLastInGroup };
}

export interface MessageGroup {
  senderId: string;
  senderName: string;
  sender: 'me' | 'them';
  messages: Message[];
  timestamp: Date;
}

/**
 * Check if a message contains media (image, audio, file).
 * Messages with media break the group.
 */
function hasMedia(msg: Message): boolean {
  return !!(msg.image || msg.audio || msg.fileUrl || msg.videoUrl);
}

/**
 * Check if a message has emoji reactions.
 * Messages with reactions break the group so reactions stay visible.
 */
function hasReactions(msg: Message): boolean {
  return !!(msg.reactions && msg.reactions.length > 0);
}

/**
 * Group consecutive messages from the same sender (< 1 min) into a single bubble.
 * System messages and messages with media break the group.
 */
export function groupConsecutiveMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentGroup: MessageGroup | null = null;

  for (const msg of messages) {
    // System messages are never grouped
    if (msg.isSystemMessage || msg.type === 'system') {
      if (currentGroup) {
        groups.push(currentGroup);
        currentGroup = null;
      }
      // System message as its own "group"
      groups.push({
        senderId: msg.senderId || '',
        senderName: msg.senderName || '',
        sender: msg.sender,
        messages: [msg],
        timestamp: msg.timestamp,
      });
      continue;
    }

    const lastMsgInGroup = currentGroup ? currentGroup.messages[currentGroup.messages.length - 1] : null;
    const timeDiffMs = lastMsgInGroup ? msg.timestamp.getTime() - lastMsgInGroup.timestamp.getTime() : 0;

    // Conditions to group:
    // - Same sender
    // - < 1 minute since last message in group
    // - Neither message has media
    // - Last message in group has no reactions (it must stay last to show its reactions)
    // Note: current msg CAN have reactions and still join the group (it becomes the new last)
    const shouldGroup =
      currentGroup &&
      lastMsgInGroup &&
      isSameSender(lastMsgInGroup, msg) &&
      timeDiffMs < ONE_MINUTE_MS &&
      !hasMedia(msg) &&
      !hasMedia(lastMsgInGroup) &&
      !hasReactions(lastMsgInGroup);

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
