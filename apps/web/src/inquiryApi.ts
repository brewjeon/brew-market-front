export type Room = {
  id: number;
  postId: number | null;
  title: string;
  lastMessage: string;
  lastMessageId: number;
  unreadCount: number;
};

export type RoomPage = { rooms: Room[]; nextBefore: number | null; unreadRoomCount: number };

export async function readInquiry<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/inquiries' + path, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('대화를 불러오지 못했습니다.');
  return response.json();
}
