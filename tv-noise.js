window.addEventListener('load', function() {
  const canvas = document.getElementById('noiseCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const image = ctx.createImageData(canvas.width, canvas.height);
  const data = image.data;

  function renderNoise() {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.random() * 255;
      data[i + 1] = Math.random() * 255;
      data[i + 2] = Math.random() * 255;
      data[i + 3] = Math.random() < 0.24 ? 38 : 0;
    }

    ctx.putImageData(image, 0, 0);
    requestAnimationFrame(renderNoise);
  }

  renderNoise();
});
