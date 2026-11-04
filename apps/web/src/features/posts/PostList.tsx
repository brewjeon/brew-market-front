import { useEffect, useRef, useState } from 'react';
import { formatPrice, statusLabel } from '../../posts';
import type { PostSummary } from '../../posts';
import { fetchPostPage } from './postListApi';
import type { PostPage } from './postListApi';
import PostImage from '../../PostImage';

export default function PostList() {
  const [input, setInput] = useState('');
  const [keyword, setKeyword] = useState('');

  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [page, setPage] = useState<PostPage | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const pending = useRef(false);
  const request = useRef<AbortController | null>(null);

  async function load(cursor: PostPage | null) {
    if (pending.current) {
      return;
    }

    pending.current = true;
    const controller = new AbortController();
    request.current = controller;

    setLoading(true);
    setError('');

    try {
      const next = await fetchPostPage(cursor, controller.signal, keyword);
      if (controller.signal.aborted) {
        return;
      }

      setPosts((previous) => {
        const seen = new Set(previous.map((post) => post.id));

        return cursor
          ? [...previous, ...next.items.filter((post) => !seen.has(post.id))]
          : next.items;
      });
      setPage(next);
    } catch {
      if (!controller.signal.aborted) {
        setError('목록을 불러오지 못했습니다. 다시 시도해 주세요.');
      }
    } finally {
      if (request.current === controller) {
        pending.current = false;

        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
  }

  useEffect(() => {
    setPosts([]);
    setPage(null);

    void load(null);

    return () => {
      request.current?.abort();
      pending.current = false;
    };
  }, [keyword]);

  return (
    <>
      <section className="intro">
        <p className="eyebrow">BREW MARKET</p>
        <h1>
          필요한 물건,<br />
          새로운 쓰임을 만나다.
        </h1>
        <p>마음에 드는 물건의 이야기를 살펴보세요.</p>
      </section>

      <div className="section-heading search-heading">
        <h2>{keyword ? '검색 결과' : '새로 올라온 게시글'}</h2>
        <form
          role="search"
          className="search-form"
          onSubmit={(event) => {
            event.preventDefault();
            setKeyword(input.trim());
          }}
        >
          <label className="search-label" htmlFor="post-search">
            게시글 제목 검색
          </label>
          <input
            id="post-search"
            type="search"
            maxLength={100}
            placeholder="어떤 물건을 찾으세요?"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <button type="submit">검색</button>
        </form>
      </div>

      <p className="hint">
        {keyword ? `‘${keyword}’ · ` : ''}최신순 · {posts.length}개 표시
      </p>

      {posts.length === 0 && !loading && !error ? (
        <section className="notice">
          <h3>{keyword ? '검색 결과가 없어요' : '아직 게시글이 없어요'}</h3>
          <p>
            {keyword ? '다른 검색어로 찾아보세요.' : '새로운 물건이 등록되면 여기에 표시됩니다.'}
          </p>
        </section>
      ) : (
        <ul className="post-grid">
          {posts.map((post) => (
            <li key={post.id}>
              <a className="post-card" href={`#/posts/${post.id}`}>
                <PostImage url={post.imageUrl} title={post.title} />
                <span className={`badge ${post.status}`}>
                  {statusLabel[post.status] ?? '상태 확인 중'}
                </span>
                <h3>{post.title}</h3>
                <p className="price">{formatPrice(post.price)}</p>
                <span className="card-link">자세히 보기 <span aria-hidden="true">↗</span></span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {loading && <p role="status">게시글을 불러오고 있습니다.</p>}
      {error && <p role="alert" className="error-message">{error}</p>}
      {!loading && (error || page?.hasNext) && (
        <div className="load-more">
          <button onClick={() => void load(page)}>
            {error ? '다시 시도' : '더 보기'}
          </button>
        </div>
      )}

      {!loading && page && !page.hasNext && posts.length > 0 && (
        <p className="hint">모든 게시글을 확인했습니다.</p>
      )}
    </>
  );
}

