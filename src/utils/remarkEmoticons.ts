import { findAndReplace } from 'mdast-util-find-and-replace';
import type { Root } from 'mdast';
import { gemoji } from 'gemoji';

// Build shortcode map from gemoji database (name → emoji)
const SHORTCODE_MAP = new Map<string, string>();
for (const entry of gemoji) {
  for (const name of entry.names) {
    SHORTCODE_MAP.set(name, entry.emoji);
  }
}

// Match :shortcode (single colon, no closing colon)
// - preceded by start of string or whitespace
// - followed by end of string, whitespace, or punctuation
const SHORTCODE_REGEX = new RegExp(
  "(?<=^|\\s):([a-z0-9_+-]+)(?=$|\\s|[.,!?;:\\])\"'()])",
  'g'
);

const EMOTICON_MAP: Record<string, string> = {
  ':-)': '😊',
  ':)': '😊',
  ':-(': '😞',
  ':(': '😞',
  ':-D': '😃',
  ':D': '😃',
  ':-d': '😃',
  ':d': '😃',
  ':-P': '😛',
  ':P': '😛',
  ':-p': '😛',
  ':p': '😛',
  ':-/': '😕',
  ':/': '😕',
  ':-O': '😮',
  ':O': '😮',
  ':-o': '😮',
  ':o': '😮',
  ':-*': '😘',
  ':*': '😘',
  ';-)': '😉',
  ';)': '😉',
  'B-)': '😎',
  'B)': '😎',
  '<3': '❤️',
  'xD': '😆',
  'XD': '😆',
  'xd': '😆',
  ':xD': '😆',
  ':XD': '😆',
  ':xd': '😆',
  '^^': '😊',
  'Xd': '😆',
  '=)': '😊',
  '=D': '😃',
  '=d': '😃',
  '=(': '😞',
  '=/': '😕',
  '=P': '😛',
  '=p': '😛',
  '=O': '😮',
  '=o': '😮',
  ":'(": '😢',
  ":'-(": '😢',
  ':-|': '😐',
  ':|': '😐',
  '-_-': '😑',
  '>:(': '😠',
  '>:-(': '😠',
  'o_o': '😳',
  'O_O': '😳',
  '</3': '💔',
  'b-)': '😎',
  'b)': '😎',
  ':-]': '😊',
  ':]': '😊',
  ':-[': '😞',
  ':[': '😞',
  'lol': 'lol 😆',
  'LOL': 'LOL 😆',
  'Lol': 'Lol 😆',
  'mdr': 'mdr 😆',
  'MDR': 'MDR 😆',
  'Mdr': 'Mdr 😆',
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Sort longest first to match :-)  before :)
const sortedKeys = Object.keys(EMOTICON_MAP).sort((a, b) => b.length - a.length);
const pattern = sortedKeys.map(escapeRegex).join('|');

// Match emoticons only at word boundaries:
// - preceded by start of string or whitespace
// - followed by end of string, whitespace, or common punctuation
const EMOTICON_REGEX = new RegExp(
  `(?<=^|\\s)(?:${pattern})(?=$|\\s|[.,!?;:\\])"'])`,
  'g'
);

export function remarkEmoticons() {
  return (tree: Root) => {
    // First pass: classic emoticons (:) :D xD etc.)
    findAndReplace(tree, [
      EMOTICON_REGEX,
      (match: string) => EMOTICON_MAP[match] || match,
    ]);
    // Second pass: shortcodes (:muscle :pray :fire etc.)
    findAndReplace(tree, [
      SHORTCODE_REGEX,
      (_match: string, name: string) => {
        const emoji = SHORTCODE_MAP.get(name);
        return emoji || _match;
      },
    ]);
  };
}
