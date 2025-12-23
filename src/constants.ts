// Storage keys differ between dev and prod to avoid conflicts
const STORAGE_PREFIX = import.meta.env.DEV ? "dev_" : "";

export const STORAGE_KEYS = {
  username: `${STORAGE_PREFIX}username`,
  lastPeerId: `${STORAGE_PREFIX}lastPeerId`,
  contacts: `${STORAGE_PREFIX}contacts`,
};

export const EMOJI_MAP: Record<string, string> = {
  ':)': '😊',
  ':-)': '😊',
  ':(': '😢',
  ':-(': '😢',
  ':D': '😃',
  ':-D': '😃',
  ':P': '😛',
  ':-P': '😛',
  ':p': '😛',
  ';)': '😉',
  ';-)': '😉',
  '<3': '❤️',
  ':o': '😮',
  ':O': '😮',
  ':/': '😕',
  ':-/': '😕',
  'xD': '😆',
  'XD': '😆',
  ':*': '😘',
  ':-*': '😘',
  '>:(': '😠',
  ":'(": '😢',
  'B)': '😎',
  'B-)': '😎',
  'o:)': '😇',
  'O:)': '😇',
  ':3': '😺',
  '</3': '💔',
  '<33': '💕',
  ':+1:': '👍',
  ':-1:': '👎',
  ':ok:': '👌',
  ':wave:': '👋',
  ':clap:': '👏',
  ':fire:': '🔥',
  ':100:': '💯',
};

