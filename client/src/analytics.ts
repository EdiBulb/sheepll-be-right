import { inject } from '@vercel/analytics';
import type { PostHog } from 'posthog-js';

// 분석 도구 두 가지 (오늘의 해와 같은 방식)
// 1) Vercel Web Analytics: 방문자 수, 유입 경로, 국가, 기기
// 2) PostHog: 들어와서 무엇을 했는지 (털 깎기, 우유, 감정 표현, 머문 시간)
// PostHog 키는 브라우저에 공개되는 write-only 키라 코드에 있어도 괜찮음. 다른 Abracadelulu 앱과 같은 프로젝트를 쓰고 app으로 구분.
const POSTHOG_KEY: string | undefined = import.meta.env.VITE_POSTHOG_KEY || 'phc_wJsc42gGxSkirpZbgFVrW3faxaHiNnzEHcqZyADzzdv5';
const POSTHOG_HOST: string = import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let ph: PostHog | null = null;

/** 개발자 본인 기기는 기록에서 뺌: ?me=1 로 한 번 들어오면 이 브라우저는 계속 제외, ?me=0 이면 다시 포함 */
const OPT_KEY = 'sheep-optout';
function optedOut() {
  try {
    const q = new URLSearchParams(location.search).get('me');
    if (q === '1') localStorage.setItem(OPT_KEY, '1');
    if (q === '0') localStorage.removeItem(OPT_KEY);
    return localStorage.getItem(OPT_KEY) === '1';
  } catch { return false; }
}
const OUT = optedOut();
const queue: [string, Record<string, unknown> | undefined][] = [];

/** uid: 브라우저에 저장된 익명 ID (이름·연락처는 보내지 않음) */
export function initAnalytics(uid: string) {
  if (!OUT) { try { inject(); } catch { /* 광고 차단기 등 */ } }
  if (!POSTHOG_KEY || OUT) return;
  const load = () => import('posthog-js').then(({ default: posthog }) => {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      bootstrap: uid ? { distinctID: uid } : undefined,
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      disable_session_recording: true,
      persistence: 'localStorage',
    });
    posthog.register({ app: 'sheepll-be-right' });
    ph = posthog;
    for (const [e, p] of queue.splice(0)) ph.capture(e, p);
  }).catch(() => { /* 분석 실패가 게임을 막으면 안 됨 */ });
  if (document.readyState === 'complete') setTimeout(load, 1500);
  else addEventListener('load', () => setTimeout(load, 1500), { once: true });
}

/** 행동 기록. 분석 도구가 꺼져 있거나 막혀 있어도 아무 일도 일어나지 않음 */
export function track(event: string, props?: Record<string, unknown>) {
  if (!POSTHOG_KEY || OUT) return;
  try {
    if (ph) ph.capture(event, props);
    else if (queue.length < 50) queue.push([event, props]);
  } catch { /* 무시 */ }
}
