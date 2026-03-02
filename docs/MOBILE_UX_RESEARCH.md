# Mobile UX Research Report — Mission-Claw Dashboard

> **Prepared:** 2026-03-02  
> **Scope:** `/srv/projects/personal/mission-control/src/`  
> **Goal:** Make Mission-Claw usable on phones without a full redesign

---

## Section 1: Current Pain Points

### 1.1 Main Layout — `src/app/workspace/[slug]/page.tsx`

**Issue:** The layout is `h-screen flex flex-col` with a `flex-1 flex overflow-hidden` row containing **three fixed side-by-side panels** (AgentsSidebar + MissionQueue + LiveFeed). There are **zero responsive breakpoints**. On a 390px iPhone screen, all three panels render simultaneously, making all content illegible.

```tsx
// Current — no mobile handling at all
<div className="flex-1 flex overflow-hidden">
  <AgentsSidebar workspaceId={workspace.id} />  {/* w-64 */}
  <MissionQueue workspaceId={workspace.id} />   {/* flex-1 */}
  <LiveFeed />                                   {/* w-80 */}
</div>
```

**Effect:** The Kanban board (main content) gets squished to nearly 0px width on mobile. Unusable.

---

### 1.2 Header — `src/components/Header.tsx`

**Issues:**
- Fixed `h-14` with 3 horizontal sections (logo/workspace, stats, time+status+settings)
- Center stats section shows two `text-2xl` number blocks — these will overlap logo on screens < 640px
- `format(currentTime, 'HH:mm:ss')` clock visible on mobile eats precious header space
- No hamburger menu / mobile nav trigger
- Workspace name badge + breadcrumb can be ~200px wide

**Effect:** Header overflows at ~500px screen width. Logo, workspace name, agent count, task count, time, status badge, and settings icon all compete for ~390px of space.

---

### 1.3 AgentsSidebar — `src/components/AgentsSidebar.tsx`

**Issues:**
- Always rendered, takes `w-64` (256px) or `w-12` (48px) minimized
- No overlay/drawer behavior — it doesn't slide over content, it pushes it
- Minimize toggle (`isMinimized` state) reduces to 48px icon-only, but **still takes screen real estate** on mobile
- No way to fully hide it on mobile without code changes
- Agent filter tabs ("all / working / standby"), sub-agent counter, and "Import from Gateway" button all become useless noise below ~600px

**Effect:** Sidebar consumes 12-65% of mobile screen width, leaving almost nothing for the Kanban board.

---

### 1.4 MissionQueue / Kanban Board — `src/components/MissionQueue.tsx`

**Issues:**
- 7 columns rendered side-by-side with `flex gap-3 overflow-x-auto`
- Each column: `min-w-[220px] max-w-[300px]` — total minimum width = **7 × 220px = 1,540px**
- `overflow-x-auto` technically allows scrolling, but with AgentsSidebar and LiveFeed also present, the actual scroll area is tiny and confusing
- Drag-and-drop (`onDragStart`, `onDrop`) is **desktop-only** — doesn't work on touch devices
- No touch-based column switching or swipe gestures

**Effect:** Main content area is ~1,540px wide on a 390px screen. Even with scrolling, it's a disaster. Drag-and-drop is completely non-functional on phones.

---

### 1.5 LiveFeed — `src/components/LiveFeed.tsx`

**Issues:**
- Fixed right panel: `w-80` (320px) or `w-12` (48px) minimized
- Same problem as AgentsSidebar — always rendered, always takes space
- On mobile, this is almost always below the fold horizontally
- Cannot be dismissed or accessed via bottom sheet

**Effect:** Invisible or inaccessible on mobile. Takes 320px of space the Kanban desperately needs.

---

### 1.6 TaskModal — `src/components/TaskModal.tsx`

**Issues:**
- Modal renders as a fixed overlay — likely `fixed inset-0` or similar
- Contains 5 tabs (overview, planning, activity, deliverables, sessions)
- Tab bar + content area may overflow on small screens
- Text areas for soul_md, user_md, agents_md fields are desktop-sized
- No bottom sheet pattern — modal opens in the center with a backdrop

**Effect:** Modal is probably usable on mobile (overlays entire screen), but the tab navigation and form elements may be cramped and hard to tap.

---

### 1.7 Zero Responsive Tailwind Classes in Core Components

Running `grep -rn "sm:\|md:\|lg:\|xl:"` across all components finds **only one hit**: `WorkspaceDashboard.tsx` (the workspace list page uses `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`). 

Every workspace-interior component (Header, AgentsSidebar, MissionQueue, LiveFeed, TaskModal) has **no mobile breakpoints whatsoever**.

---

## Section 2: Recommended Fixes (Ranked by Impact/Effort)

| Priority | Change | File(s) | Impact | Effort |
|----------|--------|---------|--------|--------|
| **P1** | Mobile layout: hide sidebars, show bottom nav | `workspace/[slug]/page.tsx`, `AgentsSidebar.tsx`, `LiveFeed.tsx` | 🔴 Critical | ~3h |
| **P2** | Kanban: horizontal scroll with snap, or vertical list on mobile | `MissionQueue.tsx` | 🔴 Critical | ~2h |
| **P3** | Header: collapse stats + time on mobile, add hamburger | `Header.tsx` | 🟠 High | ~1h |
| **P4** | Touch drag-and-drop for Kanban cards | `MissionQueue.tsx` | 🟠 High | ~3h |
| **P5** | TaskModal: full-screen bottom sheet on mobile | `TaskModal.tsx` | 🟡 Medium | ~2h |
| **P6** | AgentsSidebar: convert to mobile drawer/sheet | `AgentsSidebar.tsx` | 🟡 Medium | ~2h |
| **P7** | LiveFeed: convert to bottom sheet on mobile | `LiveFeed.tsx` | 🟡 Medium | ~1h |
| **P8** | Touch-friendly card sizes (min 44px tap targets) | All card components | 🟢 Low | ~1h |

---

### P1 — Mobile Layout with Bottom Navigation

**Pattern:** On `< md` screens, hide both sidebars and render a bottom tab bar. Users switch between "Queue", "Agents", and "Feed" views via tabs.

```tsx
// workspace/[slug]/page.tsx
<div className="h-screen flex flex-col bg-mc-bg overflow-hidden">
  <Header workspace={workspace} />

  <div className="flex-1 flex overflow-hidden">
    {/* Sidebars: hidden on mobile, visible on md+ */}
    <div className="hidden md:flex">
      <AgentsSidebar workspaceId={workspace.id} />
    </div>

    {/* Main content: always visible, but conditionally rendered on mobile */}
    <div className={`flex-1 overflow-hidden ${mobileTab !== 'queue' ? 'hidden md:flex' : 'flex'}`}>
      <MissionQueue workspaceId={workspace.id} />
    </div>

    <div className={`hidden md:flex`}>
      <LiveFeed />
    </div>

    {/* Mobile-only panels */}
    <div className={`flex-1 overflow-hidden md:hidden ${mobileTab === 'agents' ? 'flex' : 'hidden'}`}>
      <AgentsSidebar workspaceId={workspace.id} mobileMode />
    </div>
    <div className={`flex-1 overflow-hidden md:hidden ${mobileTab === 'feed' ? 'flex' : 'hidden'}`}>
      <LiveFeed mobileMode />
    </div>
  </div>

  {/* Mobile bottom navigation */}
  <nav className="md:hidden flex border-t border-mc-border bg-mc-bg-secondary">
    {[
      { id: 'queue', icon: <LayoutGrid />, label: 'Queue' },
      { id: 'agents', icon: <Users />, label: 'Agents' },
      { id: 'feed', icon: <Activity />, label: 'Feed' },
    ].map(tab => (
      <button
        key={tab.id}
        onClick={() => setMobileTab(tab.id)}
        className={`flex-1 flex flex-col items-center py-2 gap-1 text-xs ${
          mobileTab === tab.id ? 'text-mc-accent' : 'text-mc-text-secondary'
        }`}
      >
        {tab.icon}
        {tab.label}
      </button>
    ))}
  </nav>
</div>
```

---

### P2 — Kanban: Scroll-Snap on Mobile

On mobile, replace the 7-column horizontal overflow with a **single-column scroll-snap** view that shows one column at a time:

```tsx
// MissionQueue.tsx — Kanban columns wrapper
<div className={`
  flex-1 flex gap-3 p-3
  /* Mobile: single column with snap */
  overflow-x-auto snap-x snap-mandatory
  /* Desktop: normal horizontal scroll */
  md:overflow-x-auto
`}>
  {COLUMNS.map((column) => (
    <div
      key={column.id}
      className={`
        /* Mobile: full-width snap */
        snap-start shrink-0 w-[85vw]
        /* Desktop: normal column sizing */
        md:flex-1 md:min-w-[220px] md:max-w-[300px]
        flex flex-col bg-mc-bg rounded-lg border border-mc-border/50 border-t-2 ${column.color}
      `}
    >
      ...
    </div>
  ))}
</div>
```

Add a column indicator strip above showing which column you're viewing.

---

### P3 — Header: Collapse on Mobile

```tsx
// Header.tsx
<header className="h-14 bg-mc-bg-secondary border-b border-mc-border flex items-center justify-between px-4">
  {/* Logo — always visible */}
  <div className="flex items-center gap-2">
    <Zap className="w-5 h-5 text-mc-accent-cyan" />
    <span className="font-semibold text-mc-text uppercase tracking-wider text-sm hidden sm:block">
      Mission Control
    </span>
    {workspace && (
      <div className="flex items-center gap-1 ml-2">
        <span className="text-lg">{workspace.icon}</span>
        <span className="font-medium text-sm hidden sm:block">{workspace.name}</span>
      </div>
    )}
  </div>

  {/* Stats — hidden on mobile */}
  {workspace && (
    <div className="hidden md:flex items-center gap-8">
      ...stats...
    </div>
  )}

  {/* Right side — simplified on mobile */}
  <div className="flex items-center gap-2">
    {/* Status badge — always visible but compact on mobile */}
    <div className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium ${...}`}>
      <span className={`w-2 h-2 rounded-full ${...}`} />
      <span className="hidden sm:inline">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
    </div>
    {/* Clock — hidden on mobile */}
    <span className="hidden md:block text-mc-text-secondary text-sm font-mono">
      {format(currentTime, 'HH:mm:ss')}
    </span>
    <button onClick={() => router.push('/settings')} className="p-2 ...">
      <Settings className="w-5 h-5" />
    </button>
  </div>
</header>
```

---

### P4 — Touch Drag-and-Drop

Replace native HTML drag with `@dnd-kit/core` which supports both mouse and touch:

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

```tsx
import { DndContext, TouchSensor, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';

const sensors = useSensors(
  useSensor(MouseSensor),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 }, // prevents accidental drags on scroll
  })
);

<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
  ...columns...
</DndContext>
```

---

### P5 — TaskModal: Bottom Sheet on Mobile

```tsx
// TaskModal.tsx — wrap the modal
<div className={`
  fixed inset-0 z-50 flex
  /* Mobile: bottom sheet */
  items-end
  /* Desktop: centered modal */
  md:items-center md:justify-center
`}>
  <div className={`
    bg-mc-bg-secondary w-full
    /* Mobile: bottom sheet style */
    rounded-t-2xl max-h-[90vh] overflow-y-auto
    /* Desktop: centered modal */
    md:rounded-lg md:max-w-2xl md:max-h-[85vh]
  `}>
    {/* Drag handle — mobile only */}
    <div className="md:hidden flex justify-center pt-3 pb-1">
      <div className="w-10 h-1 bg-mc-border rounded-full" />
    </div>
    ...modal content...
  </div>
</div>
```

---

## Section 3: Patterns from Reference Apps

### Linear
- **Mobile:** Shows a task list (not Kanban) on mobile. Kanban view is desktop-only. Tapping a task opens a full-screen detail sheet.
- **Navigation:** Bottom tab bar with: Inbox, My Issues, Projects, Settings.
- **Sidebar:** Completely hidden on mobile, accessible via swipe-from-left gesture or hamburger.
- **Key steal:** Don't try to show a Kanban on mobile — offer a **list view** as the default mobile experience with a "View: List | Board" toggle.

### GitHub Projects
- **Mobile:** Single column list view. No Kanban visible at all on mobile.
- **Cards:** Large tap targets (full-width rows), swipe-to-reveal actions (close, assign).
- **Key steal:** Swipe actions on task cards for quick status changes without opening the modal.

### Notion
- **Mobile:** Full-screen database views with one column at a time. Board view shows one status column with horizontal swipe to move between columns.
- **Navigation:** Bottom drawer for workspace navigation, full-screen modals for page editing.
- **Key steal:** The **scroll-snap single-column Kanban** with a column indicator strip at the top is the gold standard for Kanban on mobile.

### Common Patterns Across All Three
1. **Bottom tab bars** (not top sidebars) for primary navigation on mobile
2. **Full-screen overlays** for detail views (no tiny centered modals)
3. **44px minimum tap target** for all interactive elements
4. **Simplified headers** — just logo + status on mobile, full stats on desktop
5. **List-first mobile** — Kanban is a power-user/desktop feature; list is the mobile default

---

## Section 4: Quick Wins (< 1 hour each)

### QW1 — Hide LiveFeed on Mobile (15 min)
Add `hidden md:flex` to the LiveFeed wrapper in `workspace/[slug]/page.tsx`. Immediately frees up 320px on mobile.

```tsx
<div className="hidden md:flex">
  <LiveFeed />
</div>
```

### QW2 — Auto-Minimize AgentsSidebar on Mobile (20 min)
Use a `useEffect` to detect small screen and auto-set `isMinimized = true`:

```tsx
// AgentsSidebar.tsx
useEffect(() => {
  const handleResize = () => {
    if (window.innerWidth < 768) setIsMinimized(true);
  };
  handleResize();
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

### QW3 — Header Stats: Hide on Mobile (20 min)
Wrap center stats in `hidden md:flex`:

```tsx
{workspace && (
  <div className="hidden md:flex items-center gap-8">
    ...stats...
  </div>
)}
```

### QW4 — Hide Clock on Mobile (5 min)
```tsx
<span className="hidden sm:block text-mc-text-secondary text-sm font-mono">
  {format(currentTime, 'HH:mm:ss')}
</span>
```

### QW5 — Kanban Scroll-Snap (30 min)
Add `snap-x snap-mandatory` to the kanban container and `snap-start w-[85vw]` to each column on mobile. No JS required — pure CSS.

### QW6 — Viewport Meta Tag (5 min)
Verify `src/app/layout.tsx` has the correct viewport meta tag:

```tsx
export const metadata = {
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};
```

Without `maximum-scale=1`, iOS Safari may auto-zoom on input focus, breaking the layout.

---

## Section 5: Implementation Notes

### Next.js App Router Considerations
- All modified components are `'use client'` — no Server Component constraints.
- For the mobile tab state in `workspace/[slug]/page.tsx`, use `useState` with `'queue'` as default. No URL param needed since this is transient UI state.
- `useSearchParams` could be used to persist the active mobile tab in the URL if deep-linking to "feed" or "agents" view is needed later.

### Tailwind Breakpoints
This codebase uses standard Tailwind breakpoints:
- `sm`: 640px — most small phones landscape / small tablets
- `md`: 768px — tablets, the primary mobile/desktop split point
- `lg`: 1024px — laptops

**Recommendation:** Use `md:` as the primary breakpoint for all mobile/desktop divergence in this app.

### Tailwind v3 vs v4
Check `package.json` / `tailwind.config.ts` for the Tailwind version. If using **Tailwind v4**, the `@media` breakpoints are still compatible but config is CSS-first. The `snap-x`, `snap-mandatory`, `snap-start` utilities are available in both v3 and v4.

### Touch Event Gotchas
- Native HTML5 drag (`draggable`, `onDragStart`, `onDrop`) **does not work on iOS Safari** at all. It works on Android Chrome but is unreliable. Use `@dnd-kit/core` or `react-beautiful-dnd` with touch sensor for P4.
- The `activationConstraint: { delay: 250 }` on TouchSensor is critical — without it, vertical scrolling the Kanban will accidentally trigger drags.

### Modal/Sheet Scroll on iOS
When implementing bottom sheets, iOS Safari has a known bug where `-webkit-overflow-scrolling: touch` is needed inside scrollable modal content. In Tailwind, add `overflow-y-auto` and test specifically on iOS Safari. Consider `overscroll-contain` on the sheet container to prevent scroll chaining to the page behind it.

### Safe Area Insets (iPhone Notch/Home Bar)
Bottom navigation bars on iPhones need padding for the home indicator. Use:

```css
padding-bottom: env(safe-area-inset-bottom);
```

In Tailwind, this isn't a built-in utility — add it inline or via a custom class:

```tsx
<nav className="md:hidden flex border-t border-mc-border bg-mc-bg-secondary"
     style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
```

Or add to `globals.css`:
```css
.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
```

### SSE on Mobile
The SSE connection in `useSSE` should work fine on mobile browsers. However, iOS Safari aggressively suspends background tabs. If the user switches apps and comes back, the SSE connection will be dead. The existing 30s/60s polling fallbacks handle this correctly — no changes needed here.

---

## Summary

The Mission-Claw dashboard is a **desktop-first app with zero mobile consideration** in the current codebase. The three-panel horizontal layout + 7-column Kanban makes it fundamentally unusable on phones. 

**Fastest path to mobile-usable:**
1. QW1-QW6 quick wins (< 2 hours total) — gets you from "broken" to "barely functional"
2. P1 bottom nav pattern (3h) — makes it actually usable
3. P2 scroll-snap Kanban (2h) — makes the core feature work on mobile
4. P3 header collapse (1h) — polish

Total to "mobile-friendly" MVP: **~8 hours of focused work**.
