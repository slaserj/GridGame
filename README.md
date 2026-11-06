# GridGame — Midtown West ADMS Simulator

A browser-based distribution operations (ADMS) simulator for a fictional
13.8 kV / 208Y-120 V Manhattan-style secondary network. Everything runs
client-side in a single `index.html` — no build step.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (files at the repo root).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. The site will be live at `https://<user>.github.io/<repo>/` within a minute or two.

## Embedding elsewhere

```html
<iframe src="https://<user>.github.io/<repo>/" title="GridGame ADMS simulator"
        style="width:100%;height:1500px;border:0;background:#090d12"></iframe>
```

*Fictional network built for demonstration and training. Names, routes, device
IDs and loads are invented and do not represent any utility's actual system.*
