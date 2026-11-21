// 지금 보고 있는 3D 장면을 사진으로: 버튼(UI)은 빼고 장면만 찍은 뒤 아래에 이름과 날짜를 새긴다.
// 폰에서는 공유 시트(인스타 스토리 등)로, 안 되면 미리보기를 띄워 길게 눌러 저장하게 한다.

let logo: HTMLImageElement | null = null;
{ const img = new Image(); img.onload = () => { logo = img; }; img.src = '/icon-192.png'; }

/** render() 직후 같은 순간에 복사해야 빈 화면이 안 나온다 */
export function grab(gl: HTMLCanvasElement, render: () => void) {
  const c = document.createElement('canvas'); c.width = gl.width; c.height = gl.height;
  render(); c.getContext('2d')!.drawImage(gl, 0, 0);
  return c;
}

export function compose(base: HTMLCanvasElement, line: string): Promise<Blob | null> {
  const W = base.width, H = base.height, out = document.createElement('canvas');
  out.width = W; out.height = H;
  const g = out.getContext('2d')!;
  g.drawImage(base, 0, 0);
  const u = Math.min(W, H) / 400, band = 70 * u;
  const grad = g.createLinearGradient(0, H - band * 1.6, 0, H);
  grad.addColorStop(0, 'rgba(36,50,74,0)'); grad.addColorStop(1, 'rgba(36,50,74,.6)');
  g.fillStyle = grad; g.fillRect(0, H - band * 1.6, W, band * 1.6);
  const pad = 16 * u, ls = 34 * u;
  let x = pad;
  if (logo) { g.save(); g.beginPath(); g.arc(pad + ls / 2, H - pad - ls / 2, ls / 2, 0, Math.PI * 2); g.clip(); g.drawImage(logo, pad, H - pad - ls, ls, ls); g.restore(); x += ls + 12 * u; }
  const date = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  g.font = `${17 * u}px 'Jua', system-ui, sans-serif`; g.fillText(line, x, H - pad - 16 * u);
  g.fillStyle = 'rgba(255,255,255,.82)'; g.font = `${12 * u}px 'Jua', system-ui, sans-serif`;
  g.fillText(`${date} · sheep.abracadelulu.com`, x, H - pad);
  return new Promise((res) => out.toBlob((b) => res(b), 'image/jpeg', 0.92));
}

/** 공유 시트 → 안 되면 미리보기(길게 눌러 저장) */
export async function share(blob: Blob) {
  const file = new File([blob], `sheepll-be-right-${Date.now()}.jpg`, { type: 'image/jpeg' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "Sheep'll Be Right", text: 'sheep.abracadelulu.com' }); return 'shared'; }
  } catch (e) { if ((e as DOMException)?.name === 'AbortError') return 'cancelled'; }
  const url = URL.createObjectURL(blob);
  const box = document.getElementById('photoBox')!, img = document.getElementById('photoImg') as HTMLImageElement, dl = document.getElementById('photoSave') as HTMLAnchorElement;
  img.src = url; dl.href = url; dl.download = file.name; box.hidden = false;
  document.getElementById('photoClose')!.onclick = () => { box.hidden = true; URL.revokeObjectURL(url); };
  return 'preview';
}
