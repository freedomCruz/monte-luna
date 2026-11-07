import * as React from 'react';
import type { AdminResult } from './client';

interface Page<T> {
  items: T[];
  next_cursor: string | null;
  total: number;
  generated_at: string;
}

export type AppendedPages<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: T[]; total: number; generatedAt: string; hasMore: boolean; loadingMore: boolean; moreFailed: boolean; loadMore: () => void };

/**
 * Cursor-paginated list that grows by appending pages ("Ver más"). The first page reloads
 * whenever `key` or `reload` changes; `fetchPage` must be stable for a given `key`.
 */
export function useAppendedPages<T>(fetchPage: (cursor?: string) => Promise<AdminResult<Page<T>>>, key: string, reload: number): AppendedPages<T> & { retry: () => void } {
  const [state, setState] = React.useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; items: T[]; total: number; generatedAt: string; cursor: string | null; loadingMore: boolean; moreFailed: boolean }>({ status: 'loading' });
  const [attempt, setAttempt] = React.useState(0);
  const generation = React.useRef(0);
  const fetchRef = React.useRef(fetchPage);
  fetchRef.current = fetchPage;

  React.useEffect(() => {
    let live = true;
    generation.current += 1;
    setState({ status: 'loading' });
    void fetchRef.current().then((result) => {
      if (!live) return;
      if (!result.ok) {
        setState({ status: 'error' });
        return;
      }
      setState({ status: 'ready', items: result.data.items, total: result.data.total, generatedAt: result.data.generated_at, cursor: result.data.next_cursor, loadingMore: false, moreFailed: false });
    });
    return () => { live = false; };
  }, [key, reload, attempt]);

  const retry = React.useCallback(() => setAttempt((value) => value + 1), []);
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const loadMore = React.useCallback(() => {
    const current = stateRef.current;
    if (current.status !== 'ready' || current.cursor === null || current.loadingMore) return;
    setState({ ...current, loadingMore: true, moreFailed: false });
    const started = generation.current;
    void fetchRef.current(current.cursor).then((result) => {
      if (started !== generation.current) return;
      setState((latest) => {
        if (latest.status !== 'ready') return latest;
        if (!result.ok) return { ...latest, loadingMore: false, moreFailed: true };
        return { ...latest, items: [...latest.items, ...result.data.items], total: result.data.total, cursor: result.data.next_cursor, loadingMore: false, moreFailed: false };
      });
    });
  }, []);

  if (state.status !== 'ready') return { ...state, retry };
  return { status: 'ready', items: state.items, total: state.total, generatedAt: state.generatedAt, hasMore: state.cursor !== null, loadingMore: state.loadingMore, moreFailed: state.moreFailed, loadMore, retry };
}
