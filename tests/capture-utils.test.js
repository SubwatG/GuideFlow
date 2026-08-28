const assert = require("assert");
const { calculateCapturePositions } = require("../extension/capture-utils.js");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("captures a short page once", () => {
  assert.deepStrictEqual(calculateCapturePositions(500, 600), [0]);
});

test("captures every viewport and includes the bottom edge", () => {
  assert.deepStrictEqual(calculateCapturePositions(1600, 600), [0, 600, 1000]);
});

test("handles invalid metrics safely", () => {
  assert.deepStrictEqual(calculateCapturePositions(0, 0), [0]);
  assert.deepStrictEqual(calculateCapturePositions(-1, 600), [0]);
});
