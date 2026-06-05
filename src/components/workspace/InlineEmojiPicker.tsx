// src/components/workspace/InlineEmojiPicker.tsx
// Part 48 NEW — Built-in custom emoji picker (replaces rn-emoji-keyboard).
//
// Design goals:
//   • Zero external dependencies — pure React Native components only.
//   • Renders INLINE (not in a Modal) so it sits above the input bar without
//     pushing the input off-screen. The parent ChatInput renders this ABOVE
//     the container, inside the KeyboardAvoidingView stack.
//   • Multi-select — tapping multiple emojis appends each one; picker stays
//     open until the user taps the emoji button again to close it.
//   • 300 emojis spread across 8 categories with a category tab strip.
//   • Recently-used section (up to 16, stored in-memory per session).
//   • Animated slide-in from the bottom.

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  ScrollView, StyleSheet, Animated as RNAnimated,
  useWindowDimensions,
} from 'react-native';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Emoji data ───────────────────────────────────────────────────────────────

const CATEGORIES: { key: string; label: string; emojis: string[] }[] = [
  {
    key: 'recent',
    label: '🕐',
    emojis: [], // filled dynamically from recentlyUsed
  },
  {
    key: 'smileys',
    label: '😀',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃',
      '😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚',
      '😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭',
      '🤫','🤔','🤐','🤨','😐','😑','😶','😶‍🌫️','😏','😒',
      '🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒',
      '🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','😵‍💫','🤯',
      '🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️',
      '😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥',
      '😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱',
      '😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡',
      '👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻',
    ],
  },
  {
    key: 'gestures',
    label: '👋',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞',
      '🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍',
      '👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝',
      '🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂',
      '🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅',
      '👄','🫦','💋','🫶','🤙','🤌','🫵','🫴','🫳','🫲',
    ],
  },
  {
    key: 'people',
    label: '👤',
    emojis: [
      '👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓',
      '👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇',
      '🤦','🤷','👮','🕵️','💂','🥷','👷','🫅','🤴','👸',
      '👳','👲','🧕','🤵','👰','🤰','🫄','🤱','👼','🎅',
      '🤶','🧑‍🎄','🦸','🦹','🧙','🧝','🧛','🧟','🧞','🧜',
      '🧚','🧑‍⚕️','👨‍⚕️','👩‍⚕️','🧑‍🎓','👨‍🎓','👩‍🎓','🧑‍💻','👨‍💻','👩‍💻',
    ],
  },
  {
    key: 'animals',
    label: '🐶',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨',
      '🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒',
      '🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗',
      '🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🦟',
      '🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑',
      '🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈',
      '🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏',
    ],
  },
  {
    key: 'food',
    label: '🍕',
    emojis: [
      '🍎','🍊','🍋','🍇','🍓','🍒','🍑','🥭','🍍','🥥',
      '🥝','🍅','🫒','🫑','🥦','🥬','🥒','🌽','🥕','🧅',
      '🧄','🥔','🍠','🥐','🥖','🍞','🥨','🧀','🍳','🧈',
      '🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟',
      '🍕','🌮','🌯','🫔','🥙','🧆','🥚','🍱','🍘','🍣',
      '🍛','🍜','🍝','🍲','🫕','🥘','🥗','🫙','🧂','🍿',
      '🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍩','🍪','🍦',
      '🍨','🍧','🧃','🥤','🧋','☕','🍵','🫖','🍺','🍻',
    ],
  },
  {
    key: 'objects',
    label: '💡',
    emojis: [
      '💌','💎','🔔','🔕','📱','💻','🖥️','🖨️','⌨️','🖱️',
      '🖲️','💾','💿','📀','📷','📸','📹','🎥','📞','☎️',
      '📺','📻','🧭','⏱️','⌚','📡','🔋','🔌','💡','🔦',
      '🕯️','🪔','🧯','🛢️','💰','💴','💵','💶','💷','💸',
      '💳','🪙','💹','✉️','📧','📦','📝','📋','📁','📂',
      '🗂️','📌','📍','✂️','🗃️','🗑️','🔒','🔓','🔑','🗝️',
      '🔨','🪓','⛏️','⚒️','🛠️','🗡️','⚔️','🛡️','🔧','🔩',
      '⚙️','🪤','🧲','🔗','⛓️','🪝','🧰','🧲','🪜','🧪',
    ],
  },
  {
    key: 'symbols',
    label: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
      '❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️',
      '✝️','☪️','🕉️','☯️','✡️','🔯','🕎','☦️','🛐','⛎',
      '♈','♉','♊','♋','♌','♍','♎','♏','♐','♑',
      '♒','♓','🆔','⚡','🌀','♾️','✅','❎','🆗','🆙',
      '🆒','🆕','🆓','🆖','🅰️','🅱️','🆘','❌','⭕','🛑',
      '⛔','📛','🚫','💯','💢','♨️','🚷','📵','🔞','❗',
      '❕','❓','❔','‼️','⁉️','🔅','🔆','🔱','⚜️','🔰',
      '♻️','✔️','🔀','🔁','🔂','▶️','⏩','⏫','⏪','⏬',
      '◀️','🔼','🔽','⏏️','🎦','🔇','🔈','🔉','🔊','📢',
    ],
  },
];

// ─── Recently used (in-memory, per session) ───────────────────────────────────

let _recentlyUsed: string[] = [];

function addToRecent(emoji: string) {
  _recentlyUsed = [emoji, ..._recentlyUsed.filter(e => e !== emoji)].slice(0, 24);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  visible:         boolean;
  onEmojiSelected: (emoji: string) => void;
  onClose:         () => void;
}

const NUM_COLS   = 8;
const EMOJI_SIZE = 36;

export function InlineEmojiPicker({ visible, onEmojiSelected, onClose }: Props) {
  const { width } = useWindowDimensions();
  const [activeCategory, setActiveCategory] = useState<string>('smileys');
  const [recentlyUsed,   setRecentlyUsed]   = useState<string[]>(_recentlyUsed);

  // Slide-up animation
  const slideAnim = useRef(new RNAnimated.Value(0)).current;
  const prevVisible = useRef(false);

  if (visible !== prevVisible.current) {
    prevVisible.current = visible;
    RNAnimated.timing(slideAnim, {
      toValue:  visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }

  const handleEmoji = useCallback((emoji: string) => {
    addToRecent(emoji);
    setRecentlyUsed([...(_recentlyUsed)]);
    onEmojiSelected(emoji);
    // Picker stays open — parent decides when to close
  }, [onEmojiSelected]);

  if (!visible) return null;

  // Build current emoji list
  const currentCat = CATEGORIES.find(c => c.key === activeCategory);
  const emojiList  = activeCategory === 'recent'
    ? recentlyUsed
    : (currentCat?.emojis ?? []);

  const translateY = slideAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [300, 0],
  });

  const renderEmoji = ({ item }: { item: string }) => (
    <TouchableOpacity
      onPress={() => handleEmoji(item)}
      style={styles.emojiBtn}
      activeOpacity={0.6}
    >
      <Text style={styles.emojiText}>{item}</Text>
    </TouchableOpacity>
  );

  return (
    <RNAnimated.View
      style={[styles.container, { transform: [{ translateY }] }]}
    >
      {/* Category tab strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryStrip}
        contentContainerStyle={styles.categoryStripContent}
      >
        {CATEGORIES.map(cat => {
          const isActive  = activeCategory === cat.key;
          const showCount = cat.key === 'recent' && recentlyUsed.length === 0;
          if (showCount) return null; // hide Recent tab if empty
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => setActiveCategory(cat.key)}
              style={[styles.catBtn, isActive && styles.catBtnActive]}
              activeOpacity={0.7}
            >
              <Text style={styles.catIcon}>{cat.label}</Text>
              {isActive && <View style={styles.catActiveBar} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Emoji grid */}
      <FlatList
        data={emojiList}
        keyExtractor={(item, idx) => `${item}-${idx}`}
        renderItem={renderEmoji}
        numColumns={NUM_COLS}
        showsVerticalScrollIndicator={false}
        style={styles.grid}
        contentContainerStyle={styles.gridContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No recently used emojis</Text>
          </View>
        }
        keyboardShouldPersistTaps="always"
        removeClippedSubviews
        maxToRenderPerBatch={48}
        windowSize={5}
      />
    </RNAnimated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    height:           260,
    backgroundColor:  COLORS.backgroundCard,
    borderTopWidth:   1,
    borderTopColor:   COLORS.border,
  },
  categoryStrip: {
    maxHeight:        46,
    flexShrink:       0,
  },
  categoryStripContent: {
    paddingHorizontal: SPACING.sm,
    alignItems:        'center',
    gap:               2,
  },
  catBtn: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   10,
    position:       'relative',
  },
  catBtnActive: {
    backgroundColor: `${COLORS.primary}15`,
  },
  catIcon: {
    fontSize: 20,
  },
  catActiveBar: {
    position:        'absolute',
    bottom:          4,
    left:            10,
    right:           10,
    height:          2,
    borderRadius:    1,
    backgroundColor: COLORS.primary,
  },
  divider: {
    height:          1,
    backgroundColor: COLORS.border,
  },
  grid: {
    flex: 1,
  },
  gridContent: {
    paddingHorizontal: SPACING.sm,
    paddingVertical:   SPACING.xs,
  },
  emojiBtn: {
    flex:           1,
    aspectRatio:    1,
    maxWidth:       EMOJI_SIZE + 4,
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   8,
    margin:         2,
  },
  emojiText: {
    fontSize: 22,
  },
  emptyWrap: {
    paddingVertical: SPACING.xl,
    alignItems:      'center',
  },
  emptyText: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.sm,
    fontStyle: 'italic',
  },
});