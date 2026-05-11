# Knowledge Graph Visualization — Design Spec

## Context

The house portfolio is an immersive 3D experience where visitors scroll into a Blender-modeled house and interact with a canvas-rendered desktop OS on an in-game computer. The computer currently has two folders (Websites, Apps) showing project cards.

Separately, a wiki system at `/Users/chichi/Desktop/CLAUDE CODE/RAG?/wiki/` contains 48 interconnected markdown pages (projects, concepts, tools, entities, analyses) with ~424 `[[wiki-links]]` forming a knowledge graph. Average 8.8 links per page. Hub nodes: ethan-hauger (27 links), house-portfolio (30 outgoing), claude-api (13 incoming).

**Goal:** Add an interactive Obsidian-style knowledge graph as a third "app" on the computer desktop. Visitors click the icon, see a force-directed graph of all 48 nodes color-coded by category, hover to see connections, click to read about any node. This demonstrates systems thinking and makes the portfolio memorable.

## Architecture: Pure Canvas + d3-force

Use **d3-force** (DOM-independent) for layout physics. Render everything with the existing Canvas 2D API in `computer.js`. This matches the current architecture — no DOM overlays, no extra rendering pipelines.

**Dependency:** `d3-force` (~15KB, npm install)

## Desktop Integration

### Icon Placement

Three icons in a single horizontal row, evenly spaced. **Existing FOLDERS positions (cx: 370, 654) must be updated** to accommodate the third icon:

```
  Websites (cx: ~256)  |  Apps (cx: ~512)  |  Knowledge Graph (cx: ~768)
  All at cy: 220
```

New icon uses color `#7B68EE` (medium slate blue). Icon shape: interconnected dots (mini graph) to distinguish from folder icons.

**Graceful degradation:** If `graph-data.json` fails to load or is missing, the Knowledge Graph icon is hidden and the desktop shows only the original two folders at their original positions.

### Screen Phases

New phase `graph` and `graphDetail` added to existing phases:

```
booting → desktop → graph → graphDetail
                  → folder → project
```

### Navigation Flow

```
Desktop → click "Knowledge Graph" → graph view (full content area)
  hover node → highlight connections, show name tooltip
  click node → graphDetail view (full-screen node info)
    click a connection name → navigate to that node's graphDetail
    click Back → return to graph (positions preserved)
  click Back/Close from graph → desktop
```

## Graph Layout & Physics

### d3-force Configuration

- **forceCenter:** Centers graph in content area (WIN_X + WIN_W*0.5, CONTENT_Y + CONTENT_H*0.5)
- **forceManyBody (repulsion):** strength ~-120
- **forceLink:** distance ~80px, strength ~0.3
- **forceCollide:** radius ~20px (prevents overlap)

### Node Sizing

Based on connection count (degree):

- **Hub nodes** (top 5-6 by degree): radius 8-10px
- **Regular nodes**: radius 5-6px
- Scale: `radius = Math.max(5, Math.min(10, 3 + degree * 0.4))`

### Simulation Behavior

- On entering graph view: run simulation with ~100 ticks to settle initial positions
- Continue with low alpha (~0.02) and slow decay (~0.01) for gentle floating drift
- Pause simulation when graph view is not active
- **Dragging:** Click-drag repositions a node (fixed during drag). Release unfixes so it drifts back naturally.

## Visual Rendering

All in a new `drawGraphView()` function following existing patterns.

### Edges (drawn first)

- `ctx.beginPath()` + `ctx.moveTo/lineTo` between connected node positions
- Default: `rgba(255, 255, 255, 0.08)`, lineWidth 0.5
- When a node is hovered/selected: its edges brighten to `rgba(255, 255, 255, 0.3)`, all other edges dim to `rgba(255, 255, 255, 0.03)`

### Nodes

- `ctx.arc()` circles filled with category color
- Glow effect: `ctx.shadowBlur = 8-12`, `ctx.shadowColor = categoryColor`
- **Category colors:**
  - Projects: `#4A9EE8` (blue)
  - Concepts: `#9B59B6` (purple)
  - Tools: `#2ECC71` (green)
  - Entities: `#E67E22` (orange)
  - Analyses: `#E84A8A` (pink)
- Hover state: scale 1.3x, brighter glow (`shadowBlur: 16`)
- Selected state (after click, before navigating): white ring outline

### Labels

- Font: 9-10px, same font as rest of computer UI
- Position: centered below each node
- **Visibility rules:**
  - Always show for hub nodes (top 5-6 by connection count)
  - Show on hover for all other nodes
  - Color: `rgba(255, 255, 255, 0.7)`

### Legend

Bottom-left corner of content area:
- Five small colored circles (6px) with category names in 9px text
- Arranged vertically, subtle (`rgba(255, 255, 255, 0.5)`)

### Hover Tooltip

When hovering a non-hub node (whose label is hidden):
- Show node name near cursor in 11px text
- Light background pill: `rgba(255, 255, 255, 0.1)` with rounded corners

## Node Detail View (graphDetail phase)

Full-screen detail page, same pattern as existing project detail view.

### Layout

```
┌─────────────────────────────────────────────┐
│  ← Back       Knowledge Graph          ✕    │  title bar (window chrome)
├─────────────────────────────────────────────┤
│                                             │
│  Node Title                    [Category]   │  26px, category color + pill
│  ─────────────────────────                  │  divider line
│                                             │
│  Summary text from wiki page. Two to three  │  14px, white, word-wrapped
│  sentences describing what this is.         │
│                                             │
│  CONNECTIONS                                │  section header, 11px
│  ● Project A                                │  clickable, colored dot + name
│  ● Concept B                                │  clicking navigates to that node
│  ● Tool C                                   │
│  ● ...                                      │  scrollable if many connections
│                                             │
└─────────────────────────────────────────────┘
```

### Interaction

- Each connection is a clickable row (hover highlights it)
- Clicking a connection navigates to that node's detail page (pushes onto a stack)
- Back button returns to previous view (graph or previous node detail)
- Connections show a small colored dot matching their category

## Data Pipeline

### Build Script: `RAG?/tools/wiki-to-graph.py`

Lives in the wiki project's `tools/` directory since it reads wiki data.

**Input:** All `.md` files in `RAG?/wiki/` directory

**Process:**
1. Read `index.md` to build a mapping of page name → category
2. For each wiki page:
   - Extract title (H1 heading)
   - Extract summary (first 2-3 sentences after title, before any H2)
   - Extract all `[[page-name]]` links via regex
   - Count total links (degree)
3. Build deduplicated edge list (A→B and B→A count as one edge)
4. Output JSON

**Output:** `portfolio/public/graph-data.json`

```json
{
  "nodes": [
    {
      "id": "house-portfolio",
      "title": "House Portfolio",
      "category": "project",
      "summary": "An interactive 3D portfolio website...",
      "linkCount": 30
    }
  ],
  "edges": [
    { "source": "house-portfolio", "target": "three-js" }
  ]
}
```

**Usage:** Run `python tools/wiki-to-graph.py` whenever wiki content changes, then rebuild portfolio.

### Loading in Portfolio

- Fetch `graph-data.json` on computer init (alongside screenshot preloading)
- Cache the parsed data in module scope
- Feed nodes and edges to d3-force simulation when graph view opens

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `RAG?/tools/wiki-to-graph.py` | Create | Build script: wiki → JSON |
| `portfolio/public/graph-data.json` | Generated | Graph data consumed at runtime |
| `portfolio/src/computer.js` | Modify | Add graph icon, graph phase, drawGraphView(), drawGraphDetail(), click/hover handlers |
| `portfolio/package.json` | Modify | Add d3-force dependency |

### computer.js Changes (Detailed)

**New constants:**
- `GRAPH_FOLDER` object (name, cx, cy, color) added to FOLDERS array or handled separately
- Category color map
- Node radius scale function

**New state:**
- `graphData` — parsed JSON (nodes + edges)
- `simulation` — d3-force simulation instance
- `selectedNode` — currently selected node (or null)
- `hoveredNode` — currently hovered node (or null)
- `graphDetailStack` — array of node IDs for back-navigation through detail pages

**New functions:**
- `initGraph(data)` — create d3-force simulation from graph-data.json
- `drawGraphView()` — render edges, nodes, labels, legend, tooltip
- `drawGraphDetail(node)` — render full-page node info with connections list
- `findNodeAtPosition(x, y)` — hit detection for graph nodes
- `handleGraphClick(hit)` — click handler for graph view
- `handleGraphDetailClick(hit)` — click handler for detail view

**Modified functions:**
- `drawDesktop()` — add third icon
- `onScreenClick()` — add cases for `graph` and `graphDetail` phases
- `onScreenPointerMove()` — add hover detection for graph nodes
- `preloadScreenshots()` / init area — also fetch graph-data.json

## Verification Plan

1. **Build script:** Run `python tools/wiki-to-graph.py` and verify `graph-data.json` has 48 nodes and ~150-200 unique edges
2. **Desktop:** Launch portfolio, verify third icon appears on desktop, evenly spaced
3. **Graph view:** Click icon, verify all 48 nodes render with correct category colors, edges visible, gentle drift animation
4. **Hover:** Hover nodes, verify connections highlight and name appears
5. **Drag:** Click-drag a node, verify it moves and other nodes respond
6. **Detail view:** Click a node, verify detail page shows correct title, summary, category, and connections
7. **Navigation:** Click a connection in detail view, verify it navigates to that node's detail. Click back, verify return to previous view. Click back from graph, verify return to desktop.
8. **Performance:** 48 nodes should render at 60fps on the canvas. d3-force simulation should not cause frame drops.
