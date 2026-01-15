import { useMemo, useState } from 'react';

export const usePagination = <T,>(items: T[], pageSize = 10) => {
  const [page, setPage] = useState(1);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const next = () => setPage((p) => Math.min(pages, p + 1));
  const prev = () => setPage((p) => Math.max(1, p - 1));
  const goto = (p: number) => setPage(Math.min(pages, Math.max(1, p)));

  return { page, pages, total, current, next, prev, goto, pageSize, setPage };
};

