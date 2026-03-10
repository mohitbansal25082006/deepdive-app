// src/components/research/FollowUpChat.tsx
// Conversational follow-up panel at the bottom of a research report.
// Users can ask clarifying questions about the research.

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
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
    <View style={{
      borderTopWidth: 1,
      borderTopColor: COLORS.border,
      backgroundColor: COLORS.backgroundCard,
    }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.md,
        borderBottomWidth: messages.length > 0 ? 1 : 0,
        borderBottomColor: COLORS.border,
      }}>
        <LinearGradient
          colors={COLORS.gradientPrimary}
          style={{
            width: 32, height: 32, borderRadius: 10,
            alignItems: 'center', justifyContent: 'center',
            marginRight: SPACING.sm,
          }}
        >
          <Ionicons name="chatbubble-ellipses" size={16} color="#FFF" />
        </LinearGradient>
        <Text style={{
          color: COLORS.textPrimary,
          fontSize: FONTS.sizes.base,
          fontWeight: '700',
        }}>
          Ask Follow-Up Questions
        </Text>
      </View>

      {/* Suggested questions (shown only when no messages) */}
      {messages.length === 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ padding: SPACING.md, gap: 8 }}
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
              <Text style={{
                color: COLORS.primary,
                fontSize: FONTS.sizes.sm,
                fontWeight: '500',
              }}>
                {q}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Message list */}
      {messages.length > 0 && (
        <ScrollView
          ref={scrollRef}
          style={{ maxHeight: 280 }}
          contentContainerStyle={{ padding: SPACING.md }}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg, i) => (
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
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 4,
                }}>
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
                backgroundColor: msg.role === 'user'
                  ? COLORS.primary
                  : COLORS.backgroundElevated,
                borderRadius: RADIUS.lg,
                borderBottomRightRadius: msg.role === 'user' ? 4 : RADIUS.lg,
                borderBottomLeftRadius: msg.role === 'assistant' ? 4 : RADIUS.lg,
                padding: SPACING.sm,
              }}>
                <Text style={{
                  color: COLORS.textPrimary,
                  fontSize: FONTS.sizes.sm,
                  lineHeight: 20,
                }}>
                  {msg.content}
                </Text>
              </View>
            </Animated.View>
          ))}
          {sending && (
            <View style={{
              alignSelf: 'flex-start',
              backgroundColor: COLORS.backgroundElevated,
              borderRadius: RADIUS.lg,
              padding: SPACING.sm,
              marginBottom: SPACING.sm,
            }}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          )}
        </ScrollView>
      )}

      {/* Input */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.md,
        paddingTop: SPACING.sm,
        gap: SPACING.sm,
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
          }}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          multiline={false}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
        >
          <LinearGradient
            colors={inputText.trim() ? COLORS.gradientPrimary : ['#2A2A4A', '#1A1A35']}
            style={{
              width: 42, height: 42, borderRadius: 21,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="arrow-up" size={20} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}