// src/components/workspace/EditAccessRequestModal.tsx
// Part 12 — Two-mode modal:
//   • VIEWER mode: compose + submit an access request
//   • OWNER/EDITOR mode: review + approve/deny pending requests

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Modal, ActivityIndicator, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeOut, SlideInDown, SlideOutDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../common/Avatar';
import { EditAccessRequest } from '../../services/editAccessRequestService';
import { WorkspaceRole } from '../../types';
import { COLORS, FONTS, RADIUS } from '../../constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ViewerProps {
  mode:            'viewer';
  visible:         boolean;
  workspaceName:   string;
  existingRequest: EditAccessRequest | null;
  isSubmitting:    boolean;
  onSubmit:        (message: string) => void;
  onRetract:       () => void;
  onClose:         () => void;
}

interface OwnerProps {
  mode:        'owner';
  visible:     boolean;
  requests:    EditAccessRequest[];
  isActioning: boolean;
  onApprove:   (requestId: string) => void;
  onDeny:      (requestId: string) => void;
  onClose:     () => void;
}

type Props = ViewerProps | OwnerProps;

// ─── Component ────────────────────────────────────────────────────────────────

export function EditAccessRequestModal(props: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="none"
      onRequestClose={props.onClose}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={StyleSheet.absoluteFillObject}
      >
        <TouchableOpacity 
          style={{ flex: 1 }} 
          activeOpacity={1} 
          onPress={props.onClose}
        />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kavWrap}
      >
        <Animated.View
          entering={SlideInDown
            .duration(300)
            .springify()
            .damping(15)
            .stiffness(200)
            .mass(1)
          }
          exiting={SlideOutDown.duration(200)}
          style={[
            styles.sheet, 
            { 
              paddingBottom: Math.max(insets.bottom, 20),
            }
          ]}
        >
          {/* Handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {props.mode === 'viewer' ? (
            <ViewerContent {...(props as ViewerProps)} />
          ) : (
            <OwnerContent {...(props as OwnerProps)} />
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Viewer content ───────────────────────────────────────────────────────────

function ViewerContent({
  workspaceName,
  existingRequest,
  isSubmitting,
  onSubmit,
  onRetract,
  onClose,
}: Omit<ViewerProps, 'mode' | 'visible'>) {
  const [message, setMessage] = useState('');

  const hasPending  = existingRequest?.status === 'pending';
  const hasDenied   = existingRequest?.status === 'denied';
  const hasApproved = existingRequest?.status === 'approved';

  const handleSubmit = () => {
    onSubmit(message.trim());
    setMessage('');
  };

  return (
    <View style={styles.content}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={[styles.headerIconWrap, { backgroundColor: `${COLORS.primary}15` }]}>
          <Ionicons name="pencil-outline" size={22} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Request Editor Access</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{workspaceName}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {hasApproved ? (
        // Already approved — shouldn't normally reach here
        <StatusCard
          icon="checkmark-circle"
          iconColor={COLORS.success}
          title="Access Granted"
          body="You already have editor access to this workspace."
          bg={`${COLORS.success}10`}
          border={`${COLORS.success}30`}
        />
      ) : hasPending ? (
        // Pending request
        <>
          <StatusCard
            icon="time-outline"
            iconColor={COLORS.warning}
            title="Request Pending"
            body="Your request is waiting for the workspace owner to review it. You'll be notified when they respond."
            bg={`${COLORS.warning}10`}
            border={`${COLORS.warning}30`}
          />
          {existingRequest?.message && (
            <View style={styles.messagePreview}>
              <Text style={styles.messagePreviewLabel}>Your message:</Text>
              <Text style={styles.messagePreviewText}>"{existingRequest.message}"</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={onRetract}
            disabled={isSubmitting}
            style={styles.retractBtn}
            activeOpacity={0.8}
          >
            {isSubmitting
              ? <ActivityIndicator size="small" color={COLORS.error} />
              : <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />}
            <Text style={styles.retractBtnText}>Retract Request</Text>
          </TouchableOpacity>
        </>
      ) : (
        // No request yet (or denied — allow re-request)
        <>
          {hasDenied && (
            <StatusCard
              icon="close-circle-outline"
              iconColor={COLORS.error}
              title="Previous Request Denied"
              body="Your previous request was denied. You can submit a new request with an updated message."
              bg={`${COLORS.error}10`}
              border={`${COLORS.error}30`}
            />
          )}

          <Text style={styles.fieldLabel}>
            Why do you need editor access?
            <Text style={styles.fieldOptional}> (optional)</Text>
          </Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="e.g. I want to add research reports and leave feedback on sections…"
            placeholderTextColor={COLORS.textMuted}
            style={styles.messageInput}
            multiline
            maxLength={300}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{message.length}/300</Text>

          <Text style={styles.helperText}>
            Editors can add reports to the workspace, leave comments, reply to threads, and use emoji reactions.
          </Text>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={[styles.submitBtn, isSubmitting && { opacity: 0.6 }]}
            activeOpacity={0.85}
          >
            {isSubmitting
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Ionicons name="send-outline" size={16} color="#FFF" />}
            <Text style={styles.submitBtnText}>
              {isSubmitting ? 'Sending…' : hasDenied ? 'Re-submit Request' : 'Send Request'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ─── Owner content ────────────────────────────────────────────────────────────

function OwnerContent({
  requests,
  isActioning,
  onApprove,
  onDeny,
  onClose,
}: Omit<OwnerProps, 'mode' | 'visible'>) {
  return (
    <View style={styles.content}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={[styles.headerIconWrap, { backgroundColor: `${COLORS.warning}15` }]}>
          <Ionicons name="person-add-outline" size={22} color={COLORS.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Access Requests</Text>
          <Text style={styles.subtitle}>
            {requests.length} pending request{requests.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {requests.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="checkmark-done-circle-outline" size={44} color={COLORS.success} />
          <Text style={styles.emptyTitle}>All caught up!</Text>
          <Text style={styles.emptyDesc}>No pending access requests.</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: 400 }}
          contentContainerStyle={{ gap: 8 }}
        >
          {requests.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              isActioning={isActioning}
              onApprove={() => onApprove(req.id)}
              onDeny={() => onDeny(req.id)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── RequestCard ──────────────────────────────────────────────────────────────

function RequestCard({
  request, isActioning, onApprove, onDeny,
}: {
  request:     EditAccessRequest;
  isActioning: boolean;
  onApprove:   () => void;
  onDeny:      () => void;
}) {
  const name = request.profile?.fullName ?? request.profile?.username ?? 'Unknown';
  const since = new Date(request.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });

  return (
    <View style={reqStyles.card}>
      <View style={reqStyles.top}>
        <Avatar
          url={request.profile?.avatarUrl}
          name={name}
          size={40}
        />
        <View style={{ flex: 1 }}>
          <Text style={reqStyles.name} numberOfLines={1}>{name}</Text>
          {request.profile?.username && (
            <Text style={reqStyles.username}>@{request.profile.username}</Text>
          )}
          <Text style={reqStyles.since}>Requested {since}</Text>
        </View>
      </View>

      {request.message ? (
        <View style={reqStyles.messageWrap}>
          <Ionicons name="chatbubble-outline" size={11} color={COLORS.textMuted} />
          <Text style={reqStyles.message} numberOfLines={4}>
            "{request.message}"
          </Text>
        </View>
      ) : (
        <Text style={reqStyles.noMessage}>No message provided</Text>
      )}

      <View style={reqStyles.actions}>
        <TouchableOpacity
          onPress={onDeny}
          disabled={isActioning}
          style={reqStyles.denyBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="close-outline" size={16} color={COLORS.error} />
          <Text style={reqStyles.denyText}>Deny</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onApprove}
          disabled={isActioning}
          style={reqStyles.approveBtn}
          activeOpacity={0.8}
        >
          {isActioning
            ? <ActivityIndicator size="small" color="#FFF" />
            : <Ionicons name="checkmark-outline" size={16} color="#FFF" />}
          <Text style={reqStyles.approveText}>Approve as Editor</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── StatusCard ───────────────────────────────────────────────────────────────

function StatusCard({
  icon, iconColor, title, body, bg, border,
}: {
  icon:      keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title:     string;
  body:      string;
  bg:        string;
  border:    string;
}) {
  return (
    <View style={[statusStyles.card, { backgroundColor: bg, borderColor: border }]}>
      <Ionicons name={icon} size={20} color={iconColor} />
      <View style={{ flex: 1 }}>
        <Text style={[statusStyles.title, { color: iconColor }]}>{title}</Text>
        <Text style={statusStyles.body}>{body}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  kavWrap: {
    position: 'absolute', 
    left: 0, 
    right: 0, 
    bottom: 0,
  },
  sheet: {
    backgroundColor:      COLORS.backgroundCard,
    borderTopLeftRadius:  26,
    borderTopRightRadius: 26,
    borderTopWidth:       1,
    borderColor:          COLORS.border,
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -4 },
    shadowOpacity:        0.25,
    shadowRadius:         16,
    elevation:            20,
    overflow: 'hidden',
  },
  handleWrap: { 
    alignItems: 'center', 
    paddingTop: 10, 
    paddingBottom: 6,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  handle: { 
    width: 40, 
    height: 4, 
    borderRadius: 2, 
    backgroundColor: COLORS.border,
  },
  content: { 
    paddingHorizontal: 24, 
    paddingBottom: 16,
    paddingTop: 44, // Space for handle
  },

  headerRow: {
    flexDirection: 'row', 
    alignItems: 'center',
    gap: 16, 
    marginBottom: 20,
  },
  headerIconWrap: {
    width: 48, 
    height: 48, 
    borderRadius: 14,
    alignItems: 'center', 
    justifyContent: 'center',
  },
  title: { 
    color: COLORS.textPrimary, 
    fontSize: FONTS.sizes.lg, 
    fontWeight: '800',
  },
  subtitle: { 
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.xs, 
    marginTop: 2,
  },
  closeBtn: {
    width: 32, 
    height: 32, 
    borderRadius: 10,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 1, 
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },

  fieldLabel: { 
    color: COLORS.textSecondary, 
    fontSize: FONTS.sizes.sm, 
    fontWeight: '600', 
    marginBottom: 8,
  },
  fieldOptional: { 
    color: COLORS.textMuted, 
    fontWeight: '400',
  },
  messageInput: {
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg,
    borderWidth: 1, 
    borderColor: COLORS.border,
    color: COLORS.textPrimary, 
    fontSize: FONTS.sizes.sm,
    paddingHorizontal: 16, 
    paddingVertical: 12,
    minHeight: 100,
  },
  charCount: { 
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.xs, 
    alignSelf: 'flex-end', 
    marginTop: 4,
  },
  helperText:  {
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.xs,
    lineHeight: 18, 
    marginTop: 8, 
    marginBottom: 16,
  },

  submitBtn: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg, 
    paddingVertical: 14,
  },
  submitBtnText: { 
    color: '#FFF', 
    fontSize: FONTS.sizes.base, 
    fontWeight: '700',
  },

  retractBtn: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8,
    backgroundColor: `${COLORS.error}10`,
    borderRadius: RADIUS.lg, 
    paddingVertical: 12,
    borderWidth: 1, 
    borderColor: `${COLORS.error}30`,
    marginTop: 16,
  },
  retractBtnText: { 
    color: COLORS.error, 
    fontSize: FONTS.sizes.sm, 
    fontWeight: '600',
  },

  messagePreview: {
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg, 
    padding: 16,
    borderWidth: 1, 
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  messagePreviewLabel: { 
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.xs, 
    fontWeight: '600', 
    marginBottom: 4,
  },
  messagePreviewText:  { 
    color: COLORS.textSecondary, 
    fontSize: FONTS.sizes.sm, 
    fontStyle: 'italic',
  },

  emptyWrap: { 
    alignItems: 'center', 
    paddingVertical: 24, 
    gap: 10,
  },
  emptyTitle: { 
    color: COLORS.textPrimary, 
    fontSize: FONTS.sizes.base, 
    fontWeight: '700',
  },
  emptyDesc:  { 
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.sm,
  },
});

const statusStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    gap: 10,
    borderRadius: RADIUS.lg, 
    padding: 16,
    borderWidth: 1, 
    marginBottom: 16,
  },
  title: { 
    fontSize: FONTS.sizes.sm, 
    fontWeight: '700', 
    marginBottom: 4,
  },
  body:  { 
    color: COLORS.textSecondary, 
    fontSize: FONTS.sizes.xs, 
    lineHeight: 18,
  },
});

const reqStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.xl, 
    padding: 16,
    borderWidth: 1, 
    borderColor: COLORS.border,
  },
  top: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 10, 
    marginBottom: 8,
  },
  name: { 
    color: COLORS.textPrimary, 
    fontSize: FONTS.sizes.sm, 
    fontWeight: '700',
  },
  username:  { 
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.xs,
  },
  since: { 
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.xs, 
    marginTop: 2,
  },
  messageWrap: {
    flexDirection: 'row', 
    gap: 6, 
    alignItems: 'flex-start',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg, 
    padding: 8,
    borderWidth: 1, 
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  message: { 
    color: COLORS.textSecondary, 
    fontSize: FONTS.sizes.xs, 
    lineHeight: 18, 
    flex: 1, 
    fontStyle: 'italic',
  },
  noMessage: { 
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.xs, 
    fontStyle: 'italic', 
    marginBottom: 8,
  },
  actions: { 
    flexDirection: 'row', 
    gap: 8,
  },
  denyBtn: {
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 5,
    backgroundColor: `${COLORS.error}12`,
    borderRadius: RADIUS.lg, 
    paddingVertical: 10,
    borderWidth: 1, 
    borderColor: `${COLORS.error}30`,
  },
  denyText: { 
    color: COLORS.error, 
    fontSize: FONTS.sizes.sm, 
    fontWeight: '700',
  },
  approveBtn: {
    flex: 2, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 5,
    backgroundColor: COLORS.success,
    borderRadius: RADIUS.lg, 
    paddingVertical: 10,
  },
  approveText: { 
    color: '#FFF', 
    fontSize: FONTS.sizes.sm, 
    fontWeight: '700',
  },
});