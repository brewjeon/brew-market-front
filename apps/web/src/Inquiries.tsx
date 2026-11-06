import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { mutate } from './account';

type Room = { id: number; postId: number; title: string; lastMessage: string };
type RoomPage = { rooms: Room[]; nextBefore: number | null };
type Message = { id: number; senderId: number; content: string };

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/inquiries' + path, { signal });
  if (!response.ok) throw new Error('대화를 불러오지 못했습니다.');
  return response.json();
}

export function InquiryForm({ send, label }: { send: (content: string) => Promise<void>; label: string }) {
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await send(content);
      setContent('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '메시지를 보내지 못했습니다.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        메시지
        <textarea value={content} onChange={(event) => setContent(event.target.value)}
          maxLength={2000} rows={3} disabled={busy} />
      </label>
      <button disabled={busy || !content.trim()}>{label}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export default function Inquiries({ roomId, userId }: { roomId?: string; userId: number }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    const result = roomId
      ? read<Message[]>('/' + roomId + '/messages', request.signal).then(setMessages)
      : read<RoomPage>('', request.signal).then((page) => {
          setRooms(page.rooms);
          setNext(page.nextBefore);
        });
    void result.catch((cause: Error) => {
      if (!request.signal.aborted) setError(cause.message);
    }).finally(() => {
      if (!request.signal.aborted) setLoading(false);
    });
    return () => request.abort();
  }, [roomId, refresh]);

  function reload() {
    setError('');
    setLoading(true);
    setRefresh((value) => value + 1);
  }

  async function loadMore() {
    if (next === null || loading) return;
    setLoading(true);
    setError('');
    try {
      const page = await read<RoomPage>('?before=' + next);
      setRooms((current) => [...current, ...page.rooms.filter((room) => !current.some(({ id }) => id === room.id))]);
      setNext(page.nextBefore);
    } catch {
      setError('다음 대화를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="detail">
      {roomId && <a href="#/inquiries">← 내 대화</a>}
      <h1>{roomId ? '거래 문의 내역' : '내 대화'}</h1>
      {loading && <p role="status">불러오는 중…</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" className="secondary" onClick={reload} disabled={loading}>새로고침</button>
      {roomId ? (
        <>
          <ul>{messages.map((message) => (
            <li key={message.id} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              <strong>{message.senderId === userId ? '나' : '상대방'} </strong>
              {message.content}
            </li>
          ))}</ul>
          {!error && !loading && <InquiryForm label="보내기" send={async (content) => {
            await mutate('/inquiries/' + roomId + '/messages', 'POST', { content });
            reload();
          }} />}
        </>
      ) : (
        <>
          {!loading && !error && rooms.length === 0 && <p>아직 대화가 없습니다.</p>}
          <ul>{rooms.map((room) => (
            <li key={room.id}>
              <a href={'#/inquiries/' + room.id}>{room.title} · {room.lastMessage}</a>
            </li>
          ))}</ul>
          {next !== null && <button type="button" onClick={() => void loadMore()} disabled={loading}>더보기</button>}
        </>
      )}
    </section>
  );
}
