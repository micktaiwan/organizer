---
name: refactor
description: Safe, incremental refactoring - extract components one by one with build validation
---

# Refactor Skill

## Overview

This skill performs safe, incremental refactoring of large files by extracting components/hooks one at a time. Each extraction is validated with a build before proposing the next.

**Philosophy**: No logic changes, only mechanical extraction. If it compiles and works the same, it's a valid refactor.

## Optional Arguments

```
/refactor                     # Analyze and start refactoring
/refactor src/App.tsx         # Focus on a specific file
/refactor hooks                # Focus on hooks only
/refactor continue            # Resume after user validation
```

## Instructions

### Step 1: Analyze File Lengths

Run analysis on the target directory (default: `src/`):

```bash
find src -type f \( -name "*.ts" -o -name "*.tsx" \) | xargs wc -l | sort -rn | head -40
```

Display summary:
- Total lines
- Files over 500 lines (candidates for refactoring)
- Breakdown by folder (components, hooks, services, contexts, utils)

### Step 2: Prioritize Files

**Prioritize by extraction safety, NOT by modification frequency.**

| Priority | Criteria | Why |
|----------|----------|-----|
| 🟢 High | Isolated modules (debug panels, admin, standalone features) | Low coupling, easy to extract |
| 🟡 Medium | UI components with clear boundaries | Usually safe, some prop drilling |
| 🔴 Low | Core hooks, contexts, services | High coupling, effects dependencies |

**What to extract first:**
1. Pure UI components (JSX with no complex state)
2. Isolated feature modules (PetDebug, Notes, Admin)
3. Utility functions

**What to extract last:**
1. Hooks with multiple useEffects (order matters)
2. Context providers (used everywhere)
3. Core services (socket, api)

### Step 3: Propose One Extraction

For each proposed extraction, provide:

```
## Proposition N: ComponentName

**Lignes**: 42-87 (45 lignes)
**Description**: Brief description of what this component does

**Code extrait**:
- JSX block doing X
- Related handlers (if any)

**Nouveau fichier**: src/components/ComponentName.tsx

**Props**:
- propA: type - description
- propB: type - description

**Utilisé**: List all usage locations (usually just 1)

**Risque**: Quasi nul / Faible / Moyen
- Explain why

On y va ?
```

### Step 4: Wait for User Validation

**STOP and wait for user confirmation before extracting.**

Do not proceed until the user says "oui", "ok", "go", "yes", or similar.

If user says "skip" or "next", propose the next extraction without doing this one.

### Step 5: Extract Component

Perform the extraction:

1. **Create new file** with the extracted component/hook
   - Include all necessary imports
   - Export the component/hook and any types
   - Keep the exact same logic (copy-paste, don't rewrite)

2. **Update original file**
   - Add import for the new component
   - Replace inline code with component usage
   - Remove now-unused imports from original file

3. **Build validation**
   ```bash
   npm run build 2>&1 | tail -20
   ```

4. **Report result**
   ```
   ✅ Build OK
   **FileName.tsx**: 962 → 941 lignes (-21)

   Tu peux tester manuellement. Quand c'est bon, dis-moi et je propose le suivant.
   ```

If build fails:
```
❌ Build failed
[Error message]

Je reverts les changements...
```

### Step 6: Loop

After user confirms the extraction works:
1. Go back to Step 3
2. Propose the next extraction from the same file
3. When file is reasonably sized (<400 lines) or no more safe extractions, move to next file

## Extraction Patterns

### Pattern A: UI Component Extraction

**Before** (in App.tsx):
```tsx
<div className="sidebar">
  <h2>Title</h2>
  {items.map(item => <Item key={item.id} {...item} />)}
</div>
```

**After**:
```tsx
// New file: Sidebar.tsx
interface SidebarProps {
  items: Item[];
}
export function Sidebar({ items }: SidebarProps) {
  return (
    <div className="sidebar">
      <h2>Title</h2>
      {items.map(item => <Item key={item.id} {...item} />)}
    </div>
  );
}

// In App.tsx
<Sidebar items={items} />
```

### Pattern B: Handler Group Extraction

When multiple handlers are related (e.g., video recording):

**Before**:
```tsx
const handleStartVideo = () => { ... };
const handleStopVideo = () => { ... };
const handleSendVideo = () => { ... };
```

**After**: Create a custom hook
```tsx
// useVideoHandlers.ts
export function useVideoHandlers(deps) {
  const handleStart = () => { ... };
  const handleStop = () => { ... };
  const handleSend = () => { ... };
  return { handleStart, handleStop, handleSend };
}
```

### Pattern C: Type Extraction

When a file has many inline types:

```tsx
// types/notes.ts
export interface Note { ... }
export interface Label { ... }
export type NoteView = 'list' | 'editor' | 'labels';
```

## Rules

### DO
- Copy-paste code exactly as-is
- Preserve all comments
- Keep function signatures identical
- Run build after each extraction
- Wait for user validation

### DON'T
- Change any logic while extracting
- "Improve" or "clean up" code during refactor
- Rename variables or functions
- Change the order of useEffects
- Extract hooks with complex effect dependencies
- Combine multiple extractions in one step

## Recovery

If a build fails after extraction:

1. Identify the error
2. If simple fix (missing import, typo): fix it
3. If complex: revert changes with `git checkout -- <files>`
4. Report what went wrong
5. Propose a different extraction or skip this one

## Completion

When a file reaches a reasonable size or has no more safe extractions:

```
✅ Refactoring de App.tsx terminé

**Résultat**: 962 → 650 lignes (-312, -32%)

**Composants extraits**:
1. AppTabsNavigation (35 lignes)
2. ChatTabContent (120 lignes)
3. NotesTabContent (85 lignes)
...

Prochain fichier à refactorer ?
```
