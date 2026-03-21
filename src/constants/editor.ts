// src/constants/editor.ts
// Part 28 — Slide Canvas Editor: All editor constants
// ─────────────────────────────────────────────────────────────────────────────

import type {
  FontOption,
  AIRewriteOption,
  FontFamily,
} from '../types/editor';

// ─── Credit Costs ─────────────────────────────────────────────────────────────

export const EDITOR_CREDIT_COSTS = {
  /** AI rewrite any text field  — 1 credit */
  ai_rewrite:     1,
  /** AI generate a new slide    — 2 credits */
  ai_generate:    2,
  /** AI write speaker notes     — 1 credit */
  ai_notes:       1,
  /** AI suggest better layout   — free */
  ai_layout:      0,
} as const;

// ─── Undo stack depth ─────────────────────────────────────────────────────────

export const MAX_UNDO_DEPTH = 20;

// ─── Font Scale Steps ─────────────────────────────────────────────────────────

/** Ordered scale multipliers for font-size up/down controls */
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

// ─── Editor Color Palette ─────────────────────────────────────────────────────

/** Theme accent colors — shown as first row in color picker */
export const THEME_ACCENT_COLORS = [
  '#6C63FF', // Dark/Light primary
  '#0052CC', // Corporate primary
  '#FF6584', // Vibrant primary
  '#8B5CF6', // Purple variant
  '#4FACFE', // Blue variant
  '#F093FB', // Pink variant
] as const;

/** Semantic / UI colors */
export const SEMANTIC_COLORS = [
  '#43E97B', // success / green
  '#FFA726', // warning / orange
  '#29B6F6', // info / blue
  '#FF4757', // error / red
  '#FFD700', // gold / pro
  '#FF69B4', // hot pink
] as const;

/** Extended palette — 5 rows × 6 columns = 30 colors */
export const EXTENDED_PALETTE = [
  // Row 1 — Whites & grays
  '#FFFFFF', '#F5F5F5', '#E0E0E0', '#9E9E9E', '#616161', '#212121',
  // Row 2 — Blues
  '#E3F2FD', '#90CAF9', '#42A5F5', '#1976D2', '#0D47A1', '#01579B',
  // Row 3 — Purples
  '#EDE7F6', '#CE93D8', '#AB47BC', '#7B1FA2', '#4A148C', '#311B92',
  // Row 4 — Greens
  '#E8F5E9', '#A5D6A7', '#66BB6A', '#388E3C', '#1B5E20', '#00695C',
  // Row 5 — Reds & oranges
  '#FFEBEE', '#EF9A9A', '#EF5350', '#C62828', '#FF8F00', '#E65100',
] as const;

/** All colors combined for the picker */
export const ALL_PALETTE_COLORS: string[] = [
  ...THEME_ACCENT_COLORS,
  ...SEMANTIC_COLORS,
  ...EXTENDED_PALETTE,
];

// ─── Icon Categories ──────────────────────────────────────────────────────────

export interface IconCategoryItem {
  name:  string; // Ionicons name
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
    id:    'tech',
    label: 'Technology',
    emoji: '💻',
    icons: [
      { name: 'cpu-outline',           label: 'CPU'        },
      { name: 'code-outline',          label: 'Code'       },
      { name: 'terminal-outline',      label: 'Terminal'   },
      { name: 'git-branch-outline',    label: 'Git'        },
      { name: 'wifi-outline',          label: 'WiFi'       },
      { name: 'phone-portrait-outline',label: 'Mobile'     },
      { name: 'desktop-outline',       label: 'Desktop'    },
      { name: 'server-outline',        label: 'Server'     },
      { name: 'cloud-outline',         label: 'Cloud'      },
      { name: 'hardware-chip-outline', label: 'Chip'       },
      { name: 'globe-outline',         label: 'Globe'      },
      { name: 'lock-closed-outline',   label: 'Security'   },
    ],
  },
  {
    id:    'finance',
    label: 'Finance',
    emoji: '💰',
    icons: [
      { name: 'cash-outline',          label: 'Cash'       },
      { name: 'card-outline',          label: 'Card'       },
      { name: 'trending-up-outline',   label: 'Trending Up'},
      { name: 'trending-down-outline', label: 'Trending Dn'},
      { name: 'bar-chart-outline',     label: 'Bar Chart'  },
      { name: 'pie-chart-outline',     label: 'Pie Chart'  },
      { name: 'stats-chart-outline',   label: 'Stats'      },
      { name: 'wallet-outline',        label: 'Wallet'     },
      { name: 'briefcase-outline',     label: 'Briefcase'  },
      { name: 'pricetag-outline',      label: 'Price'      },
      { name: 'receipt-outline',       label: 'Receipt'    },
      { name: 'calculator-outline',    label: 'Calculator' },
    ],
  },
  {
    id:    'science',
    label: 'Science',
    emoji: '🔬',
    icons: [
      { name: 'flask-outline',         label: 'Flask'      },
      { name: 'telescope-outline',     label: 'Telescope'  },
      { name: 'planet-outline',        label: 'Planet'     },
      { name: 'nuclear-outline',       label: 'Atom'       },
      { name: 'medkit-outline',        label: 'Medkit'     },
      { name: 'pulse-outline',         label: 'Pulse'      },
      { name: 'heart-outline',         label: 'Heart'      },
      { name: 'leaf-outline',          label: 'Leaf'       },
      { name: 'water-outline',         label: 'Water'      },
      { name: 'sunny-outline',         label: 'Sun'        },
      { name: 'thermometer-outline',   label: 'Temperature'},
      { name: 'magnet-outline',        label: 'Magnet'     },
    ],
  },
  {
    id:    'education',
    label: 'Education',
    emoji: '📚',
    icons: [
      { name: 'school-outline',        label: 'School'     },
      { name: 'book-outline',          label: 'Book'       },
      { name: 'library-outline',       label: 'Library'    },
      { name: 'pencil-outline',        label: 'Pencil'     },
      { name: 'clipboard-outline',     label: 'Clipboard'  },
      { name: 'newspaper-outline',     label: 'Newspaper'  },
      { name: 'ribbon-outline',        label: 'Ribbon'     },
      { name: 'trophy-outline',        label: 'Trophy'     },
      { name: 'medal-outline',         label: 'Medal'      },
      { name: 'bulb-outline',          label: 'Idea'       },
      { name: 'construct-outline',     label: 'Build'      },
      { name: 'compass-outline',       label: 'Compass'    },
    ],
  },
  {
    id:    'business',
    label: 'Business',
    emoji: '🏢',
    icons: [
      { name: 'people-outline',        label: 'People'     },
      { name: 'person-outline',        label: 'Person'     },
      { name: 'business-outline',      label: 'Business'   },
      { name: 'calendar-outline',      label: 'Calendar'   },
      { name: 'time-outline',          label: 'Time'       },
      { name: 'flag-outline',          label: 'Flag'       },
      { name: 'home-outline',          label: 'Home'       },
      { name: 'location-outline',      label: 'Location'   },
      { name: 'map-outline',           label: 'Map'        },
      { name: 'layers-outline',        label: 'Layers'     },
      { name: 'grid-outline',          label: 'Grid'       },
      { name: 'settings-outline',      label: 'Settings'   },
    ],
  },
  {
    id:    'data',
    label: 'Data',
    emoji: '📊',
    icons: [
      { name: 'analytics-outline',     label: 'Analytics'  },
      { name: 'filter-outline',        label: 'Filter'     },
      { name: 'search-outline',        label: 'Search'     },
      { name: 'funnel-outline',        label: 'Funnel'     },
      { name: 'list-outline',          label: 'List'       },
      { name: 'reorder-four-outline',  label: 'Reorder'    },
      { name: 'swap-horizontal-outline',label:'Swap'       },
      { name: 'git-network-outline',   label: 'Network'    },
      { name: 'share-social-outline',  label: 'Social'     },
      { name: 'infinite-outline',      label: 'Infinite'   },
      { name: 'shuffle-outline',       label: 'Shuffle'    },
      { name: 'options-outline',       label: 'Options'    },
    ],
  },
  {
    id:    'comms',
    label: 'Comms',
    emoji: '📡',
    icons: [
      { name: 'chatbubble-outline',        label: 'Chat'       },
      { name: 'mail-outline',              label: 'Email'      },
      { name: 'call-outline',              label: 'Phone'      },
      { name: 'megaphone-outline',         label: 'Announce'   },
      { name: 'notifications-outline',     label: 'Alert'      },
      { name: 'radio-outline',             label: 'Radio'      },
      { name: 'tv-outline',                label: 'TV'         },
      { name: 'camera-outline',            label: 'Camera'     },
      { name: 'mic-outline',               label: 'Mic'        },
      { name: 'videocam-outline',          label: 'Video'      },
      { name: 'headset-outline',           label: 'Headset'    },
      { name: 'volume-high-outline',       label: 'Volume'     },
    ],
  },
  {
    id:    'misc',
    label: 'Misc',
    emoji: '✨',
    icons: [
      { name: 'sparkles-outline',          label: 'Sparkle'    },
      { name: 'star-outline',              label: 'Star'       },
      { name: 'diamond-outline',           label: 'Diamond'    },
      { name: 'rocket-outline',            label: 'Rocket'     },
      { name: 'lightning-bolt-outline',    label: 'Lightning'  },
      { name: 'checkmark-circle-outline',  label: 'Check'      },
      { name: 'close-circle-outline',      label: 'Close'      },
      { name: 'add-circle-outline',        label: 'Add'        },
      { name: 'remove-circle-outline',     label: 'Remove'     },
      { name: 'arrow-up-circle-outline',   label: 'Up'         },
      { name: 'arrow-forward-outline',     label: 'Forward'    },
      { name: 'refresh-circle-outline',    label: 'Refresh'    },
    ],
  },
];

/** All icons flat, for search */
export const ALL_ICONS: IconCategoryItem[] = ICON_CATEGORIES.flatMap(cat => cat.icons);

// ─── Divider Style Options ────────────────────────────────────────────────────

export const DIVIDER_STYLES = [
  { id: 'solid'   as const, label: 'Solid',   icon: 'remove-outline'     },
  { id: 'dashed'  as const, label: 'Dashed',  icon: 'ellipsis-horizontal'},
  { id: 'diamond' as const, label: 'Diamond', icon: 'diamond-outline'    },
];

// ─── Default Block Sizes ─────────────────────────────────────────────────────

export const DEFAULT_ICON_SIZE   = 40;
export const DEFAULT_SPACER_HEIGHT = 24;