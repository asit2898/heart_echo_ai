# Heart Echo AI

I built a research demo that uses the [EchoNet-RV](https://github.com/echonet/RV) model to trace the right pumping chamber in heart-ultrasound video. It shows the video, its measured frame-by-frame area curve, and inspectable AI outlines alongside the standard measurements in a [published pulmonary-hypertension case](https://pmc.ncbi.nlm.nih.gov/articles/PMC13176855/#pul270319-tbl-0001). The case report does not include a matching ultrasound video: the working AI examples use separate teaching clips. This is not a clinical diagnostic tool or a measurement of 3D heart volume.

## Run locally

From this folder, with Python 3.10+, [uv](https://docs.astral.sh/uv/), and Node.js installed:

```sh
uv venv --python 3.10 rv-signal/.venv
uv pip install --python rv-signal/.venv/bin/python -r rv-signal/requirements.txt
mkdir -p rv-signal/.cache
curl -fL 'https://github.com/echonet/RV/releases/download/v1/segmentation.pt' -o rv-signal/.cache/segmentation.pt
shasum -a 256 rv-signal/.cache/segmentation.pt
rv-signal/.venv/bin/python rv-signal/server.py
```

The checkpoint's expected SHA-256 is `eca122d97ca03312aa701de401484c5e37e86693aadb76da64ffac4610e81eb5`. It is roughly 317 MB and is **not included** in this upload folder; the server verifies it before loading. Open `http://127.0.0.1:8767/rv-signal/index.html`. The first model run can take a few seconds. The app needs the Python server for inference; uploading this folder to GitHub alone does **not** host an interactive demo.

Run the numerical tests with `node --test rv-signal/analysis.test.mjs`. The optional browser check uses Playwright and an installed Chrome browser: `rv-signal/.venv/bin/python rv-signal/check_ui.py` (install `playwright` in the environment first).

## Sources and use

- The normal ultrasound clip comes from [CardioNetworks ECHOpedia via Wikimedia Commons](https://commons.wikimedia.org/wiki/File:A4C_normal_(CardioNetworks_ECHOpedia).webm), CC BY-SA 3.0.
- The other clip comes from the [published influenza cardiomyopathy video](https://commons.wikimedia.org/wiki/File:Influenza-Induced-Cardiomyopathy-An-Unusual-Cause-of-Hypoxemia-738146.f1.ogv) by Quddus, Afari & Minami, CC BY 3.0. The clips are not a paired PAH dataset.
- Case values are attributed to [Schneijdenberg et al., *Pulmonary Circulation* (2026), Table 1](https://pmc.ncbi.nlm.nih.gov/articles/PMC13176855/#pul270319-tbl-0001), CC BY-NC 4.0.
- The model checkpoint is downloaded from the [EchoNet-RV project](https://github.com/echonet/RV); review its license before redistributing weights or deploying the demo.

I only use permitted, de-identified footage. The browser sends frames to this Python server for inference; do not upload patient footage to an unapproved public demo. For the project pitch, see `HACKATHON_SUBMISSION_DRAFT.md`.
