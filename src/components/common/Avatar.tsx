// src/components/common/Avatar.tsx
// Displays user profile picture or initials fallback.
// FIXED: Handles cache-busted URLs, loading states, and errors properly.

import React, { useState } from 'react';
import { View, Image, Text, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS } from '../../constants/theme';

interface AvatarProps {
  url?: string | null;
  name?: string | null;
  size?: number;
}

export function Avatar({ url, name, size = 60 }: AvatarProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Get initials from the name (e.g., "John Doe" → "JD")
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  // Clean and validate the URL
  // Sometimes Supabase returns empty strings or malformed URLs
  const isValidUrl =
    url &&
    typeof url === 'string' &&
    url.trim().length > 0 &&
    (url.startsWith('http://') || url.startsWith('https://'));

  // Show initials fallback if no valid URL or if image failed to load
  if (!isValidUrl || error) {
    return (
      <LinearGradient
        colors={COLORS.gradientPrimary}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: `${COLORS.primary}50`,
        }}
      >
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: size * 0.35,
            fontWeight: '700',
          }}
        >
          {initials}
        </Text>
      </LinearGradient>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: COLORS.primary,
        backgroundColor: COLORS.backgroundCard,
      }}
    >
      {/* Show spinner while image is loading */}
      {loading && (
        <View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: COLORS.backgroundCard,
            zIndex: 1,
          }}
        >
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      )}

      <Image
        source={{
          uri: url,
          // Add cache-busting headers so updated avatars always reload
          headers: { Pragma: 'no-cache' },
        }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
        resizeMode="cover"
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true); // Fall back to initials on error
        }}
      />
    </View>
  );
}