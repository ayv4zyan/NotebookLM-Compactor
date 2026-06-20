import assert from "assert";
import {
  normalizeBatchExecuteText,
  parseBatchExecuteResponse,
  describeBatchExecuteParseFailure,
} from "../background/batchexecute-parse.js";

function testAntiXssiPrefix() {
  const inner = JSON.stringify({ ok: true });
  const line = JSON.stringify([[null, null, inner]]);
  const text = `)]}'\n\n${line}`;
  const parsed = parseBatchExecuteResponse(text);
  assert.deepStrictEqual(parsed, { ok: true });
}

function testEmbeddedJsonLine() {
  const inner = JSON.stringify([["source-id"], "Title"]);
  const line = `42\n${JSON.stringify([[null, null, inner]])}`;
  const parsed = parseBatchExecuteResponse(line);
  assert.deepStrictEqual(parsed, [["source-id"], "Title"]);
}

function testHtmlAuthResponse() {
  const parsed = parseBatchExecuteResponse("<!DOCTYPE html><html><body>Sign in</body></html>");
  assert.deepStrictEqual(parsed, { __authError: true });
  assert.match(
    describeBatchExecuteParseFailure("<!DOCTYPE html><html></html>"),
    /Session expired/
  );
}

function testNormalizeBatchExecuteText() {
  assert.strictEqual(normalizeBatchExecuteText(")]}'\n[[1]]"), "[[1]]");
}

testAntiXssiPrefix();
testEmbeddedJsonLine();
testHtmlAuthResponse();
testNormalizeBatchExecuteText();

console.log("All batchexecute-parse tests passed.");