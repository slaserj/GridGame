/* ==========================================================================
   GridGame glossary tooltips — shared by the ADMS simulator and DER planner.
   Finds industry terms in rendered text (including re-rendered content and
   SVG labels), marks them with a dotted underline, and explains them on hover
   after a short delay. Touch: tap a term to show it, tap elsewhere to close.
   ========================================================================== */
(function () {
  'use strict';

  // [pattern, title, definition, caseSensitive]. Definitions may be functions of the matched text.
  // Longer / more specific patterns first: the first alternative that matches at a position wins.
  const TERMS = [
    // ---------- device IDs (Midtown West naming) ----------
    ['CB-MW0[1-6]', (m) => `Feeder breaker ${m}`, (m) => `Circuit breaker at Hudson substation that feeds 13.8 kV primary feeder ${m.slice(3)}. Opening it de-energizes the whole feeder, and its network protectors then open on reverse power.`, 1],
    ['CB-TR[12]', (m) => `Transformer main breaker ${m}`, (m) => `Breaker connecting substation transformer ${m.slice(3)} to its 13.8 kV bus section. It trips automatically when the transformer's differential relay detects an internal fault.`, 1],
    ['CB-BT', 'Bus tie breaker', 'Normally open breaker between the two 13.8 kV bus sections. Closing it lets one substation transformer carry both bus sections after the other is lost.', 1],
    ['NP\\d\\d-\\d+', (m) => `Network protector ${m.slice(2)}`, (m) => `The automatic low-voltage breaker between network transformer TR${m.slice(2)} and the street grid. It opens on reverse power and recloses when its feeder is re-energized.`, 1],
    ['TR\\d\\d-\\d+', (m) => `Network transformer ${m}`, (m) => `A 1,000 kVA, 13.8 kV to 208Y/120 V transformer in vault ${m.slice(2)}, feeding the secondary grid through network protector NP${m.slice(2)}.`, 1],
    ['TR[12]', (m) => `Substation transformer ${m}`, '138 kV to 13.8 kV, 30 MVA power transformer at Hudson substation. Each one supplies one 13.8 kV bus section.', 1],
    ['MW0[1-6]', (m) => `Feeder ${m}`, (m) => `13.8 kV primary feeder ${m}: an underground cable from Hudson substation that loops through three network transformer vaults.`, 1],
    ['BUS [12]', (m) => m, '13.8 kV bus section at the substation. Odd-numbered feeders hang off bus 1 and even-numbered feeders off bus 2.', 1],

    // ---------- standards & certifications ----------
    ['IEEE 1547(?:-2018)?', 'IEEE 1547', 'The US standard for interconnecting distributed energy resources: voltage and frequency ride-through, trip settings, anti-islanding and smart-inverter functions.', 1],
    ['UL 1741(?: SB| CRD| PCS)?', (m) => m, 'Safety certification for inverters. The SB supplement tests IEEE 1547-2018 grid-support functions; the CRD for power control systems certifies export and import limiting.', 1],
    ['ANSI C84\\.1', 'ANSI C84.1', 'The US standard for service voltage. Range A (114–126 V on a 120 V base) is the normal operating band; Range B is tolerated only briefly.', 1],
    ['ANSI Range A|Range A', 'ANSI Range A', 'The normal service-voltage band from ANSI C84.1: 114 V to 126 V on a 120 V base (±5 %).'],
    ['NEC 625\\.42', 'NEC 625.42', 'National Electrical Code rule that lets an energy management system limit EV charging so the service can be sized to the managed load.', 1],
    ['Article 750|Art\\. 750', 'NEC Article 750', 'National Electrical Code article for energy management systems that control loads and sources to stay within a set limit.', 1],
    ['Cat(?:egory)? B / III|Cat(?:egory)? B', 'IEEE 1547 categories', 'Category B is the reactive-power capability for high-penetration DER (it supports Volt-VAR). Category III is the most demanding ride-through capability.', 1],
    ['X″d|X\'\'d', 'Subtransient reactance (X″d)', 'The internal reactance of a synchronous machine in the first cycles of a fault. Lower X″d means more fault current.', 1],
    ['25 sync-check', 'Device 25 · sync-check', 'Relay that permits closing only when the generator and grid voltage, frequency and phase angle match.', 1],
    ['27/59', 'Devices 27/59', 'Undervoltage (27) and overvoltage (59) relays. They trip the generator when voltage leaves its allowed band.', 1],
    ['81 O/U', 'Device 81 O/U', 'Over- and under-frequency relay. It trips the generator when frequency leaves its allowed band, a key anti-islanding check.', 1],
    ['51V', 'Device 51V', 'Voltage-restrained overcurrent relay used on synchronous generators, whose fault current decays quickly.', 1],
    ['32R', 'Reverse power relay (32R)', 'Protective relay (ANSI device 32) that trips when power flows from the customer toward the utility. Used to enforce non-export.', 1],

    // ---------- acronyms ----------
    ['ADMS', 'ADMS', 'Advanced Distribution Management System: the control-room software that combines SCADA, network models, power flow and switching management.', 1],
    ['SCADA', 'SCADA', 'Supervisory Control and Data Acquisition: remote telemetry and control of field devices such as breakers and network protectors.', 1],
    ['DERMS', 'DERMS', 'Distributed Energy Resource Management System: utility software that monitors DER and sends real-time limits or dispatch commands.', 1],
    ['DERs?', 'DER', 'Distributed energy resource: generation, storage or controllable load connected to the distribution system, such as rooftop solar, batteries, CHP or EV charging.', 1],
    ['UBLF', 'UBLF', 'Unbalanced load flow: a three-phase power flow that models each phase separately, capturing unequal phase loads and voltage unbalance.', 1],
    ['DPF', 'DPF', 'Distribution power flow in its balanced form: a single-phase positive-sequence equivalent. Faster, but it cannot show phase unbalance.', 1],
    ['LTC', 'LTC', 'Load tap changer: switches transformer taps under load to hold the substation bus voltage at its set point.', 1],
    ['PCS', 'Power control system (PCS)', 'Controls that limit a DER site\'s export or import at the meter to a set value, certified to UL 1741 CRD.', 1],
    ['MIR', 'Minimum import relay (MIR)', 'Relay that keeps the site importing at least a set share of its load, so it never exports into the network.', 1],
    ['CHP', 'CHP', 'Combined heat and power: an on-site engine or turbine that generates electricity and uses the waste heat for heating or cooling.', 1],
    ['PV', 'PV', 'Photovoltaic solar: panels producing DC power, converted to AC by an inverter.', 1],
    ['EV', 'EV', 'Electric vehicle. EV fast-charging hubs are large, peaky loads that planners treat like DER.', 1],
    ['EMS', 'EMS', 'Energy management system: on-site controls that cap total load, for example EV charging, at a set kW.', 1],
    ['PCC', 'PCC', 'Point of common coupling: where the customer\'s facility connects to the utility system.', 1],
    ['DTT', 'Direct transfer trip', 'A communication-based trip signal from the utility breaker to the generator, used where islanding cannot otherwise be ruled out.', 1],
    ['NP', 'Network protector (NP)', 'Automatic breaker between a network transformer and the secondary grid. It opens on reverse power so a faulted feeder is not back-fed from the grid.', 1],
    ['PF|pf', 'Power factor', 'Ratio of real power (kW) to apparent power (kVA). 1.0 means all current does useful work; lower values mean more reactive current.', 1],
    ['MVAR|kvar', 'Reactive power', 'Power that sustains electric and magnetic fields without doing work. It loads equipment and affects voltage.', 1],
    ['MVA|kVA', 'Apparent power', 'The total power a device carries, combining real and reactive power. Transformers are rated in kVA or MVA.', 1],
    ['kV', 'kilovolt', 'Thousand volts. 138 kV is subtransmission, 13.8 kV the primary distribution voltage here.', 1],
    ['N-[0-3]', 'N-1 contingency', 'Network security level. N-0 is everything in service; N-1 means one primary feeder is out and the rest must still carry the load.', 1],

    // ---------- network equipment ----------
    ['network protectors?|protectors?', 'Network protector', 'Automatic breaker between a network transformer and the secondary grid. It opens on reverse power, which normally means its feeder is faulted, and recloses when the feeder returns. DER export can also trip it.'],
    ['network transformers?', 'Network transformer', 'Vault transformer stepping 13.8 kV down to 208Y/120 V. Many of them feed one meshed street grid in parallel.'],
    ['secondary network|secondary grid|network grid', 'Secondary network', 'A meshed 208Y/120 V street grid fed by many network transformers in parallel. Losing one feeder causes no outage, which makes it very reliable but hard to export DER into.'],
    ['secondary mains?', 'Secondary main', 'The low-voltage cables under each street that tie the grid nodes together into one mesh.'],
    ['primary feeders?|feeders?', 'Primary feeder', 'A 13.8 kV cable circuit from the substation to a group of network transformers.'],
    ['vaults?', 'Transformer vault', 'Underground room, usually under the sidewalk, holding a network transformer and its network protector.'],
    ['grid nodes?', 'Grid node', 'A street intersection on the secondary grid where mains meet and customer loads connect.'],
    ['bus tie', 'Bus tie', 'Normally open breaker joining the two 13.8 kV bus sections. Closing it lets one transformer serve both sections.'],
    ['bus sections?', 'Bus section', 'One half of the substation\'s 13.8 kV switchgear, normally fed by its own transformer.'],
    ['one-line', 'One-line diagram', 'A simplified schematic that draws three-phase equipment as single lines and symbols.'],
    ['substation', 'Substation', 'Where 138 kV supply is stepped down to 13.8 kV and switched onto the distribution feeders.'],

    // ---------- operations ----------
    ['select-before-operate', 'Select-before-operate', 'SCADA safety pattern: the operator first selects a device and action, then confirms within a time limit before the command is sent.'],
    ['hold tags?', 'Hold tag', 'A safety tag placed on a device so it cannot be operated while crews are working under that clearance.'],
    ['clearance', 'Clearance', 'Formal permission for a crew to work on equipment that has been isolated, de-energized and tagged.'],
    ['lockout', 'Lockout', 'A breaker that has tripped on a fault and will not reclose automatically. It needs investigation before being closed again.'],
    ['reverse power', 'Reverse power', 'Power flowing from the secondary grid back into a network transformer. Protectors trip on it to stop back-feeding a faulted feeder; DER export can cause it too.'],
    ['differential (?:relay|protection)', 'Differential protection', 'Transformer protection that compares current entering and leaving. A mismatch means an internal fault, and the breakers trip.'],
    ['phase-to-ground fault|cable fault', 'Cable fault', 'Insulation failure that lets current flow from a conductor to ground. The feeder breaker trips to clear it.'],
    ['voltage reduction', 'Voltage reduction', 'Lowering the substation voltage set point by a few percent to cut demand during emergencies (conservation voltage reduction).'],
    ['demand response', 'Demand response', 'Paying or asking customers to cut load during peak periods. Here it curtails commercial loads by 15 %.'],
    ['power flow|load flow', 'Power flow', 'A study that solves voltages and currents everywhere in the network for a given load and configuration.'],
    ['power factor', 'Power factor', 'Ratio of real power (kW) to apparent power (kVA). 1.0 means all current does useful work.'],
    ['reactive (?:power|demand)', 'Reactive power', 'Power that sustains electric and magnetic fields without doing useful work. It loads equipment and affects voltage.'],
    ['losses', 'Losses', 'Power dissipated as heat in cables and transformers (I²R losses): the difference between power supplied and power delivered.'],
    ['voltage unbalance|phase unbalance', 'Voltage unbalance', 'Difference between the three phase voltages. Above about 2 % it overheats three-phase motors.'],
    ['emergency rating', 'Emergency rating', 'The short-time loading a transformer can carry, here 130 %, at the cost of faster insulation aging.'],
    ['hot-spot', 'Hot-spot temperature', 'The hottest point in a transformer winding. Sustained overload drives it up until insulation fails.'],
    ['contingency', 'Contingency', 'An outage of one or more components. Planners check that the network still works under credible contingencies.'],
    ['customer-minutes interrupted', 'Customer-minutes interrupted', 'Customers out multiplied by minutes out: the basis of reliability indices such as SAIDI.'],
    ['smoking manholes?', 'Smoking manhole', 'Overheated cable insulation under the street giving off smoke, often reported by the public before any alarm.'],

    // ---------- planning / DER ----------
    ['hosting capacity', 'Hosting capacity', 'How much DER can connect at a location before a voltage, thermal, protection or reverse-power limit is exceeded, without upgrades.'],
    ['interconnection queue', 'Interconnection queue', 'Applications waiting for study, in order of arrival. Each is studied with the earlier ones already connected.'],
    ['point of interconnection', 'Point of interconnection', 'Where the DER connects to the utility system, also called the PCC.'],
    ['net metering', 'Net metering', 'Billing that credits exported energy against imported energy, so the customer exports freely.'],
    ['full export', 'Full export', 'The DER may export any surplus to the grid without a limit.'],
    ['export cap', 'Export cap', 'A fixed maximum on power exported at the meter, enforced by a power control system.'],
    ['non-export', 'Non-export', 'The site never sends power to the grid; output is held at or below site load, usually by a reverse power relay.'],
    ['minimum import relay|min\\. import', 'Minimum import relay', 'Keeps the site importing at least a set share of its load, here 10 %, so it never backfeeds the network.'],
    ['flexible interconnection|flexible connection|flexible load', 'Flexible interconnection', 'Connection where the utility\'s DERMS sends dynamic export or import limits, curtailing only when the network is constrained. Faster and cheaper than upgrades.'],
    ['curtail(?:ed|ment|s|ing)?', 'Curtailment', 'Reducing DER output, or charging load, below what is available, to respect a network or contractual limit.'],
    ['anti-islanding', 'Anti-islanding', 'Protection that stops DER from keeping a de-energized part of the grid alive, protecting crews and equipment.'],
    ['transfer trip', 'Direct transfer trip', 'A communication-based trip signal from the utility breaker to the generator.'],
    ['synchronous machine|synchronous generator|synchronous', 'Synchronous machine', 'A rotating generator, like a CHP engine, locked to grid frequency. It contributes several times its rated current into faults.'],
    ['inverters?', 'Inverter', 'Power electronics converting DC (solar, battery, fuel cell) to AC. Fault current is limited to about 1.1–1.2 × rating, and they can provide smart grid functions.'],
    ['Volt-VAR', 'Volt-VAR', 'Smart-inverter function that absorbs reactive power when voltage is high and supplies it when low, flattening DER voltage rise.'],
    ['fault current|fault duty', 'Fault current', 'Current that flows into a short circuit. Equipment must be able to interrupt or withstand it; DER adds to it.'],
    ['capacity factor', 'Capacity factor', 'Energy actually delivered in a year divided by nameplate output for every hour. NYC rooftop solar is typically 13–16 %.'],
    ['light load|light-load', 'Light-load case', 'Planning case with low network demand and DER at full output: the worst case for reverse power and voltage rise.'],
    ['summer peak', 'Summer peak case', 'Planning case at the highest network demand: the worst case for thermal overload and low voltage.'],
    ['line-drop compensation', 'Line-drop compensation', 'LTC control that raises the set point with load and lowers it at light load, approximating constant voltage at customers.'],
    ['nameplate', 'Nameplate rating', 'The rated maximum output of a device, used as the conservative planning assumption.'],
    ['fast track', 'Fast track', 'Simplified review for small, low-impact DER that passes all screens.'],
    ['supplemental review', 'Supplemental review', 'Additional engineering review for projects that pass but are large, synchronous, or near a limit.'],
    ['detailed impact study', 'Detailed impact study', 'Full engineering study, with power flow, protection and fault analysis, required when screens fail or upgrades are needed.'],
    ['penetration', 'DER penetration', 'DER capacity as a share of load. High penetration on a secondary network risks protector reverse power.'],
    ['peak[- ]shaving', 'Peak shaving', 'Discharging storage, or curtailing load, during peak hours to lower the maximum demand on equipment.'],
    ['voltage (?:change|rise|drop)', 'Voltage change', 'How much voltage moves when DER starts or trips, or a load turns on. Large steps cause visible flicker.'],
    ['steady-state voltage', 'Steady-state voltage', 'Sustained voltage under normal conditions, which must stay within ANSI Range A.'],
    ['thermal loading', 'Thermal loading', 'Current carried as a share of equipment rating. Overloads heat insulation and shorten equipment life.'],
    ['fuel cells?', 'Fuel cell', 'Converts natural gas or hydrogen to electricity electrochemically, running steadily around the clock through an inverter.']
  ];

  /* ---------- compile ---------- */
  const entries = TERMS.map(([p, title, def, cs]) => ({ p, title, def, cs: !!cs, re: new RegExp('^(?:' + p + ')$', cs ? '' : 'i') }));
  const B = (list, flags) => list.length ? new RegExp('(?<![\\w\\-/.])(?:' + list.map(e => '(?:' + e.p + ')').join('|') + ')(?![\\w])', flags) : null;
  const RE_CS = B(entries.filter(e => e.cs), 'g'), RE_CI = B(entries.filter(e => !e.cs), 'gi');
  const lookup = (s) => entries.find(e => e.re.test(s));
  const SKIP = 'script, style, textarea, input, select, option, .gterm, #gtip, [data-gloss-off]';
  const SVGNS = 'http://www.w3.org/2000/svg';

  function matches(text) {
    const out = [];
    for (const re of [RE_CS, RE_CI]) {
      if (!re) continue;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) out.push({ i: m.index, j: m.index + m[0].length, s: m[0] });
    }
    out.sort((a, b) => a.i - b.i || (b.j - b.i) - (a.j - a.i));
    const keep = []; let end = -1;
    for (const m of out) if (m.i >= end) { keep.push(m); end = m.j; }
    return keep;
  }

  function annotateText(node) {
    const text = node.nodeValue;
    if (!text || !/[A-Za-z]/.test(text)) return;
    const par = node.parentElement;
    if (!par || par.closest(SKIP)) return;
    const ms = matches(text);
    if (!ms.length) return;
    const svg = par.namespaceURI === SVGNS;
    if (svg && par.tagName.toLowerCase() !== 'text' && par.tagName.toLowerCase() !== 'tspan') return;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const m of ms) {
      if (m.i > at) frag.appendChild(document.createTextNode(text.slice(at, m.i)));
      const el = svg ? document.createElementNS(SVGNS, 'tspan') : document.createElement('span');
      el.setAttribute('class', 'gterm');
      el.textContent = m.s;
      frag.appendChild(el);
      at = m.j;
    }
    if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
    node.parentNode.replaceChild(frag, node);
  }
  function annotate(root) {
    if (!root) return;
    if (root.nodeType === 3) { annotateText(root); return; }
    if (root.nodeType !== 1 || root.closest(SKIP)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(annotateText);
  }

  /* ---------- tooltip ---------- */
  const css = document.createElement('style');
  css.textContent = `
.gterm { text-decoration: underline dotted; text-decoration-thickness: 1px; text-underline-offset: 2px; text-decoration-color: color-mix(in srgb, currentColor 55%, transparent); cursor: help; }
tspan.gterm { text-decoration: none; }
button .gterm, [data-sel] .gterm, .sel-hit .gterm, a .gterm, [data-start] .gterm { cursor: inherit; }
#gtip { position: fixed; z-index: 1000; max-width: min(320px, calc(100vw - 16px)); padding: 9px 11px 10px; background: #1a2430; color: #dbe4ec;
  border: 1px solid #3a4c60; box-shadow: 0 8px 24px rgba(0,0,0,.45); font: 12.5px/1.45 "IBM Plex Sans", system-ui, sans-serif; pointer-events: none;
  opacity: 0; transform: translateY(3px); transition: opacity .12s ease, transform .12s ease; }
#gtip.on { opacity: 1; transform: none; }
#gtip b { display: block; margin-bottom: 3px; font: 600 11px/1.3 "Chakra Petch", "Bahnschrift", sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #f2a93b; }
#gtip::after { content: ""; position: absolute; left: var(--ax, 50%); width: 8px; height: 8px; background: inherit; border: inherit; border-width: 0 1px 1px 0; transform: translateX(-50%) rotate(45deg); }
#gtip.below::after { top: -5px; border-width: 1px 0 0 1px; }
#gtip:not(.below)::after { bottom: -5px; }
@media (prefers-reduced-motion: reduce) { #gtip { transition: none; transform: none; } }`;
  document.head.appendChild(css);

  const tip = document.createElement('div');
  tip.id = 'gtip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
  document.body.appendChild(tip);

  const SHOW_DELAY = 450, HIDE_DELAY = 120, WARM_MS = 600;   // hover intent; skip the delay when moving between terms
  let anchor = null, anchorAt = null, showT = 0, hideT = 0, warmUntil = 0, pinned = false;

  function place(el) {
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect(), vw = document.documentElement.clientWidth, gap = 8;
    let x = r.left + r.width / 2 - t.width / 2;
    x = Math.max(8, Math.min(vw - t.width - 8, x));
    const below = r.top - t.height - gap < 4;
    const y = below ? r.bottom + gap : r.top - t.height - gap;
    tip.classList.toggle('below', below);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
    tip.style.setProperty('--ax', Math.max(10, Math.min(t.width - 10, r.left + r.width / 2 - x)) + 'px');
  }
  function show(el) {
    const s = el.textContent.trim(), e = lookup(s);
    if (!e) return;
    const title = typeof e.title === 'function' ? e.title(s) : e.title, def = typeof e.def === 'function' ? e.def(s) : e.def;
    tip.innerHTML = '';
    const b = document.createElement('b'); b.textContent = title; tip.appendChild(b); tip.appendChild(document.createTextNode(def));
    if (anchor && anchor !== el) anchor.removeAttribute('aria-describedby');
    anchor = el; el.setAttribute('aria-describedby', 'gtip');
    const ar = el.getBoundingClientRect(); anchorAt = { x: ar.left + ar.width / 2, y: ar.top + ar.height / 2, s: el.textContent };
    tip.hidden = false; tip.classList.remove('on');
    place(el);
    requestAnimationFrame(() => tip.classList.add('on'));
  }
  function hide() {
    clearTimeout(showT); clearTimeout(hideT);
    if (tip.hidden) return;
    tip.classList.remove('on'); tip.hidden = true; pinned = false;
    if (anchor) anchor.removeAttribute('aria-describedby');
    anchor = null; warmUntil = Date.now() + WARM_MS;
  }

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const t = e.target.closest && e.target.closest('.gterm');
    if (t) {
      clearTimeout(hideT);
      if (t === anchor) return;
      clearTimeout(showT);
      const warm = !tip.hidden || Date.now() < warmUntil;
      showT = setTimeout(() => show(t), warm ? 60 : SHOW_DELAY);
    } else if (!pinned) {
      clearTimeout(showT);
      if (!tip.hidden) { clearTimeout(hideT); hideT = setTimeout(hide, HIDE_DELAY); }
    }
  });
  document.documentElement.addEventListener('mouseleave', () => { if (!pinned) hide(); });
  // touch: tap a term to show its definition (the tap still does whatever the element does); tap elsewhere to close
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest && e.target.closest('.gterm');
    if (e.pointerType === 'touch' && t) { clearTimeout(showT); show(t); pinned = true; return; }
    if (e.pointerType !== 'touch' && t) return;
    hide();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);

  /* ---------- keep annotating as the apps re-render ---------- */
  const obs = new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === 'characterData') annotateText(r.target);
      else r.addedNodes.forEach(annotate);
    }
    if (anchor && !anchor.isConnected) {
      // the term was re-rendered under the pointer: re-attach to the same term at the same spot
      const el = document.elementFromPoint(anchorAt.x, anchorAt.y);
      const t = el && el.closest && el.closest('.gterm');
      if (t && t.textContent === anchorAt.s) { anchor = t; t.setAttribute('aria-describedby', 'gtip'); } else if (!pinned) hide();
    }
    obs.takeRecords();
  });
  annotate(document.body);
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });

  window.GridGlossary = { terms: entries.length, lookup, annotate };
})();
