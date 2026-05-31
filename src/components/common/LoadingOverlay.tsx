// src/components/common/LoadingOverlay.tsx
// Part 43 CRASH FIX — removed BlurView from inside Modal.
//
// ROOT CAUSE OF EMAIL LOGIN CRASH:
//   The original LoadingOverlay used <BlurView> inside a <Modal>.
//   On Android, Modal renders in a SEPARATE native window.
//   BlurView (expo-blur v55+) requires a BlurTargetView ref to know
//   what to blur — but it cannot cross native window boundaries.
//   This causes a native crash when the Modal appears on Android.
//
//   Additionally, calling router.replace() while the Modal is open
//   causes a second crash: the OS tries to present a new screen while
//   a modal view controller is already being presented.
//   (Confirmed: https://github.com/react-navigation/react-navigation/issues/11201)
//
//   This is why email login crashed but OAuth did not:
//   OAuth never sets loading=true — the browser handles its own UI.
//   Email login sets loading=true before the API call, showing the Modal.
//
// THE FIX:
//   1. Replace <BlurView> with a plain <View> with semi-transparent background.
//      Visually almost identical, completely safe on all Android versions.
//   2. Change animationType from "fade" to "none" so the Modal appears/
//      disappears instantly — no animation to interrupt during navigation.
//   3. In signin.tsx: setLoading(false) is called BEFORE router.replace()
//      so the Modal is dismissed before navigation starts.

import React from 'react';
import { View, ActivityIndicator, Text, Modal } from 'react-native';
import { COLORS, FONTS, RADIUS } from '../../constants/theme';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export function LoadingOverlay({ visible, message = 'Loading...' }: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"       // ← was "fade"; "none" prevents animation crash on Android
      statusBarTranslucent       // ensures full-screen coverage on Android
      onRequestClose={() => {}}  // required on Android
    >
      {/* Plain semi-transparent View instead of BlurView — safe inside Modal on all Android */}
      <View
        style={{
          flex:            1,
          alignItems:      'center',
          justifyContent:  'center',
          backgroundColor: 'rgba(10, 10, 26, 0.82)',
        }}
      >
        <View style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    20,
          padding:         32,
          alignItems:      'center',
          borderWidth:     1,
          borderColor:     COLORS.border,
          minWidth:        160,
        }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{
            color:      COLORS.textSecondary,
            fontSize:   FONTS.sizes.base,
            marginTop:  16,
            textAlign:  'center',
          }}>
            {message}
          </Text>
        </View>
      </View>
    </Modal>
  );
}