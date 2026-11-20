import { track } from './analytics';

/** 인스타·스레드·페이스북 안 브라우저: 화면이 좁고 아래로 당기면 창이 닫혀서, 크롬/사파리로 열도록 위에 안내 띠를 띄움 */
export function inAppHint() {
  const ua = navigator.userAgent;
  const app = /Barcelona|Threads/i.test(ua) ? 'threads' : /Instagram/i.test(ua) ? 'instagram' : /FBAN|FBAV/i.test(ua) ? 'facebook' : /TikTok|musical_ly|BytedanceWebview/i.test(ua) ? 'tiktok' : /Line\//i.test(ua) ? 'line' : '';
  if (!app) return;
  try { if (sessionStorage.getItem('inappX')) return; } catch { /* 무시 */ }
  const android = /Android/i.test(ua);
  const el = document.getElementById('inapp')!, go = document.getElementById('inappGo') as HTMLAnchorElement;
  const text = document.getElementById('inappText')!;
  if (android) {
    const url = location.href.replace(/^https?:\/\//, '');
    go.href = `intent://${url}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(location.href)};end`;
    go.hidden = false;
    text.textContent = 'Smoother in Chrome, and you can add it to your home screen';
    go.onclick = () => track('inapp_open_chrome', { app });
  } else {
    text.textContent = 'Tap ⋯ at the top right and choose "Open in browser" for a smoother farm';
  }
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 10000);
  document.getElementById('inappX')!.onclick = () => { el.hidden = true; try { sessionStorage.setItem('inappX', '1'); } catch { /* 무시 */ } };
  track('inapp_seen', { app, os: android ? 'android' : 'ios' });
}
