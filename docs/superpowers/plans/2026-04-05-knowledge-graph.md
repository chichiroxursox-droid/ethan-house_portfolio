# Knowledge Graph Visualization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive Obsidian-style knowledge graph as a third app on the in-game computer desktop, powered by wiki data parsed into a static JSON file.

**Architecture:** Python build script parses wiki markdown into `graph-data.json`. Portfolio loads this JSON at init. d3-force handles layout physics. Canvas 2D API renders nodes/edges inside the existing computer.js canvas pipeline. New screen phases (`graph`, `graphDetail`) follow the existing `folder`/`project` pattern.

**Tech Stack:** d3-force (npm), Python 3 (build script), Canvas 2D API, existing computer.js architecture

**Spec:** `docs/superpowers/specs/2026-04-05-knowledge-graph-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `/Users/chichi/Desktop/CLAUDE CODE/RAG?/tools/wiki-to-graph.py` | Create | Parse wiki → JSON |
| `public/graph-data.json` | Generated | Static graph data (nodes + edges) |
| `src/graph.js` | Create | Graph rendering, physics, interaction — separated from computer.js to keep files focused |
| `src/computer.js` | Modify | Desktop icon, phase routing, delegate to graph.js |
| `package.json` | Modify | Add d3-force dependency |

Rationale for `src/graph.js`: computer.js is already 1556 lines. The graph feature adds ~400-500 lines of drawing, physics, hit-testing, and detail rendering. A separate module keeps both files readable and the graph logic self-contained. It exports functions that computer.js calls at the right moments (same pattern as how main.js calls computer.js).

---

### Task 1: Build Script — Wiki to JSON

**Files:**
- Create: `/Users/chichi/Desktop/CLAUDE CODE/RAG?/tools/wiki-to-graph.py`
- Generated output: `/Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio/public/graph-data.json`

- [ ] **Step 1: Create the build script**

```python
#!/usr/bin/env python3
"""Parse wiki markdown files into a graph-data.json for the portfolio."""

import json
import re
from pathlib import Path

WIKI_DIR = Path(__file__).parent.parent / "wiki"
OUTPUT = Path(__file__).parent.parent.parent / "Cool website animation" / "portfolio" / "public" / "graph-data.json"

# Category mapping from index.md section headers
CATEGORY_MAP = {}

def parse_index():
    """Read index.md to build page→category mapping."""
    index_path = WIKI_DIR / "index.md"
    text = index_path.read_text()
    current_category = None
    category_aliases = {
        "Projects": "project",
        "Concepts": "concept",
        "Tools": "tool",
        "Entities": "entity",
        "Analyses": "analysis",
    }
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("## "):
            section = line[3:].strip()
            current_category = category_aliases.get(section)
        elif line.startswith("- [[") and current_category:
            match = re.match(r"- \[\[([^\]]+)\]\]", line)
            if match:
                CATEGORY_MAP[match.group(1)] = current_category

def extract_page(filepath):
    """Extract title, summary, and links from a wiki page."""
    text = filepath.read_text()
    lines = text.splitlines()

    # Title = first H1
    title = filepath.stem.replace("-", " ").title()
    for line in lines:
        if line.startswith("# "):
            title = line[2:].strip()
            break

    # Summary = text between title and first H2 (or end), max 200 chars
    summary_lines = []
    past_title = False
    for line in lines:
        if line.startswith("# ") and not past_title:
            past_title = True
            continue
        if past_title:
            if line.startswith("## "):
                break
            stripped = line.strip()
            if stripped and not stripped.startswith("Located at:"):
                summary_lines.append(stripped)
    summary = " ".join(summary_lines)
    if len(summary) > 200:
        summary = summary[:197] + "..."

    # Links = all [[page-name]] references
    links = list(set(re.findall(r"\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]", text)))

    return title, summary, links

def main():
    parse_index()

    nodes = []
    edges_set = set()

    # Process every .md file except index.md and log.md
    for md_file in sorted(WIKI_DIR.glob("*.md")):
        if md_file.name in ("index.md", "log.md"):
            continue

        page_id = md_file.stem
        title, summary, links = extract_page(md_file)
        category = CATEGORY_MAP.get(page_id, "concept")

        # Filter links to only existing pages
        valid_links = [l for l in links if (WIKI_DIR / f"{l}.md").exists() and l != page_id]

        nodes.append({
            "id": page_id,
            "title": title,
            "category": category,
            "summary": summary,
            "linkCount": len(valid_links),
        })

        for target in valid_links:
            edge = tuple(sorted([page_id, target]))
            edges_set.add(edge)

    edges = [{"source": e[0], "target": e[1]} for e in sorted(edges_set)]

    data = {"nodes": nodes, "edges": edges}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, indent=2))
    print(f"Generated {OUTPUT}")
    print(f"  Nodes: {len(nodes)}")
    print(f"  Edges: {len(edges)}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the build script and verify output**

Run:
```bash
cd "/Users/chichi/Desktop/CLAUDE CODE/RAG?" && python tools/wiki-to-graph.py
```

Expected output:
```
Generated /Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio/public/graph-data.json
  Nodes: 48
  Edges: ~150-200
```

Then verify the JSON:
```bash
python3 -c "
import json
data = json.load(open('/Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio/public/graph-data.json'))
print(f'Nodes: {len(data[\"nodes\"])}')
print(f'Edges: {len(data[\"edges\"])}')
cats = {}
for n in data['nodes']:
    cats[n['category']] = cats.get(n['category'], 0) + 1
print(f'Categories: {cats}')
print(f'Sample node: {data[\"nodes\"][0]}')
"
```

Expected: 48 nodes, 150-200 edges, 5 categories, each node has id/title/category/summary/linkCount.

- [ ] **Step 3: Commit**

```bash
git add tools/wiki-to-graph.py
git commit -m "feat: add wiki-to-graph build script for knowledge graph JSON"
```

---

### Task 2: Install d3-force and Create graph.js Skeleton

**Files:**
- Modify: `/Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio/package.json`
- Create: `/Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio/src/graph.js`

- [ ] **Step 1: Install d3-force**

```bash
cd "/Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio" && npm install d3-force
```

- [ ] **Step 2: Create graph.js with data loading and module structure**

Create `/Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio/src/graph.js`:

```javascript
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';

// ── Category colors ──
const CATEGORY_COLORS = {
  project:  '#4A9EE8',
  concept:  '#9B59B6',
  tool:     '#2ECC71',
  entity:   '#E67E22',
  analysis: '#E84A8A',
};

const CATEGORY_LABELS = {
  project:  'Projects',
  concept:  'Concepts',
  tool:     'Tools',
  entity:   'Entities',
  analysis: 'Analyses',
};

// ── Graph state ──
let graphData = null;      // { nodes: [...], edges: [...] }
let simulation = null;
let selectedNode = null;   // node object or null (for graphDetail phase)
let hoveredNode = null;    // node object or null
let detailStack = [];      // stack of node IDs for back-navigation
let dragNode = null;       // node being dragged
let graphScrollOffset = 0; // scroll offset for detail view connections list

// ── Layout constants (set by initGraph) ──
let contentX, contentY, contentW, contentH;

/**
 * Load graph-data.json. Returns true if loaded, false if failed.
 */
export async function loadGraphData() {
  try {
    const resp = await fetch('/graph-data.json');
    if (!resp.ok) return false;
    graphData = await resp.json();
    // Pre-compute radius for each node based on linkCount
    const maxLinks = Math.max(...graphData.nodes.map(n => n.linkCount), 1);
    for (const node of graphData.nodes) {
      node.radius = Math.max(5, Math.min(10, 3 + node.linkCount * 0.4));
    }
    return true;
  } catch {
    return false;
  }
}

export function hasGraphData() {
  return graphData !== null && graphData.nodes.length > 0;
}

/**
 * Initialize the force simulation. Call when entering graph view.
 * cx, cy, cw, ch = content area bounds (canvas pixels).
 */
export function initSimulation(cx, cy, cw, ch) {
  contentX = cx;
  contentY = cy;
  contentW = cw;
  contentH = ch;

  if (!graphData) return;

  // Reset positions to center with slight jitter
  const centerX = cx + cw / 2;
  const centerY = cy + ch / 2;
  for (const node of graphData.nodes) {
    node.x = centerX + (Math.random() - 0.5) * cw * 0.5;
    node.y = centerY + (Math.random() - 0.5) * ch * 0.5;
    node.vx = 0;
    node.vy = 0;
    node.fx = null;
    node.fy = null;
  }

  simulation = forceSimulation(graphData.nodes)
    .force('charge', forceManyBody().strength(-120))
    .force('link', forceLink(graphData.edges)
      .id(d => d.id)
      .distance(80)
      .strength(0.3))
    .force('center', forceCenter(centerX, centerY))
    .force('collide', forceCollide().radius(d => d.radius + 8))
    .alphaDecay(0.01)
    .alpha(0.8);

  // Run 100 ticks to settle initial layout
  for (let i = 0; i < 100; i++) simulation.tick();

  // Keep a low alpha for gentle drift
  simulation.alpha(0.02).restart();
}

/**
 * Pause simulation (when leaving graph view).
 */
export function pauseSimulation() {
  if (simulation) simulation.stop();
}

/**
 * Resume simulation (when re-entering graph view).
 */
export function resumeSimulation() {
  if (simulation) simulation.alpha(0.02).restart();
}

// ── Hit detection ──

/**
 * Find the node at canvas position (x, y), or null.
 */
export function findNodeAt(x, y) {
  if (!graphData) return null;
  for (let i = graphData.nodes.length - 1; i >= 0; i--) {
    const node = graphData.nodes[i];
    const dx = x - node.x;
    const dy = y - node.y;
    if (dx * dx + dy * dy <= (node.radius + 4) * (node.radius + 4)) {
      return node;
    }
  }
  return null;
}

/**
 * Get the currently hovered node.
 */
export function getHoveredNode() { return hoveredNode; }
export function setHoveredNode(node) { hoveredNode = node; }

/**
 * Get the currently selected node (for detail view).
 */
export function getSelectedNode() { return selectedNode; }

// ── Navigation ──

/**
 * Select a node (transition to graphDetail).
 */
export function selectNode(node) {
  if (selectedNode) detailStack.push(selectedNode.id);
  selectedNode = node;
  graphScrollOffset = 0;
}

/**
 * Go back from detail view. Returns 'graph' if back to graph, 'graphDetail' if back to prev node.
 */
export function goBack() {
  if (detailStack.length > 0) {
    const prevId = detailStack.pop();
    selectedNode = graphData.nodes.find(n => n.id === prevId) || null;
    graphScrollOffset = 0;
    return selectedNode ? 'graphDetail' : 'graph';
  }
  selectedNode = null;
  graphScrollOffset = 0;
  return 'graph';
}

/**
 * Close graph entirely (back to desktop).
 */
export function resetGraphState() {
  selectedNode = null;
  hoveredNode = null;
  detailStack = [];
  dragNode = null;
  graphScrollOffset = 0;
}

// ── Dragging ──

export function startDrag(node) {
  dragNode = node;
  if (simulation) simulation.alphaTarget(0.1).restart();
  node.fx = node.x;
  node.fy = node.y;
}

export function updateDrag(x, y) {
  if (!dragNode) return;
  dragNode.fx = x;
  dragNode.fy = y;
}

export function endDrag() {
  if (!dragNode) return;
  if (simulation) simulation.alphaTarget(0);
  dragNode.fx = null;
  dragNode.fy = null;
  dragNode = null;
}

export function isDragging() { return dragNode !== null; }

// ── Detail view scrolling ──

export function scrollDetail(deltaY) {
  graphScrollOffset = Math.min(0, graphScrollOffset - deltaY * 0.5);
}

// ── Drawing ──

/**
 * Draw the graph view (nodes, edges, labels, legend).
 * ctx: CanvasRenderingContext2D
 */
export function drawGraphView(ctx) {
  if (!graphData) return;

  const nodes = graphData.nodes;
  const edges = graphData.edges;

  // Clamp node positions to content area
  for (const node of nodes) {
    node.x = Math.max(contentX + node.radius, Math.min(contentX + contentW - node.radius, node.x));
    node.y = Math.max(contentY + node.radius, Math.min(contentY + contentH - node.radius, node.y));
  }

  // ── Edges ──
  for (const edge of edges) {
    const source = typeof edge.source === 'object' ? edge.source : nodes.find(n => n.id === edge.source);
    const target = typeof edge.target === 'object' ? edge.target : nodes.find(n => n.id === edge.target);
    if (!source || !target) continue;

    const isConnected = hoveredNode && (source === hoveredNode || target === hoveredNode);
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = isConnected
      ? 'rgba(255, 255, 255, 0.3)'
      : hoveredNode
        ? 'rgba(255, 255, 255, 0.03)'
        : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = isConnected ? 1 : 0.5;
    ctx.stroke();
  }

  // ── Nodes ──
  // Determine hub threshold (top 6 by linkCount)
  const sortedByLinks = [...nodes].sort((a, b) => b.linkCount - a.linkCount);
  const hubThreshold = sortedByLinks[Math.min(5, sortedByLinks.length - 1)]?.linkCount || 0;

  for (const node of nodes) {
    const isHovered = node === hoveredNode;
    const color = CATEGORY_COLORS[node.category] || '#888';
    const r = isHovered ? node.radius * 1.3 : node.radius;

    // Glow
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = isHovered ? 16 : 8;

    // Circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    // Hover ring
    if (isHovered) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Labels — always show for hubs, on hover for others
    const isHub = node.linkCount >= hubThreshold;
    if (isHub || isHovered) {
      ctx.fillStyle = isHovered ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.55)';
      ctx.font = '400 9px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Truncate long names
      let label = node.title;
      if (label.length > 18) label = label.substring(0, 15) + '...';

      // Hover tooltip pill (for non-hub nodes that only show on hover)
      if (isHovered && !isHub) {
        const labelW = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        const px = node.x - labelW / 2;
        const py = node.y + r + 1;
        const pw = labelW;
        const ph = 14;
        const pr = 4;
        ctx.moveTo(px + pr, py);
        ctx.lineTo(px + pw - pr, py);
        ctx.arcTo(px + pw, py, px + pw, py + pr, pr);
        ctx.lineTo(px + pw, py + ph - pr);
        ctx.arcTo(px + pw, py + ph, px + pw - pr, py + ph, pr);
        ctx.lineTo(px + pr, py + ph);
        ctx.arcTo(px, py + ph, px, py + ph - pr, pr);
        ctx.lineTo(px, py + pr);
        ctx.arcTo(px, py, px + pr, py, pr);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = isHovered ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.55)';
      ctx.fillText(label, node.x, node.y + r + 4);
    }
  }

  // ── Legend (bottom-left) ──
  const legendX = contentX + 12;
  let legendY = contentY + contentH - 12 - Object.keys(CATEGORY_COLORS).length * 16;

  ctx.font = '400 9px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
    ctx.beginPath();
    ctx.arc(legendX + 5, legendY + 6, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(CATEGORY_LABELS[cat], legendX + 14, legendY + 6);
    legendY += 16;
  }
}

/**
 * Draw the graph detail view for the selected node.
 * ctx: CanvasRenderingContext2D
 * winX, winY, winW, winH: window content bounds
 * hoveredConnectionIndex: index of hovered connection row, or -1
 */
export function drawGraphDetail(ctx, winX, winY, winW, winH, hoveredConnectionIndex) {
  if (!selectedNode || !graphData) return;

  const padX = winX + 40;
  const maxW = winW - 80;
  let y = winY + 24 + graphScrollOffset;

  const color = CATEGORY_COLORS[selectedNode.category] || '#888';

  // ── Node title ──
  ctx.fillStyle = color;
  ctx.font = '700 26px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(selectedNode.title, padX, y);

  // Category pill
  const catLabel = CATEGORY_LABELS[selectedNode.category] || selectedNode.category;
  ctx.font = '400 11px "Helvetica Neue", Arial, sans-serif';
  const pillW = ctx.measureText(catLabel).width + 16;
  const pillX = winX + winW - 40 - pillW;
  ctx.fillStyle = color + '30';
  // rounded pill
  ctx.beginPath();
  ctx.moveTo(pillX + 9, y + 4);
  ctx.lineTo(pillX + pillW - 9, y + 4);
  ctx.arcTo(pillX + pillW, y + 4, pillX + pillW, y + 13, 9);
  ctx.lineTo(pillX + pillW, y + 13);
  ctx.arcTo(pillX + pillW, y + 22, pillX + pillW - 9, y + 22, 9);
  ctx.lineTo(pillX + 9, y + 22);
  ctx.arcTo(pillX, y + 22, pillX, y + 13, 9);
  ctx.lineTo(pillX, y + 13);
  ctx.arcTo(pillX, y + 4, pillX + 9, y + 4, 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(catLabel, pillX + pillW / 2, y + 13);

  y += 38;

  // ── Divider ──
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fillRect(padX, y, maxW, 1);
  y += 18;

  // ── Summary ──
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = '400 14px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Word-wrap summary
  const words = selectedNode.summary.split(' ');
  let line = '';
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxW && line !== '') {
      ctx.fillText(line.trim(), padX, y);
      line = word + ' ';
      y += 22;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), padX, y);
  y += 36;

  // ── Connections header ──
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '600 11px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('CONNECTIONS', padX, y);
  y += 22;

  // ── Connection rows ──
  const connections = getConnections(selectedNode);
  const ROW_H = 28;

  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i];
    const rowY = y + i * ROW_H;

    // Skip if outside visible area
    if (rowY + ROW_H < winY || rowY > winY + winH) continue;

    const isHovered = i === hoveredConnectionIndex;
    const connColor = CATEGORY_COLORS[conn.category] || '#888';

    // Hover highlight
    if (isHovered) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillRect(padX - 8, rowY - 2, maxW + 16, ROW_H);
    }

    // Category dot
    ctx.beginPath();
    ctx.arc(padX + 4, rowY + ROW_H / 2 - 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = connColor;
    ctx.fill();

    // Connection name
    ctx.fillStyle = isHovered ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.65)';
    ctx.font = '400 13px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(conn.title, padX + 16, rowY + ROW_H / 2 - 2);
  }
}

/**
 * Get connections for a node (linked nodes with their details).
 */
export function getConnections(node) {
  if (!graphData || !node) return [];
  const connected = new Set();

  for (const edge of graphData.edges) {
    const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
    const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
    if (sourceId === node.id) connected.add(targetId);
    if (targetId === node.id) connected.add(sourceId);
  }

  return graphData.nodes
    .filter(n => connected.has(n.id))
    .sort((a, b) => b.linkCount - a.linkCount);
}

/**
 * Hit-test connection rows in detail view. Returns index or -1.
 * y = starting y of connections list, rowH = row height
 */
export function hitTestConnection(cx, cy, winX, winY, winW, winH, padX, connectionsStartY) {
  if (!selectedNode || !graphData) return -1;
  const connections = getConnections(selectedNode);
  const ROW_H = 28;

  for (let i = 0; i < connections.length; i++) {
    const rowY = connectionsStartY + i * ROW_H + graphScrollOffset;
    if (rowY + ROW_H < winY || rowY > winY + winH) continue;
    if (cx >= padX - 8 && cx <= padX + winW - 80 + 8 && cy >= rowY - 2 && cy <= rowY + ROW_H - 2) {
      return i;
    }
  }
  return -1;
}

/**
 * Get a connection node by index.
 */
export function getConnectionByIndex(index) {
  if (!selectedNode) return null;
  const connections = getConnections(selectedNode);
  return connections[index] || null;
}
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio"
git add package.json package-lock.json src/graph.js
git commit -m "feat: add d3-force dependency and graph.js module skeleton"
```

---

### Task 3: Add Graph Icon to Desktop

**Files:**
- Modify: `/Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio/src/computer.js`

This task adds the third desktop icon and loads graph data on init. No graph rendering yet — just the icon and click-to-enter.

- [ ] **Step 1: Import graph module and update FOLDERS array**

In `computer.js`, add import at the top (after line 3):

```javascript
import { loadGraphData, hasGraphData, initSimulation, pauseSimulation, resumeSimulation, resetGraphState, findNodeAt, getHoveredNode, setHoveredNode, getSelectedNode, selectNode, goBack, startDrag, updateDrag, endDrag, isDragging, drawGraphView as renderGraph, drawGraphDetail as renderGraphDetail, getConnections, hitTestConnection, getConnectionByIndex, scrollDetail } from './graph.js';
```

Update FOLDERS (line 45-48) — keep original positions but add dynamic repositioning and graph icon:

```javascript
// Original 2-icon positions (used when graph data is unavailable)
const FOLDERS_2 = [
  { name: 'Websites', cx: 370, cy: 220, color: '#4A9EE8' },
  { name: 'Apps',     cx: 654, cy: 220, color: '#E84A8A' },
];
// 3-icon positions (used when graph data is loaded)
const FOLDERS_3 = [
  { name: 'Websites', cx: 280, cy: 220, color: '#4A9EE8' },
  { name: 'Apps',     cx: 512, cy: 220, color: '#E84A8A' },
];
let FOLDERS = FOLDERS_2; // Start with 2-icon layout, switch when graph loads
const GRAPH_ICON = { name: 'Knowledge Graph', cx: 744, cy: 220, color: '#7B68EE' };
let graphAvailable = false;
```

Then in `initComputer`, when graph data loads successfully, switch the layout:

```javascript
  loadGraphData().then(ok => {
    graphAvailable = ok;
    if (ok) {
      FOLDERS = FOLDERS_3; // Switch to 3-icon spacing
      console.log('Knowledge graph data loaded');
    }
  });
```

- [ ] **Step 2: Add screenPhase types and graph-related module state**

Update the screenPhase comment (line 19):

```javascript
let screenPhase = 'off'; // 'off' | 'booting' | 'desktop' | 'folder' | 'project' | 'graph' | 'graphDetail'
```

Add graph-related hover state tracking after `hoveredElement` (after line 27):

```javascript
let hoveredGraphConnection = -1; // index of hovered connection in graphDetail
let graphDragStartTime = 0;      // to distinguish click from drag
```

- [ ] **Step 3: Draw the graph icon on the desktop**

Add a new function after `drawFolderIcon` (after line 440):

```javascript
function drawGraphIcon(highlighted) {
  const icon = GRAPH_ICON;
  const x = icon.cx - FOLDER_W / 2;
  const y = icon.cy - FOLDER_H / 2;

  // Selection highlight
  if (highlighted) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, x, y, FOLDER_W, FOLDER_H, 8);
    ctx.fill();
  }

  // Draw mini graph icon (3 connected dots)
  const cx = icon.cx;
  const cy = y + 30;
  const dotR = 5;

  // Edges
  ctx.strokeStyle = icon.color + '80';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy - 8);
  ctx.lineTo(cx + 16, cy - 12);
  ctx.moveTo(cx - 16, cy - 8);
  ctx.lineTo(cx, cy + 14);
  ctx.moveTo(cx + 16, cy - 12);
  ctx.lineTo(cx, cy + 14);
  ctx.stroke();

  // Dots
  const dots = [
    { x: cx - 16, y: cy - 8 },
    { x: cx + 16, y: cy - 12 },
    { x: cx, y: cy + 14 },
  ];
  for (const d of dots) {
    ctx.beginPath();
    ctx.arc(d.x, d.y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = icon.color;
    ctx.fill();
  }

  // Label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = '400 12px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Knowledge', icon.cx, y + FOLDER_H - 26);
  ctx.fillText('Graph', icon.cx, y + FOLDER_H - 12);
}
```

- [ ] **Step 4: Update drawDesktop to show the graph icon**

Replace the `drawDesktop` function (lines 442-449):

```javascript
function drawDesktop(highlightedFolder) {
  drawDesktopBg();
  drawTaskbar();
  for (const folder of FOLDERS) {
    drawFolderIcon(folder, folder === highlightedFolder);
  }
  if (graphAvailable) {
    drawGraphIcon(highlightedFolder === GRAPH_ICON);
  }
  canvasTexture.needsUpdate = true;
}
```

- [ ] **Step 5: Update hitTestFolders to include graph icon**

Replace `hitTestFolders` (lines 853-862):

```javascript
function hitTestFolders(cx, cy) {
  for (const folder of FOLDERS) {
    const fx = folder.cx - FOLDER_W / 2;
    const fy = folder.cy - FOLDER_H / 2;
    if (cx >= fx && cx <= fx + FOLDER_W && cy >= fy && cy <= fy + FOLDER_H) {
      return folder;
    }
  }
  // Check graph icon
  if (graphAvailable) {
    const gx = GRAPH_ICON.cx - FOLDER_W / 2;
    const gy = GRAPH_ICON.cy - FOLDER_H / 2;
    if (cx >= gx && cx <= gx + FOLDER_W && cy >= gy && cy <= gy + FOLDER_H) {
      return GRAPH_ICON;
    }
  }
  return null;
}
```

- [ ] **Step 6: Load graph data in initComputer**

Add to `initComputer` (after `preloadScreenshots()` on line 1293):

```javascript
  // Load knowledge graph data
  loadGraphData().then(ok => {
    graphAvailable = ok;
    if (ok) {
      FOLDERS = FOLDERS_3;
      console.log('Knowledge graph data loaded');
    }
  });
```

- [ ] **Step 7: Update redrawCurrentPhase**

Replace `redrawCurrentPhase` (lines 864-868):

```javascript
function redrawCurrentPhase() {
  if (screenPhase === 'desktop') drawDesktop();
  else if (screenPhase === 'folder') drawFolderView();
  else if (screenPhase === 'project' && !videoFullscreen) drawProjectDetail();
  else if (screenPhase === 'graph') drawGraphScreen();
  else if (screenPhase === 'graphDetail') drawGraphDetailScreen();
}
```

- [ ] **Step 8: Commit**

```bash
cd "/Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio"
git add src/computer.js
git commit -m "feat: add Knowledge Graph icon to computer desktop"
```

---

### Task 4: Graph View Rendering & Interaction

**Files:**
- Modify: `/Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio/src/computer.js`

This task adds the graph screen rendering and all interaction handlers (click, hover, drag, scroll).

- [ ] **Step 1: Add graph screen drawing functions**

Add these functions after the `drawProjectDetail` function (after line 745):

```javascript
// ── Graph View ──

function drawGraphScreen() {
  drawDesktopBg();
  drawTaskbar();
  drawWindowChrome('Knowledge Graph', GRAPH_ICON.color, true);

  // Content area clip
  ctx.save();
  ctx.beginPath();
  ctx.rect(WIN_X + 1, CONTENT_Y, WIN_W - 2, CONTENT_H - 1);
  ctx.clip();

  renderGraph(ctx);

  ctx.restore();
  canvasTexture.needsUpdate = true;
}

function drawGraphDetailScreen() {
  drawDesktopBg();
  drawTaskbar();

  const node = getSelectedNode();
  const color = node ? (node.category === 'project' ? '#4A9EE8' : node.category === 'concept' ? '#9B59B6' : node.category === 'tool' ? '#2ECC71' : node.category === 'entity' ? '#E67E22' : '#E84A8A') : GRAPH_ICON.color;
  drawWindowChrome('Knowledge Graph', color, true);

  // Content area clip
  ctx.save();
  ctx.beginPath();
  ctx.rect(WIN_X + 1, CONTENT_Y, WIN_W - 2, CONTENT_H - 1);
  ctx.clip();

  renderGraphDetail(ctx, WIN_X + 1, CONTENT_Y, WIN_W - 2, CONTENT_H - 1, hoveredGraphConnection);

  ctx.restore();
  canvasTexture.needsUpdate = true;
}
```

- [ ] **Step 2: Add animation loop for graph drift**

Add after the graph drawing functions:

```javascript
let graphRAF = null;

function startGraphLoop() {
  function tick() {
    if (screenPhase !== 'graph') return;
    drawGraphScreen();
    graphRAF = requestAnimationFrame(tick);
  }
  graphRAF = requestAnimationFrame(tick);
}

function stopGraphLoop() {
  if (graphRAF) {
    cancelAnimationFrame(graphRAF);
    graphRAF = null;
  }
}
```

- [ ] **Step 3: Update click handler for graph phases**

In `onScreenClick` (starting at line 872), update the desktop click case to handle graph icon, and add new cases for `graph` and `graphDetail` phases.

Replace the desktop case (lines 878-887):

```javascript
  if (screenPhase === 'desktop') {
    const folder = hitTestFolders(hit.x, hit.y);
    if (folder === GRAPH_ICON) {
      playClick();
      initSimulation(WIN_X + 1, CONTENT_Y, WIN_W - 2, CONTENT_H - 1);
      screenPhase = 'graph';
      hoveredElement = null;
      startGraphLoop();
      drawGraphScreen();
    } else if (folder) {
      playClick();
      currentFolder = folder.name;
      scrollOffset = 0;
      screenPhase = 'folder';
      hoveredElement = null;
      drawFolderView();
    }
```

Add new cases before the closing brace of `onScreenClick`. Add after the `project` phase handler (after line 953):

```javascript
  } else if (screenPhase === 'graph') {
    // Close → desktop
    if (hitRect(hit.x, hit.y, CLOSE_BTN)) {
      playClick();
      stopGraphLoop();
      pauseSimulation();
      resetGraphState();
      screenPhase = 'desktop';
      hoveredElement = null;
      drawDesktop();
      return;
    }
    // Back → desktop
    if (hitRect(hit.x, hit.y, BACK_BTN)) {
      playClick();
      stopGraphLoop();
      pauseSimulation();
      resetGraphState();
      screenPhase = 'desktop';
      hoveredElement = null;
      drawDesktop();
      return;
    }
    // Click on node → detail (only if not a drag)
    if (!isDragging() && Date.now() - graphDragStartTime > 200) {
      // This was a drag release, not a click
    } else if (!isDragging()) {
      const node = findNodeAt(hit.x, hit.y);
      if (node) {
        playClick();
        stopGraphLoop();
        selectNode(node);
        screenPhase = 'graphDetail';
        hoveredElement = null;
        hoveredGraphConnection = -1;
        drawGraphDetailScreen();
      }
    }
  } else if (screenPhase === 'graphDetail') {
    // Close → desktop
    if (hitRect(hit.x, hit.y, CLOSE_BTN)) {
      playClick();
      pauseSimulation();
      resetGraphState();
      screenPhase = 'desktop';
      hoveredElement = null;
      drawDesktop();
      return;
    }
    // Back → previous (graph or prev detail)
    if (hitRect(hit.x, hit.y, BACK_BTN)) {
      playClick();
      const dest = goBack();
      if (dest === 'graph') {
        screenPhase = 'graph';
        hoveredElement = null;
        resumeSimulation();
        startGraphLoop();
        drawGraphScreen();
      } else {
        hoveredGraphConnection = -1;
        drawGraphDetailScreen();
      }
      return;
    }
    // Click on connection → navigate to that node
    if (hoveredGraphConnection >= 0) {
      const conn = getConnectionByIndex(hoveredGraphConnection);
      if (conn) {
        playClick();
        selectNode(conn);
        hoveredGraphConnection = -1;
        drawGraphDetailScreen();
      }
    }
  }
```

- [ ] **Step 4: Update hover handler for graph phases**

In `onScreenPointerMove`, add cases for `graph` and `graphDetail` phases. Add after the `project` phase hover handler (after line 1005):

```javascript
  } else if (screenPhase === 'graph') {
    if (hitRect(hit.x, hit.y, CLOSE_BTN)) {
      newHover = { type: 'close' };
    } else if (hitRect(hit.x, hit.y, BACK_BTN)) {
      newHover = { type: 'back' };
    } else {
      const node = findNodeAt(hit.x, hit.y);
      setHoveredNode(node);
      if (node) newHover = { type: 'graphNode' };
    }
  } else if (screenPhase === 'graphDetail') {
    if (hitRect(hit.x, hit.y, CLOSE_BTN)) {
      newHover = { type: 'close' };
      hoveredGraphConnection = -1;
    } else if (hitRect(hit.x, hit.y, BACK_BTN)) {
      newHover = { type: 'back' };
      hoveredGraphConnection = -1;
    } else {
      // Hit test connection rows
      const padX = WIN_X + 40;
      // Approximate connections start Y (title + divider + summary ≈ 120px)
      const connectionsStartY = CONTENT_Y + 120;
      const idx = hitTestConnection(hit.x, hit.y, WIN_X + 1, CONTENT_Y, WIN_W - 2, CONTENT_H - 1, padX, connectionsStartY);
      if (idx !== hoveredGraphConnection) {
        hoveredGraphConnection = idx;
        drawGraphDetailScreen();
      }
      if (idx >= 0) newHover = { type: 'graphConnection' };
    }
  }
```

- [ ] **Step 5: Add drag handling for graph nodes**

Add mousedown/mouseup handlers for drag. In `initComputer`, after the existing handler bindings (after line 1298):

```javascript
  // Drag handlers for graph nodes
  let onMouseDownBound = null;
  let onMouseUpBound = null;

  onMouseDownBound = (event) => {
    if (!active || screenPhase !== 'graph') return;
    const hit = screenUV(event);
    if (!hit) return;
    const node = findNodeAt(hit.x, hit.y);
    if (node) {
      graphDragStartTime = Date.now();
      startDrag(node);
    }
  };

  onMouseUpBound = (event) => {
    if (isDragging()) {
      const wasDrag = Date.now() - graphDragStartTime > 150;
      endDrag();
      if (wasDrag) return; // Was a drag, not a click — let click handler ignore it
    }
  };
```

Actually, the drag handling works better integrated into the existing pointermove handler. Let me revise — add to `onScreenPointerMove`, in the graph phase section, update the drag:

In the `graph` hover section (added in step 4), add drag update:

```javascript
  } else if (screenPhase === 'graph') {
    // Update drag position if dragging
    if (isDragging()) {
      updateDrag(hit.x, hit.y);
    }
    if (hitRect(hit.x, hit.y, CLOSE_BTN)) {
      // ... (rest stays the same)
```

For mousedown/mouseup, add event listeners in `enterComputer` (after the existing event listener setup around line 1307-1309):

```javascript
  renderer.domElement.addEventListener('pointerdown', onPointerDownBound);
  renderer.domElement.addEventListener('pointerup', onPointerUpBound);
```

And remove them in `exitComputer` (around line 1356):

```javascript
  renderer.domElement.removeEventListener('pointerdown', onPointerDownBound);
  renderer.domElement.removeEventListener('pointerup', onPointerUpBound);
```

Define the bound handlers alongside the existing ones (after line 180):

```javascript
let onPointerDownBound = null;
let onPointerUpBound = null;
```

Set them in `initComputer`:

```javascript
  onPointerDownBound = (event) => {
    if (!active || screenPhase !== 'graph') return;
    const hit = screenUV(event);
    if (!hit) return;
    const node = findNodeAt(hit.x, hit.y);
    if (node) {
      graphDragStartTime = Date.now();
      startDrag(node);
    }
  };

  onPointerUpBound = () => {
    if (isDragging()) endDrag();
  };
```

- [ ] **Step 6: Update scroll handler for graph detail**

Update `onScreenWheel` (lines 1020-1034) to also handle graphDetail scrolling:

```javascript
function onScreenWheel(event) {
  if (!active) return;

  const hit = screenUV(event);
  if (!hit) return;

  if (screenPhase === 'folder') {
    const projects = PROJECTS[currentFolder] || [];
    const rows = Math.ceil(projects.length / 2);
    const totalH = rows * (CARD_H + CARD_GAP) - CARD_GAP + CARD_PAD * 2;
    const maxScroll = Math.max(0, totalH - CONTENT_H);
    scrollOffset = Math.max(-maxScroll, Math.min(0, scrollOffset - event.deltaY * 0.5));
    drawFolderView();
    event.preventDefault();
  } else if (screenPhase === 'graphDetail') {
    scrollDetail(event.deltaY);
    drawGraphDetailScreen();
    event.preventDefault();
  }
}
```

- [ ] **Step 7: Update exitComputer to clean up graph state**

In `exitComputer` (around line 1350), add graph cleanup before the camera return animation:

```javascript
  // Stop graph animation
  stopGraphLoop();
  pauseSimulation();
  resetGraphState();
```

Also add `stopGraphLoop()` to the graph-related variables in the reset section.

- [ ] **Step 8: Handle click in graph phase — fix click vs drag distinction**

The click handler in step 3 needs to properly distinguish clicks from drags. Replace the graph click logic:

```javascript
  } else if (screenPhase === 'graph') {
    if (hitRect(hit.x, hit.y, CLOSE_BTN)) {
      playClick();
      stopGraphLoop();
      pauseSimulation();
      resetGraphState();
      screenPhase = 'desktop';
      hoveredElement = null;
      drawDesktop();
      return;
    }
    if (hitRect(hit.x, hit.y, BACK_BTN)) {
      playClick();
      stopGraphLoop();
      pauseSimulation();
      resetGraphState();
      screenPhase = 'desktop';
      hoveredElement = null;
      drawDesktop();
      return;
    }
    // Only register clicks if it wasn't a drag (< 150ms)
    if (Date.now() - graphDragStartTime < 150 || graphDragStartTime === 0) {
      const node = findNodeAt(hit.x, hit.y);
      if (node) {
        playClick();
        stopGraphLoop();
        selectNode(node);
        screenPhase = 'graphDetail';
        hoveredElement = null;
        hoveredGraphConnection = -1;
        drawGraphDetailScreen();
      }
    }
    graphDragStartTime = 0;
```

- [ ] **Step 9: Commit**

```bash
cd "/Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio"
git add src/computer.js
git commit -m "feat: wire up graph view rendering, click, hover, drag, and scroll"
```

---

### Task 5: Generate Graph Data and Test End-to-End

**Files:** No new files — testing the integration.

- [ ] **Step 1: Regenerate graph data**

```bash
cd "/Users/chichi/Desktop/CLAUDE CODE/RAG?" && python tools/wiki-to-graph.py
```

- [ ] **Step 2: Start dev server and test**

```bash
cd "/Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio" && npm run dev
```

Open the URL in browser. Navigate to the computer (scroll down, go through greeting, click "View my work").

**Verify:**
1. Three icons visible on desktop — Websites, Apps, Knowledge Graph — evenly spaced
2. Knowledge Graph icon has three connected dots (mini graph shape)
3. Click Knowledge Graph → graph view opens with 48 color-coded nodes, thin edges, gentle drift
4. Hover a node → connections highlight, name appears
5. Click-drag a node → it moves, others respond
6. Click a node → detail page shows title, category pill, summary, connections list
7. Click a connection → navigates to that node's detail
8. Click Back → returns to graph (or prev detail)
9. Click Close/Back from graph → returns to desktop

- [ ] **Step 3: Fix any visual tuning issues**

Common things to adjust:
- Force strengths if graph is too spread or too clumped (adjust in `graph.js` `initSimulation`)
- Node radius scale if nodes overlap too much
- Label font size if text is too small on the 3D monitor
- Legend position if it overlaps with nodes
- Connection list scroll bounds if list extends past window

- [ ] **Step 4: Final commit**

```bash
cd "/Users/chichi/Desktop/CLAUDE CODE/Cool website animation/portfolio"
git add -A
git commit -m "feat: interactive knowledge graph on computer desktop"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] `graph-data.json` has 48 nodes and ~150-200 edges
- [ ] Three desktop icons are evenly spaced and visually distinct
- [ ] Graph renders with correct category colors (blue/purple/green/orange/pink)
- [ ] Hub nodes (ethan-hauger, house-portfolio) are visually larger
- [ ] Hover highlights connections and dims non-connected edges
- [ ] Drag repositions nodes with physics response
- [ ] Detail view shows title, category, summary, clickable connections
- [ ] Navigation: desktop ↔ graph ↔ graphDetail chain works in both directions
- [ ] Scroll works in detail view for long connection lists
- [ ] No frame rate drop from d3-force simulation (48 nodes is lightweight)
- [ ] Existing Websites/Apps folders still work correctly after changes
- [ ] If `graph-data.json` is missing, only 2 icons show (graceful degradation)
