import { ApiError } from '../../posts';
import type { PostSummary } from '../../posts';

export interface PostPage {
  items: PostSummary[];
  hasNext: boolean;
  nextCreatedAt: string | null;
  nextId: number | null;
}

export interface NeighborhoodFilterOption {
  id: number;
  name: string;
}

export async function fetchNeighborhoods(signal: AbortSignal): Promise<NeighborhoodFilterOption[]> {
  const response = await fetch('/api/neighborhoods', { signal });
  if (!response.ok) throw new ApiError(response.status);
  return response.json();
}

export async function fetchPostPage(
  cursor: PostPage | null, signal: AbortSignal, keyword = '', mine = false, neighborhoodId = '',
): Promise<PostPage> {
  const query = new URLSearchParams();
  if (!mine) query.set('paged', 'true');

  if (keyword) query.set('keyword', keyword);
  if (!mine && neighborhoodId) query.set('neighborhoodId', neighborhoodId);

  if (cursor?.nextCreatedAt && cursor.nextId !== null) {
    query.set('beforeTime', cursor.nextCreatedAt);
    query.set('beforeId', String(cursor.nextId));
  }

  const path = mine ? '/api/posts/mine' : '/api/posts';
  const url = query.size > 0 ? `${path}?${query}` : path;
  const response = await fetch(url, mine ? { signal, cache: 'no-store' } : { signal });

  if (!response.ok) throw new ApiError(response.status);

  return response.json();
}
