import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { mutate } from './account';
import type { PostDetail, PostDraft } from './posts';

type Photo = { id: string; url?: string; sourceIndex?: number; file?: File };

function savedPhotos(urls: string[]): Photo[] {
  return urls.map((url, sourceIndex) => ({ id: url, url, sourceIndex }));
}

function PhotoPreview({ photo }: { photo: Photo }) {
  const [source, setSource] = useState(photo.url ? `/api${photo.url}` : '');
  useEffect(() => {
    if (!photo.file) {
      setSource(photo.url ? `/api${photo.url}` : '');
      return;
    }
    const url = URL.createObjectURL(photo.file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.file, photo.url]);
  return <img src={source} alt="등록할 사진 미리보기" />;
}

export default function PostForm({ post, draft, onSaved, onCancel }: {
  post?: PostDetail;
  draft?: PostDraft;
  onSaved: (id: number) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(post?.title ?? draft?.title ?? '');
  const [description, setDescription] = useState(post?.description ?? draft?.description ?? '');
  const [price, setPrice] = useState(String(post?.price ?? draft?.price ?? ''));
  const [photos, setPhotos] = useState<Photo[]>(savedPhotos(
    post?.imageUrls ?? (post?.imageUrl ? [post.imageUrl] : draft?.imageUrls ?? []),
  ));
  const [draftId, setDraftId] = useState<number | null>(draft?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  function selectPhotos(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0) return;
    if (photos.length + picked.length > 5) {
      setError('사진은 최대 5장까지 올릴 수 있습니다.');
      return;
    }
    if (picked.some((file) => !['image/jpeg', 'image/png'].includes(file.type)
      || file.size > 5 * 1024 * 1024)) {
      setError('JPEG·PNG 사진을 장당 5MB 이하로 선택해 주세요.');
      return;
    }
    setError('');
    setPhotos((current) => [...current, ...picked.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }

  function move(from: number, to: number) {
    setPhotos((current) => {
      const next = [...current];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
  }

  function formData(part: 'post' | 'draft', payload: object) {
    const form = new FormData();
    form.append(part, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    const files = photos.filter((photo) => photo.file);
    files.forEach((photo) => form.append('images', photo.file!));
    const order = photos.map((photo) => photo.file
      ? `n:${files.indexOf(photo)}`
      : `e:${photo.sourceIndex}`);
    form.append('order', new Blob([JSON.stringify(order)], { type: 'application/json' }));
    return form;
  }

  function amount(required: boolean): number | null {
    if (price.trim() === '') {
      if (required) throw new Error('가격을 입력해 주세요.');
      return null;
    }
    const value = Number(price);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('가격은 0 이상의 정수로 입력해 주세요.');
    return value;
  }

  async function saveDraft(): Promise<PostDraft> {
    const form = formData('draft', {
      title: title.trim() || null,
      description: description.trim() || null,
      price: amount(false),
    });
    const saved = await mutate<PostDraft>(draftId ? `/drafts/${draftId}` : '/drafts',
      draftId ? 'PATCH' : 'POST', form);
    setDraftId(saved.id);
    setPhotos(savedPhotos(saved.imageUrls));
    setNotice(`임시저장했습니다. ${new Date(saved.expiresAt).toLocaleString('ko-KR')}까지 보관됩니다.`);
    return saved;
  }

  async function draftClick() {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await saveDraft(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '임시저장하지 못했습니다.'); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!title.trim() || !description.trim()) throw new Error('제목과 본문을 입력해 주세요.');
      const payload = { title: title.trim(), description: description.trim(), price: amount(true) };
      if (post) {
        await mutate(`/posts/${post.id}`, 'PATCH', formData('post', payload));
        onSaved(post.id);
      } else if (draftId) {
        const saved = await saveDraft();
        const published = await mutate<{ id: number }>(`/drafts/${saved.id}/publish`, 'POST');
        onSaved(published.id);
      } else {
        const published = await mutate<{ id: number }>('/posts', 'POST', formData('post', payload));
        onSaved(published.id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.');
    } finally { setBusy(false); }
  }

  return <form className="post-form" onSubmit={submit}>
    <div className="form-heading">
      <h2>{post ? '게시글 수정' : draftId ? '임시저장 글 이어쓰기' : '새 게시글 등록'}</h2>
      <button type="button" className="secondary" aria-label="작성 화면 닫기" onClick={onCancel}>× 닫기</button>
    </div>
    <fieldset disabled={busy}>
      <p className="hint">사진은 선택 사항이며 최대 5장입니다. 첫 번째 사진이 대표 사진입니다.</p>
      <div className="actions">
        <button type="button" className="secondary" disabled={photos.length >= 5} onClick={() => gallery.current?.click()}>사진 선택</button>
        <button type="button" className="secondary" disabled={photos.length >= 5} onClick={() => camera.current?.click()}>바로 촬영</button>
        <input ref={gallery} className="visually-hidden" aria-label="사진 선택" type="file"
          accept="image/jpeg,image/png" multiple onChange={selectPhotos} />
        <input ref={camera} className="visually-hidden" aria-label="바로 촬영" type="file"
          accept="image/*" capture="environment" onChange={selectPhotos} />
      </div>
      <ol className="photo-list">
        {photos.map((photo, index) => <li key={photo.id} className="photo-item">
          <PhotoPreview photo={photo} />
          {index === 0 && <span className="badge">대표 사진</span>}
          <div className="actions">
            <button type="button" className="secondary" disabled={index === 0}
              aria-label={`${index + 1}번째 사진 앞으로`} onClick={() => move(index, index - 1)}>앞으로</button>
            <button type="button" className="secondary" disabled={index === photos.length - 1}
              aria-label={`${index + 1}번째 사진 뒤로`} onClick={() => move(index, index + 1)}>뒤로</button>
            <button type="button" className="secondary" aria-label={`${index + 1}번째 사진 제거`}
              onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))}>제거</button>
          </div>
        </li>)}
      </ol>
      <label>제목<input maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>본문<textarea rows={8} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>가격 (원)<input type="number" min="0" step="1" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      <p className="hint">나눔은 0원을 입력하세요. 임시저장은 빈 항목이 있어도 가능합니다.</p>
      {notice && <p role="status" className="hint">{notice}</p>}
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="actions">
        <button type="submit">{busy ? '처리 중…' : post ? '수정 저장' : '게시하기'}</button>
        {!post && <button type="button" className="secondary" onClick={() => void draftClick()}>임시저장</button>}
      </div>
    </fieldset>
  </form>;
}
