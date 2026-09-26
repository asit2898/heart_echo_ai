import { sampleTimes, summarizeMasks } from './analysis.mjs';
const video = document.querySelector('#sourceVideo');
const frameCanvas = document.querySelector('#frameCanvas');
const overlayCanvas = document.querySelector('#overlayCanvas');
const frameContext = frameCanvas.getContext('2d', { willReadFrequently: true });
const overlayContext = overlayCanvas.getContext('2d');
const status = document.querySelector('#status');
const captureButton = document.querySelector('#captureButton');
const analyzeButton = document.querySelector('#analyzeButton');
const chart = document.querySelector('#areaChart');
const framePlaceholder = document.querySelector('#framePlaceholder');
const videoPlaceholder = document.querySelector('#videoPlaceholder');
const windowSlider = document.querySelector('#windowSeconds');
const playbackButton = document.querySelector('#playbackButton');
const modelActivity = document.querySelector('#modelActivity');
const frameCounter = document.querySelector('#frameCounter');
const frameScrubber = document.querySelector('#frameScrubber');
const presets = [
  { button: '#demoButton', source: 'media/normal-a4c.webm', start: 0, title: 'Normal four-chamber ultrasound', subtitle: 'Normal ultrasound', label: 'Normal echo · CardioNetworks ECHOpedia / Wikimedia Commons · CC BY-SA 3.0' },
  { button: '#fluBeforeButton', source: 'media/influenza-a4c.webm', start: 1, title: 'Example video 2 · influenza case', subtitle: 'Example video 2 · first segment', label: 'Published influenza ultrasound · Quddus, Afari & Minami · CC BY 3.0' },
  { button: '#fluAfterButton', source: 'media/influenza-a4c.webm', start: 14, title: 'Example video 3 · same video', subtitle: 'Example video 3 · later segment', label: 'Same published influenza ultrasound · Quddus, Afari & Minami · CC BY 3.0' }
];
let localVideoUrl;
let autoTime = null;
let playbackTimer;
let playbackGeneration = 0;
let captured = false;
let capturedTime = 0;
let samples = [];
let activeSample;
let busy = false;

function report(message, kind = 'info') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function modelLoading(message) {
  playbackButton.dataset.loading = 'true';
  playbackButton.textContent = 'Loading EchoNet-RV…';
  modelActivity.textContent = message;
}

function modelReady(message) {
  playbackButton.dataset.loading = 'false';
  if (!playbackTimer) playbackButton.textContent = 'Play video + AI outline';
  modelActivity.textContent = message;
}

function clearResults() {
  stopPlayback();
  samples = [];
  activeSample = null;
  chart.innerHTML = '<text x="270" y="130" text-anchor="middle" fill="#7d93a3" font-size="15">Analyze a video to see the curve.</text>';
  document.querySelector('#usableValue').textContent = '—';
  document.querySelector('#changeValue').textContent = '—';
  overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  playbackButton.disabled = true;
  frameScrubber.disabled = true;
  frameScrubber.max = 0;
  frameScrubber.value = 0;
  frameCounter.textContent = 'Loading the video…';
}

function updateActions() {
  captureButton.disabled = busy || video.readyState < 2;
  analyzeButton.disabled = busy || !captured || !Number.isFinite(video.duration);
  document.querySelectorAll('.preset-button').forEach(button => { button.disabled = busy; });
  playbackButton.disabled = busy || samples.filter(sample => sample.area).length < 3;
  frameScrubber.disabled = busy || samples.length < 3;
}

function stopPlayback() {
  playbackGeneration++;
  cancelAnimationFrame(playbackTimer);
  playbackTimer = null;
  video.pause();
  playbackButton.dataset.playing = 'false';
  playbackButton.textContent = 'Play video + AI outline';
}

function startPlayback() {
  const playable = samples.filter(sample => sample.area);
  if (playable.length < 3) return;
  stopPlayback();
  const generation = playbackGeneration;
  playbackButton.dataset.playing = 'true';
  playbackButton.textContent = 'Pause video + AI outline';
  video.muted = true;
  video.currentTime = playable[0].time;
  showSample(playable[0]);
  const windowEnd = samples.at(-1).time;
  function render() {
    if (!video.seeking && (video.currentTime >= windowEnd || video.ended)) video.currentTime = playable[0].time;
    const nearest = playable.reduce((closest, sample) =>
      Math.abs(sample.time - video.currentTime) < Math.abs(closest.time - video.currentTime) ? sample : closest
    );
    if (nearest !== activeSample) showSample(nearest);
    playbackTimer = requestAnimationFrame(render);
  }
  video.play().then(() => {
    if (generation === playbackGeneration) playbackTimer = requestAnimationFrame(render);
  }).catch(() => {
    if (generation !== playbackGeneration) return;
    stopPlayback();
    report('Video playback was blocked. Press Play video + AI outline to try again.', 'warning');
  });
}

function resizeCanvases() {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return;
  for (const canvas of [frameCanvas, overlayCanvas]) {
    canvas.width = width;
    canvas.height = height;
  }
}

function capture() {
  if (video.readyState < 2 || busy) return;
  video.pause();
  resizeCanvases();
  frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
  capturedTime = video.currentTime;
  captured = true;
  clearResults();
  framePlaceholder.hidden = true;
  report('Ready. Run the EchoNet-RV model and inspect its proposed outlines.');
  updateActions();
}

function setVideo(source, label, start = null) {
  if (busy) return;
  autoTime = start;
  if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
  localVideoUrl = source.startsWith('blob:') ? source : null;
  video.controls = Boolean(localVideoUrl);
  video.src = source;
  video.load();
  videoPlaceholder.hidden = true;
  framePlaceholder.hidden = false;
  captured = false;
  clearResults();
  if (start === null) modelReady('Select a frame and run EchoNet-RV.');
  else modelLoading('Loading video and analyzing with EchoNet-RV…');
  document.querySelector('#videoInfo').textContent = label;
  report('Loading video…');
  updateActions();
}

function seek(time) {
  return new Promise((resolve, reject) => {
    const target = Math.min(video.duration - 0.01, Math.max(0, time));
    if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= 2) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      video.removeEventListener('seeked', done);
      reject(new Error('Video seeking timed out. Try a shorter clip.'));
    }, 8000);
    function done() {
      clearTimeout(timeout);
      resolve();
    }
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = target;
  });
}

function showSample(sample) {
  if (!sample?.image) return;
  activeSample = sample;
  const index = samples.indexOf(sample);
  frameCounter.textContent = `Frame ${index + 1} / ${samples.length} · ${sample.time.toFixed(2)} s${sample.area ? '' : ' · no outline'}`;
  frameScrubber.value = index;
  frameContext.putImageData(sample.image, 0, 0);
  overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (sample.mask) {
    if (!sample.maskImage) {
      sample.maskImage = new Image();
      sample.maskImage.onload = () => {
        if (activeSample === sample) overlayContext.drawImage(sample.maskImage, sample.crop.x, sample.crop.y, sample.crop.size, sample.crop.size);
      };
      sample.maskImage.src = `data:image/png;base64,${sample.mask}`;
    }
    if (sample.maskImage.complete && sample.maskImage.naturalWidth) {
      overlayContext.drawImage(sample.maskImage, sample.crop.x, sample.crop.y, sample.crop.size, sample.crop.size);
    }
  }
  document.querySelectorAll('.data-point').forEach(point => {
    point.classList.toggle('selected', Number(point.dataset.index) === samples.indexOf(sample));
  });
}

async function prepareMaskImages(results) {
  await Promise.all(results.filter(sample => sample.mask).map(sample => new Promise(resolve => {
    sample.maskImage = new Image();
    sample.maskImage.onload = resolve;
    sample.maskImage.onerror = resolve;
    sample.maskImage.src = `data:image/png;base64,${sample.mask}`;
  })));
}

function plot(results) {
  const { valid, peak, range } = summarizeMasks(results);
  document.querySelector('#usableValue').textContent = `${valid.length} / ${results.length}`;
  document.querySelector('#changeValue').textContent = range === null ? '—' : `${Math.round(range * 100)}%`;
  if (valid.length < 3) {
    chart.innerHTML = '<text x="270" y="130" text-anchor="middle" fill="#e4ae62" font-size="15">Too few plausible outlines to draw a curve.</text>';
    report('Insufficient usable frames. Try another view, video window, or clip.', 'warning');
    return;
  }
  const left = 54;
  const top = 24;
  const width = 454;
  const height = 179;
  const start = results[0].time;
  const span = results.at(-1).time - start || 1;
  const points = results.map((sample, index) => {
    if (!sample.area) return null;
    const x = left + (sample.time - start) / span * width;
    const y = top + (1 - sample.area / peak) * height;
    return { x, y, index };
  });
  const path = points.map((point, index) => {
    if (!point) return '';
    return `${index === 0 || !points[index - 1] ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).filter(Boolean).join(' ');
  chart.innerHTML = `
    <line x1="${left}" y1="${top}" x2="${left}" y2="${top + height}" class="axis" />
    <line x1="${left}" y1="${top + height}" x2="${left + width}" y2="${top + height}" class="axis" />
    <text x="11" y="${top + 4}" class="chart-label">100%</text>
    <text x="14" y="${top + height + 4}" class="chart-label">0%</text>
    <text x="${left}" y="234" class="chart-label">${start.toFixed(2)} s</text>
    <text x="${left + width}" y="234" text-anchor="end" class="chart-label">${results.at(-1).time.toFixed(2)} s</text>
    <path d="${path}" class="curve" />
    ${points.map(point => point && (point.index % Math.max(1, Math.floor((results.length - 1) / 6)) === 0 || point.index === results.length - 1) ? `<circle tabindex="0" role="button" aria-label="Inspect frame ${point.index + 1}" class="data-point" data-index="${point.index}" cx="${point.x}" cy="${point.y}" r="7" />` : '').join('')}`;
  chart.querySelectorAll('.data-point').forEach(point => {
    const show = () => {
      stopPlayback();
      const sample = results[Number(point.dataset.index)];
      video.currentTime = sample.time;
      showSample(sample);
    };
    point.addEventListener('click', show);
    point.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); }
    });
  });
  showSample(valid[0]);
  video.currentTime = valid[0].time;
  frameScrubber.max = results.length - 1;
  const rejected = results.length - valid.length;
  report(valid.length < results.length
    ? `${valid.length} plausible outlines found; ${rejected} ${rejected === 1 ? 'frame' : 'frames'} rejected. Inspect the overlays before using any numbers.`
    : 'Outlines proposed. Inspect each dot and its overlay; this is not a validated medical measurement.', 'success');
}

async function analyze() {
  if (busy || !captured) return;
  busy = true;
  updateActions();
  clearResults();
  modelLoading('EchoNet-RV is analyzing the selected video…');
  const snapshotTime = capturedTime;
  try {
    video.pause();
    const times = sampleTimes(snapshotTime, video.duration, Math.min(32, Math.max(15, Math.round(Math.min(Number(windowSlider.value), video.duration) * 20))), Number(windowSlider.value));
    if (!times.length) throw new Error('Video has no readable duration.');
    const results = [];
    const frames = [];
    for (let index = 0; index < times.length; index++) {
      report(`Sampling video frame ${index + 1} of ${times.length}…`);
      await seek(times[index]);
      frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
      const image = frameContext.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
      frames.push(frameCanvas.toDataURL('image/jpeg', 0.86).split(',')[1]);
      results.push({ time: times[index], image });
    }
    if (new Set(frames).size < 3) throw new Error('Video did not yield three distinct frames; check that it can be scrubbed');
    report('EchoNet-RV is tracing the sampled frames on this computer…');
    const response = await fetch('/rv-signal/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frames })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Server returned ${response.status}`);
    if (!Array.isArray(data.results) || data.results.length !== results.length) throw new Error('Unexpected inference result.');
    data.results.forEach((result, index) => Object.assign(results[index], result));
    await prepareMaskImages(results);
    samples = results;
    plot(results);
  } catch (error) {
    report(`No measurement produced: ${error.message}. Try again or use another clip.`, 'warning');
    document.querySelector('#usableValue').textContent = '—';
    document.querySelector('#changeValue').textContent = '—';
  } finally {
    busy = false;
    updateActions();
    modelReady(status.dataset.kind === 'warning' ? 'Analysis needs another video or window.' : 'EchoNet-RV results ready · Play video and outline in sync.');
  }
}

function choosePreset(preset) {
  if (busy) return;
  document.querySelectorAll('.preset-button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.matches(preset.button)));
  });
  document.querySelector('#sourceSubtitle').textContent = preset.title;
  document.querySelector('#resultSubtitle').textContent = preset.subtitle;
  setVideo(preset.source, preset.label, preset.start);
}

presets.forEach(preset => document.querySelector(preset.button).addEventListener('click', () => choosePreset(preset)));
document.querySelector('#fileInput').addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('video/')) {
    report('Choose a video file.', 'warning');
    return;
  }
  document.querySelectorAll('.preset-button').forEach(button => button.setAttribute('aria-pressed', 'false'));
  document.querySelector('#sourceSubtitle').textContent = 'Your selected video';
  document.querySelector('#resultSubtitle').textContent = 'Your selected video · unvalidated';
  setVideo(URL.createObjectURL(file), `Selected video: ${file.name} · frames sent to the server hosting this page`);
});
video.addEventListener('loadeddata', async () => {
  report(autoTime === null ? 'Play or scrub to a clear RV view, then capture a frame.' : 'Loading the example and tracing its right-heart outlines…');
  updateActions();
  if (autoTime === null) return;
  const target = autoTime;
  autoTime = null;
  try {
    await seek(target);
    capture();
    await analyze();
  } catch (error) {
    report(`Could not load this example: ${error.message}`, 'warning');
    modelReady('Could not analyze this video. Try another example.');
  }
});
video.addEventListener('error', () => {
  report('Could not load this video. Try another file or run the local server described in the README.', 'warning');
  modelReady('Could not load this video. Try another example.');
  updateActions();
});
captureButton.addEventListener('click', capture);
windowSlider.addEventListener('input', () => {
  document.querySelector('#windowValue').textContent = `${windowSlider.value} seconds`;
});
analyzeButton.addEventListener('click', analyze);
playbackButton.addEventListener('click', () => {
  if (playbackTimer) stopPlayback();
  else startPlayback();
});
frameScrubber.addEventListener('input', () => {
  stopPlayback();
  const sample = samples[Number(frameScrubber.value)];
  video.currentTime = sample.time;
  showSample(sample);
});
choosePreset(presets[0]);
