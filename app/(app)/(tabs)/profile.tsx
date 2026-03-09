// app/(app)/(tabs)/profile.tsx
// Profile screen — shows user info, provides edit and sign out options.
// This is the main profile view after setup.

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { useProfile } from '../../../src/hooks/useProfile';
import { Avatar } from '../../../src/components/common/Avatar';
import { AnimatedInput } from '../../../src/components/common/AnimatedInput';
import { GradientButton } from '../../../src/components/common/GradientButton';
import { LoadingOverlay } from '../../../src/components/common/LoadingOverlay';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { updateProfile, uploadAvatar, updating, uploading } = useProfile();

  const [editModalVisible, setEditModalVisible] = useState(false);

  // Edit form state (pre-filled with current profile data)
  const [editName, setEditName] = useState(profile?.full_name || '');
  const [editBio, setEditBio] = useState(profile?.bio || '');
  const [editOccupation, setEditOccupation] = useState(profile?.occupation || '');
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setEditAvatarUri(result.assets[0].uri);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    let avatarUrl = profile?.avatar_url;

    if (editAvatarUri) {
      const { url, error } = await uploadAvatar(user.id, editAvatarUri);
      if (error) {
        Alert.alert('Upload Error', error);
        return;
      }
      avatarUrl = url;
    }

    const { error } = await updateProfile(user.id, {
      full_name: editName.trim() || null,
      bio: editBio.trim() || null,
      occupation: editOccupation.trim() || null,
      avatar_url: avatarUrl,
    });

    if (error) {
      Alert.alert('Error', error);
      return;
    }

    await refreshProfile();
    setEditModalVisible(false);
    setEditAvatarUri(null);
  };

  // Open edit modal and pre-fill form with current data
  const openEditModal = () => {
    setEditName(profile?.full_name || '');
    setEditBio(profile?.bio || '');
    setEditOccupation(profile?.occupation || '');
    setEditAvatarUri(null);
    setEditModalVisible(true);
  };

  // Reusable info row component
  const InfoRow = ({
    icon,
    label,
    value,
  }: {
    icon: string;
    label: string;
    value?: string | null;
  }) => {
    if (!value) return null;
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: SPACING.sm,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: `${COLORS.primary}20`,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Ionicons name={icon as any} size={18} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
            {label}
          </Text>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base }}>
            {value}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient
      colors={[COLORS.background, COLORS.backgroundCard]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <LoadingOverlay visible={updating || uploading} message="Saving..." />

        <ScrollView
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile header */}
          <Animated.View
            entering={FadeIn.duration(600)}
            style={{ alignItems: 'center', marginBottom: SPACING.xl }}
          >
            {/* Avatar — uses the fixed Avatar component */}
            <View style={{ marginBottom: SPACING.md }}>
              <Avatar
                url={profile?.avatar_url}
                name={profile?.full_name}
                size={90}
              />
            </View>

            <Text
              style={{
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes.xl,
                fontWeight: '800',
                marginBottom: 4,
              }}
            >
              {profile?.full_name || 'User'}
            </Text>

            {profile?.username && (
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.base }}>
                @{profile.username}
              </Text>
            )}

            {profile?.bio && (
              <Text
                style={{
                  color: COLORS.textSecondary,
                  fontSize: FONTS.sizes.sm,
                  textAlign: 'center',
                  marginTop: SPACING.sm,
                  lineHeight: 20,
                }}
              >
                {profile.bio}
              </Text>
            )}

            {/* Edit Profile Button */}
            <TouchableOpacity
              onPress={openEditModal}
              style={{
                marginTop: SPACING.md,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: `${COLORS.primary}20`,
                borderRadius: RADIUS.full,
                paddingHorizontal: SPACING.lg,
                paddingVertical: SPACING.sm,
                borderWidth: 1,
                borderColor: `${COLORS.primary}40`,
              }}
            >
              <Ionicons name="pencil" size={16} color={COLORS.primary} />
              <Text
                style={{
                  color: COLORS.primary,
                  fontSize: FONTS.sizes.sm,
                  fontWeight: '600',
                  marginLeft: 6,
                }}
              >
                Edit Profile
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Profile info card */}
          <View
            style={{
              backgroundColor: COLORS.backgroundCard,
              borderRadius: RADIUS.xl,
              padding: SPACING.lg,
              borderWidth: 1,
              borderColor: COLORS.border,
              marginBottom: SPACING.lg,
            }}
          >
            <Text
              style={{
                color: COLORS.textSecondary,
                fontSize: FONTS.sizes.sm,
                fontWeight: '600',
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: SPACING.md,
              }}
            >
              About
            </Text>
            <InfoRow icon="mail-outline" label="Email" value={user?.email} />
            <InfoRow
              icon="briefcase-outline"
              label="Occupation"
              value={profile?.occupation}
            />

            {/* Interests */}
            {profile?.interests && profile.interests.length > 0 && (
              <View style={{ paddingVertical: SPACING.sm }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: SPACING.sm,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: `${COLORS.primary}20`,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    <Ionicons name="bookmark" size={18} color={COLORS.primary} />
                  </View>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    Interests
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    marginLeft: 48,
                  }}
                >
                  {profile.interests.map((interest) => (
                    <View
                      key={interest}
                      style={{
                        backgroundColor: `${COLORS.primary}15`,
                        borderRadius: RADIUS.full,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        margin: 3,
                      }}
                    >
                      <Text
                        style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs }}
                      >
                        {interest}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Account actions */}
          <View
            style={{
              backgroundColor: COLORS.backgroundCard,
              borderRadius: RADIUS.xl,
              padding: SPACING.lg,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text
              style={{
                color: COLORS.textSecondary,
                fontSize: FONTS.sizes.sm,
                fontWeight: '600',
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: SPACING.md,
              }}
            >
              Account
            </Text>

            <TouchableOpacity
              onPress={handleSignOut}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: SPACING.sm,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: `${COLORS.error}20`,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
              </View>
              <Text
                style={{
                  color: COLORS.error,
                  fontSize: FONTS.sizes.base,
                  fontWeight: '500',
                  flex: 1,
                }}
              >
                Sign Out
              </Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* ============================
            EDIT PROFILE MODAL
            ============================ */}
        <Modal
          visible={editModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setEditModalVisible(false)}
        >
          <BlurView
            intensity={20}
            style={{
              flex: 1,
              backgroundColor: 'rgba(10,10,26,0.7)',
              justifyContent: 'flex-end',
            }}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
              <View
                style={{
                  backgroundColor: COLORS.backgroundCard,
                  borderTopLeftRadius: 30,
                  borderTopRightRadius: 30,
                  padding: SPACING.xl,
                  borderTopWidth: 1,
                  borderTopColor: COLORS.border,
                  maxHeight: '90%',
                }}
              >
                {/* Modal header */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: SPACING.xl,
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.textPrimary,
                      fontSize: FONTS.sizes.xl,
                      fontWeight: '800',
                    }}
                  >
                    Edit Profile
                  </Text>
                  <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                    <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Avatar change */}
                  <View
                    style={{ alignItems: 'center', marginBottom: SPACING.xl }}
                  >
                    <TouchableOpacity onPress={pickImage}>
                      {editAvatarUri ? (
                        // Show the newly picked local image
                        <View>
                          <Image
                            source={{ uri: editAvatarUri }}
                            style={{
                              width: 90,
                              height: 90,
                              borderRadius: 45,
                              borderWidth: 2,
                              borderColor: COLORS.primary,
                            }}
                          />
                          <View
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              right: 0,
                              backgroundColor: COLORS.primary,
                              borderRadius: 16,
                              padding: 6,
                            }}
                          >
                            <Ionicons name="camera" size={14} color="#FFF" />
                          </View>
                        </View>
                      ) : (
                        // Show current profile avatar with camera overlay
                        <View>
                          <Avatar
                            url={profile?.avatar_url}
                            name={profile?.full_name}
                            size={90}
                          />
                          <View
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              right: 0,
                              backgroundColor: COLORS.primary,
                              borderRadius: 16,
                              padding: 6,
                            }}
                          >
                            <Ionicons name="camera" size={14} color="#FFF" />
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                    <Text
                      style={{
                        color: COLORS.textMuted,
                        fontSize: FONTS.sizes.xs,
                        marginTop: 8,
                      }}
                    >
                      Tap to change photo
                    </Text>
                  </View>

                  {/* Edit fields */}
                  <AnimatedInput
                    label="Full Name"
                    value={editName}
                    onChangeText={setEditName}
                    leftIcon="person-outline"
                  />
                  <AnimatedInput
                    label="Occupation"
                    value={editOccupation}
                    onChangeText={setEditOccupation}
                    leftIcon="briefcase-outline"
                  />
                  <AnimatedInput
                    label="Bio"
                    value={editBio}
                    onChangeText={setEditBio}
                    leftIcon="document-text-outline"
                    multiline
                    numberOfLines={3}
                  />

                  <GradientButton
                    title="Save Changes"
                    onPress={handleSaveProfile}
                    loading={updating || uploading}
                    style={{ marginTop: SPACING.md }}
                  />
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </BlurView>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}