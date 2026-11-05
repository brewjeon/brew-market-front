export type PostStatus = 'FOR_SALE' | 'RESERVED' | 'COMPLETED';

export interface PostSummary {
  imageUrl: string | null;
  id: number;
  title: string;
  price: number;
  status: PostStatus;
}

export interface PostDetail extends PostSummary {
  canManage: boolean;
  description: string;
  createdAt: string;
  imageUrls: string[];
}

export interface PostDraft {
  id: number;
  title: string | null;
  description: string | null;
  price: number | null;
  updatedAt: string;
  expiresAt: string;
  imageUrls: string[];
}

export async function getDrafts(): Promise<PostDraft[]> {
  const response = await fetch('/api/drafts');
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<PostDraft[]>;
}

export class ApiError extends Error {
  constructor(public status: number) {
    super(`Request failed: ${status}`);
  }
}

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { signal });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}

export const getPost = (id: string, signal: AbortSignal) =>
  get<PostDetail>(`/posts/${encodeURIComponent(id)}`, signal);

export const statusLabel: Record<PostStatus, string> = {
  FOR_SALE: '판매 중',
  RESERVED: '예약 중',
  COMPLETED: '거래 완료',
};

export const formatPrice = (price: number) =>
  price === 0 ? '나눔' : `${price.toLocaleString('ko-KR')}원`;
