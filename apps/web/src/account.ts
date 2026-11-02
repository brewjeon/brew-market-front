export interface Member { userId: number }

export async function currentMember(): Promise<Member | null> {
  const response = await fetch('/api/auth/me');
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('로그인 상태를 확인하지 못했습니다.');
  return response.json();
}

export async function mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  // 변경 요청마다 현재 세션의 CSRF 토큰을 받는다.
  const csrfResponse = await fetch('/api/auth/csrf');
  if (!csrfResponse.ok) throw new Error(csrfResponse.status === 401
    ? '로그인이 만료되었습니다. 다시 로그인해 주세요.' : '요청을 준비하지 못했습니다. 다시 시도해 주세요.');
  const csrf: { headerName: string; token: string } = await csrfResponse.json();
  const response = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', [csrf.headerName]: csrf.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { code?: string } | null;
    if (problem?.code === 'POST_STATUS_CONFLICT') {
      throw new Error('이미 거래 완료된 글입니다. 새로고침해서 현재 상태를 확인해 주세요.');
    }
    const messages: Record<number, string> = {
      400: '입력값을 확인해 주세요.',
      401: '다시 로그인해 주세요.',
      403: '권한이 없거나 요청이 만료되었습니다. 본인의 게시글인지 확인해 주세요.',
      404: '이미 삭제되었거나 존재하지 않는 게시글입니다.',
      409: '다른 변경과 충돌했습니다. 최신 글을 다시 확인해 주세요.',
    };
    throw new Error(messages[response.status] ?? '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  return response.status === 204 ? undefined as T : response.json();
}
