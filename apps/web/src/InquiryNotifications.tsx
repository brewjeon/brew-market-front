import { useEffect, useId, useRef, useState } from 'react';
import { readInquiry } from './inquiryApi';
import type { RoomPage } from './inquiryApi';

export default function InquiryNotifications({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<RoomPage | null>(null);
  const [error, setError] = useState(false);
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    const request = new AbortController();
    const updates = new EventSource('/api/inquiries/events');
    let fetching = false;
    let pending = false;

    async function sync() {
      if (request.signal.aborted) return;
      if (fetching) {
        pending = true;
        return;
      }

      fetching = true;
      do {
        pending = false;
        try {
          const result = await readInquiry<RoomPage>('?unreadOnly=true', request.signal);
          if (!request.signal.aborted) {
            setPage(result);
            setError(false);
          }
        } catch {
          if (!request.signal.aborted) setError(true);
        }
      } while (pending && !request.signal.aborted);
      fetching = false;
    }

    refresh.current = () => void sync();
    updates.onopen = refresh.current;
    updates.onmessage = refresh.current;
    refresh.current();
    return () => {
      request.abort();
      updates.close();
    };
  }, []);

  function navigate() {
    setOpen(false);
    onNavigate();
  }

  const count = page?.unreadRoomCount ?? 0;
  return (
    <div className="inquiry-notifications" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (open && event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    }}>
      <button ref={button} type="button" className="secondary inquiry-notifications-trigger"
        aria-label={count > 0 ? `대화 알림, 안 읽은 대화 ${count}개` : '대화 알림'}
        aria-expanded={open} aria-controls={panelId} onClick={() => {
          if (!open) refresh.current();
          setOpen(!open);
        }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {count > 0 && <span className="inquiry-unread" aria-hidden="true">{count}</span>}
      </button>

      <section id={panelId} hidden={!open} className="inquiry-notifications-panel" aria-label="대화 알림 목록">
        <strong>대화 알림</strong>
        {error && <p role="status">알림을 불러오지 못했습니다. <button type="button" onClick={() => refresh.current()}>다시 시도</button></p>}
        {!page && !error && <p role="status">알림을 불러오는 중…</p>}
        {page?.rooms.length === 0 && !error && <p>안 읽은 대화가 없습니다.</p>}
        {page && page.rooms.length > 0 && (
          <ul className="inquiry-rooms">
            {page.rooms.map((room) => (
              <li key={room.id}>
                <a href={`#/inquiries/${room.id}`} onClick={navigate}>
                  <span><strong>{room.title}</strong><span className="inquiry-preview">{room.lastMessage}</span></span>
                  <span className="inquiry-unread" aria-label={`안 읽은 메시지 ${room.unreadCount}건`}>{room.unreadCount}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <a href="#/inquiries" onClick={navigate}>내 대화 전체 보기</a>
      </section>
    </div>
  );
}
