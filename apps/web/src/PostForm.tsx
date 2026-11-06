import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { mutate } from './account';
import type { PostDetail, PostDraft } from './posts';

type Photo = { id: string; url?: string; sourceIndex?: number; file?: File };

function savedPhotos(urls: string[]): Photo[] {
  return urls.map((url, sourceIndex) => ({ id: url, url, sourceIndex }));
}

async function uploadablePhoto(file: File): Promise<File> {
  if (['image/jpeg', 'image/png'].includes(file.type)) {
    if (file.size > 5 * 1024 * 1024) throw new Error('사진은 장당 5MB 이하여야 합니다.');
    return file;
  }
  if (!['image/heic', 'image/heif', 'image/webp'].includes(file.type)
      && !/\.(heic|heif|webp)$/i.test(file.name)) {
    throw new Error('JPEG·PNG·HEIC·WebP 사진만 선택할 수 있습니다.');
  }
  if (file.size > 20 * 1024 * 1024) throw new Error('변환할 사진은 20MB 이하여야 합니다.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('이 기기에서는 사진 형식을 읽지 못했습니다. JPEG·PNG 사진을 선택해 주세요.');
  }
  try {
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('사진을 변환하지 못했습니다.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('사진을 변환하지 못했습니다.')),
        'image/jpeg', 0.85));
    if (blob.size > 5 * 1024 * 1024) throw new Error('변환된 사진이 5MB를 넘습니다.');
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
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
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  async function selectPhotos(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0 || selecting) return;
    if (photos.length + picked.length > 5) {
      setError('사진은 최대 5장까지 올릴 수 있습니다.');
      return;
    }
    setSelecting(true);
    setError('');
    try {
      const prepared = await Promise.all(picked.map(uploadablePhoto));
      setPhotos((current) => [...current, ...prepared.map((file) => ({ id: crypto.randomUUID(), file }))]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '사진을 준비하지 못했습니다.');
    } finally { setSelecting(false); }
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
    if (busy || selecting) return;
    setBusy(true);
    setError('');
    try { await saveDraft(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '임시저장하지 못했습니다.'); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || selecting) return;
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
        const published = await mutate<{ id: number }>(`/drafts/${draftId}/publish`,
          'POST', formData('post', payload));
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
      <p className="hint">사진은 선택 사항이며 최대 5장입니다. 첫 번째 사진이 대표 사진입니다. HEIC·WebP는 기기에서 읽을 수 있으면 JPEG로 변환합니다.</p>
      <div className="actions">
        <button type="button" className="secondary" disabled={photos.length >= 5 || selecting} onClick={() => gallery.current?.click()}>사진 선택</button>
        <button type="button" className="secondary capture-button" disabled={photos.length >= 5 || selecting} onClick={() => camera.current?.click()}>바로 촬영</button>
        <input ref={gallery} className="visually-hidden" aria-label="사진 선택" type="file"
          accept="image/*" multiple onChange={(event) => void selectPhotos(event)} />
        <input ref={camera} className="visually-hidden" aria-label="바로 촬영" type="file"
          accept="image/*" capture="environment" onChange={(event) => void selectPhotos(event)} />
      </div>
      {selecting && <p role="status" className="hint">사진을 준비하고 있습니다…</p>}
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
        <button type="submit" disabled={selecting}>{busy ? '처리 중…' : post ? '수정 저장' : '게시하기'}</button>
        {!post && <button type="button" className="secondary" disabled={selecting} onClick={() => void draftClick()}>임시저장</button>}
      </div>
    </fieldset>
  </form>;
}
