// src/hooks/useNetworkStatus.ts
// Part 22 — Convenience hook for network status.
// Re-exports useNetwork from NetworkContext with a more descriptive name,
// and adds a `showOfflineBanner` flag for screens that want a subtle banner
// rather than a full takeover screen (e.g. history tab).

import { useNetwork } from '../context/NetworkContext';

export interface NetworkStatus {
  isOnline:        boolean;
  isOffline:       boolean;
  connectionType:  string;
  isConnecting:    boolean;
  showOfflineBanner: boolean;
  recheckNetwork:  () => Promise<void>;
}

export function useNetworkStatus(): NetworkStatus {
  const network = useNetwork();

  return {
    ...network,
    // Show a banner when offline but still in a screen that could partially work
    showOfflineBanner: network.isOffline && !network.isConnecting,
  };
}