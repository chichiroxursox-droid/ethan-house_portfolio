import * as THREE from 'three';
import gsap from 'gsap';
import { playClick, playType, setIndoorVolume } from './audio.js';
import { loadGraphData, hasGraphData, initSimulation, pauseSimulation, resumeSimulation, resetGraphState, findNodeAt, getHoveredNode, setHoveredNode, getSelectedNode, selectNode, goBack, startDrag, updateDrag, endDrag, isDragging, drawGraphView as renderGraph, drawGraphDetail as renderGraphDetail, getConnections, hitTestConnection, getConnectionByIndex, scrollDetail } from './graph.js';


// ── Canvas dimensions (16:9) ──
const CANVAS_W = 1024;
const CANVAS_H = 576;

// ── Module state ──
let scene = null;
let camera = null;
let renderer = null;
let screenMesh = null;
let offCanvas = null;
let ctx = null;
let canvasTexture = null;
let active = false;
let screenPhase = 'off'; // 'off' | 'booting' | 'desktop' | 'folder' | 'project' | 'graph' | 'graphDetail'
let gameActive = false;

// ── File explorer state ──
let currentFolder = null;
let currentProject = null;
let scrollOffset = 0;
let hoveredElement = null;
let hoveredGraphConnection = -1;
let graphDragStartTime = 0;
let clockInterval = null;

// ── Screenshot cache (project name → HTMLImageElement or OffscreenCanvas) ──
const screenshotCache = new Map();

// ── Video cache (project name → HTMLVideoElement) ──
const videoCache = new Map();
let activeVideo = null; // currently playing video element (for per-frame drawing)
let videoRAF = null;    // requestAnimationFrame id for video draw loop
let inlineVideoRAF = null;

// ── Monitor world position ──
const MONITOR_POS = new THREE.Vector3(-1.8, 1.1, -1.5);
// Camera ends directly in front, close enough to fill the viewport
const CAMERA_ZOOM_POS = new THREE.Vector3(-1.8, 1.1, -1.17);

// ── Folder layout (canvas pixel coordinates) ──
const FOLDER_W = 110;
const FOLDER_H = 100;
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
let FOLDERS = FOLDERS_2;
const GRAPH_ICON = { name: 'Knowledge Graph', cx: 744, cy: 220, color: '#7B68EE' };
let graphAvailable = false;

// ── Project data ──
const PROJECTS = {
  Websites: [
    {
      name: 'Faithfully',
      tech: ['HTML/CSS/JS', 'GSAP'],
      color: '#4A9EE8',
      url: 'https://faithfullyai.netlify.app/',
      description: 'Built this for small faith-based nonprofits drowning in admin work. Custom AI workflows that save teams 10+ hours a week. I wanted to prove AI could serve communities, not just corporations.',
    },
    {
      name: 'The Lamppost',
      tech: ['React', 'Supabase', 'TypeScript'],
      color: '#F39C12',
      url: 'https://lamppost.life',
      description: 'My first website for a real client — my uncle. Taught me how to handle backend, work with a stakeholder, and actually ship something. Built with Lovable and Claude Code.',
    },
    {
      name: 'Luminary',
      tech: ['Canvas 2D', 'GSAP', 'Lenis'],
      color: '#1ABC9C',
      url: 'https://luminaryv1.netlify.app/',
      description: "A scroll-driven dive into bioluminescent creatures in the deep ocean. I wanted it to feel like you're actually descending into the dark. The storytelling and the visuals just clicked.",
    },
    {
      name: 'Original Portfolio',
      tech: ['Lovable'],
      color: '#2ECC71',
      url: 'https://ethan-portfolio.lovable.app',
      description: 'This was the first portfolio I built using Lovable. Lovable was my first real introduction of what AI could do beyond just research or answering questions. Shout to Stefan for mentoring me and getting me into AI, he was the one who showed me Lovable.',
    },
    {
      name: 'Poise',
      tech: ['Canvas 2D', 'GSAP', 'Lenis'],
      color: '#9B59B6',
      url: 'https://buymybike.netlify.app/',
      description: 'A product page for a balance bike that I designed to feel premium — thermal imaging, animated specs, scroll-driven canvas work. Probably my cleanest visual project.',
    },
    {
      name: 'Glacial',
      tech: ['Three.js', 'Canvas 2D', 'GSAP'],
      color: '#3498DB',
      url: 'https://glacialv1.netlify.app/',
      description: "Silence is the first language of ice. That's the vibe. 700+ frames, particle effects, and scientific coordinates. One of my most immersive builds.",
    },
    {
      name: 'Scroll World',
      tech: ['Seedance 2.0', 'GPT Image 2', 'FFmpeg', 'Vanilla JS'],
      color: '#C97B5A',
      url: 'https://webdev-scroll-site.vercel.app',
      description: "A pitch site for my web dev services told as a miniature clay world. Scroll flies the camera through four AI-generated dioramas: the idea, the build, the launch, and the open storefront. Every frame is Seedance video scrubbed by scroll position.",
    },
    {
      name: 'Apex',
      tech: ['HTML/CSS/JS', 'GSAP', 'Lenis', 'Seedance 2.0'],
      color: '#FF4D1A',
      url: 'https://apex-chiethan.vercel.app',
      description: "A fictional luxury motorcycle brand built around an AI-generated hero loop. Used Seedance 2.0 to render a drone shot descending into the bike's deconstruction — engine, fairing, exhaust floating apart, then snapping back. Dark, surgical, Bologna-meets-weapons-catalog energy.",
    },
  ],
  Apps: [
    {
      name: 'Parallax',
      tech: ['Godot 4.6', 'GDScript'],
      color: '#C0392B',
      url: null,
      playable: true,
      featured: true,
      gamePath: '/games/parallax/index.html',
      description: 'An architect trapped in their own impossible building. You master four ways of seeing to escape — then the ghost markers disappear and it becomes a memory game. Level 5 is brutal.\n\nPress M for menu while playing.',
    },
    {
      name: 'ClassBot',
      tech: ['Python', 'Playwright', 'Groq API'],
      color: '#E84A8A',
      url: 'https://classbot-test.netlify.app',
      description: 'A Chrome extension that joins your online classes, mutes itself, captures transcripts, and responds if the teacher calls on you. It was one of the first applications I built and it can join meetings for you automatically.',
    },
    {
      name: 'PokerBot v2',
      tech: ['JavaScript', 'GTO Strategy'],
      color: '#D35400',
      url: null,
      playable: true,
      gamePath: '/games/poker/index.html',
      description: 'Play heads-up poker against my AI bot. It uses real GTO strategy ported from the Python original. 200 chips, turbo blinds. Can you beat it?',
    },
    {
      name: 'Email Organizer',
      tech: ['Python', 'Gmail API', 'Claude API'],
      color: '#27AE60',
      url: null,
      demoVideo: '/projects/email-organizer.mp4',
      description: 'Fetches your emails, classifies them with AI, applies labels, and drafts responses. Gmail API meets Claude. Inbox zero without the effort.',
    },
    {
      name: 'Toy Car Race',
      tech: ['Three.js', 'Cannon-ES'],
      color: '#F1C40F',
      url: 'https://toycar-race.netlify.app/',
      description: 'A 3D racing game where you drive a toy car around a desk. Physics engine, lap timing, bloom effects. Just a fun thing I made.',
    },
    {
      name: 'PromptCraft',
      tech: ['HTML/CSS/JS', 'Three.js'],
      color: '#E74C3C',
      url: null,
      description: 'A game that teaches you how to write better AI prompts. You learn by doing, not reading. Puzzle rooms and a 3D sandbox mode.',
    },
    {
      name: "Nate's Brakes",
      tech: ['React', 'Supabase', 'Tailwind CSS'],
      color: '#E67E22',
      url: 'https://nates-brakes.vercel.app',
      screenshot: '/projects/nates-brakes-cards.png',
      cards: ['/projects/nates-brakes-card-front.png', '/projects/nates-brakes-card-back.png'],
      description: "A living brake manual for Nate's shop. Techs look up procedures by vehicle, contributors submit field notes, and admins approve everything. Magic-link auth, role-based access, and built as a PWA so it works offline in the bay. I also designed their business cards — click to view.",
    },
  ],
};

// ── Window layout constants ──
const WIN_X = 60;
const WIN_Y = 30;
const WIN_W = 904;
const WIN_H = 530;
const TITLE_H = 36;
const CONTENT_Y = WIN_Y + TITLE_H;
const CONTENT_H = WIN_H - TITLE_H;

// ── Card layout ──
const CARD_GAP = 14;
const CARD_PAD = 20;
const CARD_H = 85;

// ── Button hit areas ──
const CLOSE_BTN = { x: WIN_X + WIN_W - 40, y: WIN_Y + 4, w: 32, h: 28 };
const BACK_BTN = { x: WIN_X + 8, y: WIN_Y + 4, w: 32, h: 28 };
const VISIT_BTN = { x: 0, y: 0, w: 160, h: 40 };
const PLAY_BTN = { x: 0, y: 0, w: 160, h: 40 };
const DEMO_BTN = { x: 0, y: 0, w: 160, h: 40 };
const CARDS_BTN = { x: 0, y: 0, w: 160, h: 40 };
// Preview-image rect (set while drawing a project detail) — clickable when the
// project carries `cards`, opens the full-screen card viewer overlay.
const CARDS_PREVIEW = { x: 0, y: 0, w: 0, h: 0, active: false };

// ── Video fullscreen state ──
let videoFullscreen = false;

// ── Raycaster for screen clicks ──
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let onClickBound = null;
let onPointerMoveBound = null;
let onWheelBound = null;
let onPointerDownBound = null;
let onPointerUpBound = null;

// ────────────────────────────────────────────
// Drawing helpers
// ────────────────────────────────────────────

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.arcTo(x + w, y, x + w, y + r, r);
  context.lineTo(x + w, y + h - r);
  context.arcTo(x + w, y + h, x + w - r, y + h, r);
  context.lineTo(x + r, y + h);
  context.arcTo(x, y + h, x, y + h - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let curY = y;
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line !== '') {
      ctx.fillText(line.trim(), x, curY);
      line = word + ' ';
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, curY);
  return curY + lineHeight;
}

function hitRect(cx, cy, rect) {
  return cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h;
}

// ── Window chrome (title bar + close/back buttons) ──

function drawWindowChrome(title, folderColor, showBack) {
  // Window background
  ctx.fillStyle = 'rgba(15, 15, 35, 0.92)';
  roundRect(ctx, WIN_X, WIN_Y, WIN_W, WIN_H, 12);
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, WIN_X, WIN_Y, WIN_W, WIN_H, 12);
  ctx.stroke();

  // Title bar gradient (clipped to top rounded corners)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(WIN_X + 12, WIN_Y);
  ctx.lineTo(WIN_X + WIN_W - 12, WIN_Y);
  ctx.arcTo(WIN_X + WIN_W, WIN_Y, WIN_X + WIN_W, WIN_Y + 12, 12);
  ctx.lineTo(WIN_X + WIN_W, WIN_Y + TITLE_H);
  ctx.lineTo(WIN_X, WIN_Y + TITLE_H);
  ctx.lineTo(WIN_X, WIN_Y + 12);
  ctx.arcTo(WIN_X, WIN_Y, WIN_X + 12, WIN_Y, 12);
  ctx.closePath();
  ctx.clip();
  const titleGrad = ctx.createLinearGradient(WIN_X, WIN_Y, WIN_X + WIN_W, WIN_Y);
  titleGrad.addColorStop(0, folderColor + '40');
  titleGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = titleGrad;
  ctx.fillRect(WIN_X, WIN_Y, WIN_W, TITLE_H);
  ctx.restore();

  // Title bar separator
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(WIN_X, WIN_Y + TITLE_H - 1, WIN_W, 1);

  // Close button (X)
  const isCloseHovered = hoveredElement?.type === 'close';
  if (isCloseHovered) {
    ctx.fillStyle = 'rgba(231, 76, 60, 0.6)';
    roundRect(ctx, CLOSE_BTN.x, CLOSE_BTN.y, CLOSE_BTN.w, CLOSE_BTN.h, 6);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 2;
  const closeCx = CLOSE_BTN.x + CLOSE_BTN.w / 2;
  const closeCy = CLOSE_BTN.y + CLOSE_BTN.h / 2;
  ctx.beginPath();
  ctx.moveTo(closeCx - 5, closeCy - 5);
  ctx.lineTo(closeCx + 5, closeCy + 5);
  ctx.moveTo(closeCx + 5, closeCy - 5);
  ctx.lineTo(closeCx - 5, closeCy + 5);
  ctx.stroke();

  // Back button (when in detail view)
  if (showBack) {
    const isBackHovered = hoveredElement?.type === 'back';
    if (isBackHovered) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      roundRect(ctx, BACK_BTN.x, BACK_BTN.y, BACK_BTN.w, BACK_BTN.h, 6);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    const bx = BACK_BTN.x + BACK_BTN.w / 2;
    const by = BACK_BTN.y + BACK_BTN.h / 2;
    ctx.beginPath();
    ctx.moveTo(bx + 4, by - 6);
    ctx.lineTo(bx - 4, by);
    ctx.lineTo(bx + 4, by + 6);
    ctx.stroke();
  }

  // Title text
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = '500 15px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, WIN_X + WIN_W / 2, WIN_Y + TITLE_H / 2);
}

// ── Boot screen ──

function drawBootScreen(progress) {
  ctx.fillStyle = '#080818';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Logo text — fades in quickly
  const textAlpha = Math.min(progress * 4, 1);
  ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha})`;
  ctx.font = '600 32px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ETHAN OS', CANVAS_W / 2, CANVAS_H / 2 - 30);

  // Loading bar background
  const barW = 260;
  const barH = 4;
  const barX = (CANVAS_W - barW) / 2;
  const barY = CANVAS_H / 2 + 10;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  roundRect(ctx, barX, barY, barW, barH, 2);
  ctx.fill();

  // Loading bar fill — gradient
  const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  fillGrad.addColorStop(0, '#4A9EE8');
  fillGrad.addColorStop(1, '#9B59B6');
  ctx.fillStyle = fillGrad;
  roundRect(ctx, barX, barY, barW * progress, barH, 2);
  ctx.fill();

  // Status text
  if (progress > 0.3) {
    const statusAlpha = Math.min((progress - 0.3) * 2, 0.5);
    ctx.fillStyle = `rgba(255, 255, 255, ${statusAlpha})`;
    ctx.font = '300 11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('loading desktop...', CANVAS_W / 2, CANVAS_H / 2 + 40);
  }

  canvasTexture.needsUpdate = true;
}

// ── Desktop ──

function drawDesktopBg() {
  const grad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
  grad.addColorStop(0, '#1a1a3e');
  grad.addColorStop(0.5, '#2d1b4e');
  grad.addColorStop(1, '#1a2a4e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Subtle dot grid
  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
  for (let gx = 20; gx < CANVAS_W; gx += 40) {
    for (let gy = 20; gy < CANVAS_H - 40; gy += 40) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTaskbar() {
  const barY = CANVAS_H - 40;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, barY, CANVAS_W, 36);

  // Top separator
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(0, barY, CANVAS_W, 1);

  // Clock
  const now = new Date();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = '300 13px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    CANVAS_W - 16,
    barY + 18,
  );

  // Start label
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fillText('Ethan Desktop', 16, barY + 18);
}

function drawFolderIcon(folder, highlighted) {
  const x = folder.cx - FOLDER_W / 2;
  const y = folder.cy - FOLDER_H / 2;
  const iconW = 64;
  const iconH = 50;
  const iconX = folder.cx - iconW / 2;
  const iconY = y + 5;

  // Selection highlight behind folder
  if (highlighted) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, x, y, FOLDER_W, FOLDER_H, 8);
    ctx.fill();
  }

  // Folder tab
  ctx.fillStyle = folder.color;
  ctx.beginPath();
  ctx.moveTo(iconX + 4, iconY + 14);
  ctx.lineTo(iconX + 4, iconY + 4);
  ctx.quadraticCurveTo(iconX + 4, iconY, iconX + 8, iconY);
  ctx.lineTo(iconX + 24, iconY);
  ctx.lineTo(iconX + 28, iconY + 8);
  ctx.lineTo(iconX + 28, iconY + 14);
  ctx.closePath();
  ctx.fill();

  // Folder body
  ctx.fillStyle = folder.color;
  roundRect(ctx, iconX, iconY + 14, iconW, iconH - 14, 5);
  ctx.fill();

  // Highlight stripe at top of body
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(iconX + 4, iconY + 16, iconW - 8, 2);

  // Label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = '400 13px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(folder.name, folder.cx, y + FOLDER_H - 18);
}

function drawGraphIcon(highlighted) {
  const icon = GRAPH_ICON;
  const x = icon.cx - FOLDER_W / 2;
  const y = icon.cy - FOLDER_H / 2;

  if (highlighted) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, x, y, FOLDER_W, FOLDER_H, 8);
    ctx.fill();
  }

  // Draw mini graph icon (3 connected dots)
  const cx = icon.cx;
  const cy = y + 30;
  const dotR = 5;

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

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = '400 12px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Knowledge', icon.cx, y + FOLDER_H - 26);
  ctx.fillText('Graph', icon.cx, y + FOLDER_H - 12);
}

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

// ── Folder View ──

function drawFolderView() {
  drawDesktopBg();
  drawTaskbar();

  const folder = FOLDERS.find(f => f.name === currentFolder);
  const folderColor = folder?.color || '#4A9EE8';
  const projects = PROJECTS[currentFolder] || [];

  drawWindowChrome(currentFolder, folderColor, true);

  // Content area with clip region
  ctx.save();
  ctx.beginPath();
  ctx.rect(WIN_X + 1, CONTENT_Y, WIN_W - 2, CONTENT_H - 1);
  ctx.clip();

  const cols = 2;
  const colW = (WIN_W - CARD_PAD * 3) / cols;
  const startY = CONTENT_Y + CARD_PAD + scrollOffset;

  projects.forEach((project, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cardX = WIN_X + CARD_PAD + col * (colW + CARD_PAD);
    const cardY = startY + row * (CARD_H + CARD_GAP);

    // Skip cards fully outside visible area
    if (cardY + CARD_H < CONTENT_Y || cardY > WIN_Y + WIN_H) return;

    const isHovered = hoveredElement?.type === 'card' && hoveredElement.index === i;

    // Card background
    ctx.fillStyle = isHovered ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)';
    roundRect(ctx, cardX, cardY, colW, CARD_H, 8);
    ctx.fill();

    // Left color accent bar
    ctx.fillStyle = project.color;
    roundRect(ctx, cardX, cardY, 4, CARD_H, 2);
    ctx.fill();

    // Project name
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = '600 15px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(project.name, cardX + 16, cardY + 12);

    // Gold star for featured projects
    if (project.featured) {
      const nameW = ctx.measureText(project.name).width;
      ctx.fillStyle = '#F1C40F';
      ctx.font = '14px sans-serif';
      ctx.fillText('\u2605', cardX + 20 + nameW, cardY + 12);
    }

    // Tech pills
    let pillX = cardX + 16;
    ctx.font = '400 10px "Helvetica Neue", Arial, sans-serif';
    for (const tech of project.tech) {
      const tw = ctx.measureText(tech).width + 12;
      if (pillX + tw > cardX + colW - 10) break;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      roundRect(ctx, pillX, cardY + 36, tw, 18, 9);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(tech, pillX + 6, cardY + 45);
      pillX += tw + 6;
    }

    // Thumbnail on the right side of the card
    const THUMB_W = 80;
    const THUMB_H = 45;
    const thumbX = cardX + colW - THUMB_W - 12;
    const thumbY = cardY + (CARD_H - THUMB_H) / 2;
    const cachedThumb = screenshotCache.get(project.name);

    if (cachedThumb) {
      drawImageCover(cachedThumb, thumbX, thumbY, THUMB_W, THUMB_H, 4);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      roundRect(ctx, thumbX, thumbY, THUMB_W, THUMB_H, 4);
      ctx.stroke();
    } else {
      // Loading stub
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      roundRect(ctx, thumbX, thumbY, THUMB_W, THUMB_H, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      roundRect(ctx, thumbX, thumbY, THUMB_W, THUMB_H, 4);
      ctx.stroke();
    }

    // Short description preview — narrowed to leave room for thumbnail
    const descMaxW = colW - 16 - THUMB_W - 20;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '400 11px "Helvetica Neue", Arial, sans-serif';
    ctx.textBaseline = 'top';
    const shortDesc = project.description.length > 46
      ? project.description.substring(0, 43) + '...'
      : project.description;
    ctx.fillText(shortDesc, cardX + 16, cardY + 62, descMaxW);
  });

  ctx.restore();
  canvasTexture.needsUpdate = true;
}

function hitTestProjectCards(cx, cy) {
  if (cy < CONTENT_Y || cy > WIN_Y + WIN_H) return -1;

  const projects = PROJECTS[currentFolder] || [];
  const cols = 2;
  const colW = (WIN_W - CARD_PAD * 3) / cols;
  const startY = CONTENT_Y + CARD_PAD + scrollOffset;

  for (let i = 0; i < projects.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cardX = WIN_X + CARD_PAD + col * (colW + CARD_PAD);
    const cardY = startY + row * (CARD_H + CARD_GAP);

    if (cx >= cardX && cx <= cardX + colW && cy >= cardY && cy <= cardY + CARD_H) {
      return i;
    }
  }
  return -1;
}

// ── Project Detail View ──

function drawProjectDetail() {
  drawDesktopBg();
  drawTaskbar();

  const project = PROJECTS[currentFolder]?.[currentProject];
  if (!project) return;

  drawWindowChrome(project.name, project.color, true);

  const padX = WIN_X + 40;
  const maxW = WIN_W - 80;
  let y = CONTENT_Y + 24;

  // Project name (large)
  ctx.fillStyle = project.color;
  ctx.font = '700 26px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(project.name, padX, y);
  y += 38;

  // Divider
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fillRect(padX, y, maxW, 1);
  y += 18;

  // Description (word-wrapped)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = '400 14px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  y = wrapText(project.description, padX, y, maxW, 22);
  y += 16;

  // Tech section header
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '600 11px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('TECH STACK', padX, y);
  y += 20;

  // Tech pills (larger than in card view)
  let pillX = padX;
  ctx.font = '400 12px "Helvetica Neue", Arial, sans-serif';
  for (const tech of project.tech) {
    const tw = ctx.measureText(tech).width + 16;
    ctx.fillStyle = project.color + '30';
    roundRect(ctx, pillX, y, tw, 26, 13);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tech, pillX + 8, y + 13);
    pillX += tw + 8;
  }
  y += 46;

  // Action buttons row
  let btnX = padX;
  const btnW = 160;
  const btnH = 40;

  if (project.url) {
    VISIT_BTN.x = btnX;
    VISIT_BTN.y = y;
    VISIT_BTN.w = btnW;
    VISIT_BTN.h = btnH;

    const isHovered = hoveredElement?.type === 'visit';
    ctx.fillStyle = isHovered ? project.color : project.color + 'CC';
    roundRect(ctx, btnX, y, btnW, btnH, 20);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '600 14px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Visit Site \u2192', btnX + btnW / 2, y + btnH / 2);
    btnX += btnW + 16;
  } else if (project.playable) {
    PLAY_BTN.x = btnX;
    PLAY_BTN.y = y;
    PLAY_BTN.w = btnW;
    PLAY_BTN.h = btnH;

    const isHovered = hoveredElement?.type === 'play';
    ctx.fillStyle = isHovered ? project.color : project.color + 'CC';
    roundRect(ctx, btnX, y, btnW, btnH, 20);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '600 14px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Play Game \u25B6', btnX + btnW / 2, y + btnH / 2);
    btnX += btnW + 16;
  }

  // View Cards button (projects that ship a `cards` image set)
  if (project.cards) {
    CARDS_BTN.x = btnX;
    CARDS_BTN.y = y;
    CARDS_BTN.w = btnW;
    CARDS_BTN.h = btnH;

    const isHovered = hoveredElement?.type === 'cards';
    ctx.fillStyle = isHovered ? '#ffffff30' : '#ffffff18';
    roundRect(ctx, btnX, y, btnW, btnH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232, 184, 122, 0.55)';
    ctx.lineWidth = 1;
    roundRect(ctx, btnX, y, btnW, btnH, 20);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = '600 14px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('View Cards \uD83D\uDD0D', btnX + btnW / 2, y + btnH / 2);
    btnX += btnW + 16;
  }

  // Watch Demo button (for projects with demoVideo)
  if (project.demoVideo && videoCache.has(project.name)) {
    DEMO_BTN.x = btnX;
    DEMO_BTN.y = y;
    DEMO_BTN.w = btnW;
    DEMO_BTN.h = btnH;

    const isHovered = hoveredElement?.type === 'demo';
    ctx.fillStyle = isHovered ? '#ffffff30' : '#ffffff18';
    roundRect(ctx, btnX, y, btnW, btnH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    roundRect(ctx, btnX, y, btnW, btnH, 20);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = '600 14px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Watch Demo \u25B6', btnX + btnW / 2, y + btnH / 2);
  }

  y += btnH + 20;

  // ── Screenshot / video preview (inline small) ──
  const previewX = padX;
  const previewW = maxW;
  const windowBottom = WIN_Y + WIN_H - 14;
  const previewH = windowBottom - y;

  if (previewH > 40) {
    const video = videoCache.get(project.name);
    const cached = screenshotCache.get(project.name);

    if (video && video.readyState >= 2) {
      drawVideoFrame(video, previewX, y, previewW, previewH);
      if (!video.paused) canvasTexture.needsUpdate = true;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      roundRect(ctx, previewX, y, previewW, previewH, 8);
      ctx.stroke();
    } else if (cached) {
      drawImageCover(cached, previewX, y, previewW, previewH, 8);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      roundRect(ctx, previewX, y, previewW, previewH, 8);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      roundRect(ctx, previewX, y, previewW, previewH, 8);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      roundRect(ctx, previewX, y, previewW, previewH, 8);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.font = '400 12px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Loading preview...', previewX + previewW / 2, y + previewH / 2);
    }
  }

  // Make the preview clickable for projects that ship a card viewer, and draw
  // a small "Click to enlarge" hint pill in its corner.
  CARDS_PREVIEW.active = false;
  if (previewH > 40 && project.cards && screenshotCache.get(project.name)) {
    CARDS_PREVIEW.x = previewX;
    CARDS_PREVIEW.y = y;
    CARDS_PREVIEW.w = previewW;
    CARDS_PREVIEW.h = previewH;
    CARDS_PREVIEW.active = true;

    const hint = '🔍 Click to enlarge';
    ctx.font = '600 11px "Helvetica Neue", Arial, sans-serif';
    const hw = ctx.measureText(hint).width + 20;
    const hh = 22;
    const hx = previewX + previewW - hw - 10;
    const hy = y + previewH - hh - 10;
    ctx.fillStyle = 'rgba(10, 8, 6, 0.7)';
    roundRect(ctx, hx, hy, hw, hh, 11);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232, 184, 122, 0.4)';
    ctx.lineWidth = 1;
    roundRect(ctx, hx, hy, hw, hh, 11);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 224, 170, 0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hint, hx + hw / 2, hy + hh / 2 + 0.5);
  }

  canvasTexture.needsUpdate = true;

  // Keep redrawing while an inline video is playing
  if (inlineVideoRAF) cancelAnimationFrame(inlineVideoRAF);
  const inlineVid = videoCache.get(project.name);
  if (inlineVid && !inlineVid.paused) {
    inlineVideoRAF = requestAnimationFrame(() => drawProjectDetail());
  }
}

// ── Fullscreen video view ──

function drawVideoFullscreen() {
  const project = PROJECTS[currentFolder]?.[currentProject];
  if (!project) return;

  const video = videoCache.get(project.name);
  if (!video) return;

  // Dark background
  ctx.fillStyle = '#0a0c10';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Draw video filling the full canvas with aspect-fit
  const pad = 0;
  const vw = CANVAS_W - pad * 2;
  const vh = CANVAS_H - 40 - pad; // leave 40px for bottom bar
  const videoAR = video.videoWidth / video.videoHeight;
  const areaAR = vw / vh;

  let dx, dy, dw, dh;
  if (videoAR > areaAR) {
    dw = vw;
    dh = vw / videoAR;
    dx = pad;
    dy = pad + (vh - dh) / 2;
  } else {
    dh = vh;
    dw = vh * videoAR;
    dx = pad + (vw - dw) / 2;
    dy = pad;
  }

  ctx.drawImage(video, dx, dy, dw, dh);

  // Bottom bar with close hint
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, CANVAS_H - 40, CANVAS_W, 40);

  // Close button area
  DEMO_BTN.x = CANVAS_W / 2 - 60;
  DEMO_BTN.y = CANVAS_H - 36;
  DEMO_BTN.w = 120;
  DEMO_BTN.h = 32;

  const isHovered = hoveredElement?.type === 'demo';
  ctx.fillStyle = isHovered ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
  roundRect(ctx, DEMO_BTN.x, DEMO_BTN.y, DEMO_BTN.w, DEMO_BTN.h, 16);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = '600 13px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Close \u2715', CANVAS_W / 2, CANVAS_H - 20);

  canvasTexture.needsUpdate = true;
}

function startVideoFullscreen() {
  const project = PROJECTS[currentFolder]?.[currentProject];
  if (!project) return;

  const video = videoCache.get(project.name);
  if (!video) return;

  stopVideoLoop();
  videoFullscreen = true;
  activeVideo = video;
  video.currentTime = 0;
  video.play().catch(() => {});

  function tick() {
    if (!activeVideo || !videoFullscreen) return;
    drawVideoFullscreen();
    videoRAF = requestAnimationFrame(tick);
  }
  videoRAF = requestAnimationFrame(tick);
}

function exitVideoFullscreen() {
  videoFullscreen = false;
  stopVideoLoop();
  drawProjectDetail();
}

// ── Graph View ──

function drawGraphScreen() {
  drawDesktopBg();
  drawTaskbar();
  drawWindowChrome('Knowledge Graph', GRAPH_ICON.color, true);

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
  const CATEGORY_COLORS_LOCAL = { project: '#4A9EE8', concept: '#9B59B6', tool: '#2ECC71', entity: '#E67E22', analysis: '#E84A8A' };
  const color = node ? (CATEGORY_COLORS_LOCAL[node.category] || GRAPH_ICON.color) : GRAPH_ICON.color;
  drawWindowChrome('Knowledge Graph', color, true);

  ctx.save();
  ctx.beginPath();
  ctx.rect(WIN_X + 1, CONTENT_Y, WIN_W - 2, CONTENT_H - 1);
  ctx.clip();

  renderGraphDetail(ctx, WIN_X + 1, CONTENT_Y, WIN_W - 2, CONTENT_H - 1, hoveredGraphConnection);

  ctx.restore();
  canvasTexture.needsUpdate = true;
}

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

// ────────────────────────────────────────────
// Screen interaction (raycaster → UV → canvas hit test)
// ────────────────────────────────────────────

function screenUV(event) {
  if (!screenMesh) return null;

  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObject(screenMesh);

  if (intersects.length > 0 && intersects[0].uv) {
    const uv = intersects[0].uv;
    return { x: uv.x * CANVAS_W, y: (1 - uv.y) * CANVAS_H };
  }
  return null;
}

function hitTestFolders(cx, cy) {
  for (const folder of FOLDERS) {
    const fx = folder.cx - FOLDER_W / 2;
    const fy = folder.cy - FOLDER_H / 2;
    if (cx >= fx && cx <= fx + FOLDER_W && cy >= fy && cy <= fy + FOLDER_H) {
      return folder;
    }
  }
  if (graphAvailable) {
    const gx = GRAPH_ICON.cx - FOLDER_W / 2;
    const gy = GRAPH_ICON.cy - FOLDER_H / 2;
    if (cx >= gx && cx <= gx + FOLDER_W && cy >= gy && cy <= gy + FOLDER_H) {
      return GRAPH_ICON;
    }
  }
  return null;
}

function redrawCurrentPhase() {
  if (screenPhase === 'desktop') drawDesktop();
  else if (screenPhase === 'folder') drawFolderView();
  else if (screenPhase === 'project' && !videoFullscreen) drawProjectDetail();
  else if (screenPhase === 'graph') drawGraphScreen();
  else if (screenPhase === 'graphDetail') drawGraphDetailScreen();
}

// ── Click handler ──

function onScreenClick(event) {
  if (!active) return;

  const hit = screenUV(event);
  if (!hit) return;

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
  } else if (screenPhase === 'folder') {
    // Close or Back → desktop
    if (hitRect(hit.x, hit.y, CLOSE_BTN) || hitRect(hit.x, hit.y, BACK_BTN)) {
      playClick();
      screenPhase = 'desktop';
      currentFolder = null;
      hoveredElement = null;
      drawDesktop();
      return;
    }
    // Card click → project detail
    const idx = hitTestProjectCards(hit.x, hit.y);
    if (idx >= 0) {
      playClick();
      currentProject = idx;
      screenPhase = 'project';
      hoveredElement = null;
      // Auto-play video preview if project has one
      const proj = PROJECTS[currentFolder]?.[idx];
      if (proj) {
        const vid = videoCache.get(proj.name);
        if (vid) vid.play().catch(() => {});
      }
      drawProjectDetail();
    }
  } else if (screenPhase === 'project') {
    // Video fullscreen mode — only the close button works
    if (videoFullscreen) {
      if (hitRect(hit.x, hit.y, DEMO_BTN)) {
        playClick();
        exitVideoFullscreen();
      }
      return;
    }
    // Close → desktop
    if (hitRect(hit.x, hit.y, CLOSE_BTN)) {
      playClick();
      stopVideoLoop();
      screenPhase = 'desktop';
      currentFolder = null;
      currentProject = null;
      hoveredElement = null;
      drawDesktop();
      return;
    }
    // Back → folder view
    if (hitRect(hit.x, hit.y, BACK_BTN)) {
      playClick();
      stopVideoLoop();
      screenPhase = 'folder';
      currentProject = null;
      hoveredElement = null;
      drawFolderView();
      return;
    }
    // Visit button → open URL
    const project = PROJECTS[currentFolder]?.[currentProject];
    if (project?.url && hitRect(hit.x, hit.y, VISIT_BTN)) {
      playClick();
      window.open(project.url, '_blank');
    }
    // Play button → launch embedded game
    if (project?.playable && hitRect(hit.x, hit.y, PLAY_BTN)) {
      playClick();
      launchGame(project.gamePath);
    }
    // Watch Demo button → fullscreen video
    if (project?.demoVideo && videoCache.has(project.name) && hitRect(hit.x, hit.y, DEMO_BTN)) {
      playClick();
      startVideoFullscreen();
    }
    // View Cards button OR clicking the preview → open the card viewer overlay
    if (project?.cards && (hitRect(hit.x, hit.y, CARDS_BTN) ||
        (CARDS_PREVIEW.active && hitRect(hit.x, hit.y, CARDS_PREVIEW)))) {
      playClick();
      openCardsOverlay(project.cards);
    }
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
  } else if (screenPhase === 'graphDetail') {
    if (hitRect(hit.x, hit.y, CLOSE_BTN)) {
      playClick();
      pauseSimulation();
      resetGraphState();
      screenPhase = 'desktop';
      hoveredElement = null;
      drawDesktop();
      return;
    }
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
}

// ── Hover handler ──

function onScreenPointerMove(event) {
  if (!active) return;

  const hit = screenUV(event);
  if (!hit) {
    if (hoveredElement) {
      hoveredElement = null;
      redrawCurrentPhase();
    }
    renderer.domElement.style.cursor = 'default';
    return;
  }

  let newHover = null;

  if (screenPhase === 'desktop') {
    const folder = hitTestFolders(hit.x, hit.y);
    if (folder) newHover = { type: 'folder', name: folder.name };
  } else if (screenPhase === 'folder') {
    if (hitRect(hit.x, hit.y, CLOSE_BTN)) {
      newHover = { type: 'close' };
    } else if (hitRect(hit.x, hit.y, BACK_BTN)) {
      newHover = { type: 'back' };
    } else {
      const idx = hitTestProjectCards(hit.x, hit.y);
      if (idx >= 0) newHover = { type: 'card', index: idx };
    }
  } else if (screenPhase === 'project') {
    if (videoFullscreen) {
      if (hitRect(hit.x, hit.y, DEMO_BTN)) {
        newHover = { type: 'demo' };
      }
    } else if (hitRect(hit.x, hit.y, CLOSE_BTN)) {
      newHover = { type: 'close' };
    } else if (hitRect(hit.x, hit.y, BACK_BTN)) {
      newHover = { type: 'back' };
    } else {
      const project = PROJECTS[currentFolder]?.[currentProject];
      if (project?.url && hitRect(hit.x, hit.y, VISIT_BTN)) {
        newHover = { type: 'visit' };
      }
      if (project?.playable && hitRect(hit.x, hit.y, PLAY_BTN)) {
        newHover = { type: 'play' };
      }
      if (project?.demoVideo && videoCache.has(project.name) && hitRect(hit.x, hit.y, DEMO_BTN)) {
        newHover = { type: 'demo' };
      }
      if (project?.cards && (hitRect(hit.x, hit.y, CARDS_BTN) ||
          (CARDS_PREVIEW.active && hitRect(hit.x, hit.y, CARDS_PREVIEW)))) {
        newHover = { type: 'cards' };
      }
    }
  } else if (screenPhase === 'graph') {
    if (isDragging()) {
      updateDrag(hit.x, hit.y);
    }
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
      const padX = WIN_X + 1 + 40;
      const connectionsStartY = CONTENT_Y + 120;
      const idx = hitTestConnection(hit.x, hit.y, WIN_X + 1, CONTENT_Y, WIN_W - 2, CONTENT_H - 1, padX, connectionsStartY);
      if (idx !== hoveredGraphConnection) {
        hoveredGraphConnection = idx;
        drawGraphDetailScreen();
      }
      if (idx >= 0) newHover = { type: 'graphConnection' };
    }
  }

  // Only redraw when hover state actually changes
  const changed = JSON.stringify(newHover) !== JSON.stringify(hoveredElement);
  if (changed) {
    hoveredElement = newHover;
    redrawCurrentPhase();
  }

  renderer.domElement.style.cursor = newHover ? 'pointer' : 'default';
}

// ── Scroll handler (folder view only) ──

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

// ────────────────────────────────────────────
// Image / video preview helpers
// ────────────────────────────────────────────

function drawImageCover(img, px, py, pw, ph, radius = 8) {
  ctx.save();
  roundRect(ctx, px, py, pw, ph, radius);
  ctx.clip();

  const imgAR = img.width / img.height;
  const destAR = pw / ph;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (imgAR > destAR) {
    sw = img.height * destAR;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / destAR;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, px, py, pw, ph);
  ctx.restore();
}

function drawVideoFrame(video, px, py, pw, ph) {
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 8);
  ctx.clip();

  // Aspect-fit the video into the preview region
  const videoAR = video.videoWidth / video.videoHeight;
  const previewAR = pw / ph;
  let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
  if (videoAR > previewAR) {
    // Video is wider — crop sides
    sw = video.videoHeight * previewAR;
    sx = (video.videoWidth - sw) / 2;
  } else {
    // Video is taller — crop top/bottom
    sh = video.videoWidth / previewAR;
    sy = (video.videoHeight - sh) / 2;
  }
  ctx.drawImage(video, sx, sy, sw, sh, px, py, pw, ph);
  ctx.restore();

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, px, py, pw, ph, 8);
  ctx.stroke();

  canvasTexture.needsUpdate = true;
}

function startVideoLoop(px, py, pw, ph) {
  function tick() {
    if (!activeVideo) return;
    drawVideoFrame(activeVideo, px, py, pw, ph);
    videoRAF = requestAnimationFrame(tick);
  }
  videoRAF = requestAnimationFrame(tick);
}

function stopVideoLoop() {
  videoFullscreen = false;
  if (videoRAF) {
    cancelAnimationFrame(videoRAF);
    videoRAF = null;
  }
  if (activeVideo) {
    activeVideo.pause();
    activeVideo = null;
  }
  // Pause any inline preview video
  if (inlineVideoRAF) { cancelAnimationFrame(inlineVideoRAF); inlineVideoRAF = null; }
  const proj = PROJECTS[currentFolder]?.[currentProject];
  if (proj) {
    const vid = videoCache.get(proj.name);
    if (vid) vid.pause();
  }
}

// ────────────────────────────────────────────
// Screenshot placeholder generation
// ────────────────────────────────────────────

/**
 * Generates a placeholder screenshot for a project using an offscreen canvas.
 * Returns an HTMLCanvasElement with a branded preview image (1024×576).
 */
function generatePlaceholder(project) {
  const w = 1024;
  const h = 576;
  const pc = document.createElement('canvas');
  pc.width = w;
  pc.height = h;
  const c = pc.getContext('2d');

  // Background gradient using project color
  const bg = c.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, project.color + 'cc');
  bg.addColorStop(1, '#0a0a1a');
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);

  // Subtle dot grid overlay
  c.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let gx = 32; gx < w; gx += 48) {
    for (let gy = 32; gy < h; gy += 48) {
      c.beginPath();
      c.arc(gx, gy, 1.5, 0, Math.PI * 2);
      c.fill();
    }
  }

  // Horizontal rule lines for "site structure" feel
  c.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  c.lineWidth = 1;
  for (let ly = 80; ly < h - 60; ly += 56) {
    c.beginPath();
    c.moveTo(60, ly);
    c.lineTo(w - 60, ly);
    c.stroke();
  }

  // Faint vertical line (like a sidebar/column)
  c.beginPath();
  c.moveTo(w * 0.28, 60);
  c.lineTo(w * 0.28, h - 60);
  c.stroke();

  // Center vignette for depth
  const vig = c.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, h * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = vig;
  c.fillRect(0, 0, w, h);

  // Project name — large centered
  c.fillStyle = 'rgba(255, 255, 255, 0.95)';
  c.font = '700 72px "Helvetica Neue", Arial, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(project.name, w / 2, h / 2 - 30);

  // Tech stack below the name
  const techStr = project.tech.join('  ·  ');
  c.fillStyle = 'rgba(255, 255, 255, 0.5)';
  c.font = '400 22px "Helvetica Neue", Arial, sans-serif';
  c.fillText(techStr, w / 2, h / 2 + 42);

  // Thin bottom accent line using project color
  c.fillStyle = project.color;
  c.fillRect(0, h - 4, w, 4);

  return pc;
}

/**
 * Preloads all project screenshots into screenshotCache.
 * First tries to fetch from /projects/{name}.png.
 * Falls back to a generated placeholder if the image is missing.
 */
function preloadScreenshots() {
  const allProjects = [
    ...PROJECTS.Websites,
    ...PROJECTS.Apps,
  ];

  for (const project of allProjects) {
    // Preload demo video if project has one
    if (project.demoVideo) {
      const video = document.createElement('video');
      video.src = project.demoVideo;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.addEventListener('canplaythrough', () => {
        videoCache.set(project.name, video);
      }, { once: true });
      video.load();
    }

    const img = new Image();
    const slug = project.name.toLowerCase().replace(/\s+/g, '-');

    img.onload = () => {
      screenshotCache.set(project.name, img);
    };
    img.onerror = () => {
      // No external image found — use the generated placeholder
      screenshotCache.set(project.name, generatePlaceholder(project));
    };

    // Prefer an explicit screenshot path when set (avoids awkward slugs like
    // "nate's-brakes"); otherwise fall back to the derived slug filename.
    img.src = project.screenshot || `/projects/${slug}.png`;
  }
}

// ────────────────────────────────────────────
// Boot sequence
// ────────────────────────────────────────────

function startBoot() {
  screenPhase = 'booting';

  // Scatter a few keyboard-tap sounds across the 1.8s boot animation
  // to give the impression of the system initialising.
  const bootTapTimes = [100, 350, 620, 900, 1180, 1450];
  bootTapTimes.forEach((ms) => {
    setTimeout(() => { if (screenPhase === 'booting') playType(); }, ms);
  });

  const proxy = { p: 0 };
  gsap.to(proxy, {
    p: 1,
    duration: 1.8,
    ease: 'power1.in',
    onUpdate: () => drawBootScreen(proxy.p),
    onComplete: () => {
      // Brief white flash then desktop
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      canvasTexture.needsUpdate = true;

      setTimeout(() => {
        screenPhase = 'desktop';
        drawDesktop();
      }, 120);
    },
  });
}

// ────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────

export function initComputer(sceneRef, cameraRef, rendererRef) {
  scene = sceneRef;
  camera = cameraRef;
  renderer = rendererRef;

  // Find MonitorScreen mesh
  scene.traverse((child) => {
    if (child.isMesh && child.name === 'MonitorScreen') {
      screenMesh = child;
    }
  });

  if (!screenMesh) {
    console.warn('MonitorScreen mesh not found');
    return;
  }

  // Replace box geometry with a plane for clean 0-1 UVs
  screenMesh.geometry.computeBoundingBox();
  const origBB = screenMesh.geometry.boundingBox;
  const origCenter = new THREE.Vector3();
  origBB.getCenter(origCenter);
  const screenFrontZ = origBB.min.z - 0.002;

  screenMesh.geometry.dispose();
  const plane = new THREE.PlaneGeometry(0.46, 0.26);
  plane.rotateY(Math.PI);
  plane.translate(origCenter.x, origCenter.y, screenFrontZ);
  screenMesh.geometry = plane;

  // Offscreen canvas + texture
  offCanvas = document.createElement('canvas');
  offCanvas.width = CANVAS_W;
  offCanvas.height = CANVAS_H;
  ctx = offCanvas.getContext('2d');

  canvasTexture = new THREE.CanvasTexture(offCanvas);
  canvasTexture.colorSpace = THREE.SRGBColorSpace;

  if (screenMesh.material) screenMesh.material.dispose();
  screenMesh.material = new THREE.MeshBasicMaterial({ map: canvasTexture });

  // Initial: screen off (dark)
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  canvasTexture.needsUpdate = true;

  // Preload project screenshots (or generate placeholders)
  preloadScreenshots();

  // Load knowledge graph data
  loadGraphData().then(ok => {
    graphAvailable = ok;
    if (ok) {
      FOLDERS = FOLDERS_3;
    }
  });

  // Bind handlers
  onClickBound = onScreenClick;
  onPointerMoveBound = onScreenPointerMove;
  onWheelBound = onScreenWheel;

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
}

export function enterComputer(cam) {
  active = true;

  // Activate screen interaction
  renderer.domElement.addEventListener('click', onClickBound);
  renderer.domElement.addEventListener('pointermove', onPointerMoveBound);
  renderer.domElement.addEventListener('wheel', onWheelBound, { passive: false });
  renderer.domElement.addEventListener('pointerdown', onPointerDownBound);
  renderer.domElement.addEventListener('pointerup', onPointerUpBound);

  // Live clock — redraw current phase every 30s so the taskbar clock stays accurate
  clockInterval = setInterval(() => {
    if (active && screenPhase !== 'off' && screenPhase !== 'booting') {
      redrawCurrentPhase();
    }
  }, 30_000);

  const tl = gsap.timeline();

  // Phase 1: Camera zooms into the monitor
  tl.to(cam.position, {
    x: CAMERA_ZOOM_POS.x,
    y: CAMERA_ZOOM_POS.y,
    z: CAMERA_ZOOM_POS.z,
    duration: 1.2,
    ease: 'power2.inOut',
    onUpdate: () => cam.lookAt(MONITOR_POS),
  });

  // Phase 2: Boot animation after camera settles
  tl.call(() => startBoot(), null, '+=0.1');

  return tl;
}

export function exitComputer(cam, targetPos, targetLook) {
  active = false;
  screenPhase = 'off';

  // Stop video playback
  stopVideoLoop();

  // Stop graph
  stopGraphLoop();
  pauseSimulation();
  resetGraphState();

  // Stop clock
  clearInterval(clockInterval);
  clockInterval = null;

  // Reset file explorer state
  currentFolder = null;
  currentProject = null;
  scrollOffset = 0;
  hoveredElement = null;

  // Remove interaction
  renderer.domElement.removeEventListener('click', onClickBound);
  renderer.domElement.removeEventListener('pointermove', onPointerMoveBound);
  renderer.domElement.removeEventListener('wheel', onWheelBound);
  renderer.domElement.removeEventListener('pointerdown', onPointerDownBound);
  renderer.domElement.removeEventListener('pointerup', onPointerUpBound);
  renderer.domElement.style.cursor = 'default';

  // Screen off
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  canvasTexture.needsUpdate = true;

  // Camera return
  const tl = gsap.timeline();
  const lookProxy = { x: MONITOR_POS.x, y: MONITOR_POS.y, z: MONITOR_POS.z };

  tl.to(cam.position, {
    x: targetPos.x, y: targetPos.y, z: targetPos.z,
    duration: 1.5, ease: 'power2.inOut',
    onUpdate: () => cam.lookAt(lookProxy.x, lookProxy.y, lookProxy.z),
  }, 0);

  tl.to(lookProxy, {
    x: targetLook.x, y: targetLook.y, z: targetLook.z,
    duration: 1.5, ease: 'power2.inOut',
  }, 0);

  // Dispose canvas texture after exit animation completes
  tl.call(() => {
    if (canvasTexture) { canvasTexture.dispose(); canvasTexture = null; }
  });

  return tl;
}

// ── Game embedding ──

function getScreenMeshRect() {
  if (!screenMesh || !camera || !renderer) return null;

  screenMesh.updateMatrixWorld();
  const posAttr = screenMesh.geometry.getAttribute('position');

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const v = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);
    v.applyMatrix4(screenMesh.matrixWorld);
    v.project(camera);

    const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;

    minX = Math.min(minX, sx);
    minY = Math.min(minY, sy);
    maxX = Math.max(maxX, sx);
    maxY = Math.max(maxY, sy);
  }

  return {
    left: Math.round(minX),
    top: Math.round(minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  };
}

function onGameMessage(event) {
  if (event.data === 'parallax-quit' || event.data === 'poker-quit') {
    closeGame();
  }
}

function launchGame(gamePath) {
  gameActive = true;

  const rect = getScreenMeshRect();
  if (!rect) return;

  const overlay = document.getElementById('game-overlay');
  const iframe = document.getElementById('game-iframe');
  const closeBtn = document.getElementById('btn-close-game');

  // Position iframe to match the computer screen mesh
  iframe.style.left   = `${rect.left}px`;
  iframe.style.top    = `${rect.top}px`;
  iframe.style.width  = `${rect.width}px`;
  iframe.style.height = `${rect.height}px`;

  // Position close button above top-right of iframe
  closeBtn.style.left = `${rect.left + rect.width - 90}px`;
  closeBtn.style.top  = `${Math.max(4, rect.top - 36)}px`;

  // Load game and show overlay (cache-bust to avoid stale pck/wasm)
  iframe.src = `${gamePath}?v=${Date.now()}`;
  overlay.style.display = 'block';

  // Hide computer overlay back button while game runs
  const computerOverlay = document.getElementById('computer-overlay');
  if (computerOverlay) computerOverlay.style.display = 'none';

  // Remove canvas interaction while game runs
  renderer.domElement.removeEventListener('click', onClickBound);
  renderer.domElement.removeEventListener('pointermove', onPointerMoveBound);
  renderer.domElement.removeEventListener('wheel', onWheelBound);
  renderer.domElement.removeEventListener('pointerdown', onPointerDownBound);
  renderer.domElement.removeEventListener('pointerup', onPointerUpBound);
  renderer.domElement.style.cursor = 'default';

  // Mute portfolio audio
  setIndoorVolume(0);

  // Go fullscreen for immersion and to capture the mouse
  iframe.requestFullscreen?.().catch(() => {});

  // Once the game loads, hook up M→ESC mapping and gameplay pointer lock.
  // We deliberately do NOT requestPointerLock on canvas click — that hides the
  // cursor on the main menu and breaks menu interaction. Instead, we lock the
  // pointer on the first WASD keypress, which is unambiguously gameplay (the
  // menu uses mouse only). Browser ESC will release it automatically.
  iframe.addEventListener('load', function onGameLoad() {
    iframe.removeEventListener('load', onGameLoad);
    try {
      const iframeDoc = iframe.contentDocument;
      const canvas = iframeDoc?.getElementById('canvas');
      if (canvas) {
        const movementKeys = new Set(['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
        iframeDoc.addEventListener('keydown', (e) => {
          // M key → dispatch ESC to Godot (opens pause menu)
          if (e.key === 'm' || e.key === 'M') {
            e.preventDefault();
            canvas.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true,
            }));
            return;
          }
          // Movement key during gameplay → ensure pointer lock so mouse-look
          // doesn't escape the iframe.
          if (movementKeys.has(e.key) && !iframeDoc.pointerLockElement) {
            canvas.requestPointerLock?.();
          }
        });
      }
    } catch (e) {}
  });

  // Focus iframe for keyboard input
  iframe.focus();

  // Listen for quit message from game
  window.addEventListener('message', onGameMessage);

  // Also close game if user exits fullscreen manually
  document.addEventListener('fullscreenchange', onFullscreenChange);
}

function onFullscreenChange() {
  if (!document.fullscreenElement && gameActive) {
    closeGame();
  }
}

export function closeGame() {
  gameActive = false;

  const overlay = document.getElementById('game-overlay');
  const iframe = document.getElementById('game-iframe');

  // Unload game
  iframe.src = 'about:blank';
  overlay.style.display = 'none';

  // Re-show computer overlay
  const computerOverlay = document.getElementById('computer-overlay');
  if (computerOverlay) computerOverlay.style.display = 'flex';

  // Re-bind canvas interaction
  renderer.domElement.addEventListener('click', onClickBound);
  renderer.domElement.addEventListener('pointermove', onPointerMoveBound);
  renderer.domElement.addEventListener('wheel', onWheelBound, { passive: false });
  renderer.domElement.addEventListener('pointerdown', onPointerDownBound);
  renderer.domElement.addEventListener('pointerup', onPointerUpBound);

  // Restore portfolio audio
  setIndoorVolume(0.15);

  // Clean up listeners
  window.removeEventListener('message', onGameMessage);
  document.removeEventListener('fullscreenchange', onFullscreenChange);

  // Exit fullscreen if still in it
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }

  // Redraw project detail
  redrawCurrentPhase();
}

// ── Card viewer overlay (front/back business cards, full-resolution DOM) ──
// A lightweight image lightbox layered over the computer view, mirroring the
// music overlay. The full-screen `.overlay` captures pointer events, so the
// computer's canvas listeners underneath stay harmlessly inert until close.

export function openCardsOverlay(images) {
  const overlay = document.getElementById('cards-overlay');
  if (!overlay) return;
  const wrap = overlay.querySelector('.cards-images');
  if (wrap) {
    wrap.innerHTML = '';
    (images || []).forEach((src, i) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = i === 0 ? 'Business card front' : 'Business card back';
      img.className = 'card-img';
      wrap.appendChild(img);
    });
  }
  overlay.style.display = 'flex';
  playClick();
}

export function closeCardsOverlay() {
  const overlay = document.getElementById('cards-overlay');
  if (overlay) overlay.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-close-cards')?.addEventListener('click', closeCardsOverlay);
  // Click the dimmed backdrop (but not the panel) to dismiss
  document.getElementById('cards-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'cards-overlay') closeCardsOverlay();
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('cards-overlay');
    if (overlay && overlay.style.display !== 'none') closeCardsOverlay();
  }
});

export function repositionGameIframe() {
  if (!gameActive) return;
  const rect = getScreenMeshRect();
  if (!rect) return;

  const iframe = document.getElementById('game-iframe');
  const closeBtn = document.getElementById('btn-close-game');

  iframe.style.left   = `${rect.left}px`;
  iframe.style.top    = `${rect.top}px`;
  iframe.style.width  = `${rect.width}px`;
  iframe.style.height = `${rect.height}px`;

  closeBtn.style.left = `${rect.left + rect.width - 90}px`;
  closeBtn.style.top  = `${Math.max(4, rect.top - 36)}px`;
}

export { gameActive };
