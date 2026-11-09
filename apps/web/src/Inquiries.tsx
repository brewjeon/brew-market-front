import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { mutate } from './account';

type Room = {
  id: number;
  postId: number | null;
  title: string;
  lastMessage: string;
  lastMessageId: number;
  unreadCount: number;
};
type RoomPage = { rooms: Room[]; nextBefore: number | null; unreadRoomCount: number };
type Message = { id: number; senderId: number; content: string };

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/inquiries' + path, { signal, cache: 'no-store' });
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
  const [unreadRoomCount, setUnreadRoomCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [listUpdatePending, setListUpdatePending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [peerLastReadId, setPeerLastReadId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const messageList = useRef<HTMLUListElement>(null);
  const readThrough = useRef(0);
  const pendingReads = useRef(new Set<number>());
  const moreRequest = useRef<AbortController | null>(null);
  const jumpToLatest = useRef(false);
  const lastSentId = messages.reduce<number | undefined>(
    (latest, message) => message.senderId === userId ? message.id : latest, undefined,
  );
  useEffect(() => {
    if (!roomId) return;

    const request = new AbortController();
    let fetching = false;
    let changed = false;

    async function syncRoom() {
      if (fetching) {
        changed = true;
        return;
      }
      fetching = true;
      try {
        const [history, state] = await Promise.all([
          read<Message[]>('/' + roomId + '/messages', request.signal),
          read<{ peerLastReadId: number }>('/' + roomId + '/read', request.signal),
        ]);
        if (request.signal.aborted) return;
        setMessages(history);
        setPeerLastReadId((current) => Math.max(current ?? 0, state.peerLastReadId));
        setError('');
      } catch (cause) {
        if (!request.signal.aborted) {
          setError(cause instanceof Error ? cause.message : '대화를 불러오지 못했습니다.');
        }
      } finally {
        fetching = false;
        if (!request.signal.aborted) {
          setLoading(false);
          if (changed) {
            changed = false;
            void syncRoom();
          }
        }
      }
    }

    const updates = new EventSource('/api/inquiries/' + roomId + '/events');
    // 재연결 때도 서버에서 현재 상태를 다시 읽어 연결이 끊긴 동안의 변경을 반영한다.
    updates.onopen = () => void syncRoom();
    updates.onmessage = () => void syncRoom();
    void syncRoom();

    return () => {
      request.abort();
      updates.close();
    };
  }, [roomId, refresh]);

  useEffect(() => {
    const list = messageList.current;
    if (!roomId || !list || loading || error) return;

    const observer = new IntersectionObserver((entries) => {
      if (document.visibilityState !== 'visible') return;

      const visibleIds = entries.filter((entry) => entry.isIntersecting)
        .map((entry) => Number(entry.target.getAttribute('data-message-id')));
      const messageId = Math.max(readThrough.current, ...visibleIds);
      if (messageId === readThrough.current || pendingReads.current.has(messageId)) return;

      pendingReads.current.add(messageId);
      void mutate('/inquiries/' + roomId + '/read', 'PUT', { messageId })
        .then(() => { readThrough.current = Math.max(readThrough.current, messageId); })
        .catch(() => { /* 다음 조회에서 다시 읽음 요청을 보낼 수 있다. */ })
        .finally(() => { pendingReads.current.delete(messageId); });
    });

    function observeVisibleTab() {
      observer.disconnect();
      if (document.visibilityState === 'visible') {
        list?.querySelectorAll('[data-message-id]').forEach((item) => observer.observe(item));
      }
    }

    observeVisibleTab();
    document.addEventListener('visibilitychange', observeVisibleTab);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', observeVisibleTab);
    };
  }, [roomId, messages, loading, error]);

  useEffect(() => {
    if (roomId) return;

    const request = new AbortController();
    const query = unreadOnly ? '?unreadOnly=true' : '';
    let firstPage: RoomPage | undefined;
    let fetching = false;
    let changed = false;

    async function syncList() {
      if (fetching) {
        changed = true;
        return;
      }
      fetching = true;
      try {
        const page = await read<RoomPage>(query, request.signal);
        if (request.signal.aborted) return;

        setUnreadRoomCount(page.unreadRoomCount);
        const previousRooms = firstPage?.rooms;
        const samePage = previousRooms?.length === page.rooms.length && page.rooms.every((room, index) => {
          const previous = previousRooms[index];
          return room.id === previous.id && room.lastMessageId === previous.lastMessageId
            && room.unreadCount === previous.unreadCount && room.title === previous.title
            && room.postId === previous.postId;
        });
        if (firstPage && window.scrollY > 0) {
          setListUpdatePending(!samePage);
        } else if (!samePage) {
          moreRequest.current?.abort();
          moreRequest.current = null;
          firstPage = page;
          setRooms(page.rooms);
          setNext(page.nextBefore);
          setListUpdatePending(false);
          if (jumpToLatest.current) {
            jumpToLatest.current = false;
            window.scrollTo(0, 0);
          }
        }
        setError('');
      } catch (cause) {
        if (!request.signal.aborted && !firstPage) {
          setError(cause instanceof Error ? cause.message : '대화를 불러오지 못했습니다.');
        }
      } finally {
        fetching = false;
        if (!request.signal.aborted) {
          if (!moreRequest.current) setLoading(false);
          if (changed) {
            changed = false;
            void syncList();
          }
        }
      }
    }

    const updates = new EventSource('/api/inquiries/events');
    updates.onopen = () => void syncList();
    updates.onmessage = () => void syncList();
    void syncList();
    return () => {
      request.abort();
      moreRequest.current?.abort();
      moreRequest.current = null;
      updates.close();
    };
  }, [roomId, refresh, unreadOnly]);

  function reload() {
    setError('');
    setLoading(true);
    setRefresh((value) => value + 1);
  }

  async function loadMore() {
    if (next === null || loading || moreRequest.current || listUpdatePending) return;
    const request = new AbortController();
    moreRequest.current = request;
    setLoading(true);
    setError('');
    try {
      const query = '?before=' + next + (unreadOnly ? '&unreadOnly=true' : '');
      const page = await read<RoomPage>(query, request.signal);
      if (request.signal.aborted) return;
      setRooms((current) => [...current, ...page.rooms.filter((room) => !current.some(({ id }) => id === room.id))]);
      setNext(page.nextBefore);
    } catch {
      if (!request.signal.aborted) setError('다음 대화를 불러오지 못했습니다.');
    } finally {
      if (moreRequest.current === request) {
        moreRequest.current = null;
        setLoading(false);
      }
    }
  }

  function toggleUnread() {
    jumpToLatest.current = false;
    setLoading(true);
    setError('');
    setRooms([]);
    setNext(null);
    setListUpdatePending(false);
    setUnreadOnly((current) => !current);
  }

  return (
    <section className="detail inquiry-panel">
      {roomId && <a href="#/inquiries">← 내 대화</a>}
      <div className="inquiry-heading">
        <h1>{roomId ? '거래 문의 내역' : '내 대화'}</h1>
        <div className="inquiry-heading-actions">
          {!roomId && (
            <button type="button" aria-pressed={unreadOnly} onClick={toggleUnread}>
              안 읽은 대화 <span className="inquiry-unread">{unreadRoomCount}</span>
            </button>
          )}
          <button type="button" className="inquiry-refresh" onClick={reload} disabled={loading}>새로고침</button>
        </div>
      </div>
      {loading && <p role="status">불러오는 중…</p>}
      {error && <p role="alert">{error}</p>}
      {roomId ? (
        <>
          <ul ref={messageList} className="inquiry-messages">{messages.map((message) => (
            <li key={message.id} data-message-id={message.senderId !== userId ? message.id : undefined}
              className={message.senderId === userId ? 'inquiry-own' : undefined}>
              {message.senderId !== userId && <span className="inquiry-sender">상대방</span>}
              <span className="inquiry-bubble">{message.content}</span>
              {message.id === lastSentId && peerLastReadId !== null && (
                <span className="inquiry-receipt">{peerLastReadId >= message.id ? '읽음' : '안 읽음'}</span>
              )}
            </li>
          ))}</ul>
          {!error && !loading && <InquiryForm label="보내기" send={async (content) => {
            await mutate('/inquiries/' + roomId + '/messages', 'POST', { content });
          }} />}
        </>
      ) : (
        <>
          {listUpdatePending && (
            <button type="button" className="inquiry-list-update" disabled={loading} onClick={() => {
              jumpToLatest.current = true;
              reload();
            }}>새 메시지 보기</button>
          )}
          {!loading && !error && rooms.length === 0 && (
            <p className="inquiry-empty">{unreadOnly ? '안 읽은 대화가 없습니다.' : '아직 대화가 없습니다.'}</p>
          )}
          <ul className="inquiry-rooms">{rooms.map((room) => (
            <li key={room.id}>
              <a href={'#/inquiries/' + room.id}>
                <span><strong>{room.title}</strong><span className="inquiry-preview">{room.lastMessage}</span></span>
                <span className="inquiry-room-actions">
                  {room.unreadCount > 0 && (
                    <span className="inquiry-unread" aria-label={`안 읽은 메시지 ${room.unreadCount}건`}>
                      {room.unreadCount}
                    </span>
                  )}
                  <span aria-hidden="true">›</span>
                </span>
              </a>
            </li>
          ))}</ul>
          {next !== null && (
            <button type="button" onClick={() => void loadMore()} disabled={loading || listUpdatePending}>더보기</button>
          )}
        </>
      )}
    </section>
  );
}
