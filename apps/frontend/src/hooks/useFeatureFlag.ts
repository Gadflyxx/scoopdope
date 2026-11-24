import { useCallback, useEffect, useState } from 'react';

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  rollout_percent: number;
}

interface FeatureFlagsResponse {
  flags?: FeatureFlag[];
  feature_flags?: FeatureFlag[];
}

const API_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL) ||
  '';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  flags: Record<string, boolean>;
  timestamp: number;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<Record<string, boolean>> | null = null;

function getAuthToken(): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return (
        localStorage.getItem('auth_token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('access_token')
      );
    }
  } catch {
    // Ignore storage access errors (e.g. SSR or privacy mode).
  }
  return null;
}

function normalizeFlags(payload: FeatureFlagsResponse | FeatureFlag[]): Record<string, boolean> {
  const list: FeatureFlag[] = Array.isArray(payload)
    ? payload
    : payload?.flags ?? payload?.feature_flags ?? [];

  const result: Record<string, boolean> = {};
  for (const flag of list) {
    if (!flag || typeof flag.name !== 'string') continue;
    const rollout = typeof flag.rollout_percent === 'number' ? flag.rollout_percent : 100;
    result[flag.name] = Boolean(flag.enabled) && rollout > 0;
  }
  return result;
}

async function fetchFeatureFlags(): Promise<Record<string, boolean>> {
  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return cache.flags;
  }

  if (inFlight) {
    return inFlight;
  }

  const token = getAuthToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  inFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/feature-flags`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch feature flags: ${response.status}`);
      }

      const payload = (await response.json()) as FeatureFlagsResponse | FeatureFlag[];
      const flags = normalizeFlags(payload);
      cache = { flags, timestamp: Date.now() };
      return flags;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Returns whether the given feature flag is enabled for the current user.
 * Defaults to `false` while loading or on error.
 */
export function useFeatureFlag(name: string): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
      return cache.flags[name] ?? false;
    }
    return false;
  });

  const load = useCallback(async () => {
    try {
      const flags = await fetchFeatureFlags();
      setEnabled(flags[name] ?? false);
    } catch {
      setEnabled(false);
    }
  }, [name]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const flags = await fetchFeatureFlags();
        if (!cancelled) {
          setEnabled(flags[name] ?? false);
        }
      } catch {
        if (!cancelled) {
          setEnabled(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [name]);

  // Expose a manual refresh path via the returned value's stability.
  void load;

  return enabled;
}

/** Clears the in-memory cache so the next hook render refetches flags. */
export function clearFeatureFlagCache(): void {
  cache = null;
  inFlight = null;
}

export default useFeatureFlag;