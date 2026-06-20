import { handleSourceApiMessage } from "./source-api.js";
import { sweepStale } from "./storage-sweep.js";

chrome.runtime.onInstalled.addListener(() => {
  sweepStale().catch((error) => {
    console.error("[background] Stale storage sweep failed:", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  sweepStale().catch((error) => {
    console.error("[background] Stale storage sweep failed:", error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "source-api") return false;

  handleSourceApiMessage(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    });

  return true;
});