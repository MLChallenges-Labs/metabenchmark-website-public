/* Illustrative leaderboard on the proposal page (#leaderboard). Fictional data.
   Each method has raw measurements; each criterion maps to a 0-100 score:
     acc, rob, fair: percentages, used as measured;
     speed, energy:  log scale, 100 at the reference minimum, -5 points per tenfold increase.
   Combined score = weighted mean of the selected criteria (accuracy counts double, WEIGHT).
   Uncertainty comes from N_DRAWS seeded bootstrap draws (Gaussian noise on percentages,
   log-normal noise on latency and energy). "A significantly beats B" means A scores below B
   in fewer than 2.5% of the draws (5% level, two-sided).
     - Interval: 2.5-97.5 percentile range of the combined score.
     - Tied with #1: not significantly beaten by the leader on the combined score.
     - Average rank (informative column): on each criterion, rank = 1 + the number of methods
       that significantly beat it, so statistical ties share a rank; then the weighted mean. */
(() => {
  const root = document.querySelector("[data-leaderboard]");
  if (!root) return;

  const METHODS = [
    // lat: ms per prediction; energy: J per 1,000 predictions; acc/rob/fair: %
    { name: "Gradient-boosted trees", acc: 89.4, lat: 0.05, energy: 0.5, rob: 80.6, fair: 78.2 },
    { name: "LLM, fine-tuned (8B)", acc: 89.1, lat: 180, energy: 54000, rob: 84.9, fair: 81.5 },
    { name: "Deep ensemble (5 MLPs)", acc: 88.6, lat: 0.1, energy: 1.5, rob: 82.8, fair: 79.6 },
    { name: "MLP", acc: 87.8, lat: 0.02, energy: 0.3, rob: 77.4, fair: 74.1 },
    { name: "Random forest", acc: 87.5, lat: 0.3, energy: 4, rob: 81.2, fair: 78.8 },
    { name: "SVM (RBF kernel)", acc: 86.3, lat: 2, energy: 25, rob: 76.0, fair: 73.0 },
    { name: "k-nearest neighbours", acc: 84.1, lat: 5, energy: 60, rob: 71.5, fair: 75.3 },
    { name: "Logistic regression", acc: 83.2, lat: 0.002, energy: 0.02, rob: 79.0, fair: 77.0, baseline: true },
    { name: "Decision tree", acc: 81.4, lat: 0.003, energy: 0.03, rob: 69.8, fair: 68.5 },
  ];
  const N_DRAWS = 1000;
  const ALPHA = 0.025;
  const CRIT = ["acc", "speed", "energy", "rob", "fair"];
  const WEIGHT = { acc: 2, speed: 1, energy: 1, rob: 1, fair: 1 };

  // Standard errors: percentage points, or relative error for latency and energy.
  const SE = { acc: 0.45, rob: 0.7, fair: 1.1, lat: 0.08, energy: 0.12 };
  const LOG_REF = { lat: 0.001, energy: 0.01 }; // values that score 100

  const toScore = {
    acc: m => m.acc,
    rob: m => m.rob,
    fair: m => m.fair,
    speed: m => 100 - 5 * Math.log10(m.lat / LOG_REF.lat),
    energy: m => 100 - 5 * Math.log10(m.energy / LOG_REF.energy),
  };

  // Seeded random numbers, so the intervals are the same on every visit.
  let seed = 20261125;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

  // Per method, per criterion: the point score and N_DRAWS resampled scores.
  METHODS.forEach((m, idx) => {
    m.idx = idx;
    m.point = {};
    m.draws = {};
    CRIT.forEach(c => { m.point[c] = toScore[c](m); m.draws[c] = new Float64Array(N_DRAWS); });
    for (let i = 0; i < N_DRAWS; i++) {
      const d = {
        acc: m.acc + SE.acc * gauss(),
        rob: m.rob + SE.rob * gauss(),
        fair: m.fair + SE.fair * gauss(),
        lat: m.lat * Math.exp(SE.lat * gauss()),
        energy: m.energy * Math.exp(SE.energy * gauss()),
      };
      CRIT.forEach(c => { m.draws[c][i] = toScore[c](d); });
    }
  });

  // True when draws `a` are significantly above draws `b`.
  const beats = (a, b) => {
    let below = 0;
    for (let i = 0; i < N_DRAWS; i++) if (a[i] <= b[i]) below++;
    return below / N_DRAWS < ALPHA;
  };

  // Rank per criterion with statistical ties: 1 + number of methods that significantly beat it.
  CRIT.forEach(c => {
    METHODS.forEach(m => {
      m.rank = m.rank || {};
      m.rank[c] = 1 + METHODS.filter(o => o !== m && beats(o.draws[c], m.draws[c])).length;
    });
  });

  const fmtMs = v => String(parseFloat(v.toPrecision(2))) + " ms";
  const fmtJ = v => (v >= 1000 ? (v / 1000).toFixed(0) + " kJ" : v + " J");
  const RAW = {
    acc: m => m.acc.toFixed(1) + "%",
    speed: m => fmtMs(m.lat),
    energy: m => fmtJ(m.energy),
    rob: m => m.rob.toFixed(1) + "%",
    fair: m => m.fair.toFixed(1) + "%",
  };
  const RAW_LABEL = {
    acc: "Accuracy",
    speed: "Latency / prediction",
    energy: "Energy / 1k predictions",
    rob: "Accuracy under shift",
    fair: "Worst-group accuracy",
  };

  const lb = root.querySelector(".lb");
  const axis = root.querySelector(".lb-axis");
  const live = root.querySelector(".lb-live");
  const tip = root.querySelector(".lb-tip");
  const chips = [...root.querySelectorAll(".crit .chip")];

  lb.innerHTML = '<div class="lb-base"></div>';
  const baseLine = lb.querySelector(".lb-base");
  METHODS.forEach(m => {
    const r = document.createElement("div");
    r.className = "lb-row" + (m.baseline ? " is-baseline" : "");
    r.innerHTML =
      '<span class="r"></span>' +
      `<span class="m"><span class="m__name">${m.name}</span><span class="m__raw"></span></span>` +
      '<span class="trk"><span class="ci"></span><span class="pt"></span></span>' +
      '<span class="v"></span><span class="ar"></span>';
    r.addEventListener("mouseenter", () => showTip(m, r));
    r.addEventListener("mouseleave", () => { tip.hidden = true; });
    lb.appendChild(r);
    m.row = r;
  });

  let last = []; // results of the latest draw(), for the tooltip

  const draw = () => {
    const sel = chips.filter(c => c.getAttribute("aria-pressed") === "true").map(c => c.dataset.k);
    const W = sel.reduce((s, c) => s + WEIGHT[c], 0);
    const wmean = f => sel.reduce((s, c) => s + WEIGHT[c] * f(c), 0) / W;
    const res = METHODS.map(m => {
      const combo = new Float64Array(N_DRAWS);
      for (let i = 0; i < N_DRAWS; i++) combo[i] = wmean(c => m.draws[c][i]);
      const sorted = Float64Array.from(combo).sort();
      return {
        m,
        combo,
        v: wmean(c => m.point[c]),
        avgRank: wmean(c => m.rank[c]),
        lo: sorted[Math.floor(ALPHA * N_DRAWS)],
        hi: sorted[Math.ceil((1 - ALPHA) * N_DRAWS) - 1],
      };
    }).sort((a, b) => b.v - a.v);

    const lead = res[0];
    res.forEach((r, i) => { r.tie = i === 0 || !beats(lead.combo, r.combo); });
    last = res;

    // Axis: round bounds around every interval, ticks at least ~45px apart.
    const trk = lead.m.row.querySelector(".trk");
    const minV = Math.min(...res.map(r => r.lo)), maxV = Math.max(...res.map(r => r.hi));
    const maxTicks = Math.max(3, Math.floor(trk.offsetWidth / 45));
    const step = [1, 2, 5, 10, 20, 25].find(st => (maxV - minV + 1) / st <= maxTicks) || 50;
    const lo = Math.max(0, Math.floor((minV - 0.5) / step) * step);
    const hi = Math.min(100, Math.ceil((maxV + 0.5) / step) * step);
    const P = v => ((v - lo) / (hi - lo)) * 100;

    const ROW = lb.querySelector(".lb-row").offsetHeight;
    lb.style.height = METHODS.length * ROW + "px";

    res.forEach((r, i) => {
      const el = r.m.row;
      el.style.transform = `translateY(${i * ROW}px)`;
      el.classList.toggle("is-tie", r.tie);
      el.querySelector(".r").textContent = i + 1;
      el.querySelector(".v").textContent = r.v.toFixed(1);
      el.querySelector(".ar").textContent = r.avgRank.toFixed(1);
      el.querySelector(".m__raw").textContent = sel.map(c => RAW[c](r.m)).join(" · ");
      const ci = el.querySelector(".ci"), pt = el.querySelector(".pt");
      ci.style.left = P(r.lo) + "%";
      ci.style.width = P(r.hi) - P(r.lo) + "%";
      pt.style.left = P(r.v) + "%";
    });

    // Baseline guide: positioned inside the track column of the rows.
    const base = res.find(r => r.m.baseline);
    baseLine.style.left = base.m.row.offsetLeft + trk.offsetLeft + (P(base.v) / 100) * trk.offsetWidth + "px";

    let ticks = "";
    for (let v = lo; v <= hi + 1e-9; v += step) ticks += `<span style="left:${P(v)}%">${v}</span>`;
    axis.innerHTML = `<div class="ticks">${ticks}</div>`;

    live.textContent =
      "Ranking by " + sel.map(c => RAW_LABEL[c].toLowerCase()).join(", ") + ": " +
      res.map((r, i) =>
        `${i + 1}. ${r.m.name}, score ${r.v.toFixed(1)}, average rank ${r.avgRank.toFixed(1)}` +
        (i > 0 && r.tie ? " (tied with #1)" : "")).join("; ");
  };

  const showTip = (m, row) => {
    const r = last.find(x => x.m === m);
    if (!r) return;
    tip.innerHTML =
      `<strong>${m.name}${m.baseline ? " · baseline" : ""}</strong>` +
      `<span class="lb-tip__score">Score ${r.v.toFixed(1)} <small>[${r.lo.toFixed(1)}, ${r.hi.toFixed(1)}]</small></span>` +
      "<dl>" + CRIT.map(c => `<dt>${RAW_LABEL[c]}</dt><dd>${RAW[c](m)} <small>rank ${m.rank[c]}</small></dd>`).join("") + "</dl>";
    tip.hidden = false;
    const box = root.getBoundingClientRect(), rb = row.getBoundingClientRect();
    const below = rb.bottom - box.top + 4;
    const fitsBelow = below + tip.offsetHeight < root.offsetHeight;
    tip.style.top = (fitsBelow ? below : rb.top - box.top - tip.offsetHeight - 4) + "px";
  };

  chips.forEach(c => c.addEventListener("click", () => {
    const on = c.getAttribute("aria-pressed") === "true";
    if (on && chips.filter(x => x.getAttribute("aria-pressed") === "true").length === 1) return; // keep one
    c.setAttribute("aria-pressed", String(!on));
    draw();
  }));
  window.addEventListener("resize", draw, { passive: true });
  draw();
})();
