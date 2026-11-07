import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { mutate } from './account';

type Room = { id: number; postId: number | null; title: string; lastMessage: string };
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
    <form className="inquiry-composer" onSubmit={submit}>
      <div className="inquiry-composer-row">
        <textarea aria-label="메시지" placeholder="메시지를 입력하세요"
          value={content} onChange={(event) => setContent(event.target.value)}
          maxLength={2000} rows={2} disabled={busy} />
        <button disabled={busy || !content.trim()}>{busy ? '전송 중…' : label}</button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function NewInquiry({ post }: { post: { id: number; title: string } }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const postId = post.id;

  useEffect(() => {
    const request = new AbortController();
    void read<{ roomId: number | null }>('/by-post/' + postId, request.signal)
      .then(({ roomId }) => {
        if (request.signal.aborted) return;
        if (roomId !== null) {
          window.location.replace('#/inquiries/' + roomId);
        } else {
          setReady(true);
        }
      })
      .catch(() => {
        if (!request.signal.aborted) setError('기존 대화를 확인하지 못했습니다.');
      });
    return () => request.abort();
  }, [postId, attempt]);

  return (
    <section className="detail inquiry-panel">
      <a href={'#/posts/' + postId}>← 게시글</a>
      <h1>{post.title}</h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button type="button" onClick={() => {
            setError('');
            setAttempt((value) => value + 1);
          }}>다시 시도</button>
        </>
      ) : ready ? (
        <>
          <p className="inquiry-empty">판매자에게 첫 메시지를 보내보세요.</p>
          <InquiryForm label="보내기" send={async (content) => {
            const result = await mutate<{ roomId: number }>('/inquiries', 'POST', { postId, content });
            window.location.replace('#/inquiries/' + result.roomId);
          }} />
        </>
      ) : <p role="status">대화를 확인하는 중…</p>}
    </section>
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
    <section className="detail inquiry-panel">
      {roomId && <a href="#/inquiries">← 내 대화</a>}
      <div className="inquiry-heading">
        <h1>{roomId ? '거래 문의 내역' : '내 대화'}</h1>
        <button type="button" className="inquiry-refresh" onClick={reload} disabled={loading}>새로고침</button>
      </div>
      {loading && <p role="status">불러오는 중…</p>}
      {error && <p role="alert">{error}</p>}
      {roomId ? (
        <>
          <ul className="inquiry-messages">{messages.map((message) => (
            <li key={message.id} className={message.senderId === userId ? 'inquiry-own' : undefined}>
              <span className="inquiry-sender">{message.senderId === userId ? '나' : '상대방'}</span>
              <span className="inquiry-bubble">{message.content}</span>
            </li>
          ))}</ul>
          {!error && !loading && <InquiryForm label="보내기" send={async (content) => {
            await mutate('/inquiries/' + roomId + '/messages', 'POST', { content });
            reload();
          }} />}
        </>
      ) : (
        <>
          {!loading && !error && rooms.length === 0 && <p className="inquiry-empty">아직 대화가 없습니다.</p>}
          <ul className="inquiry-rooms">{rooms.map((room) => (
            <li key={room.id}>
              <a href={'#/inquiries/' + room.id}>
                <span><strong>{room.title}</strong><span className="inquiry-preview">{room.lastMessage}</span></span>
                <span aria-hidden="true">›</span>
              </a>
            </li>
          ))}</ul>
          {next !== null && <button type="button" onClick={() => void loadMore()} disabled={loading}>더보기</button>}
        </>
      )}
    </section>
  );
}
