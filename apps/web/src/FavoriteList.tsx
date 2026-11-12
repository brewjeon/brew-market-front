import { useEffect, useState } from 'react';
import { ApiError, formatPrice, statusLabel } from './posts';
import type { PostSummary } from './posts';
import PostImage from './PostImage';

type FavoritePage = { items: PostSummary[]; hasNext: boolean; nextId: number | null };

export default function FavoriteList() {
  const [items, setItems] = useState<PostSummary[]>([]);
  const [page, setPage] = useState<FavoritePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(beforeId?: number, signal?: AbortSignal) {
    setLoading(true);
    setError('');
    try {
      const query = beforeId ? `?beforeId=${beforeId}` : '';
      const response = await fetch(`/api/favorites${query}`, { signal, cache: 'no-store' });
      if (!response.ok) throw new ApiError(response.status);
      const result = await response.json() as FavoritePage;
      setItems((previous) => beforeId ? [...previous, ...result.items] : result.items);
      setPage(result);
    } catch {
      if (!signal?.aborted) setError('관심글을 불러오지 못했습니다. 다시 시도해 주세요.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(undefined, controller.signal);
    return () => controller.abort();
  }, []);

  return <section aria-label="관심글">
    <div className="section-heading"><h1>관심글</h1></div>
    {items.length === 0 && !loading && !error && <p>저장한 관심글이 없습니다.</p>}
    <ul className="post-grid">{items.map((post) => <li key={post.id}>
      <a className="post-card" href={`#/posts/${post.id}`}>
        <PostImage url={post.imageUrl} title={post.title} />
        <span className={`badge ${post.status}`}>{statusLabel[post.status]}</span>
        <h2>{post.title}</h2><p className="price">{formatPrice(post.price)}</p>
      </a>
    </li>)}</ul>
    {loading && <p role="status">관심글을 불러오고 있습니다.</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && (error || page?.hasNext) && <button onClick={() => void load(page?.nextId ?? undefined)}>
      {error ? '다시 시도' : '더 보기'}
    </button>}
  </section>;
}
