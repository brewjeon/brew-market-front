import { useEffect, useRef, useState } from 'react';
import { mutate } from './account';
import { readInquiry } from './inquiryApi';

type ReservationState = 'AVAILABLE' | 'RESERVED_HERE' | 'RESERVED_ELSEWHERE'
  | 'LEGACY_RESERVED' | 'COMPLETED_HERE' | 'COMPLETED' | 'UNAVAILABLE';
type Reservation = { state: ReservationState; version: number | null };
type Action = 'CONFIRM' | 'CANCEL' | 'COMPLETE';

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

  async function change(action: Action) {
    const version = reservation?.version;
    if (version == null || loadError || submitting.current || !window.confirm(actions[action].confirmation)) return;
    submitting.current = true;
    setBusy(true);
    setActionError('');
    try {
      await mutate('/inquiries' + path, 'PATCH', { action, version });
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '예약을 변경하지 못했습니다.');
    } finally {
      setReservation(null);
      setRetry((value) => value + 1);
      setBusy(false);
      submitting.current = false;
    }
  }

  const availableActions: Action[] = [];
  if (reservation && reservation.version !== null && !loadError) {
    if (reservation.state === 'AVAILABLE') availableActions.push('CONFIRM');
    if (reservation.state === 'RESERVED_HERE') availableActions.push('CANCEL', 'COMPLETE');
  }

  return (
    <section className="manage-post" aria-label="거래 예약">
      {loadError ? <p role="alert">예약 상태를 불러오지 못했습니다.{' '}
        <button type="button" onClick={() => setRetry((value) => value + 1)}>다시 시도</button>
      </p> : <p role="status">{reservation ? labels[reservation.state] : '예약 상태를 확인하는 중…'}</p>}
      {availableActions.length > 0 && <div className="actions">
        {availableActions.map((action) => <button key={action} type="button"
          disabled={busy} onClick={() => void change(action)}>{actions[action].label}</button>)}
      </div>}
      {actionError && <p role="alert">{actionError}</p>}
    </section>
  );
}
