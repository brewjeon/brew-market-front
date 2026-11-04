import { useEffect, useState } from 'react';

export default function PostImage({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [url]);

  if (!url || failed) {
    return <div className="image-placeholder">사진 없음</div>;
  }

  return <img className="post-image" src={`/api${url}`} alt={title} loading="lazy" onError={() => setFailed(true)} />;
}
