import React from 'react';
import { Box, Text } from 'ink';
import { Message as MessageType, User, getUserId } from '../types.js';

interface Props {
  message: MessageType;
  currentUserId: string;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function getSenderName(sender: string | User): string {
  if (typeof sender === 'string') {
    return sender;
  }
  return sender.displayName || sender.username;
}

function getSenderId(sender: string | User): string {
  return getUserId(sender);
}

export function Message({ message, currentUserId }: Props) {
  const isMe = getSenderId(message.senderId) === currentUserId;
  const senderName = isMe ? 'You' : getSenderName(message.senderId);
  const time = formatTime(message.createdAt);

  // System messages
  if (message.type === 'system') {
    return (
      <Box>
        <Text color="gray" italic>
          [{time}] {message.content}
        </Text>
      </Box>
    );
  }

  // File/image/video messages
  let content = message.content;
  if (message.type === 'image') {
    content = `[Image${message.caption ? `: ${message.caption}` : ''}]`;
  } else if (message.type === 'file') {
    content = `[File: ${message.fileName || 'unknown'}]`;
  } else if (message.type === 'video') {
    content = `[Video${message.caption ? `: ${message.caption}` : ''}]`;
  } else if (message.type === 'audio') {
    content = '[Audio message]';
  }

  return (
    <Box>
      <Text color="gray">[{time}] </Text>
      <Text color={isMe ? 'cyan' : 'yellow'} bold>
        {senderName}
      </Text>
      <Text>: {content}</Text>
      {message.reactions && message.reactions.length > 0 && (
        <Text color="gray">
          {' '}
          {message.reactions.map((r) => r.emoji).join('')}
        </Text>
      )}
    </Box>
  );
}
