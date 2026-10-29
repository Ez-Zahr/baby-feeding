// ---------------------------------------------------------------------------
// CONFIG — BUCKET is a unique, randomly generated name. Keep it private.
// Every phone that should share data must use the same BUCKET + KEY.
// MantleDB note: unclaimed buckets are public, and items untouched for
// 30 days are purged (each feeding rewrites the item, so normal use is fine).
// ---------------------------------------------------------------------------
const MANTLE_BASE = "https://mantledb.sh/v2";
const BUCKET = "baby-feeding-517bc520d742c480";
const KEY = "state";
const URL_STATE = `${MANTLE_BASE}/${BUCKET}/${KEY}`;

const DEFAULT_INTERVAL = 3; // hours
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 12;
const SOON_MS = 15 * 60000; // highlight when next feeding is within 15 min

const MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو",
  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

// State: { lastFed: <ms timestamp | null>, interval: <hours> }
let state = { lastFed: null, interval: DEFAULT_INTERVAL };
let saveTimer = null;

const $ = (id) => document.getElementById(id);
const el = {
  sync: $("sync"), lastFed: $("lastFed"), lastFedAgo: $("lastFedAgo"),
  nextCard: $("nextCard"), nextFeed: $("nextFeed"), countdown: $("countdown"),
  interval: $("interval"), intervalUnit: $("intervalUnit"), minus: $("minus"),
  plus: $("plus"), fedBtn: $("fedBtn"), refresh: $("refresh"),
};

// ---------- Formatting ----------
// "29 أكتوبر، 02:30 م"
function formatDate(ms) {
  const d = new Date(ms);
  let h = d.getHours();
  const ampm = h >= 12 ? "م" : "ص";
  h = h % 12 || 12;
  const hh = String(h).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]}، ${hh}:${mm} ${ampm}`;
}

// "2 س 05 د" / "15 د"
function formatDuration(ms) {
  const totalMin = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} د`;
  return `${h} س ${String(m).padStart(2, "0")} د`;
}

// Arabic plural for hours: 1 ساعة، 2 ساعتان، 3–10 ساعات، 11+ ساعة
function hoursWord(n) {
  if (n === 1) return "ساعة";
  if (n === 2) return "ساعتان";
  if (n >= 3 && n <= 10) return "ساعات";
  return "ساعة";
}

// ---------- Rendering ----------
function render() {
  el.interval.textContent = state.interval;
  el.intervalUnit.textContent = hoursWord(state.interval);
  el.minus.disabled = state.interval <= MIN_INTERVAL;
  el.plus.disabled = state.interval >= MAX_INTERVAL;

  if (!state.lastFed) {
    el.lastFed.textContent = "—";
    el.lastFedAgo.textContent = "لم تُسجَّل أي رضعة بعد";
    el.nextFeed.textContent = "—";
    el.countdown.innerHTML = "&nbsp;";
    el.nextCard.className = "card";
    return;
  }

  const now = Date.now();
  const since = now - state.lastFed;
  el.lastFed.textContent = formatDate(state.lastFed);
  el.lastFedAgo.textContent = since < 60000 ? "الآن" : `منذ ${formatDuration(since)}`;

  const next = state.lastFed + state.interval * 3600000;
  const left = next - now;
  el.nextFeed.textContent = formatDate(next);

  if (left <= 0) {
    el.countdown.textContent = `متأخرة بـ ${formatDuration(left)}`;
    el.nextCard.className = "card late";
  } else {
    el.countdown.textContent = `بعد ${formatDuration(left)}`;
    el.nextCard.className = left <= SOON_MS ? "card soon" : "card ok";
  }
}

function setSync(text, isError = false) {
  el.sync.textContent = text;
  el.sync.classList.toggle("error", isError);
}

// ---------- MantleDB ----------
async function load() {
  try {
    const res = await fetch(URL_STATE, { cache: "no-store" });
    if (res.status === 404) { setSync("لا توجد بيانات بعد"); render(); return; }
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    // Don't overwrite a local interval change that hasn't been saved yet
    if (!saveTimer) {
      state.lastFed = typeof data.lastFed === "number" ? data.lastFed : null;
      state.interval = clampInterval(data.interval ?? DEFAULT_INTERVAL);
    }
    setSync("تمت المزامنة");
  } catch (e) {
    setSync("غير متصل", true);
  }
  render();
}

async function save() {
  setSync("جارٍ الحفظ…");
  try {
    const res = await fetch(URL_STATE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastFed: state.lastFed, interval: state.interval }),
    });
    if (!res.ok) throw new Error(res.status);
    setSync("تم الحفظ");
    return true;
  } catch (e) {
    setSync("فشل الحفظ", true);
    return false;
  }
}

function clampInterval(v) {
  const n = Math.round(Number(v)) || DEFAULT_INTERVAL;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, n));
}

// ---------- Actions ----------
el.fedBtn.addEventListener("click", async () => {
  // Guard against accidental double taps
  if (state.lastFed && Date.now() - state.lastFed < 2 * 60 * 60000) {
    if (!confirm("سُجّلت رضعة قبل أقل من ساعتين. هل تريد تسجيل رضعة جديدة؟")) return;
  }
  el.fedBtn.disabled = true;
  state.lastFed = Date.now();
  render();
  await save();
  el.fedBtn.disabled = false;
});

function changeInterval(delta) {
  state.interval = clampInterval(state.interval + delta);
  render();
  // Debounce so several quick taps produce one save
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await save();
    saveTimer = null;
  }, 800);
}
el.minus.addEventListener("click", () => changeInterval(-1));
el.plus.addEventListener("click", () => changeInterval(1));
el.refresh.addEventListener("click", () => { setSync("جارٍ التحميل…"); load(); });

// ---------- Lifecycle ----------
setInterval(render, 1000);

load();

// ---------- PWA install support (network-only service worker, no caching) ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
}
