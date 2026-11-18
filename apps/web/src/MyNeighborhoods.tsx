import { useEffect, useState } from 'react';
import { mutate } from './account';
import { fetchVerifiedNeighborhoods, verifyCurrentNeighborhood } from './verifiedNeighborhoods';
import type { VerifiedNeighborhood } from './verifiedNeighborhoods';

export default function MyNeighborhoods() {
  const [options, setOptions] = useState<VerifiedNeighborhood[] | null>(null);
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState<number | 'verify' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchVerifiedNeighborhoods(controller.signal)
      .then((result) => { if (!controller.signal.aborted) setOptions(result); })
      .catch(() => {
        if (!controller.signal.aborted) setError('인증된 동네를 불러오지 못했습니다.');
      });
    return () => controller.abort();
  }, [retry]);

  async function verify() {
    setPending('verify');
    setError('');
    setNotice('');
    try {
      const verified = await verifyCurrentNeighborhood();
      setOptions((current) => [...(current ?? []).filter((item) => item.id !== verified.id), verified]);
      setNotice(`${verified.name} 인증을 완료했습니다.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '동네를 인증하지 못했습니다.');
    } finally {
      setPending(null);
    }
  }

  async function revoke(option: VerifiedNeighborhood) {
    if (!window.confirm(`${option.name} 인증을 해제할까요? 이 동네로 새 글을 올리거나 수정할 때는 다시 인증해야 합니다.`)) return;
    setPending(option.id);
    setError('');
    setNotice('');
    try {
      await mutate<void>(`/neighborhoods/verified/${option.id}`, 'DELETE');
      setOptions((current) => current?.filter((item) => item.id !== option.id) ?? []);
      setNotice(`${option.name} 인증을 해제했습니다.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '동네 인증을 해제하지 못했습니다.');
    } finally {
      setPending(null);
    }
  }

  return <section className="notice">
    <h1>내 동네</h1>
    <p>동네는 최대 두 곳까지 인증할 수 있습니다. 인증을 해제해도 이미 올린 글과 대화는 유지됩니다.</p>
    {options === null && !error && <p role="status">인증된 동네를 불러오고 있습니다.</p>}
    {options?.length === 0 && <p>인증된 동네가 없습니다.</p>}
    {options && options.length > 0 && <ul>
      {options.map((option) => <li key={option.id}>
        <div className="actions">
          <strong>{option.name}</strong>
          <span className="hint"><time dateTime={option.expiresAt}>{new Date(option.expiresAt).toLocaleString('ko-KR')}</time>까지</span>
          <button type="button" className="secondary" aria-label={`${option.name} 인증 해제`}
            disabled={pending !== null} onClick={() => void revoke(option)}>
            {pending === option.id ? '해제 중…' : '인증 해제'}
          </button>
        </div>
      </li>)}
    </ul>}
    {options !== null && <button type="button" disabled={pending !== null} onClick={() => void verify()}>
      {pending === 'verify' ? '위치 확인 중…' : '현재 위치로 동네 인증'}
    </button>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {error && options === null && <button type="button" onClick={() => { setError(''); setRetry((value) => value + 1); }}>다시 시도</button>}
  </section>;
}
