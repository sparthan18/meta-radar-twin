// Tilt-shift outside deck.gl: every frame, copy the GL canvases into a 2D canvas with a blur filter
// and keep only the top and bottom bands (soft-edged), so the focus band in the middle stays sharp.
// deck.gl's own tiltShift pass is unusable in 9.4.1 because PostProcessEffect drops the depth test.
export function startTiltShift(canvas, sources, { blur = 5, focus = 0.5, band = 0.16 } = {}) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const mask = g.createLinearGradient(0, 0, 0, H);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(Math.max(0, focus - band - 0.22), 'rgba(0,0,0,1)');
  mask.addColorStop(focus - band, 'rgba(0,0,0,0)');
  mask.addColorStop(focus + band, 'rgba(0,0,0,0)');
  mask.addColorStop(Math.min(1, focus + band + 0.22), 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,1)');
  let running = true;
  function frame() {
    if (!running) return;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.filter = `blur(${blur}px)`;
    for (const src of sources()) if (src && src.width) g.drawImage(src, 0, 0, W, H);
    g.filter = 'none';
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = mask;
    g.fillRect(0, 0, W, H);
    requestAnimationFrame(frame);
  }
  frame();
  return () => { running = false; };
}
