// src/components/research/KnowledgeGraph.tsx
// Advanced Interactive Knowledge Graph — v5
//
// Changes vs v4:
//  • Export feature removed entirely (SVG / PDF buttons, state, handlers).

import React, {
  useEffect, useRef, useState, useMemo, useCallback,
} from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Dimensions, PanResponder, TextInput, Modal,
} from 'react-native';
import Svg, { Circle, Line, Text as SvgText, G } from 'react-native-svg';
import { Ionicons }          from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  KnowledgeGraph as KnowledgeGraphType,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
} from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import type {
  KnowledgeGraphCluster,
  ExtendedKnowledgeGraph,
} from '../../services/agents/knowledgeGraphAgent';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Constants ────────────────────────────────────────────────────────────────

const CLUSTER_FALLBACK = [
  '#6C63FF', '#00D4AA', '#FF6584', '#F9CB42',
  '#4FACFE', '#F093FB', '#43E97B', '#FF8E53',
];

const NODE_TYPE_COLORS: Record<string, string> = {
  root:      '#6C63FF',
  primary:   '#4FACFE',
  secondary: '#43E97B',
  concept:   '#F093FB',
  company:   '#FA709A',
  trend:     '#F9CB42',
};

const NODE_TYPE_SIZE: Record<string, number> = {
  root:      34,
  primary:   24,
  secondary: 17,
  concept:   16,
  company:   20,
  trend:     18,
};

const EDGE_DASH: Record<string, string> = {
  causal:       '0',
  hierarchical: '0',
  associative:  '4,3',
  comparative:  '6,3',
  temporal:     '2,4',
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#43E97B',
  neutral:  '#A0A0C0',
  negative: '#FF4757',
};

const MIN_SCALE = 0.25;
const MAX_SCALE = 5.0;
const ZOOM_STEP = 0.35;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveId(ep: string | KnowledgeGraphNode): string {
  return typeof ep === 'string' ? ep : ep.id;
}
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function ptDist(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

// ─── Force simulation ─────────────────────────────────────────────────────────

function runForceLayout(
  rawNodes: KnowledgeGraphNode[],
  rawEdges: KnowledgeGraphEdge[],
  clusters: KnowledgeGraphCluster[],
  W: number, H: number,
  iters = 320,
): KnowledgeGraphNode[] {
  const clusterNodeMap = new Map<string, string>();
  clusters.forEach(c => c.nodeIds.forEach(id => clusterNodeMap.set(id, c.id)));
  const clusterIds   = clusters.map(c => c.id);
  const sectorSize   = clusterIds.length > 0 ? (2 * Math.PI) / clusterIds.length : Math.PI;
  const clusterAngle = new Map<string, number>(
    clusterIds.map((id, i) => [id, i * sectorSize - Math.PI / 2])
  );

  const nodes: KnowledgeGraphNode[] = rawNodes.map(n => {
    const cId   = clusterNodeMap.get(n.id) ?? null;
    const ang   = cId ? (clusterAngle.get(cId) ?? 0) : Math.random() * Math.PI * 2;
    const baseR = n.type === 'root' ? 0 : n.type === 'primary' ? 120 : 230;
    const j     = (Math.random() - 0.5) * 80;
    return {
      ...n,
      x: W / 2 + (baseR + j) * Math.cos(ang + (Math.random() - 0.5) * 0.8),
      y: H / 2 + (baseR + j) * Math.sin(ang + (Math.random() - 0.5) * 0.8),
      vx: 0, vy: 0,
    };
  });

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const edges = rawEdges.map(e => ({
    src: nodeMap.get(resolveId(e.source)),
    tgt: nodeMap.get(resolveId(e.target)),
    strength: e.strength ?? 0.5,
  })).filter(e => e.src && e.tgt) as {
    src: KnowledgeGraphNode; tgt: KnowledgeGraphNode; strength: number;
  }[];

  for (let iter = 0; iter < iters; iter++) {
    const alpha = 0.3 * (1 - iter / iters);

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = (b.x ?? 0) - (a.x ?? 0), dy = (b.y ?? 0) - (a.y ?? 0);
        const d  = Math.sqrt(dx * dx + dy * dy) || 1;
        const f  = (3200 * alpha) / (d * d);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx! -= fx; a.vy! -= fy; b.vx! += fx; b.vy! += fy;
      }
    }

    for (const e of edges) {
      const dx = (e.tgt.x ?? 0) - (e.src.x ?? 0), dy = (e.tgt.y ?? 0) - (e.src.y ?? 0);
      const d  = Math.sqrt(dx * dx + dy * dy) || 1;
      const delta = (d - 110) * alpha * e.strength;
      const fx = (dx / d) * delta, fy = (dy / d) * delta;
      e.src.vx! += fx; e.src.vy! += fy; e.tgt.vx! -= fx; e.tgt.vy! -= fy;
    }

    const ctr = new Map<string, { x: number; y: number; n: number }>();
    nodes.forEach(nd => {
      const cId = clusterNodeMap.get(nd.id); if (!cId) return;
      const c   = ctr.get(cId) ?? { x: 0, y: 0, n: 0 };
      c.x += nd.x ?? 0; c.y += nd.y ?? 0; c.n++;
      ctr.set(cId, c);
    });
    nodes.forEach(nd => {
      if (nd.type === 'root') return;
      const cId = clusterNodeMap.get(nd.id); if (!cId) return;
      const c   = ctr.get(cId); if (!c || c.n < 2) return;
      nd.vx! += ((c.x / c.n) - (nd.x ?? 0)) * 0.014 * alpha * 22;
      nd.vy! += ((c.y / c.n) - (nd.y ?? 0)) * 0.014 * alpha * 22;
    });

    for (const n of nodes) {
      if (n.type === 'root') { n.x = W / 2; n.y = H / 2; continue; }
      n.vx! += ((W / 2) - (n.x ?? 0)) * 0.01 * alpha;
      n.vy! += ((H / 2) - (n.y ?? 0)) * 0.01 * alpha;
      n.vx! *= 0.82; n.vy! *= 0.82;
      n.x = clamp((n.x ?? 0) + (n.vx ?? 0), 50, W - 50);
      n.y = clamp((n.y ?? 0) + (n.vy ?? 0), 50, H - 50);
    }
  }
  return nodes;
}

// ─── SVG Canvas ───────────────────────────────────────────────────────────────

interface CanvasProps {
  graph:        KnowledgeGraphType | ExtendedKnowledgeGraph;
  layoutNodes:  KnowledgeGraphNode[];
  W:            number;
  H:            number;
  scale:        number;
  ox:           number;
  oy:           number;
  selectedNode: KnowledgeGraphNode | null;
  visibleIds:   Set<string>;
  matches:      Set<string>;
  connectedIds: Set<string>;
  colorMap:     Map<string, string>;
  onNodePress:  (n: KnowledgeGraphNode) => void;
}

function GraphCanvas({
  graph, layoutNodes, W, H,
  scale, ox, oy,
  selectedNode, visibleIds, matches, connectedIds,
  colorMap, onNodePress,
}: CanvasProps) {
  const nodeMap  = useMemo(() => new Map(layoutNodes.map(n => [n.id, n])), [layoutNodes]);
  const getColor = (n: KnowledgeGraphNode) => colorMap.get(n.id) ?? NODE_TYPE_COLORS[n.type] ?? '#6C63FF';

  const vbX = -ox / scale;
  const vbY = -oy / scale;
  const vbW =  W  / scale;
  const vbH =  H  / scale;

  const edgeEls = graph.edges.map((edge, i) => {
    const srcId = resolveId(edge.source), tgtId = resolveId(edge.target);
    if (!visibleIds.has(srcId) || !visibleIds.has(tgtId)) return null;
    const src = nodeMap.get(srcId), tgt = nodeMap.get(tgtId);
    if (!src?.x || !tgt?.x) return null;

    const isHL  = selectedNode?.id === srcId || selectedNode?.id === tgtId;
    const isDim = !!selectedNode && !isHL;
    const cat   = ((edge as any).category ?? 'associative') as string;
    const dash  = EDGE_DASH[cat] ?? '4,3';
    const op    = isDim ? 0.04 : isHL ? 0.95 : 0.18 + edge.strength * 0.3;
    const sw    = Math.max(0.4,
      (cat === 'causal' || cat === 'hierarchical'
        ? 0.5 + edge.strength * 2
        : 0.5 + edge.strength * 1.2) / scale
    );

    return (
      <Line key={`e${i}`}
        x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
        stroke={isHL ? getColor(src) : `rgba(160,160,200,${op})`}
        strokeWidth={sw}
        strokeDasharray={dash === '0' ? undefined : dash}
        strokeOpacity={op}
      />
    );
  });

  const nodeEls = layoutNodes.filter(n => visibleIds.has(n.id)).map(node => {
    const baseR = NODE_TYPE_SIZE[node.type] ?? 18;
    const isSel = selectedNode?.id === node.id;
    const isCon = connectedIds.has(node.id);
    const isDim = !!selectedNode && !isSel && !isCon;
    const isMat = matches.size > 0 && matches.has(node.id);
    const r     = baseR * (isMat ? 1.35 : 1);
    const color = getColor(node);
    const cx    = node.x ?? 0, cy = node.y ?? 0;
    const fs    = (node.type === 'root' ? 11 : node.type === 'primary' ? 10 : 8.5) / scale;

    return (
      <G key={node.id} onPress={() => onNodePress(node)} opacity={isDim ? 0.1 : 1}>
        {(isSel || isMat) && (
          <Circle cx={cx} cy={cy} r={r + 10 / scale}
            fill={`${color}18`} stroke={color} strokeWidth={1.2 / scale}/>
        )}
        {isCon && !isSel && (
          <Circle cx={cx} cy={cy} r={r + 7 / scale}
            fill="none" stroke={color}
            strokeWidth={0.8 / scale}
            strokeDasharray={`${3 / scale},${2 / scale}`}
            opacity={0.55}/>
        )}
        <Circle cx={cx} cy={cy} r={r} fill={color} opacity={isSel ? 1 : 0.88}/>
        <Circle cx={cx - r * 0.27} cy={cy - r * 0.27} r={r * 0.32}
          fill="rgba(255,255,255,0.18)"/>
        <SvgText
          x={cx} y={cy + r + 13 / scale}
          textAnchor="middle"
          fontSize={fs}
          fontWeight={node.type === 'root' || node.type === 'primary' ? 'bold' : 'normal'}
          fill={isDim ? 'rgba(160,160,180,0.2)' : 'rgba(220,220,240,0.93)'}
        >
          {node.label.length > 20 ? node.label.slice(0, 19) + '…' : node.label}
        </SvgText>
      </G>
    );
  });

  return (
    <Svg width={W} height={H} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}>
      {Array.from({ length: 10 }).map((_, i) => (
        <Line key={`hg${i}`} x1={0} y1={i * (H / 9)} x2={W} y2={i * (H / 9)}
          stroke="rgba(108,99,255,0.03)" strokeWidth={1}/>
      ))}
      {Array.from({ length: 10 }).map((_, i) => (
        <Line key={`vg${i}`} x1={i * (W / 9)} y1={0} x2={i * (W / 9)} y2={H}
          stroke="rgba(108,99,255,0.03)" strokeWidth={1}/>
      ))}
      <G>{edgeEls}</G>
      <G>{nodeEls}</G>
    </Svg>
  );
}

// ─── Zoom control bar ─────────────────────────────────────────────────────────

interface ZoomBarProps {
  scale:    number;
  isFS:     boolean;
  onZoomIn: () => void;
  onZoomOut:() => void;
  onReset:  () => void;
  onExpand: () => void;
  bottom?:  number;
}

function ZoomBar({ scale, isFS, onZoomIn, onZoomOut, onReset, onExpand, bottom = 12 }: ZoomBarProps) {
  return (
    <View style={{ position: 'absolute', bottom, right: 10, gap: 6, alignItems: 'center' }}>
      <TouchableOpacity onPress={onExpand} style={ctrlBtn}>
        <Ionicons name={isFS ? 'contract-outline' : 'expand-outline'} size={15} color={COLORS.textSecondary}/>
      </TouchableOpacity>

      <View style={{ width: 34, height: 1, backgroundColor: COLORS.border, marginVertical: 1 }}/>

      <TouchableOpacity onPress={onZoomIn}
        style={[ctrlBtn, scale >= MAX_SCALE && { opacity: 0.35 }]}
        disabled={scale >= MAX_SCALE}>
        <Ionicons name="add" size={19} color={COLORS.textSecondary}/>
      </TouchableOpacity>

      <View style={[ctrlBtn, { backgroundColor: 'rgba(8,8,26,0.92)' }]}>
        <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '800' }}>
          {Math.round(scale * 100)}%
        </Text>
      </View>

      <TouchableOpacity onPress={onZoomOut}
        style={[ctrlBtn, scale <= MIN_SCALE && { opacity: 0.35 }]}
        disabled={scale <= MIN_SCALE}>
        <Ionicons name="remove" size={19} color={COLORS.textSecondary}/>
      </TouchableOpacity>

      <TouchableOpacity onPress={onReset} style={ctrlBtn}>
        <Ionicons name="locate-outline" size={14} color={COLORS.textMuted}/>
      </TouchableOpacity>
    </View>
  );
}

const ctrlBtn: object = {
  width: 34, height: 34, borderRadius: 10,
  backgroundColor: 'rgba(8,8,26,0.92)',
  alignItems: 'center', justifyContent: 'center',
  borderWidth: 1, borderColor: 'rgba(42,42,74,0.95)',
};

// ─── Hook: gesture state + pan responder ──────────────────────────────────────

function useGestures(
  scaleRef: React.MutableRefObject<number>,
  oxRef:    React.MutableRefObject<number>,
  oyRef:    React.MutableRefObject<number>,
  setScale: (s: number | ((p: number) => number)) => void,
  setOx:    (v: number | ((p: number) => number)) => void,
  setOy:    (v: number | ((p: number) => number)) => void,
) {
  const lastPan       = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef<number | null>(null);
  const lastTap       = useRef(0);
  const isGesturing   = useRef(false);

  return useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,
      onStartShouldSetPanResponder:        () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture:  () => false,
      onPanResponderTerminationRequest:    () => false,

      onPanResponderGrant: (_evt, gs) => {
        isGesturing.current   = true;
        lastPan.current       = { x: gs.dx, y: gs.dy };
        lastPinchDist.current = null;

        const now = Date.now();
        if (now - lastTap.current < 280) {
          setScale(prev => clamp(prev + ZOOM_STEP * 2, MIN_SCALE, MAX_SCALE));
        }
        lastTap.current = now;
      },

      onPanResponderMove: (evt, gs) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          const t0 = touches[0], t1 = touches[1];
          const d  = ptDist(t0.pageX, t0.pageY, t1.pageX, t1.pageY);
          if (lastPinchDist.current !== null && lastPinchDist.current > 0) {
            const ratio    = d / lastPinchDist.current;
            const newScale = clamp(scaleRef.current * ratio, MIN_SCALE, MAX_SCALE);
            setScale(newScale);
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

      onPanResponderRelease: () => {
        isGesturing.current   = false;
        lastPinchDist.current = null;
      },

      onPanResponderTerminate: () => {
        isGesturing.current   = false;
        lastPinchDist.current = null;
      },
    })
  ).current;
}

// ─── Fullscreen Modal (hoisted — must stay outside KnowledgeGraphView) ────────

interface FullscreenContentProps {
  visible:       boolean;
  graph:         KnowledgeGraphType | ExtendedKnowledgeGraph;
  extended:      ExtendedKnowledgeGraph;
  fsLayoutNodes: KnowledgeGraphNode[];
  fsW:           number;
  fsH:           number;
  scale:         number;
  ox:            number;
  oy:            number;
  selectedNode:  KnowledgeGraphNode | null;
  visibleIds:    Set<string>;
  matches:       Set<string>;
  connectedIds:  Set<string>;
  colorMap:      Map<string, string>;
  insets:        { top: number; bottom: number; left: number; right: number };
  ready:         boolean;
  searchQuery:   string;
  fsPanHandlers: object;
  getColor:      (n: KnowledgeGraphNode) => string;
  onClose:       () => void;
  onNodePress:   (n: KnowledgeGraphNode) => void;
  onZoomIn:      () => void;
  onZoomOut:     () => void;
  onReset:       () => void;
  onExpand:      () => void;
  onSearchChange:(q: string) => void;
  onDeselectNode:() => void;
}

function FullscreenModal({
  visible, graph, extended, fsLayoutNodes, fsW, fsH,
  scale, ox, oy,
  selectedNode, visibleIds, matches, connectedIds,
  colorMap, insets, ready, searchQuery, fsPanHandlers, getColor,
  onClose, onNodePress, onZoomIn, onZoomOut, onReset, onExpand,
  onSearchChange, onDeselectNode,
}: FullscreenContentProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: '#08081C' }}>

        {/* Header */}
        <View style={{
          paddingTop: insets.top + 6, paddingBottom: SPACING.sm,
          paddingHorizontal: SPACING.md,
          flexDirection: 'row', alignItems: 'center', gap: 10,
          borderBottomWidth: 1, borderBottomColor: COLORS.border,
        }}>
          <TouchableOpacity onPress={onClose} style={ctrlBtn}>
            <Ionicons name="close" size={18} color={COLORS.textSecondary}/>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
              {extended.topicTitle ?? 'Knowledge Graph'}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {graph.nodes.length} nodes · {graph.edges.length} edges · Pinch zoom · Drag pan
            </Text>
          </View>

          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: COLORS.backgroundElevated,
            borderRadius: RADIUS.full, paddingHorizontal: 10, height: 34,
            borderWidth: 1, borderColor: COLORS.border, flex: 1, maxWidth: 180,
          }}>
            <Ionicons name="search-outline" size={13} color={COLORS.textMuted} style={{ marginRight: 5 }}/>
            <TextInput
              style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.xs, paddingVertical: 0 }}
              placeholder="Search…" placeholderTextColor={COLORS.textMuted}
              value={searchQuery} onChangeText={onSearchChange}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => onSearchChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={13} color={COLORS.textMuted}/>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Canvas */}
        <View style={{ flex: 1 }} {...fsPanHandlers}>
          {ready && (
            <GraphCanvas
              graph={graph} layoutNodes={fsLayoutNodes}
              W={fsW} H={fsH}
              scale={scale} ox={ox} oy={oy}
              selectedNode={selectedNode}
              visibleIds={visibleIds} matches={matches} connectedIds={connectedIds}
              colorMap={colorMap} onNodePress={onNodePress}
            />
          )}
          <ZoomBar
            scale={scale} isFS
            onZoomIn={onZoomIn} onZoomOut={onZoomOut}
            onReset={onReset} onExpand={onExpand}
            bottom={insets.bottom + 12}
          />
        </View>

        {/* Selected node overlay */}
        {selectedNode && (
          <View style={{
            position: 'absolute',
            bottom: insets.bottom + 12, left: 12, right: 60,
            backgroundColor: 'rgba(16,14,36,0.97)',
            borderRadius: RADIUS.xl, padding: SPACING.md,
            borderWidth: 1, borderColor: `${getColor(selectedNode)}40`,
            borderLeftWidth: 3, borderLeftColor: getColor(selectedNode),
            ...SHADOWS.large,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: getColor(selectedNode) }}/>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', flex: 1 }}>
                {selectedNode.label}
              </Text>
              <View style={{
                backgroundColor: `${getColor(selectedNode)}20`,
                borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2,
              }}>
                <Text style={{ color: getColor(selectedNode), fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>
                  {selectedNode.type}
                </Text>
              </View>
              <TouchableOpacity onPress={onDeselectNode} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={16} color={COLORS.textMuted}/>
              </TouchableOpacity>
            </View>
            {selectedNode.description && (
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 17, marginBottom: 6 }}>
                {selectedNode.description}
              </Text>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Importance</Text>
              <View style={{ flex: 1, height: 3, backgroundColor: COLORS.backgroundElevated, borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ width: `${selectedNode.weight * 10}%`, height: '100%', backgroundColor: getColor(selectedNode), borderRadius: 2 }}/>
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{selectedNode.weight}/10</Text>
            </View>
          </View>
        )}

        {!selectedNode && (
          <View style={{ position: 'absolute', bottom: insets.bottom + 14, left: 14 }}>
            <Text style={{ color: 'rgba(160,160,200,0.28)', fontSize: 11 }}>
              Pinch to zoom · Drag to pan · Double-tap to zoom in
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface KnowledgeGraphViewProps {
  graph:        KnowledgeGraphType | ExtendedKnowledgeGraph;
  height?:      number;
  onNodePress?: (node: KnowledgeGraphNode) => void;
}

export function KnowledgeGraphView({ graph, height = 500, onNodePress }: KnowledgeGraphViewProps) {
  const extended = graph as ExtendedKnowledgeGraph;
  const clusters = extended.clusters ?? [];
  const insets   = useSafeAreaInsets();

  const canvasW = SCREEN_W - SPACING.lg * 2;
  const canvasH = height;
  const fsW     = SCREEN_W;
  const fsH     = SCREEN_H;

  // ── Shared transform state ────────────────────────────────────────────────

  const [scale, setScale] = useState(1);
  const [ox,    setOx]    = useState(0);
  const [oy,    setOy]    = useState(0);

  const scaleRef = useRef(scale);
  const oxRef    = useRef(ox);
  const oyRef    = useRef(oy);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { oxRef.current    = ox;    }, [ox]);
  useEffect(() => { oyRef.current    = oy;    }, [oy]);

  // ── UI state ──────────────────────────────────────────────────────────────

  const [selectedNode,   setSelectedNode]   = useState<KnowledgeGraphNode | null>(null);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [hiddenClusters, setHiddenClusters] = useState<Set<string>>(new Set());
  const [filterType,     setFilterType]     = useState<string | null>(null);
  const [isFullscreen,   setIsFullscreen]   = useState(false);
  const [ready,          setReady]          = useState(false);

  // ── Layouts ───────────────────────────────────────────────────────────────

  const layoutNodes = useMemo(
    () => runForceLayout(graph.nodes, graph.edges, clusters, canvasW, canvasH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph.nodes.length, graph.edges.length, canvasW, canvasH]
  );

  const fsLayoutNodes = useMemo(
    () => runForceLayout(graph.nodes, graph.edges, clusters, fsW, fsH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph.nodes.length, graph.edges.length, fsW, fsH]
  );

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, [layoutNodes]);

  // ── Color map ─────────────────────────────────────────────────────────────

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    clusters.forEach((c, i) =>
      c.nodeIds.forEach(id =>
        m.set(id, c.color ?? CLUSTER_FALLBACK[i % CLUSTER_FALLBACK.length])
      )
    );
    return m;
  }, [clusters]);

  const getColor = useCallback(
    (n: KnowledgeGraphNode) => colorMap.get(n.id) ?? NODE_TYPE_COLORS[n.type] ?? '#6C63FF',
    [colorMap]
  );

  // ── Adjacency ─────────────────────────────────────────────────────────────

  const adjacency = useMemo(() => {
    const m = new Map<string, string[]>();
    graph.edges.forEach(e => {
      const s = resolveId(e.source), t = resolveId(e.target);
      if (!m.has(s)) m.set(s, []); if (!m.has(t)) m.set(t, []);
      m.get(s)!.push(t); m.get(t)!.push(s);
    });
    return m;
  }, [graph.edges]);

  // ── Search / filter ───────────────────────────────────────────────────────

  const matches = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(layoutNodes.filter(n =>
      n.label.toLowerCase().includes(q) ||
      (n.description ?? '').toLowerCase().includes(q)
    ).map(n => n.id));
  }, [searchQuery, layoutNodes]);

  const isVisible = useCallback((n: KnowledgeGraphNode) => {
    const cId = clusters.find(c => c.nodeIds.includes(n.id))?.id;
    if (cId && hiddenClusters.has(cId)) return false;
    if (filterType && n.type !== filterType) return false;
    return true;
  }, [clusters, hiddenClusters, filterType]);

  const visibleIds = useMemo(
    () => new Set(layoutNodes.filter(isVisible).map(n => n.id)),
    [layoutNodes, isVisible]
  );

  const connectedIds = useMemo(
    () => new Set(selectedNode ? (adjacency.get(selectedNode.id) ?? []) : []),
    [selectedNode, adjacency]
  );

  const selectedConns = useMemo(() => {
    if (!selectedNode) return [];
    const nm = new Map(layoutNodes.map(n => [n.id, n]));
    return (adjacency.get(selectedNode.id) ?? [])
      .map(id => nm.get(id)).filter(Boolean) as KnowledgeGraphNode[];
  }, [selectedNode, adjacency, layoutNodes]);

  // ── Pan responders ────────────────────────────────────────────────────────

  const inlinePan = useGestures(scaleRef, oxRef, oyRef, setScale, setOx, setOy);
  const fsPan     = useGestures(scaleRef, oxRef, oyRef, setScale, setOx, setOy);

  // ── Zoom ──────────────────────────────────────────────────────────────────

  const zoomIn    = useCallback(() => setScale(prev => clamp(prev + ZOOM_STEP, MIN_SCALE, MAX_SCALE)), []);
  const zoomOut   = useCallback(() => setScale(prev => clamp(prev - ZOOM_STEP, MIN_SCALE, MAX_SCALE)), []);
  const resetView = useCallback(() => { setScale(1); setOx(0); setOy(0); }, []);

  const handleExpand = useCallback(() => {
    setIsFullscreen(v => !v);
    resetView();
  }, [resetView]);

  const handleCloseFullscreen = useCallback(() => {
    setIsFullscreen(false);
    resetView();
  }, [resetView]);

  // ── Node press ────────────────────────────────────────────────────────────

  const handleNodePress = useCallback((node: KnowledgeGraphNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);
    onNodePress?.(node);
  }, [onNodePress]);

  const handleDeselectNode = useCallback(() => setSelectedNode(null), []);

  const sentimentMeta = selectedNode ? {
    label: (selectedNode as any).sentiment ?? 'neutral',
    color: SENTIMENT_COLORS[(selectedNode as any).sentiment ?? 'neutral'] ?? SENTIMENT_COLORS.neutral,
  } : null;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View>
      {/* Search bar */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: COLORS.backgroundElevated,
        borderRadius: RADIUS.lg, paddingHorizontal: SPACING.sm,
        marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, height: 40,
      }}>
        <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }}/>
        <TextInput
          style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, paddingVertical: 0 }}
          placeholder="Search nodes…" placeholderTextColor={COLORS.textMuted}
          value={searchQuery} onChangeText={setSearchQuery} returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={COLORS.textMuted}/>
          </TouchableOpacity>
        )}
        {matches.size > 0 && (
          <View style={{
            backgroundColor: `${COLORS.primary}20`, borderRadius: RADIUS.full,
            paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8,
          }}>
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
              {matches.size}
            </Text>
          </View>
        )}
      </View>

      {/* Type filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingBottom: SPACING.sm }}>
        {(['root', 'primary', 'secondary', 'concept', 'company', 'trend'] as const).map(type => (
          <TouchableOpacity key={type}
            onPress={() => setFilterType(prev => prev === type ? null : type)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full,
              backgroundColor: filterType === type ? `${NODE_TYPE_COLORS[type]}25` : COLORS.backgroundElevated,
              borderWidth: 1, borderColor: filterType === type ? NODE_TYPE_COLORS[type] : COLORS.border,
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: NODE_TYPE_COLORS[type] }}/>
            <Text style={{
              color: filterType === type ? NODE_TYPE_COLORS[type] : COLORS.textMuted,
              fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'capitalize',
            }}>
              {type}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Inline canvas */}
      <View
        style={{
          width: canvasW, height: canvasH,
          backgroundColor: '#08081C',
          borderRadius: RADIUS.xl, overflow: 'hidden',
          borderWidth: 1, borderColor: `${COLORS.primary}20`,
        }}
        {...inlinePan.panHandlers}
      >
        {ready && (
          <GraphCanvas
            graph={graph} layoutNodes={layoutNodes}
            W={canvasW} H={canvasH}
            scale={scale} ox={ox} oy={oy}
            selectedNode={selectedNode}
            visibleIds={visibleIds} matches={matches} connectedIds={connectedIds}
            colorMap={colorMap} onNodePress={handleNodePress}
          />
        )}
        <ZoomBar
          scale={scale} isFS={false}
          onZoomIn={zoomIn} onZoomOut={zoomOut}
          onReset={resetView} onExpand={handleExpand}
        />
      </View>

      {/* Gesture hint */}
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginTop: 6 }}>
        Pinch to zoom · Drag to pan · Double-tap to zoom in · ⤢ expand full-screen
      </Text>

      {/* Selected node detail */}
      {selectedNode && (
        <Animated.View entering={FadeInDown.duration(260).springify()} style={{
          backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.md,
          marginTop: SPACING.sm, borderWidth: 1,
          borderColor: `${getColor(selectedNode)}40`,
          borderLeftWidth: 3, borderLeftColor: getColor(selectedNode),
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
            <View style={{
              width: 36, height: 36, borderRadius: 12,
              backgroundColor: `${getColor(selectedNode)}25`,
              alignItems: 'center', justifyContent: 'center',
              marginRight: SPACING.sm, flexShrink: 0,
            }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: getColor(selectedNode) }}/>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                  {selectedNode.label}
                </Text>
                <View style={{
                  backgroundColor: `${getColor(selectedNode)}20`,
                  borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2,
                }}>
                  <Text style={{ color: getColor(selectedNode), fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>
                    {selectedNode.type}
                  </Text>
                </View>
                {sentimentMeta && (
                  <View style={{
                    backgroundColor: `${sentimentMeta.color}20`,
                    borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2,
                  }}>
                    <Text style={{ color: sentimentMeta.color, fontSize: 9, fontWeight: '700' }}>
                      {sentimentMeta.label}
                    </Text>
                  </View>
                )}
              </View>
              {selectedNode.description && (
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 17 }}>
                  {selectedNode.description}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setSelectedNode(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: SPACING.sm }}
            >
              <Ionicons name="close" size={18} color={COLORS.textMuted}/>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Importance</Text>
            <View style={{ flex: 1, height: 4, backgroundColor: COLORS.backgroundElevated, borderRadius: 2, overflow: 'hidden' }}>
              <View style={{
                width: `${selectedNode.weight * 10}%`, height: '100%',
                backgroundColor: getColor(selectedNode), borderRadius: 2,
              }}/>
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{selectedNode.weight}/10</Text>
          </View>

          {selectedConns.length > 0 && (
            <View>
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
                fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
              }}>
                {selectedConns.length} Connected
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {selectedConns.slice(0, 8).map(cn => (
                  <TouchableOpacity key={cn.id} onPress={() => handleNodePress(cn)} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    backgroundColor: COLORS.backgroundElevated,
                    borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5,
                    borderWidth: 1, borderColor: COLORS.border,
                  }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: getColor(cn) }}/>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs }}>
                      {cn.label.length > 14 ? cn.label.slice(0, 13) + '…' : cn.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      )}

      {/* Cluster legend */}
      {clusters.length > 0 && (
        <View style={{ marginTop: SPACING.sm }}>
          <Text style={{
            color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
            fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
          }}>
            Clusters
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {clusters.map(c => {
              const hidden = hiddenClusters.has(c.id);
              return (
                <TouchableOpacity key={c.id}
                  onPress={() => setHiddenClusters(prev => {
                    const n = new Set(prev);
                    n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                    return n;
                  })}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: hidden ? COLORS.backgroundElevated : `${c.color}15`,
                    borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 6,
                    borderWidth: 1, borderColor: hidden ? COLORS.border : `${c.color}40`,
                    opacity: hidden ? 0.5 : 1,
                  }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }}/>
                  <Text style={{
                    color: hidden ? COLORS.textMuted : COLORS.textSecondary,
                    fontSize: FONTS.sizes.xs, fontWeight: '600',
                  }}>
                    {c.label}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{c.nodeIds.length}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Edge type legend */}
      <View style={{ marginTop: SPACING.sm }}>
        <Text style={{
          color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
          fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
        }}>
          Edge Types
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            { label: 'Causal',       dash: '─────', color: COLORS.primary   },
            { label: 'Associative',  dash: '─ ─ ─', color: COLORS.textMuted },
            { label: 'Comparative',  dash: '── ──', color: COLORS.warning   },
            { label: 'Temporal',     dash: '· · ·', color: COLORS.info      },
            { label: 'Hierarchical', dash: '─────', color: COLORS.success   },
          ].map(e => (
            <View key={e.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ color: e.color, fontSize: 11, letterSpacing: 1 }}>{e.dash}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{e.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Fullscreen Modal */}
      <FullscreenModal
        visible={isFullscreen}
        graph={graph}
        extended={extended}
        fsLayoutNodes={fsLayoutNodes}
        fsW={fsW}
        fsH={fsH}
        scale={scale}
        ox={ox}
        oy={oy}
        selectedNode={selectedNode}
        visibleIds={visibleIds}
        matches={matches}
        connectedIds={connectedIds}
        colorMap={colorMap}
        insets={insets}
        ready={ready}
        searchQuery={searchQuery}
        fsPanHandlers={fsPan.panHandlers}
        getColor={getColor}
        onClose={handleCloseFullscreen}
        onNodePress={handleNodePress}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onReset={resetView}
        onExpand={handleExpand}
        onSearchChange={setSearchQuery}
        onDeselectNode={handleDeselectNode}
      />
    </View>
  );
}