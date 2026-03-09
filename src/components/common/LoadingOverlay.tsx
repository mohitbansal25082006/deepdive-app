// src/components/common/LoadingOverlay.tsx
// Shows a full-screen loading indicator with a blur backdrop.
// Used when performing async operations like signing in.

import React from 'react';
import { View, ActivityIndicator, Text, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, FONTS } from '../../constants/theme';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export function LoadingOverlay({ visible, message = 'Loading...' }: LoadingOverlayProps) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <BlurView
        intensity={20}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(10, 10, 26, 0.7)',
        }}
      >
        <View style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius: 20,
          padding: 32,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: COLORS.border,
        }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{
            color: COLORS.textSecondary,
            fontSize: FONTS.sizes.base,
            marginTop: 16,
          }}>
            {message}
          </Text>
        </View>
      </BlurView>
    </Modal>
  );
}