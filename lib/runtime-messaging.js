(function () {
  /**
   * NotebookLM API calls run in the content script so session cookies are available.
   * Firefox background workers often cannot authenticate batchexecute requests.
   */
  function sendSourceApi(body) {
    const client = window.NBLC?.batchexecuteClient;
    if (client?.handle) {
      return Promise.resolve(client.handle(body));
    }

    const message = { type: "source-api", body };

    return new Promise((resolve, reject) => {
      try {
        const maybePromise = chrome.runtime.sendMessage(message);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise
            .then((response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              resolve(response);
            })
            .catch((error) => {
              reject(
                error instanceof Error
                  ? error
                  : new Error(String(error || "sendMessage failed"))
              );
            });
          return;
        }
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  window.NBLC = window.NBLC || {};
  window.NBLC.runtimeMessaging = { sendSourceApi };
})();