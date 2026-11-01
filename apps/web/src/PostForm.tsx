import { useState } from 'react';
import type { FormEvent } from 'react';
import { mutate } from './account';
import type { PostDetail } from './posts';

export default function PostForm({ post, onSaved, onCancel }: {
  post?: PostDetail;
  onSaved: (id: number) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(post?.title ?? '');
  const [description, setDescription] = useState(post?.description ?? '');
  const [price, setPrice] = useState(String(post?.price ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const amount = Number(price);
    if (!title.trim() || !description.trim() || price.trim() === '' || !Number.isSafeInteger(amount) || amount < 0) {
      setError('제목·본문과 0 이상의 정수 가격을 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = { title: title.trim(), description: description.trim(), price: amount };
      if (post) {
        await mutate(`/posts/${post.id}`, 'PATCH', body);
        onSaved(post.id);
      } else {
        const response = await mutate<{ id: number }>('/posts', 'POST', body);
        onSaved(response.id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.');
    } finally { setBusy(false); }
  }

  return <form className="post-form" onSubmit={submit}>
    <h2>{post ? '게시글 수정' : '새 게시글 등록'}</h2>
    <fieldset disabled={busy}>
      <label>제목<input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>본문<textarea required rows={8} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>가격 (원)<input required type="number" min="0" step="1" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      <p className="hint">나눔은 0원을 입력하세요.</p>
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="actions"><button type="submit">{busy ? '저장 중…' : '저장'}</button><button type="button" className="secondary" onClick={onCancel}>취소</button></div>
    </fieldset>
  </form>;
}
