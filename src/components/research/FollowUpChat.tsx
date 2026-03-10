// src/components/research/FollowUpChat.tsx
// UPDATED: Keyboard-safe — messages scroll up when keyboard opens.
// Uses ScrollView with inverted approach so newest messages are always visible.

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ConversationMessage } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const SUGGESTED_QUESTIONS = [
  'Who are the top companies?',
  'What are the biggest risks?',
  'What should I invest in?',
  'What does this mean for jobs?',
];

interface Props {
  messages: ConversationMessage[];
  sending: boolean;
  onSend: (text: string) => void;
}

export function FollowUpChat({ messages, sending, onSend }: Props) {
  const [inputText, setInputText] = React.useState('');
  const scrollRef = useRef<ScrollView>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = () => {
    if (!inputText.trim() || sending) return;
    onSend(inputText.trim());
    setInputText('');
  };

  return (
    <View style={{ flexShrink: 1 }}>
      {/* Suggested chips — only when no messages yet */}
      {messages.length === 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.sm,
            gap: 8,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {SUGGESTED_QUESTIONS.map((q) => (
            <TouchableOpacity
              key={q}
              onPress={() => onSend(q)}
              style={{
                backgroundColor: `${COLORS.primary}15`,
                borderRadius: RADIUS.full,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: `${COLORS.primary}30`,
              }}
            >
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '500' }}>
                {q}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Message list — fixed height so it doesn't push the input off screen */}
      {messages.length > 0 && (
        <ScrollView
          ref={scrollRef}
          style={{ height: 220 }}
          contentContainerStyle={{
            padding: SPACING.md,
            paddingBottom: SPACING.sm,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
        >
          {messages.map((msg) => (
            <Animated.View
              key={msg.id}
              entering={FadeInDown.duration(300)}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                marginBottom: SPACING.sm,
              }}
            >
              {msg.role === 'assistant' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <LinearGradient
                    colors={COLORS.gradientPrimary}
                    style={{
                      width: 18, height: 18, borderRadius: 6,
                      alignItems: 'center', justifyContent: 'center',
                      marginRight: 6,
                    }}
                  >
                    <Ionicons name="sparkles" size={10} color="#FFF" />
                  </LinearGradient>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    DeepDive AI
                  </Text>
                </View>
              )}
              <View style={{
                backgroundColor: msg.role === 'user' ? COLORS.primary : COLORS.backgroundElevated,
                borderRadius: RADIUS.lg,
                borderBottomRightRadius: msg.role === 'user' ? 4 : RADIUS.lg,
                borderBottomLeftRadius: msg.role === 'assistant' ? 4 : RADIUS.lg,
                padding: SPACING.sm,
              }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 20 }}>
                  {msg.content}
                </Text>
              </View>
            </Animated.View>
          ))}

          {/* Typing indicator */}
          {sending && (
            <View style={{
              alignSelf: 'flex-start',
              backgroundColor: COLORS.backgroundElevated,
              borderRadius: RADIUS.lg,
              padding: SPACING.sm,
              marginBottom: SPACING.sm,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                Thinking...
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Input row — always visible, above keyboard */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        gap: SPACING.sm,
        borderTopWidth: messages.length > 0 ? 1 : 0,
        borderTopColor: COLORS.border,
      }}>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask anything about this research..."
          placeholderTextColor={COLORS.textMuted}
          style={{
            flex: 1,
            backgroundColor: COLORS.backgroundElevated,
            borderRadius: RADIUS.full,
            paddingHorizontal: SPACING.md,
            paddingVertical: 10,
            color: COLORS.textPrimary,
            fontSize: FONTS.sizes.sm,
            borderWidth: 1,
            borderColor: COLORS.border,
            maxHeight: 80,
          }}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          blurOnSubmit={false}
          multiline={false}
        />
        <TouchableOpacity onPress={handleSend} disabled={!inputText.trim() || sending}>
          <LinearGradient
            colors={inputText.trim() ? COLORS.gradientPrimary : ['#2A2A4A', '#1A1A35']}
            style={{
              width: 42, height: 42, borderRadius: 21,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {sending
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Ionicons name="arrow-up" size={20} color="#FFF" />
            }
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}