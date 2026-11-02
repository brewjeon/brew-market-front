import { ApiError } from '../../posts';
import type { PostSummary } from '../../posts';

export interface PostPage {
  items: PostSummary[];
  hasNext: boolean;
  nextCreatedAt: string | null;
  nextId: number | null;
}

export async function fetchPostPage(cursor: PostPage | null, signal: AbortSignal): Promise<PostPage> {
  const query = new URLSearchParams({ paged: 'true' });
  if (cursor?.nextCreatedAt && cursor.nextId !== null) {
    query.set('beforeTime', cursor.nextCreatedAt);
    query.set('beforeId', String(cursor.nextId));
  }
  const response = await fetch(`/api/posts?${query}`, { signal });
  if (!response.ok) throw new ApiError(response.status);
  return response.json();
}
