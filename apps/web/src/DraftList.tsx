import { useEffect, useState } from 'react';
import { mutate } from './account';
import { getDrafts } from './posts';
import type { PostDraft } from './posts';

export default function DraftList({ onResume, onClose }: {
  onResume: (draft: PostDraft) => void;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<PostDraft[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getDrafts().then((items) => { if (active) setDrafts(items); })
      .catch(() => { if (active) setError('임시저장 글을 불러오지 못했습니다.'); });
    return () => { active = false; };
  }, []);

  async function remove(id: number) {
    setBusyId(id);
    setError('');
    try {
      await mutate(`/drafts/${id}`, 'DELETE');
      setDrafts((current) => current.filter((draft) => draft.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '임시저장 글을 삭제하지 못했습니다.');
    } finally { setBusyId(null); }
  }

  return <section className="draft-list">
    <div className="form-heading"><h2>임시저장 글</h2><button type="button" className="secondary" onClick={onClose}>× 닫기</button></div>
    <p className="hint">최대 5개까지 저장할 수 있습니다. 마지막 저장부터 3일 뒤 글과 사진이 삭제됩니다.</p>
    {error && <p role="alert" className="error-message">{error}</p>}
    {drafts.length === 0 && !error && <p>임시저장한 글이 없습니다.</p>}
    <ul className="draft-items">{drafts.map((draft) => <li key={draft.id}>
      <strong>{draft.title || '제목 없음'}</strong>
      <span className="hint">{new Date(draft.expiresAt).toLocaleString('ko-KR')}까지</span>
      <div className="actions">
        <button type="button" onClick={() => onResume(draft)}>이어쓰기</button>
        <button type="button" className="secondary" disabled={busyId === draft.id}
          onClick={() => void remove(draft.id)}>삭제</button>
      </div>
    </li>)}</ul>
  </section>;
}
