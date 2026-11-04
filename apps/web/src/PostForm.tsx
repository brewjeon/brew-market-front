import { useEffect, useRef, useState } from 'react';
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
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!image) {
      setPreview(null);
      return;
    }

    const url = URL.createObjectURL(image);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [image]);

  const imageSource = preview ?? (!removeImage && post?.imageUrl ? `/api${post.imageUrl}` : null);

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
      const form = new FormData();
      form.append('post', new Blob([JSON.stringify(body)], { type: 'application/json' }));

      if (image) {
        form.append('image', image);
      }

      form.append('removeImage', String(removeImage));

      if (post) {
        await mutate(`/posts/${post.id}`, 'PATCH', form);
        onSaved(post.id);
      } else {
        const response = await mutate<{ id: number }>('/posts', 'POST', form);
        onSaved(response.id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.');
    } finally { setBusy(false); }
  }

  return <form className="post-form" onSubmit={submit}>
    <h2>{post ? '게시글 수정' : '새 게시글 등록'}</h2>
    <fieldset disabled={busy}>
      <label>
        사진 한 장 (JPEG·PNG, 5MB 이하)
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (!selected) return;

            if (!['image/jpeg', 'image/png'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
              setError('JPEG·PNG 사진을 5MB 이하로 선택해 주세요.');
              event.target.value = '';
              return;
            }

            setError('');
            setImage(selected);
            setRemoveImage(false);
          }}
        />
      </label>

      {imageSource && <div className="image-preview">
        <img src={imageSource} alt="저장할 사진 미리보기" />
        <button type="button" aria-label="사진 삭제 예정" onClick={() => {
          setImage(null);
          setRemoveImage(true);
          if (fileInput.current) fileInput.current.value = '';
        }}>×</button>
      </div>}

      {removeImage && post?.imageUrl && <p className="hint">저장을 누르면 기존 사진이 삭제됩니다.</p>}
      <p className="hint">사진 변경은 저장할 때 반영됩니다. 취소하면 기존 사진이 유지됩니다.</p>

      <label>제목<input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>본문<textarea required rows={8} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>가격 (원)<input required type="number" min="0" step="1" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      <p className="hint">나눔은 0원을 입력하세요.</p>
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="actions"><button type="submit">{busy ? '저장 중…' : '저장'}</button><button type="button" className="secondary" onClick={onCancel}>취소</button></div>
    </fieldset>
  </form>;
}
