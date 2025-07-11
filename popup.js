const BASE = "http://127.0.0.1:10101";
const speakerSel = document.getElementById("speaker");
const styleSel = document.getElementById("style");
const statusEl = document.getElementById("status");
const speedRange = document.getElementById("speed");
const speedValueSpan = document.getElementById("speedValue");

init();

async function init() {
  try {
    const speakers = await fetch(`${BASE}/speakers`).then((r) => r.json());
    // populate speakers
    speakers.forEach((sp, idx) => {
      const opt = document.createElement("option");
      opt.value = sp.name;
      opt.textContent = sp.name;
      speakerSel.appendChild(opt);
    });

    // load saved voice
    const saved = await chrome.storage.local.get(["voice"]);
    if (saved.voice) {
      speakerSel.value = saved.voice.speakerName;
      speedRange.value = saved.voice.speed || 1;
    }

    populateStyles(speakers);

    // select saved style
    if (saved.voice) {
      styleSel.value = saved.voice.styleName;
    }

    speedValueSpan.textContent = speedRange.value;

    speakerSel.addEventListener("change", () => populateStyles(speakers));
    styleSel.addEventListener("change", saveVoice);
    document.getElementById("test").addEventListener("click", testVoice);
    speedRange.addEventListener("input", () => {
      speedValueSpan.textContent = speedRange.value;
      saveVoice();
    });

    document.getElementById("stop").addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "stopAll" });
      statusEl.textContent = "停止指示を送信しました";
    });
  } catch (e) {
    statusEl.textContent = `エラー: ${e}`;
    statusEl.style.color = "red";
    alert("AiviSpeechが起動していません。AiviSpeechを起動してから拡張機能をご利用ください。");
  }
}

function populateStyles(speakers) {
  // If no speaker selected yet, choose first one
  if (!speakerSel.value && speakers.length > 0) {
    speakerSel.value = speakers[0].name;
  }
  const sp = speakers.find((s) => s.name === speakerSel.value);
  styleSel.innerHTML = "";
  if (sp) {
    sp.styles.forEach((st) => {
      const opt = document.createElement("option");
      opt.value = st.name;
      opt.textContent = st.name;
      styleSel.appendChild(opt);
    });
  }
  saveVoice();
}

function saveVoice() {
  if (chrome.storage?.local) {
    const voice = {
      speakerName: speakerSel.value,
      styleName: styleSel.value,
      speed: parseFloat(speedRange.value),
    };
    chrome.storage.local.set({ voice });
  } else {
    console.error("popup: chrome.storage not available");
  }
}

async function testVoice() {
  statusEl.textContent = "テスト音声生成中...";
  statusEl.style.color = "black";
  try {
    const id = await getStyleIdByName(speakerSel.value, styleSel.value);
    await preload(id);
    const buffer = await synthesize("テストです", id, parseFloat(speedRange.value));
    const base64 = arrayBufferToBase64(buffer);
    playBase64(base64);
    statusEl.textContent = "再生中...";
  } catch (e) {
    statusEl.textContent = `エラー: ${e}`;
    statusEl.style.color = "red";
    alert("AiviSpeechが起動していません。AiviSpeechを起動してから拡張機能をご利用ください。");
  }
}

async function getStyleIdByName(name, style) {
  const speakers = await fetch(`${BASE}/speakers`).then((r) => r.json());
  const sp = speakers.find((s) => s.name === name);
  return sp?.styles.find((st) => st.name === style)?.id;
}
async function preload(id) {
  await fetch(`${BASE}/initialize_speaker?speaker=${id}&skip_reinit=false`, { method: "POST" });
}
async function synthesize(text, id, speed=1) {
  const query = await fetch(`${BASE}/audio_query?text=${encodeURIComponent(text)}&speaker=${id}`, { method: "POST" }).then((r) => r.json());
  query.speedScale = speed;
  return await fetch(`${BASE}/synthesis?speaker=${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  }).then((r) => r.arrayBuffer());
}
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function playBase64(b64) {
  const buffer = base64ToArrayBuffer(b64);
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.decodeAudioData(buffer).then((audioBuf) => {
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuf;
    source.connect(audioCtx.destination);
    source.start(0);
  });
}
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
} 