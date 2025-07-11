// Content script: receive base64 audio data chunks and play sequentially using Web Audio API
(
  () => {
    // Run only in top-level frame to avoid duplicate playback from iframes
    if (window.top !== window) {
      // We're in an iframe – no speech handling here
      console.log("[ContentScript] Skipped in iframe");
      return;
    }

    if (window.__speechPlayerInitialized) {
      console.log("[ContentScript] Already initialized in this frame – skipping re-init");
      return;
    }
    window.__speechPlayerInitialized = true;

    var audioCtx = window.__speakAudioCtx || (window.__speakAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
    var queue = window.__speakQueue || (window.__speakQueue = []);
    var isPlaying = window.__speakIsPlaying || false;
    var currentSource = window.__speakCurrentSource || null;
    console.log("[ContentScript] initialized, existing queue length:", queue.length);

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "queueAudio" && message.base64) {
        enqueue(message.base64);
        // no async response needed
        return; // stop further processing
      } else if (message.action === "stopAudio") {
        stopAll();
        return;
      } else if (message.action === "showAlert" && message.message) {
        alert(message.message);
        return;
      } else if (message.action === "getSelectionText") {
        // Respond with the raw selection text (includes newlines)
        try {
          const selText = window.getSelection().toString();
          sendResponse({ selectionText: selText });
        } catch (e) {
          console.error("[ContentScript] getSelectionText error:", e);
          sendResponse({ selectionText: "" });
        }
        return true; // keep message channel open until sendResponse
      }
    });

    async function enqueue(base64) {
      console.log("[ContentScript] enqueue called, queue length before push:", queue.length);
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
      console.log("[ContentScript] playNext invoked, isPlaying:", isPlaying, "queue length:", queue.length);
      if (isPlaying || queue.length === 0) return;
      const buf = queue.shift();
      const source = audioCtx.createBufferSource();
      source.buffer = buf;
      source.connect(audioCtx.destination);
      currentSource = source;
      source.onended = () => {
        isPlaying = false;
        console.log("[ContentScript] playback ended, remaining queue length:", queue.length);
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
      console.log("[ContentScript] stopAll invoked");
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
  }
)(); 