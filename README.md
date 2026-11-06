# GridGame — Midtown West Network

Two browser games built on one fictional 13.8 kV / 208Y-120 V Manhattan-style
secondary network. Everything runs client-side — no build step.

| Page | What it is |
|---|---|
| [`/`](index.html) | **ADMS simulator** — operate the network: switching, protectors, alarms, customer impact, shift scenarios |
| [`/der/`](der/index.html) | **DER interconnection planner** — connect PV, storage, CHP, fuel cells and EV charging; run screens, hosting capacity, hourly profiles and compare interconnection options |

Both pages load the same network model and power-flow engine from
[`js/gridengine.js`](js/gridengine.js).

Industry terms on both pages get hover tooltips from
[`js/glossary.js`](js/glossary.js). It finds terms in the rendered text
automatically, including content that re-renders, so to add or edit a definition,
change the `TERMS` list there.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (files at the repo root).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. The site is live at https://sim.jonesgrid.com/ (custom domain set in `CNAME`).

## Embedding in Squarespace

Paste the contents of [`squarespace-embed.html`](squarespace-embed.html) (ADMS)
or [`squarespace-embed-der.html`](squarespace-embed-der.html) (DER planner) into a
Squarespace **Code Block**. The game reports its height to the parent page via
`postMessage`, so the iframe resizes to fit with no inner scrollbar.

*Fictional network built for demonstration and training. Names, routes, device
IDs and loads are invented and do not represent any utility's actual system.*
