/* ==========================================================================
   Midtown West Network — ADMS simulation engine
   Fictional 13.8 kV / 208Y-120 V Manhattan-style secondary network.
   Per-unit, phase-frame nodal current-injection power flow.
     UBLF : 3-phase unbalanced load flow (phase impedance matrices, per-phase loads)
     DPF  : balanced positive-sequence distribution power flow (single-phase equivalent)
   ========================================================================== */
(function (G) {
  'use strict';

  const SB = 1.0;                       // system base, MVA (3-phase)
  const VSET = 1.05;                    // 138 kV source / LTC-regulated set point, pu
  const NP = 1.0, NQ = 2.5;             // load voltage exponents (real ~ constant current, reactive ~ impedance-like)
  const TAU = 2 * Math.PI / 3;
  const PHA = [0, -TAU, TAU];
  const ZB = { mv: 13.8 * 13.8 / SB, lv: 0.208 * 0.208 / SB };

  /* ---------- dense complex LU ---------- */
  function luFactor(n, re, im) {
    const piv = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      let p = k, best = -1;
      for (let i = k; i < n; i++) {
        const m = re[i * n + k] ** 2 + im[i * n + k] ** 2;
        if (m > best) { best = m; p = i; }
      }
      if (best < 1e-30) throw new Error('Singular admittance matrix');
      piv[k] = p;
      if (p !== k) {
        for (let j = 0; j < n; j++) {
          let t = re[k * n + j]; re[k * n + j] = re[p * n + j]; re[p * n + j] = t;
          t = im[k * n + j]; im[k * n + j] = im[p * n + j]; im[p * n + j] = t;
        }
      }
      const pr = re[k * n + k], pi = im[k * n + k], d = pr * pr + pi * pi;
      for (let i = k + 1; i < n; i++) {
        const ar = re[i * n + k], ai = im[i * n + k];
        if (ar === 0 && ai === 0) continue;
        const lr = (ar * pr + ai * pi) / d, li = (ai * pr - ar * pi) / d;
        re[i * n + k] = lr; im[i * n + k] = li;
        for (let j = k + 1; j < n; j++) {
          const ur = re[k * n + j], ui = im[k * n + j];
          if (ur === 0 && ui === 0) continue;
          re[i * n + j] -= lr * ur - li * ui;
          im[i * n + j] -= lr * ui + li * ur;
        }
      }
    }
    return piv;
  }
  function luSolve(n, re, im, piv, br, bi) {
    for (let k = 0; k < n; k++) {
      const p = piv[k];
      if (p !== k) { let t = br[k]; br[k] = br[p]; br[p] = t; t = bi[k]; bi[k] = bi[p]; bi[p] = t; }
    }
    for (let i = 0; i < n; i++) {
      let sr = br[i], si = bi[i];
      for (let j = 0; j < i; j++) {
        const lr = re[i * n + j], li = im[i * n + j];
        if (lr === 0 && li === 0) continue;
        sr -= lr * br[j] - li * bi[j]; si -= lr * bi[j] + li * br[j];
      }
      br[i] = sr; bi[i] = si;
    }
    for (let i = n - 1; i >= 0; i--) {
      let sr = br[i], si = bi[i];
      for (let j = i + 1; j < n; j++) {
        const ur = re[i * n + j], ui = im[i * n + j];
        if (ur === 0 && ui === 0) continue;
        sr -= ur * br[j] - ui * bi[j]; si -= ur * bi[j] + ui * br[j];
      }
      const pr = re[i * n + i], pi = im[i * n + i], d = pr * pr + pi * pi;
      br[i] = (sr * pr + si * pi) / d; bi[i] = (si * pr - sr * pi) / d;
    }
  }
  function cinv(n, re, im) {
    const R = Float64Array.from(re), I = Float64Array.from(im);
    const piv = luFactor(n, R, I);
    const oR = new Float64Array(n * n), oI = new Float64Array(n * n);
    for (let c = 0; c < n; c++) {
      const br = new Float64Array(n), bi = new Float64Array(n); br[c] = 1;
      luSolve(n, R, I, piv, br, bi);
      for (let r = 0; r < n; r++) { oR[r * n + c] = br[r]; oI[r * n + c] = bi[r]; }
    }
    return { re: oR, im: oI };
  }
  function phaseZ(z1, z0) {
    const sr = (z0[0] + 2 * z1[0]) / 3, sx = (z0[1] + 2 * z1[1]) / 3;
    const mr = (z0[0] - z1[0]) / 3, mx = (z0[1] - z1[1]) / 3;
    const re = new Float64Array(9), im = new Float64Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      re[i * 3 + j] = i === j ? sr : mr; im[i * 3 + j] = i === j ? sx : mx;
    }
    return { re, im };
  }

  /* ---------- network model ---------- */
  const AVES = [{ n: '11 Av', k: '11', x: 0 }, { n: '10 Av', k: '10', x: 260 }, { n: '9 Av', k: '9', x: 520 }, { n: '8 Av', k: '8', x: 780 }];
  const STS = [{ n: 'W 52 St', num: 52, y: 0 }, { n: 'W 50 St', num: 50, y: 160 }, { n: 'W 48 St', num: 48, y: 320 }, { n: 'W 46 St', num: 46, y: 480 }, { n: 'W 44 St', num: 44, y: 640 }];
  const SUB = { x: -330, y: 300, name: 'Hudson Area Substation' };
  // feeder supplying the network transformer vault at [street][avenue]; 0 = no vault
  const VAULT_FEEDER = [[0, 1, 2, 3], [0, 5, 6, 1], [2, 3, 4, 5], [6, 1, 2, 3], [4, 5, 6, 4]];
  // spot loads at 100 % (summer peak): [kW 3-ph, description, pf, customers]
  const LOADS = [
    [[350, 'Residential towers', 0.96, 410], [505, 'Residential over retail', 0.94, 380], [650, 'Hotel', 0.90, 12], [800, 'Theater & hotel', 0.90, 9]],
    [[315, 'Parking garages', 0.92, 6], [530, 'Residential', 0.95, 520], [680, 'Office', 0.90, 14], [860, 'Office tower', 0.89, 3]],
    [[375, 'Auto showrooms', 0.91, 8], [580, 'Mixed use', 0.93, 240], [630, 'Restaurant row', 0.88, 46], [750, 'Theater district', 0.90, 11]],
    [[300, 'Residential walk-ups', 0.96, 330], [570, 'Mixed use', 0.93, 210], [615, 'Restaurant row', 0.88, 52], [815, 'Hotel & office', 0.90, 7]],
    [[430, 'Telecom hub', 0.95, 2], [500, 'Residential', 0.95, 470], [565, 'Retail', 0.91, 64], [680, 'Office', 0.90, 10]]
  ];
  const NTX_KVA = 1000;
  const FEEDER_RATING_A = 380;          // 500 kcmil Cu 3/c, normal
  // impedances (ohm/km)
  const PRI_Z1 = [0.090, 0.110], PRI_Z0 = [0.50, 0.30];             // 13.8 kV 500 kcmil 3/c
  const SEC_Z1 = [0.102 / 6, 0.082 / 6];                             // 6 x 500 kcmil 600 V per phase
  const SEC_Z0 = [SEC_Z1[0] * 3, SEC_Z1[1] * 3];

  function zPolar(mag, xr) { const r = mag / Math.sqrt(1 + xr * xr); return [r, r * xr]; }
  function scaleZ(zkm, km, zb) { return [zkm[0] * km / zb, zkm[1] * km / zb]; }

  function buildModel() {
    const nodes = [], branches = [], switches = [], loads = [], vaults = [], feeders = [], gridNodes = [], mains = [];
    const nIndex = new Map();
    const addNode = (id, kind, x, y, label) => { nIndex.set(id, nodes.length); nodes.push({ id, kind, x, y, label: label || id }); return id; };
    const addBr = (o) => { o.fi = nIndex.get(o.f); o.ti = nIndex.get(o.t); branches.push(o); return o; };
    const addSw = (o) => { o.fi = nIndex.get(o.f); o.ti = nIndex.get(o.t); switches.push(o); return o; };

    // Substation: 2 x 138/13.8 kV transformers, 2 bus sections, normally-open bus tie
    for (const k of [1, 2]) {
      addNode('HV' + k, 'hv', SUB.x, SUB.y, '138 kV supply ' + k);
      addNode('TR' + k + 'L', 'mv', SUB.x, SUB.y, 'TR' + k + ' 13.8 kV terminal');
      addNode('BUS' + k, 'mv', SUB.x, SUB.y, '13.8 kV bus section ' + k);
      const z = zPolar(0.10 * SB / 30, 30);
      addBr({ id: 'TR' + k, kind: 'subtx', f: 'HV' + k, t: 'TR' + k + 'L', z1: z, z0: z, ratingMVA: 30, label: 'TR' + k + ' 138/13.8 kV 30 MVA' });
      addSw({ id: 'CB-TR' + k, kind: 'cb', f: 'TR' + k + 'L', t: 'BUS' + k, normal: true, label: 'TR' + k + ' 13.8 kV main breaker', branch: 'TR' + k });
    }
    addSw({ id: 'CB-BT', kind: 'tie', f: 'BUS1', t: 'BUS2', normal: false, label: 'Bus tie breaker 1–2' });

    // Secondary grid nodes (208Y/120 V)
    STS.forEach((st, s) => AVES.forEach((av, a) => {
      const id = `N${st.num}-${av.k}`;
      addNode(id, 'lv', av.x, st.y, `${st.n} & ${av.n}`);
      const L = LOADS[s][a];
      const seed = Math.sin((s + 1) * 12.9898 + (a + 1) * 78.233) * 43758.5453;
      const r = (q) => (Math.abs(Math.sin(seed * q)) - 0.5) * 0.24;
      let w = [1 + r(1.3), 1 + r(2.7), 1 + r(4.1)];
      if (s === 3 && a === 0) w = [1.38, 0.90, 0.72];        // walk-ups: lopsided single-phase load
      const ws = w[0] + w[1] + w[2]; w = w.map(v => v * 3 / ws);
      const tan = Math.tan(Math.acos(L[2]));
      loads.push({ node: id, kw: L[0], pf: L[2], desc: L[1], cust: L[3],
        p: w.map(v => L[0] / 3 * v), q: w.map(v => L[0] / 3 * v * tan) });
      gridNodes.push({ id, s, a, label: `${st.n} & ${av.n}`, desc: L[1] });
    }));
    // Secondary mains: streets (E-W, 260 m) and avenues (N-S, 160 m)
    STS.forEach((st, s) => AVES.forEach((av, a) => {
      const id = `N${st.num}-${av.k}`;
      if (a < 3) { const to = `N${st.num}-${AVES[a + 1].k}`;
        mains.push(addBr({ id: `M:${id}>${to}`, kind: 'main', f: id, t: to, lenM: 260, z1: scaleZ(SEC_Z1, 0.26, ZB.lv), z0: scaleZ(SEC_Z0, 0.26, ZB.lv), ratingA: 2400, street: st.n })); }
      if (s < 4) { const to = `N${STS[s + 1].num}-${av.k}`;
        mains.push(addBr({ id: `M:${id}>${to}`, kind: 'main', f: id, t: to, lenM: 160, z1: scaleZ(SEC_Z1, 0.16, ZB.lv), z0: scaleZ(SEC_Z0, 0.16, ZB.lv), ratingA: 2400, street: av.n })); }
    }));

    // Network transformer vaults + protectors
    STS.forEach((st, s) => AVES.forEach((av, a) => {
      const f = VAULT_FEEDER[s][a]; if (!f) return;
      const key = `${st.num}-${av.k}`;
      const v = { id: 'V' + key, tr: 'TR' + key, np: 'NP' + key, node: `N${key}`, feeder: 'MW0' + f,
        x: av.x + 34, y: st.y + 34, label: `Vault ${key} · ${st.n} & ${av.n}` };
      addNode('P' + key, 'mv', v.x, v.y, `${v.tr} primary`);
      addNode('S' + key, 'lv', v.x, v.y, `${v.tr} secondary`);
      const z = zPolar(0.05 * SB / (NTX_KVA / 1000), 7);
      addBr({ id: v.tr, kind: 'ntx', f: 'P' + key, t: 'S' + key, z1: z, z0: z, ratingKVA: NTX_KVA, vault: v.id });
      addSw({ id: v.np, kind: 'np', f: 'S' + key, t: v.node, normal: true, label: `Network protector ${key}`, vault: v.id });
      vaults.push(v);
    }));

    // Primary feeders: breaker on alternate bus sections, cable chained through vaults
    for (let k = 1; k <= 6; k++) {
      const id = 'MW0' + k, bus = (k % 2) ? 1 : 2;
      const fv = vaults.filter(v => v.feeder === id);
      const chain = []; let cur = { x: SUB.x, y: SUB.y };
      const left = fv.slice();
      while (left.length) {
        left.sort((p, q) => (Math.abs(p.x - cur.x) + Math.abs(p.y - cur.y)) - (Math.abs(q.x - cur.x) + Math.abs(q.y - cur.y)));
        cur = left.shift(); chain.push(cur);
      }
      addNode(id + 'H', 'mv', SUB.x, SUB.y, id + ' feeder head');
      addSw({ id: 'CB-' + id, kind: 'cb', f: 'BUS' + bus, t: id + 'H', normal: true, label: `Feeder ${id} breaker`, feeder: id });
      let prev = id + 'H', px = SUB.x, py = SUB.y, total = 0; const segs = [];
      chain.forEach((v, i) => {
        const len = (Math.abs(v.x - px) + Math.abs(v.y - py)) * 1.12 + (i === 0 ? 220 : 40);
        total += len;
        const b = addBr({ id: `C:${id}:${i + 1}`, kind: 'cable', f: prev, t: 'P' + v.id.slice(1), lenM: Math.round(len),
          z1: scaleZ(PRI_Z1, len / 1000, ZB.mv), z0: scaleZ(PRI_Z0, len / 1000, ZB.mv), ratingA: FEEDER_RATING_A, feeder: id });
        segs.push(b.id); prev = b.t; px = v.x; py = v.y;
      });
      feeders.push({ id, bus, breaker: 'CB-' + id, vaults: chain.map(v => v.id), segs, lenM: Math.round(total), ratingA: FEEDER_RATING_A });
    }

    // precompute admittances
    for (const b of branches) {
      const Z3 = phaseZ(b.z1, b.z0);
      b.Y3 = cinv(3, Z3.re, Z3.im);
      const d = b.z1[0] ** 2 + b.z1[1] ** 2;
      b.Y1 = { re: Float64Array.of(b.z1[0] / d), im: Float64Array.of(-b.z1[1] / d) };
    }
    const brById = new Map(branches.map(b => [b.id, b]));
    const swById = new Map(switches.map(s => [s.id, s]));
    return { nodes, nIndex, branches, brById, switches, swById, loads, vaults, feeders, gridNodes, mains,
      AVES, STS, SUB, slacks: ['HV1', 'HV2'], NTX_KVA };
  }

  function createState(model) {
    const sw = {};
    for (const s of model.switches) sw[s.id] = { closed: s.normal, tag: false, manual: false, lockout: '' };
    return { sw, faults: {}, load: 0.85, vr: 0, dr: false, failed: {} };
  }

  /* ---------- topology ---------- */
  const brOut = (state, b) => !!(b.vault && state.failed && state.failed[b.vault]);
  function trace(model, isClosed, state) {
    const N = model.nodes.length, adj = Array.from({ length: N }, () => []);
    for (const b of model.branches) if (!brOut(state, b)) { adj[b.fi].push(b.ti); adj[b.ti].push(b.fi); }
    for (const s of model.switches) if (isClosed(s)) { adj[s.fi].push(s.ti); adj[s.ti].push(s.fi); }
    const seen = new Uint8Array(N), q = [];
    for (const id of model.slacks) { const i = model.nIndex.get(id); seen[i] = 1; q.push(i); }
    while (q.length) { const i = q.pop(); for (const j of adj[i]) if (!seen[j]) { seen[j] = 1; q.push(j); } }
    return seen;
  }

  function topology(model, state) {
    const N = model.nodes.length, parent = Int32Array.from({ length: N }, (_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (const s of model.switches) if (state.sw[s.id].closed) {
      const a = find(s.fi), b = find(s.ti); if (a !== b) parent[a] = b;
    }
    const rep = new Int32Array(N); for (let i = 0; i < N; i++) rep[i] = find(i);
    const energ = trace(model, s => state.sw[s.id].closed, state);
    const slackRep = new Set(model.slacks.map(id => rep[model.nIndex.get(id)]));
    return { rep, energ, slackRep };
  }

  /* ---------- power flow ---------- */
  function powerFlow(model, state, topo, nph) {
    const { rep, energ, slackRep } = topo;
    const N = model.nodes.length, idx = new Int32Array(N).fill(-1);
    let n = 0;
    for (let i = 0; i < N; i++) if (energ[i] && rep[i] === i && !slackRep.has(i)) idx[i] = n++;
    const M = n * nph;
    const vset = VSET * (1 - (state.vr || 0));
    const Vs = (ph) => [vset * Math.cos(nph === 3 ? PHA[ph] : 0), vset * Math.sin(nph === 3 ? PHA[ph] : 0)];
    const Yr = new Float64Array(M * M), Yi = new Float64Array(M * M), Cr = new Float64Array(M), Ci = new Float64Array(M);
    for (const b of model.branches) {
      const i = rep[b.fi], j = rep[b.ti];
      if (i === j || !energ[b.fi] || brOut(state, b)) continue;
      const Y = nph === 3 ? b.Y3 : b.Y1, ii = idx[i], jj = idx[j];
      for (let p = 0; p < nph; p++) for (let q = 0; q < nph; q++) {
        const yr = Y.re[p * nph + q], yi = Y.im[p * nph + q];
        if (ii >= 0) { Yr[(ii * nph + p) * M + ii * nph + q] += yr; Yi[(ii * nph + p) * M + ii * nph + q] += yi; }
        if (jj >= 0) { Yr[(jj * nph + p) * M + jj * nph + q] += yr; Yi[(jj * nph + p) * M + jj * nph + q] += yi; }
        if (ii >= 0 && jj >= 0) {
          Yr[(ii * nph + p) * M + jj * nph + q] -= yr; Yi[(ii * nph + p) * M + jj * nph + q] -= yi;
          Yr[(jj * nph + p) * M + ii * nph + q] -= yr; Yi[(jj * nph + p) * M + ii * nph + q] -= yi;
        } else {
          const f = ii >= 0 ? ii : jj; const [vr, vi] = Vs(q);
          if (f >= 0) { Cr[f * nph + p] += yr * vr - yi * vi; Ci[f * nph + p] += yr * vi + yi * vr; }
        }
      }
    }
    // loads: wye, exponential voltage dependence P = P0|V|^NP, Q = Q0|V|^NQ (pu of per-phase base)
    const Sph = SB * 1000 / 3, Lr = new Float64Array(M), Li = new Float64Array(M), hasLoad = new Uint8Array(M);
    for (const L of model.loads) {
      const i = model.nIndex.get(L.node); if (!energ[i]) continue;
      const k = idx[rep[i]]; if (k < 0) continue;
      for (let p = 0; p < nph; p++) {
        const P = nph === 3 ? L.p[p] : L.kw / 3, Q = nph === 3 ? L.q[p] : L.kw / 3 * Math.tan(Math.acos(L.pf));
        const fct = loadFactor(state, L);
        Lr[k * nph + p] += P * fct / Sph; Li[k * nph + p] += Q * fct / Sph; hasLoad[k * nph + p] = 1;
      }
    }
    // DER / extra constant-power loads: state.gen = [{ node, p: kW 3-ph (+ = generating), q: kvar 3-ph (+ = exporting vars) }]
    const Gp = new Float64Array(M), Gq = new Float64Array(M), hasGen = new Uint8Array(M);
    for (const g of (state.gen || [])) {
      const i = model.nIndex.get(g.node); if (i === undefined || !energ[i]) continue;
      const k = idx[rep[i]]; if (k < 0) continue;
      for (let p = 0; p < nph; p++) { Gp[k * nph + p] += g.p / 3 / Sph; Gq[k * nph + p] += (g.q || 0) / 3 / Sph; hasGen[k * nph + p] = 1; }
    }
    const Vr = new Float64Array(M), Vi = new Float64Array(M);
    for (let k = 0; k < n; k++) for (let p = 0; p < nph; p++) { const [a, b] = Vs(p); Vr[k * nph + p] = a; Vi[k * nph + p] = b; }
    let iters = 0, converged = M === 0;
    if (M > 0) {
      const piv = luFactor(M, Yr, Yi);
      for (iters = 1; iters <= 60; iters++) {
        const br = Float64Array.from(Cr), bi = Float64Array.from(Ci);
        for (let m = 0; m < M; m++) if (hasLoad[m]) {
          const d = Vr[m] * Vr[m] + Vi[m] * Vi[m], vm = Math.sqrt(d);
          const P = Lr[m] * Math.pow(vm, NP), Q = Li[m] * Math.pow(vm, NQ);
          // I = conj(S/V) = (P - jQ)/conj(V) ; injection = -I
          const ir = (P * Vr[m] + Q * Vi[m]) / d, ii = (P * Vi[m] - Q * Vr[m]) / d;
          br[m] -= ir; bi[m] -= ii;
        }
        for (let m = 0; m < M; m++) if (hasGen[m]) {
          const d = Vr[m] * Vr[m] + Vi[m] * Vi[m];
          br[m] += (Gp[m] * Vr[m] + Gq[m] * Vi[m]) / d; bi[m] += (Gp[m] * Vi[m] - Gq[m] * Vr[m]) / d;
        }
        luSolve(M, Yr, Yi, piv, br, bi);
        let dmax = 0;
        for (let m = 0; m < M; m++) { dmax = Math.max(dmax, Math.abs(br[m] - Vr[m]) + Math.abs(bi[m] - Vi[m])); Vr[m] = br[m]; Vi[m] = bi[m]; }
        if (dmax < 1e-9) { converged = true; break; }
      }
    }
    // node voltages
    const V = (nodeIdx) => {
      if (!energ[nodeIdx]) return null;
      const r = rep[nodeIdx];
      if (slackRep.has(r)) return Array.from({ length: nph }, (_, p) => Vs(p));
      const k = idx[r]; return Array.from({ length: nph }, (_, p) => [Vr[k * nph + p], Vi[k * nph + p]]);
    };
    const nodeV = model.nodes.map((_, i) => V(i));
    // branch currents (from -> to) and from-end power
    const brRes = {};
    for (const b of model.branches) {
      const vf = nodeV[b.fi], vt = nodeV[b.ti];
      if (!vf || !vt || brOut(state, b)) { brRes[b.id] = null; continue; }
      const Y = nph === 3 ? b.Y3 : b.Y1, I = [], S = [];
      for (let p = 0; p < nph; p++) {
        let ir = 0, ii = 0;
        for (let q = 0; q < nph; q++) {
          const dr = vf[q][0] - vt[q][0], di = vf[q][1] - vt[q][1], yr = Y.re[p * nph + q], yi = Y.im[p * nph + q];
          ir += yr * dr - yi * di; ii += yr * di + yi * dr;
        }
        I.push([ir, ii]);
        S.push([vf[p][0] * ir + vf[p][1] * ii, vf[p][1] * ir - vf[p][0] * ii]); // V*conj(I)
      }
      brRes[b.id] = { I, S };
    }
    return { nph, nodeV, brRes, iters, converged };
  }

  /* ---------- study: automatic logic + UBLF + DPF ---------- */
  function runStudy(model, state) {
    const events = [];
    for (const f of model.feeders) {
      const s = state.sw[f.breaker];
      if (state.faults[f.id] && s.closed) { s.closed = false; s.lockout = 'Primary cable fault'; events.push({ sev: 'crit', dev: f.breaker, msg: `${f.id} breaker TRIPPED — primary cable fault, lockout` }); }
    }
    for (const k of [1, 2]) {
      const s = state.sw['CB-TR' + k];
      if (state.faults['TR' + k] && s.closed) { s.closed = false; s.lockout = 'Transformer differential relay'; events.push({ sev: 'crit', dev: 'CB-TR' + k, msg: `TR${k} main breaker TRIPPED — differential relay, transformer fault` }); }
    }
    // Network protector relays: trip on reverse power when the primary feeder is lost,
    // auto-close when the primary is re-energized (unless blocked open by the operator).
    const prim = trace(model, s => s.kind !== 'np' && state.sw[s.id].closed, state);
    for (const s of model.switches) if (s.kind === 'np') {
      const st = state.sw[s.id], want = !st.manual && !!prim[s.fi];
      if (st.closed !== want) {
        st.closed = want;
        if (!st.manual) events.push(want
          ? { sev: 'info', dev: s.id, msg: `${s.id} auto-CLOSED — primary feeder restored` }
          : { sev: 'high', dev: s.id, msg: `${s.id} OPENED on reverse power — primary feeder de-energized` });
      }
    }
    const topo = topology(model, state);
    const ublf = powerFlow(model, state, topo, 3);
    const dpf = powerFlow(model, state, topo, 1);
    return { events, topo, ublf, dpf, summary: summarize(model, state, topo, ublf, dpf) };
  }

  /* ---------- engineering results ---------- */
  const mag = (c) => Math.hypot(c[0], c[1]);
  // demand response curtails commercial loads (pf < 0.93) by 15 %
  function loadFactor(state, L) { const sc = state.loadScale && state.loadScale[L.node]; return state.load * (sc == null ? 1 : sc) * (state.dr && L.pf < 0.93 ? 0.85 : 1); }
  function genP(model, state, pf) { return (state.gen || []).reduce((a, g) => a + (pf.nodeV[model.nIndex.get(g.node)] ? g.p : 0), 0); }
  function summarize(model, state, topo, ublf, dpf) {
    const kA = (pu, kv) => pu * SB * 1000 / (Math.sqrt(3) * kv);   // pu current -> amps
    const kWph = SB * 1000 / 3;
    const one = (pf) => {
      const nph = pf.nph, out = { feeders: {}, vaults: {}, nodes: {}, subtx: {} };
      let Pin = 0, Qin = 0, Pload = 0, Qload = 0, minV = Infinity, maxV = -Infinity, minNode = '', maxNode = '', maxTR = 0, maxTRid = '', maxVUF = 0, vufNode = '';
      for (const k of [1, 2]) {
        const r = pf.brRes['TR' + k];
        const P = r ? r.S.reduce((a, s) => a + s[0], 0) * kWph * (3 / nph) : 0;
        const Q = r ? r.S.reduce((a, s) => a + s[1], 0) * kWph * (3 / nph) : 0;
        Pin += P; Qin += Q; out.subtx['TR' + k] = { P, Q, pct: Math.hypot(P, Q) / 30000 * 100 };
      }
      for (const f of model.feeders) {
        const r = pf.brRes[f.segs[0]], closed = state.sw[f.breaker].closed;
        const I = r && closed ? r.I.map(c => kA(mag(c), 13.8)) : [0, 0, 0].slice(0, nph);
        const P = r && closed ? r.S.reduce((a, s) => a + s[0], 0) * kWph * (3 / nph) : 0;
        const Q = r && closed ? r.S.reduce((a, s) => a + s[1], 0) * kWph * (3 / nph) : 0;
        const head = pf.nodeV[model.nIndex.get(f.id + 'H')];
        out.feeders[f.id] = { I, Imax: Math.max(...I), P, Q, energized: !!head && closed,
          kV: head ? head.map(c => mag(c) * 13.8) : null,
          npClosed: f.vaults.filter(v => state.sw['NP' + v.slice(1)].closed).length, npTotal: f.vaults.length };
      }
      for (const v of model.vaults) {
        const r = pf.brRes[v.tr];
        const I = r ? r.I.map(c => mag(c)) : null;   // pu on 1 MVA = 1.0 pu rated
        const P = r ? r.S.reduce((a, s) => a + s[0], 0) * kWph * (3 / nph) : 0;
        const pct = I ? Math.max(...I) / (model.NTX_KVA / 1000 / SB) * 100 : 0;
        const Ia = I ? I.map(x => kA(x, 0.208)) : null;
        out.vaults[v.id] = { pct, P, Ia, energized: !!r };
        if (state.sw[v.np].closed && pct > maxTR) { maxTR = pct; maxTRid = v.id; }
      }
      let custOut = 0, kwOut = 0;
      for (const L of model.loads) {
        const vv = pf.nodeV[model.nIndex.get(L.node)];
        if (!vv) { custOut += L.cust; kwOut += L.kw * loadFactor(state, L); out.nodes[L.node] = { V: null }; continue; }
        const mags = vv.map(c => mag(c) * 120);
        const fct = loadFactor(state, L), qph = nph === 3 ? L.q : [L.kw / 3 * Math.tan(Math.acos(L.pf))], pph = nph === 3 ? L.p : [L.kw / 3];
        vv.forEach((c, p) => { const m = mag(c); Pload += pph[p] * fct * Math.pow(m, NP) * (3 / nph); Qload += qph[p] * fct * Math.pow(m, NQ) * (3 / nph); });
        const lo = Math.min(...mags), hi = Math.max(...mags);
        if (lo < minV) { minV = lo; minNode = L.node; }
        if (hi > maxV) { maxV = hi; maxNode = L.node; }
        const avg = mags.reduce((a, b) => a + b, 0) / mags.length, vuf = Math.max(...mags.map(m => Math.abs(m - avg))) / avg * 100;
        if (vuf > maxVUF) { maxVUF = vuf; vufNode = L.node; }
        out.nodes[L.node] = { V: mags, min: lo, vuf };
      }
      out.tot = { P: Pin, Q: Qin, pf: Pin > 0 ? Pin / Math.hypot(Pin, Qin) : 0, losses: Math.max(0, Pin + genP(model, state, pf) - Pload), Pload, Qload,
        minV: isFinite(minV) ? minV : 0, maxV: isFinite(maxV) ? maxV : 0, minNode, maxNode, maxTR, maxTRid, maxVUF, vufNode,
        custOut, kwOut, iters: pf.iters, converged: pf.converged };
      return out;
    };
    const U = one(ublf), D = one(dpf);
    const out = model.feeders.filter(f => !state.sw[f.breaker].closed || !U.feeders[f.id].energized).length;
    return { U, D, contingency: out };
  }

  /* ---------- short circuit: bolted 3-phase fault, positive sequence ---------- */
  // Utility source at 138 kV is ideal. Synchronous DER enter as X''d shunts; inverter DER as current sources
  // limited to ixf x rated current, transferred to the fault point through Zbus (superposition).
  function shortCircuit(model, state, topo, sources, at) {
    const { rep, energ, slackRep } = topo, N = model.nodes.length, idx = new Int32Array(N).fill(-1);
    let n = 0;
    for (let i = 0; i < N; i++) if (energ[i] && rep[i] === i && !slackRep.has(i)) idx[i] = n++;
    const build = (withSync) => {
      const Yr = new Float64Array(n * n), Yi = new Float64Array(n * n);
      for (const b of model.branches) {
        const i = rep[b.fi], j = rep[b.ti]; if (i === j || !energ[b.fi] || brOut(state, b)) continue;
        const yr = b.Y1.re[0], yi = b.Y1.im[0], ii = idx[i], jj = idx[j];
        if (ii >= 0) { Yr[ii * n + ii] += yr; Yi[ii * n + ii] += yi; }
        if (jj >= 0) { Yr[jj * n + jj] += yr; Yi[jj * n + jj] += yi; }
        if (ii >= 0 && jj >= 0) { Yr[ii * n + jj] -= yr; Yi[ii * n + jj] -= yi; Yr[jj * n + ii] -= yr; Yi[jj * n + ii] -= yi; }
      }
      if (withSync) for (const s of sources) if (s.kind === 'sync') {
        const k = idx[rep[model.nIndex.get(s.node)]]; if (k < 0) continue;
        Yi[k * n + k] += -(s.kva / 1000 / SB) / s.xd;          // y = S / (j X''d) on system base
      }
      return cinv(n, Yr, Yi);
    };
    const hasSync = sources.some(s => s.kind === 'sync');
    const Z0 = build(false), Z = hasSync ? build(true) : Z0;
    const out = {};
    for (const id of at) {
      const i = model.nIndex.get(id); if (!energ[i]) { out[id] = null; continue; }
      const k = idx[rep[i]], kv = model.nodes[i].kind === 'lv' ? 0.208 : 13.8, Ib = SB * 1000 / (Math.sqrt(3) * kv) / 1000;  // kA base
      const grid = Ib / Math.hypot(Z0.re[k * n + k], Z0.im[k * n + k]);
      const zz = Math.hypot(Z.re[k * n + k], Z.im[k * n + k]), withSync = Ib / zz;
      let inv = 0;
      for (const s of sources) if (s.kind === 'inv') {
        const j = idx[rep[model.nIndex.get(s.node)]]; if (j < 0) continue;
        inv += (s.ixf || 1.2) * (s.kva / 1000 / SB) * Math.hypot(Z.re[k * n + j], Z.im[k * n + j]) / zz * Ib;
      }
      out[id] = { grid, sync: withSync - grid, inv, total: withSync + inv };
    }
    return out;
  }

  G.GridEngine = { buildModel, createState, runStudy, loadFactor, topology, powerFlow, shortCircuit, trace, constants: { SB, VSET, ZB, NP, NQ } };
})(typeof window !== 'undefined' ? window : globalThis);
