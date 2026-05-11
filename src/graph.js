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
