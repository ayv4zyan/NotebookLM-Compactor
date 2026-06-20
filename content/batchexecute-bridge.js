import { handleSourceApiMessage } from "../background/source-api.js";

async function handle(body) {
  return handleSourceApiMessage({ body });
}

const root = typeof window !== "undefined" ? window : globalThis;
root.NBLC = root.NBLC || {};
root.NBLC.batchexecuteClient = { handle };

export { handle };