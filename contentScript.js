// Content script: receive base64 audio data chunks and play sequentially using Web Audio API

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const queue = [];
let isPlaying = false;
let currentSource = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "queueAudio" && message.base64) {
    enqueue(message.base64);
  } else if (message.action === "stopAudio") {
    stopAll();
  } else if (message.action === "getSelectionText") {
    // Respond with the raw selection text (includes newlines)
    try {
      const selText = window.getSelection().toString();
      sendResponse({ selectionText: selText });
    } catch (e) {
      console.error("[ContentScript] getSelectionText error:", e);
      sendResponse({ selectionText: "" });
    }
  }
  return true;
});

async function enqueue(base64) {
  try {
    const buffer = base64ToArrayBuffer(base64);
    const audioBuffer = await audioCtx.decodeAudioData(buffer);
    queue.push(audioBuffer);
    playNext();
  } catch (e) {
    console.error("[ContentScript] enqueue decode failed", e);
  }
}

function playNext() {
  if (isPlaying || queue.length === 0) return;
  const buf = queue.shift();
  const source = audioCtx.createBufferSource();
  source.buffer = buf;
  source.connect(audioCtx.destination);
  currentSource = source;
  source.onended = () => {
    isPlaying = false;
    if (queue.length === 0) {
      sendStatus("stopped");
    }
    playNext();
  };
  isPlaying = true;
  sendStatus("playing");
  source.start(0);
}

function stopAll() {
  queue.length = 0;
  if (currentSource) {
    try {
      currentSource.stop();
    } catch (e) {
      console.error("[ContentScript] currentSource.stop error:", e);
    }
    currentSource = null;
  }
  isPlaying = false;
  sendStatus("stopped");
}

function sendStatus(status) {
  try {
    chrome.runtime.sendMessage({ action: "playbackStatus", status }, () => {
      if (chrome.runtime.lastError && !chrome.runtime.lastError.message.includes("The message port closed")) {
        console.error("[ContentScript] sendStatus runtime error:", chrome.runtime.lastError);
      }
    });
  } catch (e) {
    console.error("[ContentScript] sendStatus exception:", e);
  }
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
} 