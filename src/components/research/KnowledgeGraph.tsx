// src/components/research/KnowledgeGraph.tsx
// Interactive SVG-based knowledge graph using a radial force-directed layout.
// Uses d3-force for physics simulation + react-native-svg for rendering.

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Dimensions, ActivityIndicator, PanResponder,
  GestureResponderEvent, PanResponderGestureState,
} from 'react-native';
import Svg, { Circle, Line, Text as SvgText, G, Defs, RadialGradient, Stop, Marker, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { KnowledgeGraph as KnowledgeGraphType, KnowledgeGraphNode, KnowledgeGraphEdge } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

// Node colors by type
const NODE_COLORS: Record<string, [string, string]> = {
  root:      ['#6C63FF', '#8B5CF6'],
  primary:   ['#4FACFE', '#00F2FE'],
  secondary: ['#43E97B', '#38F9D7'],
  concept:   ['#FF6584', '#FF8E53'],
  company:   ['#FA709A', '#FEE140'],
  trend:     ['#F093FB', '#F5576C'],
};

const NODE_SIZES: Record<string, number> = {
  root:      36,
  primary:   26,
  secondary: 20,
  concept:   18,
  company:   22,
  trend:     20,
};

// Very lightweight force simulation — no d3 import needed
function runForceSimulation(
  rawNodes: KnowledgeGraphNode[],
  rawEdges: KnowledgeGraphEdge[],
  width: number,
  height: number,
  iterations = 250
): KnowledgeGraphNode[] {
  // Clone nodes with initial positions in a circle
  const nodes: KnowledgeGraphNode[] = rawNodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / rawNodes.length;
    const radius = n.type === 'root' ? 0 : n.type === 'primary' ? 120 : 220;
    return {
      ...n,
      x: width / 2 + radius * Math.cos(angle),
      y: height / 2 + radius * Math.sin(angle),
      vx: 0,
      vy: 0,
    };
  });

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Build edge list with resolved node refs
  const edges = rawEdges.map(e => ({
    source: nodeMap.get(typeof e.source === 'string' ? e.source : e.source.id),
    target: nodeMap.get(typeof e.target === 'string' ? e.target : e.target.id),
    strength: e.strength ?? 0.5,
  })).filter(e => e.source && e.target);

  const LINK_DIST = 110;
  const REPULSION = 2500;
  const DAMPING   = 0.85;
  const ALPHA     = 0.3;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = ALPHA * (1 - iter / iterations);

    // Repulsion between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (REPULSION * alpha) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx! -= fx; a.vy! -= fy;
        b.vx! += fx; b.vy! += fy;
      }
    }

    // Attraction along edges
    for (const e of edges) {
      if (!e.source || !e.target) continue;
      const dx = (e.target.x ?? 0) - (e.source.x ?? 0);
      const dy = (e.target.y ?? 0) - (e.source.y ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const delta = (dist - LINK_DIST) * alpha * e.strength;
      const fx = (dx / dist) * delta;
      const fy = (dy / dist) * delta;
      e.source.vx! += fx; e.source.vy! += fy;
      e.target.vx! -= fx; e.target.vy! -= fy;
    }

    // Gravity toward center
    for (const n of nodes) {
      if (n.type === 'root') { n.x = width / 2; n.y = height / 2; continue; }
      n.vx! += ((width  / 2) - (n.x ?? 0)) * 0.015 * alpha;
      n.vy! += ((height / 2) - (n.y ?? 0)) * 0.015 * alpha;
    }

    // Apply velocity with damping
    for (const n of nodes) {
      if (n.type === 'root') continue;
      n.vx! *= DAMPING;
      n.vy! *= DAMPING;
      n.x = (n.x ?? 0) + (n.vx ?? 0);
      n.y = (n.y ?? 0) + (n.vy ?? 0);
      // Clamp to canvas
      n.x = Math.max(50, Math.min(width  - 50, n.x));
      n.y = Math.max(50, Math.min(height - 50, n.y));
    }
  }

  return nodes;
}

interface Props {
  graph: KnowledgeGraphType;
  height?: number;
  onNodePress?: (node: KnowledgeGraphNode) => void;
}

export function KnowledgeGraphView({ graph, height = 480, onNodePress }: Props) {
  const canvasW = SCREEN_W - SPACING.lg * 2;
  const canvasH = height;

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale]   = useState(1);
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);

  // Run layout once
  const layoutNodes = useMemo(
    () => runForceSimulation(graph.nodes, graph.edges, canvasW, canvasH),
    [graph.nodes.length, graph.edges.length]
  );

  const nodeMap = useMemo(
    () => new Map(layoutNodes.map(n => [n.id, n])),
    [layoutNodes]
  );

  // Pan
  const lastPan = useRef({ x: 0, y: 0 });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (_, gs) => {
        lastPan.current = { x: gs.dx, y: gs.dy };
      },
      onPanResponderMove: (_, gs) => {
        setOffset(prev => ({
          x: prev.x + (gs.dx - lastPan.current.x),
          y: prev.y + (gs.dy - lastPan.current.y),
        }));
        lastPan.current = { x: gs.dx, y: gs.dy };
      },
    })
  ).current;

  const handleNodePress = (node: KnowledgeGraphNode) => {
    setSelectedNode(prev => (prev?.id === node.id ? null : node));
    onNodePress?.(node);
  };

  // Build edges
  const renderedEdges = graph.edges.map((edge, i) => {
    const srcId = typeof edge.source === 'string' ? edge.source : edge.source.id;
    const tgtId = typeof edge.target === 'string' ? edge.target : edge.target.id;
    const src   = nodeMap.get(srcId);
    const tgt   = nodeMap.get(tgtId);
    if (!src?.x || !tgt?.x) return null;
    const opacity = 0.15 + edge.strength * 0.35;
    return (
      <Line
        key={`e-${i}`}
        x1={src.x} y1={src.y}
        x2={tgt.x} y2={tgt.y}
        stroke={`rgba(108,99,255,${opacity})`}
        strokeWidth={0.5 + edge.strength * 1.5}
      />
    );
  });

  // Build nodes
  const renderedNodes = layoutNodes.map((node) => {
    const r      = NODE_SIZES[node.type] ?? 18;
    const colors = NODE_COLORS[node.type] ?? NODE_COLORS.concept;
    const isSelected = selectedNode?.id === node.id;
    const cx = node.x ?? 0;
    const cy = node.y ?? 0;

    return (
      <G key={node.id} onPress={() => handleNodePress(node)}>
        {/* Glow ring when selected */}
        {isSelected && (
          <Circle
            cx={cx} cy={cy}
            r={r + 10}
            fill={`${colors[0]}20`}
            stroke={colors[0]}
            strokeWidth={1.5}
          />
        )}
        {/* Main circle */}
        <Circle
          cx={cx} cy={cy}
          r={r}
          fill={colors[0]}
          opacity={isSelected ? 1 : 0.85}
        />
        {/* Inner lighter circle */}
        <Circle
          cx={cx - r * 0.25} cy={cy - r * 0.25}
          r={r * 0.35}
          fill="rgba(255,255,255,0.2)"
        />
        {/* Label */}
        <SvgText
          x={cx}
          y={cy + r + 14}
          textAnchor="middle"
          fontSize={node.type === 'root' ? 11 : 9}
          fontWeight={node.type === 'root' ? 'bold' : 'normal'}
          fill="rgba(255,255,255,0.8)"
        >
          {node.label.length > 16 ? node.label.slice(0, 15) + '…' : node.label}
        </SvgText>
      </G>
    );
  });

  return (
    <View>
      {/* Graph canvas */}
      <View
        style={{
          width: canvasW, height: canvasH,
          backgroundColor: '#0D0D25',
          borderRadius: RADIUS.xl,
          overflow: 'hidden',
          borderWidth: 1, borderColor: COLORS.border,
        }}
        {...panResponder.panHandlers}
      >
        <Svg
          width={canvasW} height={canvasH}
          viewBox={`${-offset.x / scale} ${-offset.y / scale} ${canvasW / scale} ${canvasH / scale}`}
        >
          {/* Background grid */}
          {Array.from({ length: 8 }).map((_, i) => (
            <Line
              key={`hg-${i}`}
              x1={0} y1={i * (canvasH / 7)}
              x2={canvasW} y2={i * (canvasH / 7)}
              stroke="rgba(108,99,255,0.04)" strokeWidth={1}
            />
          ))}
          {Array.from({ length: 8 }).map((_, i) => (
            <Line
              key={`vg-${i}`}
              x1={i * (canvasW / 7)} y1={0}
              x2={i * (canvasW / 7)} y2={canvasH}
              stroke="rgba(108,99,255,0.04)" strokeWidth={1}
            />
          ))}
          {renderedEdges}
          {renderedNodes}
        </Svg>
      </View>

      {/* Selected node info card */}
      {selectedNode && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={{
            backgroundColor: COLORS.backgroundCard,
            borderRadius: RADIUS.lg,
            padding: SPACING.md,
            marginTop: SPACING.sm,
            borderWidth: 1,
            borderColor: `${NODE_COLORS[selectedNode.type]?.[0] ?? COLORS.primary}50`,
            borderLeftWidth: 3,
            borderLeftColor: NODE_COLORS[selectedNode.type]?.[0] ?? COLORS.primary,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <View style={{
              backgroundColor: `${NODE_COLORS[selectedNode.type]?.[0] ?? COLORS.primary}20`,
              borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8,
            }}>
              <Text style={{
                color: NODE_COLORS[selectedNode.type]?.[0] ?? COLORS.primary,
                fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase',
              }}>
                {selectedNode.type}
              </Text>
            </View>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', flex: 1 }}>
              {selectedNode.label}
            </Text>
          </View>
          {selectedNode.description && (
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18 }}>
              {selectedNode.description}
            </Text>
          )}
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 6 }}>
            Importance: {'●'.repeat(Math.round(selectedNode.weight / 2))}{'○'.repeat(5 - Math.round(selectedNode.weight / 2))}
          </Text>
        </Animated.View>
      )}

      {/* Legend */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: SPACING.sm }}
      >
        {Object.entries(NODE_COLORS).map(([type, [color]]) => (
          <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textTransform: 'capitalize' }}>
              {type}
            </Text>
          </View>
        ))}
      </ScrollView>

      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginTop: 4 }}>
        Drag to pan · Tap a node to inspect
      </Text>
    </View>
  );
}