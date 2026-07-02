// Production — API base URL is relative to the same origin (reverse proxy)
// Override at build time: NG_APP_API_URL / NG_APP_WS_URL env vars
// or inject window.__ENV at runtime via index.html <script>.
declare global {
  interface Window {
    __ENV?: { apiUrl?: string; wsUrl?: string };
  }
}

const _origin  = typeof window !== 'undefined' ? window.location.origin : '';
const _ws      = _origin.replace(/^http/, 'ws');

export const environment = {
  production: true,
  apiUrl: (typeof window !== 'undefined' && window.__ENV?.apiUrl) || _origin,
  wsUrl:  (typeof window !== 'undefined' && window.__ENV?.wsUrl)  || _ws,
};
