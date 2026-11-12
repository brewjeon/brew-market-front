import { useEffect, useState } from 'react';
import { ApiError, formatPrice, getPost, statusLabel } from './posts';
import type { PostDetail, PostDraft, PostStatus } from './posts';
import { currentMember, mutate } from './account';
import type { Member } from './account';
import PostForm from './PostForm';
import PostImage from './PostImage';
import PostList from './features/posts/PostList';
import DraftList from './DraftList';
import Inquiries, { NewInquiry } from './Inquiries';
import InquiryNotifications from './InquiryNotifications';
import FavoriteList from './FavoriteList';

type PageData = { kind: 'list' } | { kind: 'mine' } | { kind: 'favorites' } | { kind: 'detail'; post: PostDetail }
  | { kind: 'inquiries'; roomId?: string } | { kind: 'new-inquiry'; post: PostDetail };
type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: PageData }
  | { kind: 'error'; notFound: boolean };

export default function App() {
  const [route, setRoute] = useState(window.location.hash || '#/');
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [member, setMember] = useState<Member | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<PostDraft | null>(null);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const result = await currentMember();
        if (active) { setMember(result); if (!result) { setCreating(false); setDraftsOpen(false); setSelectedDraft(null); } }
      } catch {
        if (active) setAuthError('로그인 상태를 확인하지 못했습니다.');
      } finally { if (active) setAuthLoading(false); }
    }
    void refresh();
    window.addEventListener('focus', refresh);
    // 화면에 돌아오면 세션 상태를 다시 확인한다.
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, []);

  async function logout() {
    setLoggingOut(true);
    try {
      await mutate('/logout', 'POST');
      setMember(null);
      setCreating(false);
      setDraftsOpen(false);
      setSelectedDraft(null);
      setRetry((value) => value + 1);
      setAuthError('');
    } catch (error) { setAuthError(error instanceof Error ? error.message : '로그아웃하지 못했습니다.'); }
    finally { setLoggingOut(false); }
  }

  function saved(id: number) {
    setCreating(false);
    setDraftsOpen(false);
    setSelectedDraft(null);
    window.location.hash = `/posts/${id}`;
    setRetry((value) => value + 1);
  }

  useEffect(() => {
    const onNavigate = () => {
      setState({ kind: 'loading' });
      setCreating(false);
      setDraftsOpen(false);
      setSelectedDraft(null);
      setRoute(window.location.hash || '#/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onNavigate);
    return () => window.removeEventListener('hashchange', onNavigate);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    const match = /^#\/posts\/([1-9]\d*)$/.exec(route);
    const inquiry = /^#\/inquiries(?:\/([1-9]\d*))?$/.exec(route);
    const newInquiry = /^#\/inquiries\/new\/([1-9]\d*)$/.exec(route);

    async function load() {
      try {
        let data: PageData;
        if (route === '#/' || route === '#') {
          data = { kind: 'list' };
        } else if (route === '#/my-posts') {
          data = { kind: 'mine' };
        } else if (route === '#/favorites') {
          data = { kind: 'favorites' };
        } else if (match) {
          data = { kind: 'detail', post: await getPost(match[1], controller.signal) };
        } else if (inquiry) {
          data = { kind: 'inquiries', roomId: inquiry[1] };
        } else if (newInquiry) {
          data = { kind: 'new-inquiry', post: await getPost(newInquiry[1], controller.signal) };
        } else {
          throw new ApiError(404);
        }
        if (!controller.signal.aborted) setState({ kind: 'ready', data });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ kind: 'error', notFound: error instanceof ApiError && error.status === 404 });
        }
      }
    }

    void load();
    // 화면을 떠난 뒤 이전 요청이 새 화면의 결과를 덮어쓰지 않도록 취소한다.
    return () => controller.abort();
  }, [route, retry, member?.userId]);

  return (
    <>
      <header className="header">
        <a href="#/" className="brand" aria-label="브루마켓 홈">brew<span>market</span><span className="brand-dot">.</span></a>
        <nav className="actions" aria-label="회원 메뉴">
          {authLoading ? <span>로그인 확인 중…</span> : member ? <>
            <span className="header-note">회원 {member.userId}</span>
            <a href="#/inquiries" onClick={() => { setCreating(false); setDraftsOpen(false); }}>내 대화</a>
            <a href="#/my-posts" onClick={() => { setCreating(false); setDraftsOpen(false); }}>내 글</a>
            <a href="#/favorites" onClick={() => { setCreating(false); setDraftsOpen(false); }}>관심글</a>
            <InquiryNotifications key={member.userId} onNavigate={() => {
              setCreating(false);
              setDraftsOpen(false);
            }} />
            <button onClick={() => { setSelectedDraft(null); setDraftsOpen(false); setCreating(true); }}>글쓰기</button>
            <button className="secondary" onClick={() => { setCreating(false); setDraftsOpen(true); }}>임시저장 글</button>
            <button className="secondary" disabled={loggingOut} onClick={logout}>{loggingOut ? '로그아웃 중…' : '로그아웃'}</button>
          </> : <a className="button" href="/oauth2/authorization/google">구글 로그인</a>}
        </nav>
      </header>
      <main>
        {authError && <p role="alert" className="error-message">{authError}</p>}
        {!authLoading && !member && <p className="hint">구글 로그인 후 브루마켓으로 돌아옵니다.</p>}
        {creating && member && <PostForm key={selectedDraft?.id ?? 'new'} draft={selectedDraft ?? undefined}
          onSaved={saved} onCancel={() => { setCreating(false); setSelectedDraft(null); }} />}
        {draftsOpen && member && <DraftList onResume={(draft) => {
          setSelectedDraft(draft); setDraftsOpen(false); setCreating(true);
        }} onClose={() => setDraftsOpen(false)} />}
        {!creating && !draftsOpen && state.kind === 'loading' && <div className="notice" role="status">게시글을 불러오고 있습니다.</div>}
        {!creating && !draftsOpen && state.kind === 'error' && (
          <section className="notice" role="alert">
            <h1>{state.notFound ? '게시글을 찾을 수 없어요' : '게시글을 불러오지 못했어요'}</h1>
            <p>{state.notFound ? '삭제되었거나 잘못된 주소일 수 있습니다.' : '연결을 확인한 뒤 다시 시도해 주세요.'}</p>
            {state.notFound ? <a className="button" href="#/">목록으로</a> : <button onClick={() => setRetry((value) => value + 1)}>다시 시도</button>}
          </section>
        )}
        {!creating && !draftsOpen && state.kind === 'ready' && (state.data.kind === 'list'
          ? <PostList key={retry} />
          : state.data.kind === 'mine'
            ? member
              ? <PostList key={`mine-${member.userId}-${retry}`} mine />
              : <p>{authLoading ? '로그인 확인 중…' : '로그인 후 내 글을 볼 수 있습니다.'}</p>
          : state.data.kind === 'favorites'
            ? member
              ? <FavoriteList key={`${member.userId}-${retry}`} />
              : <p>{authLoading ? '로그인 확인 중…' : '로그인 후 관심글을 볼 수 있습니다.'}</p>
          : state.data.kind === 'inquiries'
            ? member
              ? <Inquiries key={`${member.userId}-${state.data.roomId ?? 'list'}`} roomId={state.data.roomId} userId={member.userId} />
              : <p>{authLoading ? '로그인 확인 중…' : '로그인 후 내 대화를 볼 수 있습니다.'}</p>
            : state.data.kind === 'new-inquiry'
              ? member
                ? state.data.post.canManage
                  ? <p>내 게시글에는 거래 문의를 보낼 수 없습니다.</p>
                  : <NewInquiry key={`${member.userId}-${state.data.post.id}`} post={state.data.post} />
                : <p>{authLoading ? '로그인 확인 중…' : '로그인 후 거래 문의를 보낼 수 있습니다.'}</p>
            : <PostContent key={`${state.data.post.id}-${retry}-${member?.userId ?? 'guest'}`} post={state.data.post} member={member} onSaved={saved} onDeleted={() => { window.location.hash = '/'; setRetry((value) => value + 1); }} />)}
      </main>
      <footer>가까운 곳에서 시작하는 새로운 쓰임 · 브루마켓</footer>
    </>
  );
}

function PostContent({ post, member, onSaved, onDeleted }: { post: PostDetail; member: Member | null; onSaved: (id: number) => void; onDeleted: () => void }) {
  const [favorite, setFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [favoriteReady, setFavoriteReady] = useState(false);
  const [favoriteError, setFavoriteError] = useState('');
  useEffect(() => {
    if (!member) return;
    const controller = new AbortController();
    setFavoriteReady(false);
    fetch(`/api/favorites/${post.id}`, { signal: controller.signal, cache: 'no-store' })
      .then((response) => { if (!response.ok) throw new ApiError(response.status); return response.json() as Promise<{ favorite: boolean }>; })
      .then((result) => { setFavorite(result.favorite); setFavoriteReady(true); setFavoriteError(''); })
      .catch(() => { if (!controller.signal.aborted) setFavoriteError('관심글 상태를 확인하지 못했습니다.'); });
    return () => controller.abort();
  }, [member?.userId, post.id]);
  async function toggleFavorite() {
    if (favoriteLoading) return;
    setFavoriteLoading(true);
    setFavoriteError('');
    try {
      await mutate(`/favorites/${post.id}`, favorite ? 'DELETE' : 'POST');
      setFavorite(!favorite);
    } catch (cause) {
      setFavoriteError(cause instanceof Error ? cause.message : '관심글을 변경하지 못했습니다.');
    } finally { setFavoriteLoading(false); }
  }
  const [editing, setEditing] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [nextStatus, setNextStatus] = useState<PostStatus>(post.status);
  const [error, setError] = useState('');
  async function changeStatus() {
    if (changingStatus || deleting) return;
    if (nextStatus === 'COMPLETED' && !window.confirm('거래 완료로 변경하면 이전 상태로 되돌릴 수 없습니다. 완료할까요?')) return;
    setChangingStatus(true);
    setError('');
    try {
      await mutate(`/posts/${post.id}/status`, 'PATCH', { status: nextStatus });
      onSaved(post.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '상태를 변경하지 못했습니다.'); }
    finally { setChangingStatus(false); }
  }
  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setError('');
    try { await mutate(`/posts/${post.id}`, 'DELETE'); onDeleted(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '삭제하지 못했습니다.'); }
    finally { setDeleting(false); }
  }
  const createdAt = new Date(post.createdAt);
  const imageUrls = post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [];
  if (editing) return <PostForm post={post} onSaved={onSaved} onCancel={() => setEditing(false)} />;
  return (
    <article className="detail">
      <a className="back-link" href="#/">← 게시글 목록</a>
      <div className="detail-heading">
        <PostImage url={imageUrls[selectedImage] ?? null} title={post.title} />
        {imageUrls.length > 1 && <div className="image-thumbnails" aria-label="게시글 사진 선택">
          {imageUrls.map((url, index) => <button key={url} type="button"
            aria-label={`${index + 1}번째 사진 보기`} aria-pressed={selectedImage === index}
            className={selectedImage === index ? 'selected' : ''}
            onClick={() => setSelectedImage(index)}>
            <img src={`/api${url}`} alt="" loading="lazy" />
          </button>)}
        </div>}
        <span className={`badge ${post.status}`}>{statusLabel[post.status] ?? '상태 확인 중'}</span>
        <h1>{post.title}</h1>
        <p className="price">{formatPrice(post.price)}</p>
        {!Number.isNaN(createdAt.getTime()) && <time dateTime={post.createdAt}>{createdAt.toLocaleString('ko-KR')} 작성</time>}
      </div>
      <h2 className="description-label">물건 이야기</h2>
      <p className="description">{post.description || '등록된 설명이 없습니다.'}</p>
      {member && !post.canManage && <div>
        <button type="button" className="secondary" aria-pressed={favorite} disabled={favoriteLoading || !favoriteReady}
          onClick={() => void toggleFavorite()}>{favoriteLoading ? '처리 중…' : favorite ? '관심글 해제' : '관심글 저장'}</button>
        {favoriteError && <p role="alert">{favoriteError}</p>}
      </div>}
      {member && !post.canManage && (
        <a className="button" href={`#/inquiries/new/${post.id}`}>대화 신청</a>
      )}
      {member && post.canManage && <section className="manage-post" aria-label="게시글 관리">
        {post.status !== 'COMPLETED' ? <fieldset disabled={changingStatus || deleting} className="status-controls">
          <label htmlFor="post-status">거래 상태</label>
          <select id="post-status" value={nextStatus} onChange={(event) => setNextStatus(event.target.value as PostStatus)}>
            <option value="FOR_SALE">판매 중</option><option value="RESERVED">예약 중</option><option value="COMPLETED">거래 완료</option>
          </select>
          <button disabled={nextStatus === post.status} onClick={changeStatus}>{changingStatus ? '변경 중…' : '상태 변경'}</button>
        </fieldset> : <p className="hint">거래가 완료되었습니다. 이전 상태로 되돌릴 수 없습니다.</p>}
        <p className="hint">본인이 작성한 게시글만 수정·삭제할 수 있습니다.</p>
        <div className="actions"><button className="secondary" disabled={deleting} onClick={() => setEditing(true)}>수정</button><button className="secondary" disabled={deleting} onClick={() => setConfirming(true)}>삭제</button></div>
        {confirming && <div className="delete-confirm"><p>이 게시글과 사진을 영구 삭제할까요? 복구할 수 없습니다.</p><div className="actions"><button disabled={deleting} onClick={remove}>{deleting ? '삭제 중…' : '영구 삭제'}</button><button className="secondary" disabled={deleting} onClick={() => setConfirming(false)}>취소</button></div></div>}
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>}
    </article>
  );
}
