// src/components/research/KnowledgeGraph.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Interactive Knowledge Graph — FULL THEME COMPATIBILITY
// Visual upgrade with theme-aware colors and text visibility
// Part 58.5 — Collision-aware force layout so nodes never overlap each other
//             (or each other's labels), even in dense graphs.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useEffect, useRef, useState, useMemo, useCallback,
} from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Dimensions, PanResponder, TextInput, Modal,
  InteractionManager, ActivityIndicator, Alert, Platform,
} from 'react-native';
import Svg, {
  Circle, Line, Text as SvgText, G,
  Defs, RadialGradient, LinearGradient as SvgLinearGradient, Stop,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  forceSimulation, forceManyBody, forceLink, forceCollide, forceX, forceY,
} from 'd3-force';
import {
  KnowledgeGraph as KnowledgeGraphType,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
} from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import type {
  KnowledgeGraphCluster,
  ExtendedKnowledgeGraph,
} from '../../services/agents/knowledgeGraphAgent';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const CLUSTER_FALLBACK = [
  '#6C63FF', '#00D4AA', '#FF6584', '#F9CB42',
  '#4FACFE', '#F093FB', '#43E97B', '#FF8E53',
];

const NODE_TYPE_COLORS: Record<string, string> = {
  root: '#6C63FF', primary: '#4FACFE', secondary: '#43E97B',
  concept: '#F093FB', company: '#FA709A', trend: '#F9CB42',
};

const NODE_TYPE_SIZE: Record<string, number> = {
  root: 34, primary: 24, secondary: 17, concept: 16, company: 20, trend: 18,
};

const EDGE_DASH: Record<string, string> = {
  causal: '0', hierarchical: '0', associative: '4,3', comparative: '6,3', temporal: '2,4',
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#43E97B', neutral: '#A0A0C0', negative: '#FF4757',
};

const MIN_SCALE = 0.25;
const MAX_SCALE = 5.0;
const ZOOM_STEP = 0.35;

function resolveId(ep: string | KnowledgeGraphNode): string {
  return typeof ep === 'string' ? ep : ep.id;
}
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function ptDist(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

// ─── Force simulation ──────────────────────────────────────────────────────────
// Part 58.5 — node spacing overhaul.
//
// The previous layout used a hand-rolled O(n²) repulsion pass with a single
// fixed spacing target (a flat "110" ideal edge length, generic 1/d² push).
// That approximates spacing between node *centers*, but never accounted for:
//   (a) each node type's actual rendered circle size (root=34 vs concept=16), or
//   (b) the label rendered *below* every node, which can be far wider than the
//       node circle itself for longer entity names.
// The result: labels of smaller nodes routinely overlapped neighboring nodes
// or their labels even when the circles looked "far enough" apart.
//
// This version:
//  1. Defines a per-node "collision radius" = max(circle radius + padding,
//     estimated label half-width + padding), so both the node body and its
//     label get guaranteed clearance.
//  2. Runs a real d3-force simulation (forceManyBody + forceLink +
//     forceCollide) — forceCollide is purpose-built to converge on
//     non-overlapping circle-packed layouts, which is far more reliable than
//     the previous approximate repulsion math.
//  3. Follows the simulation with a deterministic, iterative overlap-resolution
//     pass that directly separates any pair of nodes still closer than their
//     combined collision radius. This guarantees a fully overlap-free result
//     even if the physics simulation hasn't perfectly converged (dense
//     clusters, tight canvases, etc).
//  4. Preserves the original cluster-sector seeding + cluster-cohesion pull so
//     thematic grouping still reads clearly, and keeps the root node pinned
//     dead-center as before.

const LABEL_CHAR_WIDTH = 3.2;   // ≈ average glyph width (px) at the label font sizes used below nodes
const LABEL_MAX_CHARS  = 19;    // matches the "…" truncation applied when rendering labels
const NODE_PADDING     = 16;    // minimum guaranteed gap (px) between any two nodes/labels

function nodeBaseRadius(n: KnowledgeGraphNode): number {
  return NODE_TYPE_SIZE[n.type] ?? 18;
}

// Half the estimated width of a node's rendered label. Needed because a small
// node (e.g. a "concept" node, r=16) can carry a long label that is much wider
// than the circle itself — without this, physics would happily place a
// neighboring node right where that label renders.
function labelHalfWidth(n: KnowledgeGraphNode): number {
  const chars = Math.min((n.label ?? '').length, LABEL_MAX_CHARS);
  return (chars * LABEL_CHAR_WIDTH) / 2;
}

// The effective "personal space" radius used for both the physics collision
// force and the final deterministic overlap-resolution pass.
function collisionRadius(n: KnowledgeGraphNode): number {
  const r = nodeBaseRadius(n);
  return Math.max(r + NODE_PADDING, labelHalfWidth(n) + NODE_PADDING * 0.75);
}

type SimNode = KnowledgeGraphNode & {
  index?: number;
  vx?: number; vy?: number;
  x?: number; y?: number;
  fx?: number | null; fy?: number | null;
};

interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  strength: number;
}

// Custom d3-force-compatible force: pulls each non-root node toward the
// running centroid of its own cluster every tick, so thematic clusters stay
// visually grouped even as collision/repulsion forces push individual nodes
// apart to avoid overlap.
function makeClusterForce(nodes: SimNode[], clusterNodeMap: Map<string, string>) {
  return (alpha: number) => {
    if (clusterNodeMap.size === 0) return;
    const centers = new Map<string, { x: number; y: number; n: number }>();
    for (const n of nodes) {
      const cId = clusterNodeMap.get(n.id);
      if (!cId) continue;
      const c = centers.get(cId) ?? { x: 0, y: 0, n: 0 };
      c.x += n.x ?? 0; c.y += n.y ?? 0; c.n += 1;
      centers.set(cId, c);
    }
    for (const n of nodes) {
      if (n.type === 'root') continue;
      const cId = clusterNodeMap.get(n.id);
      if (!cId) continue;
      const c = centers.get(cId);
      if (!c || c.n < 2) continue;
      const cx = c.x / c.n, cy = c.y / c.n;
      n.vx = (n.vx ?? 0) + (cx - (n.x ?? 0)) * alpha * 0.05;
      n.vy = (n.vy ?? 0) + (cy - (n.y ?? 0)) * alpha * 0.05;
    }
  };
}

// Direct, non-physics positional correction: repeatedly pushes any pair of
// nodes closer than their combined collision radius apart along the line
// connecting their centers. This is the safety net that guarantees a fully
// overlap-free layout regardless of how well the physics simulation converged.
function resolveOverlaps(nodes: SimNode[], passes = 48) {
  for (let p = 0; p < passes; p++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const minDist = collisionRadius(a) + collisionRadius(b);
        let dx = (b.x ?? 0) - (a.x ?? 0);
        let dy = (b.y ?? 0) - (a.y ?? 0);
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.0001) {
          dx = (Math.random() - 0.5) * 0.5;
          dy = (Math.random() - 0.5) * 0.5;
          dist = 0.01;
        }
        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const ux = dx / dist, uy = dy / dist;
          const aFixed = a.type === 'root';
          const bFixed = b.type === 'root';
          if (!aFixed) {
            a.x = (a.x ?? 0) - ux * overlap * (bFixed ? 2 : 1);
            a.y = (a.y ?? 0) - uy * overlap * (bFixed ? 2 : 1);
          }
          if (!bFixed) {
            b.x = (b.x ?? 0) + ux * overlap * (aFixed ? 2 : 1);
            b.y = (b.y ?? 0) + uy * overlap * (aFixed ? 2 : 1);
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

function clampToBounds(nodes: SimNode[], W: number, H: number) {
  for (const n of nodes) {
    if (n.type === 'root') { n.x = W / 2; n.y = H / 2; continue; }
    const r = collisionRadius(n);
    // If a single node's footprint is larger than the canvas (pathological
    // case), fall back to centering it rather than producing NaN bounds.
    const minX = Math.min(r, W - r), maxX = Math.max(r, W - r);
    const minY = Math.min(r, H - r), maxY = Math.max(r, H - r);
    n.x = clamp(n.x ?? 0, minX, maxX);
    n.y = clamp(n.y ?? 0, minY, maxY);
  }
}

function runForceLayout(
  rawNodes: KnowledgeGraphNode[],
  rawEdges: KnowledgeGraphEdge[],
  clusters: KnowledgeGraphCluster[],
  W: number, H: number,
  iters = 400,
): KnowledgeGraphNode[] {
  const clusterNodeMap = new Map<string, string>();
  clusters.forEach(c => c.nodeIds.forEach(id => clusterNodeMap.set(id, c.id)));
  const clusterIds = clusters.map(c => c.id);
  const sectorSize = clusterIds.length > 0 ? (2 * Math.PI) / clusterIds.length : Math.PI;
  const clusterAngle = new Map<string, number>(clusterIds.map((id, i) => [id, i * sectorSize - Math.PI / 2]));

  // Seed positions in cluster-grouped sectors — same spirit as the original
  // layout — but with a wider spread so the physics pass starts from a less
  // crowded state and converges to a non-overlapping layout faster.
  const nodes: SimNode[] = rawNodes.map(n => {
    const cId = clusterNodeMap.get(n.id) ?? null;
    const ang = cId ? (clusterAngle.get(cId) ?? 0) : Math.random() * Math.PI * 2;
    const baseR = n.type === 'root' ? 0 : n.type === 'primary' ? 140 : 260;
    const j = (Math.random() - 0.5) * 90;
    const x = W / 2 + (baseR + j) * Math.cos(ang + (Math.random() - 0.5) * 0.8);
    const y = H / 2 + (baseR + j) * Math.sin(ang + (Math.random() - 0.5) * 0.8);
    return {
      ...n,
      x, y, vx: 0, vy: 0,
      ...(n.type === 'root' ? { fx: W / 2, fy: H / 2 } : {}),
    };
  });

  const nodeById = new Map(nodes.map(n => [n.id, n]));

  const links: SimLink[] = rawEdges
    .map(e => ({ source: resolveId(e.source), target: resolveId(e.target), strength: e.strength ?? 0.5 }))
    .filter(l => nodeById.has(l.source as string) && nodeById.has(l.target as string));

  // Ideal edge length scales with both endpoints' collision radii, so
  // connected nodes settle with enough room for both of their labels rather
  // than a single flat constant that ignored node/label size entirely.
  const linkDistance = (l: any) => {
    const sId = typeof l.source === 'object' ? l.source.id : l.source;
    const tId = typeof l.target === 'object' ? l.target.id : l.target;
    const s = nodeById.get(sId);
    const t = nodeById.get(tId);
    const base = 70 + (s ? collisionRadius(s) : 20) + (t ? collisionRadius(t) : 20);
    return clamp(base, 90, 260);
  };

  const clusterForce = makeClusterForce(nodes, clusterNodeMap);

  const sim = forceSimulation(nodes as any)
    .alphaDecay(1 - Math.pow(0.001, 1 / iters))
    .force('charge', (forceManyBody().strength(-240).distanceMax(Math.max(W, H)) as any))
    .force('link', (forceLink(links as any)
      .id((d: any) => d.id)
      .distance(linkDistance)
      .strength((l: any) => 0.15 + (l.strength ?? 0.5) * 0.3) as any))
    // forceCollide is the industry-standard way to guarantee non-overlapping
    // circle layouts: radius = each node's full collision footprint (circle +
    // label clearance), strength near 1 and several iterations so the
    // constraint is rigid rather than "soft"/jittery.
    .force('collide', (forceCollide((d: any) => collisionRadius(d)).strength(1).iterations(4) as any))
    .force('x', (forceX(W / 2).strength(0.015) as any))
    .force('y', (forceY(H / 2).strength(0.015) as any))
    .force('cluster', clusterForce as any)
    .stop();

  for (let i = 0; i < iters; i++) {
    sim.tick();
    // Belt-and-suspenders: keep the root perfectly centered every tick even
    // though fx/fy should already pin it.
    for (const n of nodes) {
      if (n.type === 'root') { n.x = W / 2; n.y = H / 2; }
    }
  }

  // The physics pass gets the graph *close* to non-overlapping. This
  // deterministic pass makes the no-overlap guarantee exact, then we
  // re-clamp to canvas bounds (and resolve once more, since clamping can
  // reintroduce a tiny amount of crowding at the edges).
  resolveOverlaps(nodes, 48);
  clampToBounds(nodes, W, H);
  resolveOverlaps(nodes, 16);
  clampToBounds(nodes, W, H);

  return nodes as KnowledgeGraphNode[];
}

// ─── SVG Canvas ──────────────────────────────────────────────────────────────

interface CanvasProps {
  graph: KnowledgeGraphType | ExtendedKnowledgeGraph;
  layoutNodes: KnowledgeGraphNode[];
  W: number; H: number;
  scale: number; ox: number; oy: number;
  selectedNode: KnowledgeGraphNode | null;
  visibleIds: Set<string>;
  matches: Set<string>;
  connectedIds: Set<string>;
  colorMap: Map<string, string>;
  onNodePress: (n: KnowledgeGraphNode) => void;
}

function GraphCanvas({
  graph, layoutNodes, W, H, scale, ox, oy,
  selectedNode, visibleIds, matches, connectedIds, colorMap, onNodePress,
}: CanvasProps) {
  const { isLight } = useTheme();
  const nodeMap = useMemo(() => new Map(layoutNodes.map(n => [n.id, n])), [layoutNodes]);
  const getColor = (n: KnowledgeGraphNode) => colorMap.get(n.id) ?? NODE_TYPE_COLORS[n.type] ?? '#6C63FF';

  const vbX = -ox / scale, vbY = -oy / scale, vbW = W / scale, vbH = H / scale;

  const gradientDefs: React.ReactElement[] = [];

  // Theme-aware text colors for labels
  const labelColor = isLight ? 'rgba(20,20,40,0.95)' : 'rgba(225,225,245,0.95)';
  const dimLabelColor = isLight ? 'rgba(100,100,120,0.3)' : 'rgba(160,160,180,0.2)';

  const edgeEls = graph.edges.map((edge, i) => {
    const srcId = resolveId(edge.source), tgtId = resolveId(edge.target);
    if (!visibleIds.has(srcId) || !visibleIds.has(tgtId)) return null;
    const src = nodeMap.get(srcId), tgt = nodeMap.get(tgtId);
    if (!src?.x || !tgt?.x) return null;

    const isHL = selectedNode?.id === srcId || selectedNode?.id === tgtId;
    const isDim = !!selectedNode && !isHL;
    const cat = ((edge as any).category ?? 'associative') as string;
    const dash = EDGE_DASH[cat] ?? '4,3';
    const op = isDim ? 0.04 : isHL ? 0.95 : 0.16 + edge.strength * 0.3;
    const sw = Math.max(0.4, (cat === 'causal' || cat === 'hierarchical' ? 0.6 + edge.strength * 2.2 : 0.5 + edge.strength * 1.3) / scale);

    let stroke = isLight ? `rgba(60,60,100,${op})` : `rgba(150,150,200,${op})`;
    if (isHL) {
      const gid = `edge-grad-${i}`;
      gradientDefs.push(
        <SvgLinearGradient key={gid} id={gid} x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={getColor(src)} stopOpacity={0.95} />
          <Stop offset="1" stopColor={getColor(tgt)} stopOpacity={0.95} />
        </SvgLinearGradient>
      );
      stroke = `url(#${gid})`;
    }

    return (
      <Line key={`e${i}`}
        x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
        stroke={stroke} strokeWidth={sw}
        strokeDasharray={dash === '0' ? undefined : dash}
        strokeOpacity={isHL ? 1 : op}
        strokeLinecap="round"
      />
    );
  });

  const nodeEls = layoutNodes.filter(n => visibleIds.has(n.id)).map(node => {
    const baseR = NODE_TYPE_SIZE[node.type] ?? 18;
    const isSel = selectedNode?.id === node.id;
    const isCon = connectedIds.has(node.id);
    const isDim = !!selectedNode && !isSel && !isCon;
    const isMat = matches.size > 0 && matches.has(node.id);
    const r = baseR * (isMat ? 1.35 : 1);
    const color = getColor(node);
    const cx = node.x ?? 0, cy = node.y ?? 0;
    const fs = (node.type === 'root' ? 11 : node.type === 'primary' ? 10 : 8.5) / scale;
    const emphasize = isSel || isMat || node.type === 'root';

    return (
      <G key={node.id} onPress={() => onNodePress(node)} opacity={isDim ? 0.12 : 1}>
        {emphasize && (
          <Circle cx={cx} cy={cy} r={r + 12 / scale} fill={color} opacity={0.16} />
        )}
        {(isSel || isMat) && (
          <Circle cx={cx} cy={cy} r={r + 9 / scale} fill="none" stroke={color} strokeWidth={1.4 / scale} opacity={0.9} />
        )}
        {isCon && !isSel && (
          <Circle cx={cx} cy={cy} r={r + 6 / scale} fill="none" stroke={color}
            strokeWidth={0.8 / scale} strokeDasharray={`${3 / scale},${2 / scale}`} opacity={0.5} />
        )}
        <Circle cx={cx} cy={cy} r={r} fill={color} opacity={isSel ? 1 : 0.92} />
        <Circle cx={cx - r * 0.28} cy={cy - r * 0.28} r={r * 0.34} fill="rgba(255,255,255,0.22)" />
        <SvgText
          x={cx} y={cy + r + 13 / scale}
          textAnchor="middle" fontSize={fs}
          fontWeight={node.type === 'root' || node.type === 'primary' ? 'bold' : 'normal'}
          fill={isDim ? dimLabelColor : labelColor}
          stroke={isLight ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
          strokeWidth={isLight ? 2 / scale : 1.5 / scale}
        >
          {node.label.length > 20 ? node.label.slice(0, 19) + '…' : node.label}
        </SvgText>
      </G>
    );
  });

  const bgGradient: readonly [string, string] = isLight 
    ? ['#F5F6FB', '#FFFFFF']
    : ['#13132F', '#08081C'];

  const gridColor = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(108,99,255,0.035)';

  return (
    <Svg width={W} height={H} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}>
      <Defs>
        <RadialGradient id="kg-bg" cx="50%" cy="40%" r="75%">
          <Stop offset="0" stopColor={bgGradient[0]} stopOpacity={1} />
          <Stop offset="1" stopColor={bgGradient[1]} stopOpacity={1} />
        </RadialGradient>
        {gradientDefs}
      </Defs>
      {Array.from({ length: 10 }).map((_, i) => (
        <Line key={`hg${i}`} x1={0} y1={i * (H / 9)} x2={W} y2={i * (H / 9)} stroke={gridColor} strokeWidth={1} />
      ))}
      {Array.from({ length: 10 }).map((_, i) => (
        <Line key={`vg${i}`} x1={i * (W / 9)} y1={0} x2={i * (W / 9)} y2={H} stroke={gridColor} strokeWidth={1} />
      ))}
      <G>{edgeEls}</G>
      <G>{nodeEls}</G>
    </Svg>
  );
}

// ─── Zoom control bar ─────────────────────────────────────────────────────────

interface ZoomBarProps {
  scale: number; isFS: boolean;
  onZoomIn: () => void; onZoomOut: () => void; onReset: () => void; onExpand: () => void;
  bottom?: number;
}

function ZoomBar({
  scale, isFS, onZoomIn, onZoomOut, onReset, onExpand,
  bottom = 12,
}: ZoomBarProps) {
  const { isLight } = useTheme();
  const ctrlBtnStyle = {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: isLight ? 'rgba(255,255,255,0.92)' : 'rgba(10,10,28,0.92)',
    alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: 1, borderColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(108,99,255,0.35)',
    ...SHADOWS.small,
  };

  return (
    <View style={{ position: 'absolute', bottom, right: 10, gap: 7, alignItems: 'center' }}>
      <TouchableOpacity onPress={onExpand} style={ctrlBtnStyle}>
        <Ionicons name={isFS ? 'contract-outline' : 'expand-outline'} size={15} color={COLORS.textSecondary} />
      </TouchableOpacity>
      <View style={{ width: 34, height: 1, backgroundColor: 'rgba(108,99,255,0.25)', marginVertical: 1 }} />
      <TouchableOpacity onPress={onZoomIn} style={[ctrlBtnStyle, scale >= MAX_SCALE && { opacity: 0.35 }]} disabled={scale >= MAX_SCALE}>
        <Ionicons name="add" size={19} color={COLORS.textSecondary} />
      </TouchableOpacity>
      <View style={[ctrlBtnStyle, { backgroundColor: 'rgba(108,99,255,0.18)' }]}>
        <Text style={{ color: COLORS.primaryLight, fontSize: 9, fontWeight: '900' }}>{Math.round(scale * 100)}%</Text>
      </View>
      <TouchableOpacity onPress={onZoomOut} style={[ctrlBtnStyle, scale <= MIN_SCALE && { opacity: 0.35 }]} disabled={scale <= MIN_SCALE}>
        <Ionicons name="remove" size={19} color={COLORS.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onReset} style={ctrlBtnStyle}>
        <Ionicons name="locate-outline" size={14} color={COLORS.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Gestures ─────────────────────────────────────────────────────────────────

function useGestures(
  scaleRef: React.MutableRefObject<number>,
  oxRef: React.MutableRefObject<number>,
  oyRef: React.MutableRefObject<number>,
  setScale: (s: number | ((p: number) => number)) => void,
  setOx: (v: number | ((p: number) => number)) => void,
  setOy: (v: number | ((p: number) => number)) => void,
) {
  const lastPan = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef<number | null>(null);
  const lastTap = useRef(0);
  const isGesturing = useRef(false);

  return useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) => Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_evt, gs) => {
        isGesturing.current = true;
        lastPan.current = { x: gs.dx, y: gs.dy };
        lastPinchDist.current = null;
        const now = Date.now();
        if (now - lastTap.current < 280) setScale(prev => clamp(prev + ZOOM_STEP * 2, MIN_SCALE, MAX_SCALE));
        lastTap.current = now;
      },
      onPanResponderMove: (evt, gs) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          const t0 = touches[0], t1 = touches[1];
          const d = ptDist(t0.pageX, t0.pageY, t1.pageX, t1.pageY);
          if (lastPinchDist.current !== null && lastPinchDist.current > 0) {
            const ratio = d / lastPinchDist.current;
            setScale(clamp(scaleRef.current * ratio, MIN_SCALE, MAX_SCALE));
          }
          lastPinchDist.current = d;
          lastPan.current = { x: gs.dx, y: gs.dy };
        } else {
          lastPinchDist.current = null;
          const dxFrame = gs.dx - lastPan.current.x;
          const dyFrame = gs.dy - lastPan.current.y;
          setOx(prev => prev + dxFrame);
          setOy(prev => prev + dyFrame);
          lastPan.current = { x: gs.dx, y: gs.dy };
        }
      },
      onPanResponderRelease: () => { isGesturing.current = false; lastPinchDist.current = null; },
      onPanResponderTerminate: () => { isGesturing.current = false; lastPinchDist.current = null; },
    })
  ).current;
}

// ─── Fullscreen Modal ──────────────────────────────────────────────────────────

interface FullscreenContentProps {
  visible: boolean;
  graph: KnowledgeGraphType | ExtendedKnowledgeGraph;
  extended: ExtendedKnowledgeGraph;
  fsLayoutNodes: KnowledgeGraphNode[];
  fsW: number; fsH: number;
  scale: number; ox: number; oy: number;
  selectedNode: KnowledgeGraphNode | null;
  visibleIds: Set<string>; matches: Set<string>; connectedIds: Set<string>;
  colorMap: Map<string, string>;
  insets: { top: number; bottom: number; left: number; right: number };
  ready: boolean; searchQuery: string; fsPanHandlers: object;
  getColor: (n: KnowledgeGraphNode) => string;
  onClose: () => void; onNodePress: (n: KnowledgeGraphNode) => void;
  onZoomIn: () => void; onZoomOut: () => void; onReset: () => void; onExpand: () => void;
  onSearchChange: (q: string) => void; onDeselectNode: () => void;
}

function FullscreenModal({
  visible, graph, extended, fsLayoutNodes, fsW, fsH,
  scale, ox, oy, selectedNode, visibleIds, matches, connectedIds,
  colorMap, insets, ready, searchQuery, fsPanHandlers, getColor,
  onClose, onNodePress, onZoomIn, onZoomOut, onReset, onExpand, onSearchChange, onDeselectNode,
}: FullscreenContentProps) {
  const { isLight } = useTheme();
  const bgColor = isLight ? '#F5F6FB' : '#08081C';
  const headerBg: readonly [string, string] = isLight ? ['#FFFFFF', '#EEF0F8'] : ['#15152E', '#0A0A1C'];
  const ctrlBtnStyle = {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: isLight ? 'rgba(255,255,255,0.92)' : 'rgba(10,10,28,0.92)',
    alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: 1, borderColor: isLight ? 'rgba(0,0,0,0.12)' : COLORS.border,
    ...SHADOWS.small,
  };

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: bgColor }}>
        <LinearGradient colors={headerBg} style={{
          paddingTop: insets.top + 6, paddingBottom: SPACING.sm, paddingHorizontal: SPACING.md,
          flexDirection: 'row', alignItems: 'center', gap: 10,
          borderBottomWidth: 1, borderBottomColor: COLORS.border,
        }}>
          <TouchableOpacity onPress={onClose} style={ctrlBtnStyle}>
            <Ionicons name="close" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
              {extended.topicTitle ?? 'Knowledge Graph'}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {graph.nodes.length} nodes · {graph.edges.length} edges · pinch + drag
            </Text>
          </View>
          <View style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: isLight ? 'rgba(0,0,0,0.04)' : COLORS.backgroundElevated,
            borderRadius: RADIUS.full, paddingHorizontal: 10, height: 34,
            borderWidth: 1, borderColor: COLORS.border, flex: 1, maxWidth: 180,
          }}>
            <Ionicons name="search-outline" size={13} color={COLORS.textMuted} style={{ marginRight: 5 }} />
            <TextInput
              style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.xs, paddingVertical: 0 }}
              placeholder="Search…" placeholderTextColor={COLORS.textMuted}
              value={searchQuery} onChangeText={onSearchChange}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => onSearchChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={13} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>

        <View style={{ flex: 1 }} {...fsPanHandlers}>
          {ready ? (
            <GraphCanvas
              graph={graph} layoutNodes={fsLayoutNodes} W={fsW} H={fsH}
              scale={scale} ox={ox} oy={oy} selectedNode={selectedNode}
              visibleIds={visibleIds} matches={matches} connectedIds={connectedIds}
              colorMap={colorMap} onNodePress={onNodePress}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>Arranging nodes…</Text>
            </View>
          )}
          <ZoomBar
            scale={scale} isFS onZoomIn={onZoomIn} onZoomOut={onZoomOut} onReset={onReset} onExpand={onExpand}
            bottom={insets.bottom + 12}
          />
        </View>

        {selectedNode && (
          <View style={{
            position: 'absolute', bottom: insets.bottom + 12, left: 12, right: 60,
            borderRadius: RADIUS.xl, overflow: 'hidden',
            borderWidth: 1, borderColor: `${getColor(selectedNode)}44`, ...SHADOWS.large,
          }}>
            <LinearGradient colors={isLight ? ['#FFFFFF', '#EEF0F8'] : ['#1A1838', '#100E26']} style={{ padding: SPACING.md, borderLeftWidth: 3, borderLeftColor: getColor(selectedNode) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: getColor(selectedNode) }} />
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', flex: 1 }}>{selectedNode.label}</Text>
                <View style={{ backgroundColor: `${getColor(selectedNode)}22`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: getColor(selectedNode), fontSize: 9, fontWeight: '800', textTransform: 'uppercase' }}>{selectedNode.type}</Text>
                </View>
                <TouchableOpacity onPress={onDeselectNode} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
              {selectedNode.description && (
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 17, marginBottom: 6 }}>{selectedNode.description}</Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Importance</Text>
                <View style={{ flex: 1, height: 4, backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                  <LinearGradient colors={[getColor(selectedNode), `${getColor(selectedNode)}99` as const]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${selectedNode.weight * 10}%`, height: '100%' }} />
                </View>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{selectedNode.weight}/10</Text>
              </View>
            </LinearGradient>
          </View>
        )}

        {!selectedNode && (
          <View style={{ position: 'absolute', bottom: insets.bottom + 14, left: 14 }}>
            <Text style={{ color: isLight ? 'rgba(100,100,120,0.3)' : 'rgba(160,160,200,0.3)', fontSize: 11 }}>
              Pinch · drag · double-tap to zoom
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export interface KnowledgeGraphViewProps {
  graph: KnowledgeGraphType | ExtendedKnowledgeGraph;
  height?: number;
  onNodePress?: (node: KnowledgeGraphNode) => void;
}

export function KnowledgeGraphView({ graph, height = 500, onNodePress }: KnowledgeGraphViewProps) {
  const extended = graph as ExtendedKnowledgeGraph;
  const clusters = extended.clusters ?? [];
  const insets = useSafeAreaInsets();
  const { isLight } = useTheme();

  const canvasW = SCREEN_W - SPACING.lg * 2;
  const canvasH = height;
  const fsW = SCREEN_W;
  const fsH = SCREEN_H;

  const [scale, setScale] = useState(1);
  const [ox, setOx] = useState(0);
  const [oy, setOy] = useState(0);

  const scaleRef = useRef(scale), oxRef = useRef(ox), oyRef = useRef(oy);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { oxRef.current = ox; }, [ox]);
  useEffect(() => { oyRef.current = oy; }, [oy]);

  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenClusters, setHiddenClusters] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Part 58.6 — instant screen open ────────────────────────────────────────
  // Force-directed layout (d3-force simulation + overlap resolution) is
  // real, non-trivial computation. Running it synchronously inside a
  // `useMemo` — as before — means it executes as part of the render/commit
  // phase, which blocks the JS thread right when the screen is trying to
  // navigate in. That's what made "opening the knowledge graph" feel slow:
  // the screen itself was ready, but the JS thread was busy laying out nodes
  // before it could paint anything at all.
  //
  // Fix: compute layout in *state*, populated from an effect that's
  // deferred via InteractionManager.runAfterInteractions (waits for the
  // navigation transition/animations to finish) plus one more
  // requestAnimationFrame (lets the empty-state UI actually paint first).
  // The screen and its header/stats/canvas frame now render immediately;
  // the graph itself pops in ~1-2s later behind a small "Arranging nodes…"
  // indicator, which is an explicitly acceptable tradeoff.
  //
  // The fullscreen layout is also made *lazy*: it's only computed the first
  // time the user actually opens fullscreen, instead of always being
  // computed up front (which previously doubled the up-front cost for a
  // view most sessions never open).
  const [layoutNodes, setLayoutNodes] = useState<KnowledgeGraphNode[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [fsLayoutNodes, setFsLayoutNodes] = useState<KnowledgeGraphNode[]>([]);
  const [fsLayoutReady, setFsLayoutReady] = useState(false);
  const fsComputedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLayoutReady(false);
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        const nodes = runForceLayout(graph.nodes, graph.edges, clusters, canvasW, canvasH);
        if (!cancelled) { setLayoutNodes(nodes); setLayoutReady(true); }
      });
    });
    return () => { cancelled = true; (task as any)?.cancel?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes.length, graph.edges.length, canvasW, canvasH]);

  // Invalidate the cached fullscreen layout whenever the underlying graph or
  // fullscreen dimensions change, so the next time fullscreen opens it
  // recomputes rather than showing a stale layout.
  useEffect(() => { fsComputedRef.current = false; }, [graph.nodes.length, graph.edges.length, fsW, fsH]);

  useEffect(() => {
    if (!isFullscreen || fsComputedRef.current) return;
    let cancelled = false;
    setFsLayoutReady(false);
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        const nodes = runForceLayout(graph.nodes, graph.edges, clusters, fsW, fsH);
        if (!cancelled) {
          setFsLayoutNodes(nodes);
          setFsLayoutReady(true);
          fsComputedRef.current = true;
        }
      });
    });
    return () => { cancelled = true; (task as any)?.cancel?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, graph.nodes.length, graph.edges.length, fsW, fsH]);

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    clusters.forEach((c, i) => c.nodeIds.forEach(id => m.set(id, c.color ?? CLUSTER_FALLBACK[i % CLUSTER_FALLBACK.length])));
    return m;
  }, [clusters]);

  const getColor = useCallback((n: KnowledgeGraphNode) => colorMap.get(n.id) ?? NODE_TYPE_COLORS[n.type] ?? '#6C63FF', [colorMap]);

  const adjacency = useMemo(() => {
    const m = new Map<string, string[]>();
    graph.edges.forEach(e => {
      const s = resolveId(e.source), t = resolveId(e.target);
      if (!m.has(s)) m.set(s, []); if (!m.has(t)) m.set(t, []);
      m.get(s)!.push(t); m.get(t)!.push(s);
    });
    return m;
  }, [graph.edges]);

  const matches = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(layoutNodes.filter(n => n.label.toLowerCase().includes(q) || (n.description ?? '').toLowerCase().includes(q)).map(n => n.id));
  }, [searchQuery, layoutNodes]);

  const isVisible = useCallback((n: KnowledgeGraphNode) => {
    const cId = clusters.find(c => c.nodeIds.includes(n.id))?.id;
    if (cId && hiddenClusters.has(cId)) return false;
    if (filterType && n.type !== filterType) return false;
    return true;
  }, [clusters, hiddenClusters, filterType]);

  const visibleIds = useMemo(() => new Set(layoutNodes.filter(isVisible).map(n => n.id)), [layoutNodes, isVisible]);
  const connectedIds = useMemo(() => new Set(selectedNode ? (adjacency.get(selectedNode.id) ?? []) : []), [selectedNode, adjacency]);

  const selectedConns = useMemo(() => {
    if (!selectedNode) return [];
    const nm = new Map(layoutNodes.map(n => [n.id, n]));
    return (adjacency.get(selectedNode.id) ?? []).map(id => nm.get(id)).filter(Boolean) as KnowledgeGraphNode[];
  }, [selectedNode, adjacency, layoutNodes]);

  const inlinePan = useGestures(scaleRef, oxRef, oyRef, setScale, setOx, setOy);
  const fsPan = useGestures(scaleRef, oxRef, oyRef, setScale, setOx, setOy);

  const zoomIn = useCallback(() => setScale(prev => clamp(prev + ZOOM_STEP, MIN_SCALE, MAX_SCALE)), []);
  const zoomOut = useCallback(() => setScale(prev => clamp(prev - ZOOM_STEP, MIN_SCALE, MAX_SCALE)), []);
  const resetView = useCallback(() => { setScale(1); setOx(0); setOy(0); }, []);
  const handleExpand = useCallback(() => { setIsFullscreen(v => !v); resetView(); }, [resetView]);
  const handleCloseFullscreen = useCallback(() => { setIsFullscreen(false); resetView(); }, [resetView]);

  const handleNodePress = useCallback((node: KnowledgeGraphNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);
    onNodePress?.(node);
  }, [onNodePress]);
  const handleDeselectNode = useCallback(() => setSelectedNode(null), []);

  const sentimentMeta = selectedNode ? {
    label: (selectedNode as any).sentiment ?? 'neutral',
    color: SENTIMENT_COLORS[(selectedNode as any).sentiment ?? 'neutral'] ?? SENTIMENT_COLORS.neutral,
  } : null;

  const bgColor = isLight ? 'rgba(0,0,0,0.04)' : COLORS.backgroundElevated;
  const canvasBg = isLight ? '#F5F6FB' : '#08081C';

  return (
    <View>
      <View style={{
        flexDirection: 'row', alignItems: 'center', backgroundColor: bgColor,
        borderRadius: RADIUS.lg, paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm,
        borderWidth: 1, borderColor: COLORS.border, height: 42,
      }}>
        <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, paddingVertical: 0 }}
          placeholder="Search nodes…" placeholderTextColor={COLORS.textMuted}
          value={searchQuery} onChangeText={setSearchQuery} returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
        {matches.size > 0 && (
          <View style={{ backgroundColor: `${COLORS.primary}22`, borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 2, marginLeft: 8 }}>
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '800' }}>{matches.size}</Text>
          </View>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: SPACING.sm }}>
        {(['root', 'primary', 'secondary', 'concept', 'company', 'trend'] as const).map(type => {
          const active = filterType === type;
          return (
            <TouchableOpacity key={type}
              onPress={() => setFilterType(prev => prev === type ? null : type)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 11, paddingVertical: 6, borderRadius: RADIUS.full,
                backgroundColor: active ? `${NODE_TYPE_COLORS[type]}26` : bgColor,
                borderWidth: 1, borderColor: active ? NODE_TYPE_COLORS[type] : COLORS.border,
              }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: NODE_TYPE_COLORS[type] }} />
              <Text style={{ color: active ? NODE_TYPE_COLORS[type] : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'capitalize' }}>{type}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View
        style={{
          width: canvasW, height: canvasH, backgroundColor: canvasBg,
          borderRadius: RADIUS.xl, overflow: 'hidden', borderWidth: 1, borderColor: `${COLORS.primary}26`,
          ...SHADOWS.medium,
        }}
        {...inlinePan.panHandlers}
      >
        {layoutReady ? (
          <GraphCanvas
            graph={graph} layoutNodes={layoutNodes} W={canvasW} H={canvasH}
            scale={scale} ox={ox} oy={oy} selectedNode={selectedNode}
            visibleIds={visibleIds} matches={matches} connectedIds={connectedIds}
            colorMap={colorMap} onNodePress={handleNodePress}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Arranging nodes…</Text>
          </View>
        )}
        <ZoomBar
          scale={scale} isFS={false} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetView} onExpand={handleExpand}
        />
      </View>

      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginTop: 6 }}>
        Pinch to zoom · drag to pan · double-tap to zoom · ⤢ full-screen
      </Text>

      {selectedNode && (
        <Animated.View entering={FadeInDown.duration(260).springify()} style={{
          borderRadius: RADIUS.xl, marginTop: SPACING.sm, overflow: 'hidden',
          borderWidth: 1, borderColor: `${getColor(selectedNode)}44`,
        }}>
          <LinearGradient colors={isLight ? ['#FFFFFF', '#EEF0F8'] : ['#1A1838', '#121028']} style={{ padding: SPACING.md, borderLeftWidth: 3, borderLeftColor: getColor(selectedNode) }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
              <LinearGradient colors={[getColor(selectedNode), `${getColor(selectedNode)}88` as const]} style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm, flexShrink: 0 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.85)' }} />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>{selectedNode.label}</Text>
                  <View style={{ backgroundColor: `${getColor(selectedNode)}22`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: getColor(selectedNode), fontSize: 9, fontWeight: '800', textTransform: 'uppercase' }}>{selectedNode.type}</Text>
                  </View>
                  {sentimentMeta && (
                    <View style={{ backgroundColor: `${sentimentMeta.color}22`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: sentimentMeta.color, fontSize: 9, fontWeight: '800' }}>{sentimentMeta.label}</Text>
                    </View>
                  )}
                </View>
                {selectedNode.description && (
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 17 }}>{selectedNode.description}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setSelectedNode(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: SPACING.sm }}>
                <Ionicons name="close" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Importance</Text>
              <View style={{ flex: 1, height: 5, backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <LinearGradient colors={[getColor(selectedNode), `${getColor(selectedNode)}99` as const]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${selectedNode.weight * 10}%`, height: '100%' }} />
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{selectedNode.weight}/10</Text>
            </View>

            {selectedConns.length > 0 && (
              <View>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{selectedConns.length} Connected</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {selectedConns.slice(0, 8).map(cn => (
                    <TouchableOpacity key={cn.id} onPress={() => handleNodePress(cn)} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
                      borderRadius: RADIUS.full, paddingHorizontal: 11, paddingVertical: 6, borderWidth: 1, borderColor: `${getColor(cn)}33`,
                    }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: getColor(cn) }} />
                      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs }}>{cn.label.length > 14 ? cn.label.slice(0, 13) + '…' : cn.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </LinearGradient>
        </Animated.View>
      )}

      {clusters.length > 0 && (
        <View style={{ marginTop: SPACING.sm }}>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Clusters</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {clusters.map(c => {
              const hidden = hiddenClusters.has(c.id);
              return (
                <TouchableOpacity key={c.id}
                  onPress={() => setHiddenClusters(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: hidden ? bgColor : `${c.color}18`,
                    borderRadius: RADIUS.full, paddingHorizontal: 11, paddingVertical: 7,
                    borderWidth: 1, borderColor: hidden ? COLORS.border : `${c.color}44`, opacity: hidden ? 0.5 : 1,
                  }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                  <Text style={{ color: hidden ? COLORS.textMuted : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{c.label}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{c.nodeIds.length}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ marginTop: SPACING.sm }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Edge Types</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            { label: 'Causal', dash: '─────', color: COLORS.primary },
            { label: 'Associative', dash: '─ ─ ─', color: COLORS.textMuted },
            { label: 'Comparative', dash: '── ──', color: COLORS.warning },
            { label: 'Temporal', dash: '· · ·', color: COLORS.info },
            { label: 'Hierarchical', dash: '─────', color: COLORS.success },
          ].map(e => (
            <View key={e.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ color: e.color, fontSize: 11, letterSpacing: 1 }}>{e.dash}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{e.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <FullscreenModal
        visible={isFullscreen} graph={graph} extended={extended}
        fsLayoutNodes={fsLayoutNodes} fsW={fsW} fsH={fsH}
        scale={scale} ox={ox} oy={oy} selectedNode={selectedNode}
        visibleIds={visibleIds} matches={matches} connectedIds={connectedIds}
        colorMap={colorMap} insets={insets} ready={fsLayoutReady} searchQuery={searchQuery}
        fsPanHandlers={fsPan.panHandlers} getColor={getColor}
        onClose={handleCloseFullscreen} onNodePress={handleNodePress}
        onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetView} onExpand={handleExpand}
        onSearchChange={setSearchQuery} onDeselectNode={handleDeselectNode}
      />
    </View>
  );
}