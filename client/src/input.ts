// 조이스틱(폰)과 키보드(PC) 입력을 하나의 방향 벡터로 합친다
const keys: Record<string, boolean> = {};
const joy = { x: 0, y: 0, id: null as number | null };

export function initInput(onKey: (code: string) => void) {
  addEventListener('keydown', (e) => { if (!keys[e.code]) onKey(e.code); keys[e.code] = true; });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  const el = document.getElementById('joy')!, knob = document.getElementById('knob')!;
  const move = (e: PointerEvent) => {
    const b = el.getBoundingClientRect();
    let dx = (e.clientX - (b.left + b.width / 2)) / (b.width / 2), dy = (e.clientY - (b.top + b.height / 2)) / (b.height / 2);
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    joy.x = dx; joy.y = dy; knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
  };
  const end = () => { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  el.addEventListener('pointerdown', (e) => { joy.id = e.pointerId; el.setPointerCapture(e.pointerId); move(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) move(e); });
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

/** 화면 기준 방향: x 오른쪽, z 아래(카메라 쪽). 길이는 최대 1 */
export function readInput() {
  let x = joy.x + ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
  let z = joy.y + ((keys.KeyS || keys.ArrowDown) ? 1 : 0) - ((keys.KeyW || keys.ArrowUp) ? 1 : 0);
  const len = Math.hypot(x, z); if (len > 1) { x /= len; z /= len; }
  return { x, z, len: Math.min(1, len) };
}
