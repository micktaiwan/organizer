import { EMOJI_MAP } from "../constants";

export const convertEmojis = (text: string): string => {
  let result = text;
  // Sort by length descending to match longer patterns first (e.g., </3 before <3)
  const sortedKeys = Object.keys(EMOJI_MAP).sort((a, b) => b.length - a.length);
  for (const shortcut of sortedKeys) {
    const escapedShortcut = shortcut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedShortcut, 'g');
    result = result.replace(regex, EMOJI_MAP[shortcut]);
  }
  return result;
};

