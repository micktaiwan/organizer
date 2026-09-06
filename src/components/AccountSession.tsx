import { Fragment, ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useServerConfig } from '../contexts/ServerConfigContext';

// Cached data and drafts belong to one account/server. Remount them together
// when that identity changes; token refreshes keep the current session intact.
export function AccountSession({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { selectedServer } = useServerConfig();
  const sessionKey = JSON.stringify([selectedServer?.id, selectedServer?.url, user?.id]);
  return <Fragment key={sessionKey}>{children}</Fragment>;
}
