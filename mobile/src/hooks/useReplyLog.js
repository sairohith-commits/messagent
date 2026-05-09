// Hook for fetching and paginating reply logs, and submitting thumbs ratings.

import { useState, useCallback } from 'react';
import { get, put } from '../services/api';

const PAGE_SIZE = 20;

/**
 * @returns {{
 *   logs:       object[],
 *   total:      number,
 *   isLoading:  boolean,
 *   loadMore:   () => void,
 *   rateReply:  (logId: string, rating: 1 | -1) => Promise<void>,
 *   refresh:    () => void,
 * }}
 */
export function useReplyLog() {
  const [logs,      setLogs]      = useState([]);
  const [total,     setTotal]     = useState(0);
  const [offset,    setOffset]    = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPage = useCallback(async (currentOffset) => {
    setIsLoading(true);
    try {
      const data = await get(`/logs?limit=${PAGE_SIZE}&offset=${currentOffset}`);
      if (currentOffset === 0) {
        // Full refresh — replace the list
        setLogs(data.logs ?? []);
      } else {
        // Append next page
        setLogs((prev) => [...prev, ...(data.logs ?? [])]);
      }
      setTotal(data.total ?? 0);
    } catch (err) {
      console.warn('[useReplyLog] fetch failed:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Expose a pull-to-refresh entry point that resets pagination
  const refresh = useCallback(() => {
    setOffset(0);
    fetchPage(0);
  }, [fetchPage]);

  // Load next page — called by FlatList onEndReached
  const loadMore = useCallback(() => {
    if (isLoading) return;
    const hasMore = logs.length < total;
    if (!hasMore) return;
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    fetchPage(nextOffset);
  }, [isLoading, logs.length, total, offset, fetchPage]);

  // Submit a thumbs up (1) or thumbs down (-1) rating
  const rateReply = useCallback(async (logId, rating) => {
    // Optimistic local update
    setLogs((prev) =>
      prev.map((log) => (log.id === logId ? { ...log, rating } : log)),
    );
    try {
      await put(`/logs/${logId}/rating`, { rating });
    } catch (err) {
      // Revert optimistic update on failure
      setLogs((prev) =>
        prev.map((log) => (log.id === logId ? { ...log, rating: null } : log)),
      );
      console.warn('[useReplyLog] rateReply failed:', err.message);
    }
  }, []);

  return { logs, total, isLoading, refresh, loadMore, rateReply };
}
