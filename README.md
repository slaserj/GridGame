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

## Embedding in Squarespace

Paste the contents of [`squarespace-embed.html`](squarespace-embed.html) into a
Squarespace **Code Block**. The game reports its height to the parent page via
`postMessage`, so the iframe resizes to fit with no inner scrollbar.

*Fictional network built for demonstration and training. Names, routes, device
IDs and loads are invented and do not represent any utility's actual system.*
