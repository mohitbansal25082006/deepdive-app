// src/lib/screenState.ts
// Part 18D — Lightweight global state tracking which workspace chat screen
// is currently focused. Used by notification services to suppress in-app
// notifications when the user is already viewing that screen.
//
// Usage:
//   ChatScreen onFocus  → setActiveChatWorkspaceId(workspaceId)
//   ChatScreen onBlur   → setActiveChatWorkspaceId(null)
//   Notification code   → isOnChatScreen(workspaceId) before firing

let _activeChatWorkspaceId: string | null = null;

/** Call when the workspace chat screen gains focus. */
export function setActiveChatWorkspaceId(id: string | null): void {
  _activeChatWorkspaceId = id;
}

/** Returns true if the user is currently viewing the chat for this workspace. */
export function isOnChatScreen(workspaceId: string): boolean {
  return _activeChatWorkspaceId === workspaceId;
}

/** Returns the currently active workspace chat ID (or null). */
export function getActiveChatWorkspaceId(): string | null {
  return _activeChatWorkspaceId;
}