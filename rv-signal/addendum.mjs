import { sampleTimes, summarizeMasks } from './analysis.mjs';

function waitForVideo(video) {
  if (video.readyState >= 2 && Number.isFinite(video.duration)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.addEventListener('loadeddata', resolve, { once: true });
    video.addEventListener('error', () => reject(new Error('Video could not load')), { once: true });
  });
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) return resolve();
    const timeout = setTimeout(() => reject(new Error('Video seek timed out')), 8000);
    video.addEventListener('seeked', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
    video.currentTime = time;
  });
}

async function prepareRow(row) {
  const video = row.querySelector('video');
  const chart = row.querySelector('svg');
  const button = row.querySelector('button');
  const status = row.querySelector('.example-status');
  button.disabled = true;
  status.textContent = 'Measuring video frames…';
  try {
    await waitForVideo(video);
    const times = sampleTimes(Number(row.dataset.start), video.duration, 16, Number(row.dataset.window));
    if (times.length < 3) throw new Error('Video is too short');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    const frames = [];
    for (const time of times) {
      await seekVideo(video, time);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL('image/jpeg', 0.86).split(',')[1]);
    }
    const response = await fetch('/rv-signal/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frames })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Analysis failed');
    if (!Array.isArray(data.results) || data.results.length !== times.length) throw new Error('Unexpected model output');
    const samples = times.map((time, index) => ({ time, area: data.results[index].area }));
    const { valid, peak } = summarizeMasks(samples);
    if (valid.length < 3) throw new Error('Too few usable outlines');
    const points = samples.map((sample, index) => sample.area > 0
      ? { x: 42 + index * 468 / (samples.length - 1), y: 22 + (1 - sample.area / peak) * 128, time: sample.time }
      : null);
    const path = points.map((point, index) => point
      ? `${index && points[index - 1] ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
      : '').filter(Boolean).join(' ');
    chart.innerHTML = `<line x1="42" y1="16" x2="42" y2="158" class="chart-axis"/><line x1="42" y1="158" x2="510" y2="158" class="chart-axis"/><text x="45" y="181" class="grid-label">Start of clip</text><text x="507" y="181" text-anchor="end" class="grid-label">End of clip</text><path d="${path}" class="example-curve"/><circle class="example-marker" r="6" cx="42" cy="22"/>`;
    const marker = chart.querySelector('.example-marker');
    const playable = points.filter(Boolean);
    let animation;
    function pause() {
      video.pause();
      cancelAnimationFrame(animation);
      button.textContent = 'Play clip + curve';
    }
    function tick() {
      if (video.paused) return;
      if (video.currentTime >= times.at(-1) || video.ended) video.currentTime = times[0];
      const closest = playable.reduce((best, point) => Math.abs(point.time - video.currentTime) < Math.abs(best.time - video.currentTime) ? point : best);
      marker.setAttribute('cx', closest.x);
      marker.setAttribute('cy', closest.y);
      animation = requestAnimationFrame(tick);
    }
    await seekVideo(video, times[0]);
    marker.setAttribute('cx', playable[0].x);
    marker.setAttribute('cy', playable[0].y);
    status.textContent = `${valid.length} of ${times.length} frames outlined · relative area`;
    button.disabled = false;
    button.textContent = 'Play clip + curve';
    button.addEventListener('click', async () => {
      if (!video.paused) return pause();
      video.currentTime = times[0];
      try {
        await video.play();
        button.textContent = 'Pause clip + curve';
        animation = requestAnimationFrame(tick);
      } catch {
        pause();
        status.textContent = 'Playback blocked; press Play to retry.';
      }
    });
  } catch (error) {
    chart.innerHTML = '<text x="270" y="95" text-anchor="middle" class="grid-label">Could not measure this clip.</text>';
    status.textContent = error.message;
    button.textContent = 'Retry measurement';
    button.disabled = false;
    button.addEventListener('click', () => prepareRow(row), { once: true });
  }
}

for (const row of document.querySelectorAll('.addendum-example')) {
  prepareRow(row);
}
