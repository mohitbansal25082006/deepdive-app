// src/context/NetworkContext.tsx
// Part 22 — Network connectivity context.
//
// Uses @react-native-community/netinfo to detect real internet connectivity.
// Provides:
//   • isOnline  — true if connected and internet is reachable
//   • isOffline — convenience inverse
//   • connectionType — 'wifi' | 'cellular' | 'none' | 'unknown'
//   • isConnecting — true during the brief window between status changes
//
// The provider is placed at the root (_layout.tsx) so all screens can
// access network status without prop drilling.
//
// IMPORTANT: Workspace features always require online — they are never cached.
// This is enforced in the offline screen (shows a notice for workspace tabs).

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from 'react';
import NetInfo, {
  NetInfoState,
  NetInfoStateType,
  NetInfoSubscription,
} from '@react-native-community/netinfo';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectionType = 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';

export interface NetworkContextValue {
  isOnline:        boolean;
  isOffline:       boolean;
  connectionType:  ConnectionType;
  isConnecting:    boolean;
  /** Force a fresh connectivity check */
  recheckNetwork:  () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const NetworkContext = createContext<NetworkContextValue>({
  isOnline:       true,
  isOffline:      false,
  connectionType: 'unknown',
  isConnecting:   false,
  recheckNetwork: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  // Start optimistically online to avoid flash on first render
  const [isOnline,       setIsOnline]       = useState(true);
  const [connectionType, setConnectionType] = useState<ConnectionType>('unknown');
  const [isConnecting,   setIsConnecting]   = useState(false);

  const unsubRef = useRef<NetInfoSubscription | null>(null);

  const applyState = useCallback((state: NetInfoState) => {
    const connected =
      state.isConnected === true &&
      (state.isInternetReachable === true || state.isInternetReachable == null);

    setIsOnline(connected);
    setIsConnecting(false);

    const rawType = state.type as NetInfoStateType;
    if (rawType === NetInfoStateType.wifi)     setConnectionType('wifi');
    else if (rawType === NetInfoStateType.cellular) setConnectionType('cellular');
    else if (rawType === NetInfoStateType.ethernet) setConnectionType('ethernet');
    else if (rawType === NetInfoStateType.none)     setConnectionType('none');
    else                                            setConnectionType('unknown');
  }, []);

  useEffect(() => {
    // Initial fetch
    NetInfo.fetch().then(applyState).catch(() => {});

    // Subscribe to changes
    unsubRef.current = NetInfo.addEventListener((state) => {
      setIsConnecting(true);
      // Small debounce so we don't flash the offline screen during brief drops
      setTimeout(() => applyState(state), 800);
    });

    return () => {
      unsubRef.current?.();
    };
  }, [applyState]);

  const recheckNetwork = useCallback(async () => {
    setIsConnecting(true);
    try {
      const state = await NetInfo.fetch();
      applyState(state);
    } catch {
      setIsConnecting(false);
    }
  }, [applyState]);

  return (
    <NetworkContext.Provider
      value={{
        isOnline,
        isOffline:      !isOnline,
        connectionType,
        isConnecting,
        recheckNetwork,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext);
}