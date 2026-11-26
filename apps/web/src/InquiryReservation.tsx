import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { mutate } from './account';
import { readInquiry } from './inquiryApi';

type ReservationState = 'AVAILABLE' | 'RESERVED_HERE' | 'RESERVED_ELSEWHERE'
  | 'LEGACY_RESERVED' | 'COMPLETED_HERE' | 'COMPLETED' | 'UNAVAILABLE';
type Reservation = {
  state: ReservationState;
  version: number | null;
  meetingAt: string | null;
  meetingPlace: string | null;
};
type Action = 'CONFIRM' | 'CANCEL' | 'COMPLETE';
type ReservationChange =
  | { action: 'CONFIRM'; meetingAt: string; meetingPlace: string }
  | { action: 'CANCEL' | 'COMPLETE' };

const meetingTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});

const labels: Record<ReservationState, string> = {
  AVAILABLE: '판매 중',
  RESERVED_HERE: '이 대화에서 예약이 확정되었습니다.',
  RESERVED_ELSEWHERE: '다른 대화에서 예약이 확정되었습니다.',
  LEGACY_RESERVED: '게시글이 기존 방식으로 예약 중입니다.',
  COMPLETED_HERE: '이 대화의 거래가 완료되었습니다.',
  COMPLETED: '게시글의 거래가 완료되었습니다.',
  UNAVAILABLE: '게시글이 삭제되어 예약할 수 없습니다.',
};

const actions: Record<Action, { label: string; confirmation: string }> = {
  CONFIRM: { label: '이 상대와 예약 확정', confirmation: '이 대화 상대와 예약을 확정할까요?' },
  CANCEL: { label: '예약 취소', confirmation: '예약을 취소하고 다시 판매 중으로 바꿀까요?' },
  COMPLETE: { label: '거래 완료', confirmation: '거래를 완료하면 게시글 내용과 상태를 수정할 수 없습니다. 완료할까요?' },
};

export default function InquiryReservation({ roomId, update }: { roomId: string; update: number }) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState('');
  const [meetingAt, setMeetingAt] = useState('');
  const [meetingPlace, setMeetingPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const submitting = useRef(false);
  const path = '/' + roomId + '/reservation';

  useEffect(() => {
    const request = new AbortController();
    void readInquiry<Reservation>(path, request.signal)
      .then((result) => {
        if (request.signal.aborted) return;
        setReservation(result);
        setLoadError(false);
      })
      .catch(() => {
        if (!request.signal.aborted) setLoadError(true);
      });
    return () => request.abort();
  }, [path, update, retry]);

  async function change(request: ReservationChange) {
    const version = reservation?.version;
    if (version == null || loadError || submitting.current
      || !window.confirm(actions[request.action].confirmation)) return;
    submitting.current = true;
    setBusy(true);
    setActionError('');
    try {
      await mutate('/inquiries' + path, 'PATCH', { ...request, version });
      if (request.action === 'CONFIRM') {
        setMeetingAt('');
        setMeetingPlace('');
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '예약을 변경하지 못했습니다.');
    } finally {
      setReservation(null);
      setRetry((value) => value + 1);
      setBusy(false);
      submitting.current = false;
    }
  }

  function confirmReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const time = new Date(meetingAt);
    const place = meetingPlace.trim();
    if (!Number.isFinite(time.getTime()) || time.getTime() <= Date.now()) {
      setActionError('현재보다 늦은 약속 날짜와 시간을 입력해 주세요.');
      return;
    }
    if (!place) {
      setActionError('만날 장소를 입력해 주세요.');
      return;
    }
    void change({ action: 'CONFIRM', meetingAt: time.toISOString(), meetingPlace: place });
  }

  const canManage = reservation?.version != null && !loadError;
  const reservedHere = reservation?.state === 'RESERVED_HERE' && !loadError;

  return (
    <section className="inquiry-reservation" aria-label="거래 예약">
      {loadError ? (
        <div className="inquiry-reservation-retry">
          <p role="alert">예약 상태를 불러오지 못했습니다.</p>
          <button type="button" className="inquiry-reservation-secondary"
            onClick={() => setRetry((value) => value + 1)}>다시 시도</button>
        </div>
      ) : (
        <p className={reservedHere ? 'inquiry-reservation-status confirmed' : 'inquiry-reservation-status'}
          role="status">{reservation ? labels[reservation.state] : '예약 상태를 확인하는 중…'}</p>
      )}
      {canManage && reservation?.state === 'AVAILABLE' && (
        <form onSubmit={confirmReservation}>
          <div className="inquiry-reservation-fields">
            <label>
              만날 날짜와 시간
              <input type="datetime-local" value={meetingAt} required disabled={busy}
                onChange={(event) => setMeetingAt(event.target.value)} />
            </label>
            <label>
              만날 장소
              <input type="text" value={meetingPlace} placeholder="예: 역 2번 출구" required maxLength={200} disabled={busy}
                onChange={(event) => setMeetingPlace(event.target.value)} />
            </label>
          </div>
          <div className="inquiry-reservation-actions">
            <button type="submit" disabled={busy}>{actions.CONFIRM.label}</button>
          </div>
        </form>
      )}
      {reservedHere && reservation.meetingAt && reservation.meetingPlace && (
        <dl className="inquiry-meeting">
          <div>
            <dt>만날 날짜와 시간</dt>
            <dd><time dateTime={reservation.meetingAt}>{meetingTimeFormat.format(new Date(reservation.meetingAt))}</time></dd>
          </div>
          <div>
            <dt>만날 장소</dt>
            <dd>{reservation.meetingPlace}</dd>
          </div>
        </dl>
      )}
      {canManage && reservedHere && <div className="inquiry-reservation-actions">
        {(['CANCEL', 'COMPLETE'] as const).map((action) => <button key={action} type="button"
          className={action === 'CANCEL' ? 'inquiry-reservation-secondary' : undefined}
          disabled={busy} onClick={() => void change({ action })}>{actions[action].label}</button>)}
      </div>}
      {actionError && <p className="inquiry-reservation-error" role="alert">{actionError}</p>}
    </section>
  );
}
