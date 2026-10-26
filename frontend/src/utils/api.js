export function apiFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  try {
    const session = JSON.parse(localStorage.getItem('naviguard_session') || 'null');
    if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);
  } catch (error) {
    console.warn('Could not read the saved NaviGuard session for an API request:', error);
  }

  return fetch(input, { ...init, headers }).then((response) => {
    if (response.status === 401) {
      window.dispatchEvent(new Event('naviguard:unauthorized'));
    }
    return response;
  });
}
