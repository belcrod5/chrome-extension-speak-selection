chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "speakSelection",
    title: "選択したテキストを読み上げる",
    contexts: ["selection"],
  });
});

const BASE = "http://127.0.0.1:10101";
// Keep track of which tab already has the content script injected
const injectedTabs = new Set();

async function getStyleIdByName(name = "Anneli", style = "ノーマル") {
  const speakers = await fetch(`${BASE}/speakers`).then((r) => r.json());
  const sp = speakers.find((s) => s.name === name);
  return sp?.styles.find((st) => st.name === style)?.id;
}

async function preload(id) {
  await fetch(`${BASE}/initialize_speaker?speaker=${id}&skip_reinit=false`, {
    method: "POST",
  });
}

async function synthesize(text, id, speed=1) {
  const query = await fetch(
    `${BASE}/audio_query?text=${encodeURIComponent(text)}&speaker=${id}`,
    { method: "POST" }
  ).then((r) => r.json());

  query.speedScale = speed;
  const arrayBuffer = await fetch(`${BASE}/synthesis?speaker=${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  }).then((r) => r.arrayBuffer());

  return arrayBuffer;
}

function canInject(tab) {
  if (!tab || !tab.url) return false;
  // Skip Chrome internal pages and extension pages
  const disallowed = ["chrome://", "chrome-extension://", "edge://", "about:"]; // for other browsers too
  return !disallowed.some((prefix) => tab.url.startsWith(prefix));
}

async function sendToContent(tab, payload) {
  if (!canInject(tab)) {
    console.warn("Cannot inject content script into this page:", tab.url);
    return;
  }

  // Helper to actually send the message
  const doSend = () => new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, payload, { frameId: 0 }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });

  try {
    await doSend();
  } catch (err) {
    // If the script for the tab hasn't been injected yet, inject once then retry
    if (!injectedTabs.has(tab.id)) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ["contentScript.js"] });
        injectedTabs.add(tab.id);
        await doSend();
      } catch (e2) {
        console.error("[Background] Failed to inject content script or send message", e2);
      }
    } else {
      console.error("[Background] sendMessage failed even after injection", err);
    }
  }
}

// Retrieve raw selection text (with newlines) from the tab via the content script
async function getSelectionFromTab(tab) {
  return new Promise((resolve) => {
    if (!canInject(tab)) {
      resolve("");
      return;
    }

    // Try sending a message first – if content script not yet present, we'll inject then retry
    const request = { action: "getSelectionText" };
    chrome.tabs.sendMessage(tab.id, request, (response) => {
      if (chrome.runtime.lastError || !response) {
        // Inject content script and retry once
        chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ["contentScript.js"] }, () => {
          chrome.tabs.sendMessage(tab.id, request, { frameId: 0 }, (resp2) => {
            if (chrome.runtime.lastError || !resp2) {
              resolve("");
            } else {
              resolve(resp2.selectionText || "");
            }
          });
        });
      } else {
        resolve(response.selectionText || "");
      }
    });
  });
}

// Utility: ask content script to show an alert in the page context
function showAlert(tab, message) {
  sendToContent(tab, { action: "showAlert", message });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "speakSelection") {
    // 先に既存の再生を停止
    sendToContent(tab, { action: "stopAudio" });
    (async () => {
      try {
        const rawSelection = await getSelectionFromTab(tab);
        const targetText = rawSelection && rawSelection.trim() ? rawSelection : info.selectionText || "";
        console.log("[Background] targetText obtained (length):", targetText.length);
        if (!targetText) return;
        const voicePref = await chrome.storage.local.get(["voice"]);
        const speakerName = voicePref.voice?.speakerName || "Anneli";
        const styleName = voicePref.voice?.styleName || "ノーマル";
        const id = await getStyleIdByName(speakerName, styleName);
        if (!id) throw new Error("Style ID not found");
        await preload(id);
        const speed = voicePref.voice?.speed || 1;
        const chunks = splitTextIntoChunks(targetText);
        console.log("[Background] chunks prepared:", chunks);
        for (const chunk of chunks) {
          // Original chunk may include punctuation for display; strip it for synthesis but keep for caption
          const synthText = chunk.replace(/[。、」]+$/g, "").trim();
          
          // 「·」だけ、あるいは空文字になった場合はスキップ
          if (!synthText || /^[·]+$/.test(synthText)) {
            continue;
          }

          console.log("[Background] synthesizing chunk (clean):", synthText, "display:", chunk);

          const buf = await synthesize(synthText, id, speed);
          const b64 = arrayBufferToBase64(buf);
          console.log("[Background] sending chunk to content script (bytes):", b64.length);
          sendToContent(tab, {
            action: "queueAudio",
            base64: b64,
            text: chunk,
          });
        }
      } catch (e) {
        console.error("Speech synthesis failed", e);
        // AiviSpeech server may not be running – notify the user
        showAlert(tab, "AiviSpeechが起動していません。AiviSpeechを起動してから再度お試しください。");
      }
    })();
  }
});

// popup からの停止要求
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === "stopAll") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        sendToContent(tabs[0], { action: "stopAudio" });
      }
    });
  }
});

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function splitTextIntoChunks(text) {
  // Keep punctuation (、 。 」) at the end of each chunk for caption display.
  // Match a run of non-separator characters followed by an optional punctuation mark.
  const tokens = text.match(/[^。、」\s\u3000\r\n]+[。、」]?/g) || [];
  const chunks = tokens.map((s) => s.trim());
  console.log(`[Background] split into ${chunks.length} chunk(s):`, chunks);
  return chunks;
} 