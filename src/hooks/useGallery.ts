import { useState, useEffect, useCallback, useRef } from 'react';
import { api, GalleryFile } from '../services/api';
import { socketService } from '../services/socket';

export type GalleryFilter = 'all' | 'image' | 'video' | 'audio' | 'file';
export type GallerySort = 'date' | 'size';

const PAGE_SIZE = 60;

interface UseGalleryOptions {
  enabled?: boolean;
}

export const useGallery = (options: UseGalleryOptions = {}) => {
  const { enabled = true } = options;

  const [files, setFiles] = useState<GalleryFile[]>([]);
  const [filter, setFilterState] = useState<GalleryFilter>('all');
  const [sort, setSortState] = useState<GallerySort>('date');
  const [searchQuery, setSearchQueryState] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSearchRef = useRef('');
  const currentFilterRef = useRef<GalleryFilter>('all');
  const currentSortRef = useRef<GallerySort>('date');

  const fetchFiles = useCallback(async (
    filterType: GalleryFilter,
    search: string,
    sortBy: GallerySort,
    paginationOpts?: { before?: string; offset?: number },
  ) => {
    try {
      const params: { type?: string; limit?: number; before?: string; search?: string; sort?: 'date' | 'size'; offset?: number } = {
        limit: PAGE_SIZE,
        sort: sortBy,
      };
      if (filterType !== 'all') params.type = filterType;
      if (search) params.search = search;
      if (paginationOpts?.before) params.before = paginationOpts.before;
      if (paginationOpts?.offset) params.offset = paginationOpts.offset;

      const { files: fetched } = await api.getFiles(params);
      return fetched;
    } catch (err) {
      console.error('Failed to fetch gallery files:', err);
      throw err;
    }
  }, []);

  const loadInitial = useCallback(async (filterType: GalleryFilter, search: string, sortBy: GallerySort) => {
    setIsLoading(true);
    setError(null);
    try {
      const fetched = await fetchFiles(filterType, search, sortBy);
      setFiles(fetched);
      setHasMore(fetched.length >= PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
      setFiles([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [fetchFiles]);

  // Initial load
  useEffect(() => {
    if (!enabled) return;
    loadInitial('all', '', 'date');
  }, [enabled, loadInitial]);

  // Socket listener for file:deleted
  useEffect(() => {
    if (!enabled) return;

    const unsub = socketService.on('file:deleted', (data: unknown) => {
      const { messageId } = data as { messageId: string };
      setFiles(prev => prev.filter(f => f.id !== messageId));
    });

    return () => { unsub(); };
  }, [enabled]);

  const setFilter = useCallback((f: GalleryFilter) => {
    setFilterState(f);
    currentFilterRef.current = f;
    loadInitial(f, currentSearchRef.current, currentSortRef.current);
  }, [loadInitial]);

  const setSort = useCallback((s: GallerySort) => {
    setSortState(s);
    currentSortRef.current = s;
    loadInitial(currentFilterRef.current, currentSearchRef.current, s);
  }, [loadInitial]);

  const setSearch = useCallback((q: string) => {
    setSearchQueryState(q);
    currentSearchRef.current = q;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      loadInitial(currentFilterRef.current, q, currentSortRef.current);
    }, 300);
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || files.length === 0) return;

    setIsLoadingMore(true);
    try {
      const lastFile = files[files.length - 1];
      const currentSort = currentSortRef.current;
      const paginationOpts = currentSort === 'size'
        ? { offset: files.length }
        : { before: lastFile.createdAt };
      const fetched = await fetchFiles(
        currentFilterRef.current,
        currentSearchRef.current,
        currentSort,
        paginationOpts,
      );
      setFiles(prev => [...prev, ...fetched]);
      setHasMore(fetched.length >= PAGE_SIZE);
    } catch (err) {
      console.error('Failed to load more gallery files:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, files, fetchFiles]);

  const deleteFile = useCallback(async (fileId: string): Promise<boolean> => {
    try {
      await api.deleteFile(fileId);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      return true;
    } catch (err) {
      console.error('Failed to delete file:', err);
      return false;
    }
  }, []);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return {
    files,
    filter,
    sort,
    searchQuery,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    setFilter,
    setSort,
    setSearch,
    loadMore,
    deleteFile,
  };
};
