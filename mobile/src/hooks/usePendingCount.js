// Hook — polls the pending replies count every 30s to keep the tab badge fresh.

import { useState, useEffect } from 'react';
import { useAuthStore }        from '../store/authStore';
import * as api                from '../services/api';

export function usePendingCount() {
  const [count, setCount] = useState(0);
  const token             = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return;

    function fetch() {
      api.getPendingReplies()
        .then((data) => setCount(data.total ?? 0))
        .catch(() => {});
    }

    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, [token]);

  return count;
}
