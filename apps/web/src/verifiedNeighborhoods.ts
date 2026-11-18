import { mutate } from './account';

export type VerifiedNeighborhood = { id: number; name: string; expiresAt: string };

export async function fetchVerifiedNeighborhoods(signal: AbortSignal): Promise<VerifiedNeighborhood[]> {
  const response = await fetch('/api/neighborhoods/verified', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('인증된 동네를 불러오지 못했습니다.');
  return response.json();
}

function currentPosition(): Promise<GeolocationCoordinates> {
  if (!navigator.geolocation) return Promise.reject(new Error('이 브라우저에서는 위치를 확인할 수 없습니다.'));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve(coords),
      () => reject(new Error('위치 권한과 기기의 위치 설정을 확인해 주세요.')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

export async function verifyCurrentNeighborhood() {
  const { latitude, longitude, accuracy } = await currentPosition();
  return mutate<VerifiedNeighborhood>('/neighborhoods/verify', 'POST', { latitude, longitude, accuracy });
}
