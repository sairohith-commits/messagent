// Hook that bridges the Dashboard/Settings UI to agentStore actions.
// Components should use this instead of reaching into the store directly,
// so we can add logging, error toasts, etc. in one place.

import { useEffect } from 'react';
import { useAgentStore } from '../store/agentStore';

/**
 * @returns {{
 *   platforms:      import('../constants/theme').DEFAULT_PLATFORMS,
 *   isLoading:      boolean,
 *   fetchSettings:  () => Promise<void>,
 *   togglePlatform: (platform: string, enabled: boolean) => Promise<void>,
 *   setMode:        (platform: string, mode: string) => Promise<void>,
 *   setSchedule:    (platform: string, start: string, end: string) => Promise<void>,
 * }}
 */
export function useAgent() {
  const platforms      = useAgentStore((s) => s.platforms);
  const isLoading      = useAgentStore((s) => s.isLoading);
  const fetchSettings  = useAgentStore((s) => s.fetchSettings);
  const togglePlatform = useAgentStore((s) => s.togglePlatform);
  const setMode        = useAgentStore((s) => s.setMode);
  const setSchedule    = useAgentStore((s) => s.setSchedule);

  // Fetch fresh settings on first mount
  useEffect(() => {
    fetchSettings();
  }, []);

  return { platforms, isLoading, fetchSettings, togglePlatform, setMode, setSchedule };
}
