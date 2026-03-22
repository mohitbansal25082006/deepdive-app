// src/constants/editor.ts
// Part 29 — UPDATED from Part 28
// Changes:
//   1. Removed BLOCK_TABS / BlockInserter references
//   2. Added EDITOR_TOOL_TABS (canvas | design | ai | template) — 'blocks' removed
//   3. All other constants unchanged
// ─────────────────────────────────────────────────────────────────────────────

import type {
  FontOption,
  AIRewriteOption,
  FontFamily,
  EditorTool,
} from '../types/editor';

// ─── Credit Costs ─────────────────────────────────────────────────────────────

export const EDITOR_CREDIT_COSTS = {
  ai_rewrite:   1,
  ai_generate:  2,
  ai_notes:     1,
  ai_layout:    0,
} as const;

// ─── Undo stack depth ─────────────────────────────────────────────────────────

export const MAX_UNDO_DEPTH = 20;

// ─── Font Scale Steps ─────────────────────────────────────────────────────────

export const FONT_SCALE_STEPS = [0.7, 0.8, 0.9, 1.0, 1.15, 1.3, 1.5, 1.75, 2.0] as const;
export const DEFAULT_FONT_SCALE = 1.0;

// ─── Font Options ─────────────────────────────────────────────────────────────

export const FONT_OPTIONS: FontOption[] = [
  {
    id:          'system',
    label:       'System Default',
    description: 'Clean, native look on any device',
    rnFont:      'System',
    pptxFont:    'Arial',
  },
  {
    id:          'serif',
    label:       'Classic Serif',
    description: 'Elegant, academic feel',
    rnFont:      'Georgia',
    pptxFont:    'Georgia',
  },
  {
    id:          'mono',
    label:       'Monospace',
    description: 'Technical, code-style vibe',
    rnFont:      'Courier New',
    pptxFont:    'Courier New',
  },
  {
    id:          'rounded',
    label:       'Rounded',
    description: 'Friendly, approachable tone',
    rnFont:      'System',
    pptxFont:    'Trebuchet MS',
  },
  {
    id:          'condensed',
    label:       'Condensed',
    description: 'Space-efficient, newspaper style',
    rnFont:      'System',
    pptxFont:    'Impact',
  },
];

export const DEFAULT_FONT: FontFamily = 'system';

// ─── Spacing Options ──────────────────────────────────────────────────────────

export const SPACING_OPTIONS = [
  {
    id:          'compact' as const,
    label:       'Compact',
    description: 'More content, tighter spacing',
    icon:        'contract-outline',
    padding:     0.75,
  },
  {
    id:          'default' as const,
    label:       'Default',
    description: 'Balanced whitespace',
    icon:        'reorder-four-outline',
    padding:     1.0,
  },
  {
    id:          'spacious' as const,
    label:       'Spacious',
    description: 'Airy, breathing room',
    icon:        'expand-outline',
    padding:     1.35,
  },
];

// ─── AI Rewrite Options ───────────────────────────────────────────────────────

export const AI_REWRITE_OPTIONS: AIRewriteOption[] = [
  {
    id:          'shorter',
    label:       'Shorter',
    description: 'Cut to half the length, keep the key point',
    icon:        'cut-outline',
    gradient:    ['#FF6584', '#F093FB'],
    cost:        EDITOR_CREDIT_COSTS.ai_rewrite,
  },
  {
    id:          'formal',
    label:       'More Formal',
    description: 'Lift the register for boardroom audiences',
    icon:        'briefcase-outline',
    gradient:    ['#0052CC', '#4FACFE'],
    cost:        EDITOR_CREDIT_COSTS.ai_rewrite,
  },
  {
    id:          'simpler',
    label:       'Simpler',
    description: 'Plain language, remove jargon',
    icon:        'happy-outline',
    gradient:    ['#43E97B', '#38F9D7'],
    cost:        EDITOR_CREDIT_COSTS.ai_rewrite,
  },
  {
    id:          'punchier',
    label:       'Punchier',
    description: 'Direct, active voice, stronger verbs',
    icon:        'flash-outline',
    gradient:    ['#FFA726', '#FF7043'],
    cost:        EDITOR_CREDIT_COSTS.ai_rewrite,
  },
];

// ─── Editor Tool Tabs ─────────────────────────────────────────────────────────
// Part 29: 'blocks' tab removed. 'template' tab added.

export interface EditorToolTabMeta {
  id:       EditorTool;
  label:    string;
  icon:     string;
  gradient: readonly [string, string];
}

export const EDITOR_TOOL_TABS: EditorToolTabMeta[] = [
  { id: 'select',   label: 'Edit',     icon: 'pencil-outline',        gradient: ['#6C63FF', '#8B5CF6'] },
  { id: 'design',   label: 'Design',   icon: 'color-palette-outline', gradient: ['#FF6584', '#F093FB'] },
  { id: 'ai',       label: 'AI ✦',     icon: 'sparkles-outline',      gradient: ['#FFA726', '#FF7043'] },
  { id: 'template', label: 'Templates',icon: 'copy-outline',           gradient: ['#43E97B', '#38F9D7'] },
];

// ─── Editor Color Palette ─────────────────────────────────────────────────────

export const THEME_ACCENT_COLORS = [
  '#6C63FF',
  '#0052CC',
  '#FF6584',
  '#8B5CF6',
  '#4FACFE',
  '#F093FB',
] as const;

export const SEMANTIC_COLORS = [
  '#43E97B',
  '#FFA726',
  '#29B6F6',
  '#FF4757',
  '#FFD700',
  '#FF69B4',
] as const;

export const EXTENDED_PALETTE = [
  '#FFFFFF', '#F5F5F5', '#E0E0E0', '#9E9E9E', '#616161', '#212121',
  '#E3F2FD', '#90CAF9', '#42A5F5', '#1976D2', '#0D47A1', '#01579B',
  '#EDE7F6', '#CE93D8', '#AB47BC', '#7B1FA2', '#4A148C', '#311B92',
  '#E8F5E9', '#A5D6A7', '#66BB6A', '#388E3C', '#1B5E20', '#00695C',
  '#FFEBEE', '#EF9A9A', '#EF5350', '#C62828', '#FF8F00', '#E65100',
] as const;

export const ALL_PALETTE_COLORS: string[] = [
  ...THEME_ACCENT_COLORS,
  ...SEMANTIC_COLORS,
  ...EXTENDED_PALETTE,
];

// ─── Icon Categories ──────────────────────────────────────────────────────────

export interface IconCategoryItem {
  name:  string;
  label: string;
}

export interface IconCategory {
  id:    string;
  label: string;
  emoji: string;
  icons: IconCategoryItem[];
}

export const ICON_CATEGORIES: IconCategory[] = [
  {
    id: 'tech', label: 'Technology', emoji: '💻',
    icons: [
      { name: 'cpu-outline',            label: 'CPU'       },
      { name: 'code-outline',           label: 'Code'      },
      { name: 'terminal-outline',       label: 'Terminal'  },
      { name: 'git-branch-outline',     label: 'Git'       },
      { name: 'wifi-outline',           label: 'WiFi'      },
      { name: 'phone-portrait-outline', label: 'Mobile'    },
      { name: 'desktop-outline',        label: 'Desktop'   },
      { name: 'server-outline',         label: 'Server'    },
      { name: 'cloud-outline',          label: 'Cloud'     },
      { name: 'hardware-chip-outline',  label: 'Chip'      },
      { name: 'globe-outline',          label: 'Globe'     },
      { name: 'lock-closed-outline',    label: 'Security'  },
    ],
  },
  {
    id: 'finance', label: 'Finance', emoji: '💰',
    icons: [
      { name: 'cash-outline',           label: 'Cash'      },
      { name: 'card-outline',           label: 'Card'      },
      { name: 'trending-up-outline',    label: 'Up'        },
      { name: 'trending-down-outline',  label: 'Down'      },
      { name: 'bar-chart-outline',      label: 'Bar Chart' },
      { name: 'pie-chart-outline',      label: 'Pie Chart' },
      { name: 'stats-chart-outline',    label: 'Stats'     },
      { name: 'wallet-outline',         label: 'Wallet'    },
      { name: 'briefcase-outline',      label: 'Briefcase' },
      { name: 'pricetag-outline',       label: 'Price'     },
      { name: 'receipt-outline',        label: 'Receipt'   },
      { name: 'calculator-outline',     label: 'Calculator'},
    ],
  },
  {
    id: 'science', label: 'Science', emoji: '🔬',
    icons: [
      { name: 'flask-outline',          label: 'Flask'     },
      { name: 'telescope-outline',      label: 'Telescope' },
      { name: 'planet-outline',         label: 'Planet'    },
      { name: 'nuclear-outline',        label: 'Atom'      },
      { name: 'medkit-outline',         label: 'Medkit'    },
      { name: 'pulse-outline',          label: 'Pulse'     },
      { name: 'heart-outline',          label: 'Heart'     },
      { name: 'leaf-outline',           label: 'Leaf'      },
      { name: 'water-outline',          label: 'Water'     },
      { name: 'sunny-outline',          label: 'Sun'       },
      { name: 'thermometer-outline',    label: 'Temp'      },
      { name: 'magnet-outline',         label: 'Magnet'    },
    ],
  },
  {
    id: 'education', label: 'Education', emoji: '📚',
    icons: [
      { name: 'school-outline',         label: 'School'    },
      { name: 'book-outline',           label: 'Book'      },
      { name: 'library-outline',        label: 'Library'   },
      { name: 'pencil-outline',         label: 'Pencil'    },
      { name: 'clipboard-outline',      label: 'Clipboard' },
      { name: 'newspaper-outline',      label: 'Newspaper' },
      { name: 'ribbon-outline',         label: 'Ribbon'    },
      { name: 'trophy-outline',         label: 'Trophy'    },
      { name: 'medal-outline',          label: 'Medal'     },
      { name: 'bulb-outline',           label: 'Idea'      },
      { name: 'construct-outline',      label: 'Build'     },
      { name: 'compass-outline',        label: 'Compass'   },
    ],
  },
  {
    id: 'business', label: 'Business', emoji: '🏢',
    icons: [
      { name: 'people-outline',         label: 'People'    },
      { name: 'person-outline',         label: 'Person'    },
      { name: 'business-outline',       label: 'Business'  },
      { name: 'calendar-outline',       label: 'Calendar'  },
      { name: 'time-outline',           label: 'Time'      },
      { name: 'flag-outline',           label: 'Flag'      },
      { name: 'home-outline',           label: 'Home'      },
      { name: 'location-outline',       label: 'Location'  },
      { name: 'map-outline',            label: 'Map'       },
      { name: 'layers-outline',         label: 'Layers'    },
      { name: 'grid-outline',           label: 'Grid'      },
      { name: 'settings-outline',       label: 'Settings'  },
    ],
  },
  {
    id: 'data', label: 'Data', emoji: '📊',
    icons: [
      { name: 'analytics-outline',      label: 'Analytics' },
      { name: 'filter-outline',         label: 'Filter'    },
      { name: 'search-outline',         label: 'Search'    },
      { name: 'funnel-outline',         label: 'Funnel'    },
      { name: 'list-outline',           label: 'List'      },
      { name: 'reorder-four-outline',   label: 'Reorder'   },
      { name: 'swap-horizontal-outline',label: 'Swap'      },
      { name: 'git-network-outline',    label: 'Network'   },
      { name: 'share-social-outline',   label: 'Social'    },
      { name: 'infinite-outline',       label: 'Infinite'  },
      { name: 'shuffle-outline',        label: 'Shuffle'   },
      { name: 'options-outline',        label: 'Options'   },
    ],
  },
  {
    id: 'comms', label: 'Comms', emoji: '📡',
    icons: [
      { name: 'chatbubble-outline',     label: 'Chat'      },
      { name: 'mail-outline',           label: 'Email'     },
      { name: 'call-outline',           label: 'Phone'     },
      { name: 'megaphone-outline',      label: 'Announce'  },
      { name: 'notifications-outline',  label: 'Alert'     },
      { name: 'radio-outline',          label: 'Radio'     },
      { name: 'tv-outline',             label: 'TV'        },
      { name: 'camera-outline',         label: 'Camera'    },
      { name: 'mic-outline',            label: 'Mic'       },
      { name: 'videocam-outline',       label: 'Video'     },
      { name: 'headset-outline',        label: 'Headset'   },
      { name: 'volume-high-outline',    label: 'Volume'    },
    ],
  },
  {
    id: 'misc', label: 'Misc', emoji: '✨',
    icons: [
      { name: 'sparkles-outline',           label: 'Sparkle'  },
      { name: 'star-outline',               label: 'Star'     },
      { name: 'diamond-outline',            label: 'Diamond'  },
      { name: 'rocket-outline',             label: 'Rocket'   },
      { name: 'flash-outline',              label: 'Flash'    },
      { name: 'checkmark-circle-outline',   label: 'Check'    },
      { name: 'close-circle-outline',       label: 'Close'    },
      { name: 'add-circle-outline',         label: 'Add'      },
      { name: 'remove-circle-outline',      label: 'Remove'   },
      { name: 'arrow-up-circle-outline',    label: 'Up'       },
      { name: 'arrow-forward-outline',      label: 'Forward'  },
      { name: 'refresh-circle-outline',     label: 'Refresh'  },
    ],
  },
];

export const ALL_ICONS: IconCategoryItem[] = ICON_CATEGORIES.flatMap(cat => cat.icons);

// ─── Divider Style Options ────────────────────────────────────────────────────

export const DIVIDER_STYLES = [
  { id: 'solid'   as const, label: 'Solid',   icon: 'remove-outline'      },
  { id: 'dashed'  as const, label: 'Dashed',  icon: 'ellipsis-horizontal' },
  { id: 'diamond' as const, label: 'Diamond', icon: 'diamond-outline'     },
];

// ─── Default Block Sizes ──────────────────────────────────────────────────────

export const DEFAULT_ICON_SIZE     = 40;
export const DEFAULT_SPACER_HEIGHT = 24;

// ─── Block insertion position presets ────────────────────────────────────────

export const BLOCK_POSITION_PRESETS = [
  {
    id:    'inline',
    label: 'Below slide content',
    icon:  'arrow-down-outline',
    description: 'Stacks below the main slide layout (classic)',
  },
  {
    id:    'overlay',
    label: 'Inside slide (overlay)',
    icon:  'layers-outline',
    description: 'Placed directly inside the 16:9 slide canvas',
  },
] as const;