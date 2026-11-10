import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeImageAttachment } from '../src/imageCompression.ts';

function sample(type, size = 1024 * 1024, name = 'foto.jpg') {
  return new File([new Uint8Array(size)], name, { type, lastModified: 123 });
}

test('retains screenshots, GIFs and already small photos without encoding', async () => {
  for (const file of [
    sample('image/png', 2 * 1024 * 1024, 'captura.png'),
    sample('image/gif', 1024 * 1024, 'animado.gif'),
    sample('image/jpeg', 128 * 1024),
  ]) {
    assert.strictEqual(await optimizeImageAttachment(file), file);
  }
});

test('converts a large photograph to WebP and caps its longest edge', async () => {
  const originalBitmap = globalThis.createImageBitmap;
  const originalDocument = globalThis.document;
  let width = 0, height = 0, closed = false;
  globalThis.createImageBitmap = async () => ({
    width: 4000, height: 2000, close() { closed = true; },
  });
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = {
        width: 0, height: 0,
        getContext() {
          return { imageSmoothingEnabled: false, imageSmoothingQuality: 'low',
            drawImage() { width = canvas.width; height = canvas.height; } };
        },
        toBlob(callback, type) {
          assert.equal(type, 'image/webp');
          callback(new Blob([new Uint8Array(50 * 1024)], { type }));
        },
      };
      return canvas;
    },
  };
  try {
    const input = sample('image/jpeg', 1024 * 1024, 'ferias.jpg');
    const result = await optimizeImageAttachment(input);
    assert.equal(result.name, 'ferias.webp');
    assert.equal(result.type, 'image/webp');
    assert.equal(result.lastModified, 123);
    assert.ok(result.size < input.size);
    assert.equal(width, 2048);
    assert.equal(height, 1024);
    assert.equal(closed, true);
  } finally {
    if (originalBitmap === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = originalBitmap;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('keeps the source if the canvas encoder has no WebP support', async () => {
  const originalBitmap = globalThis.createImageBitmap;
  const originalDocument = globalThis.document;
  globalThis.createImageBitmap = async () => ({ width: 1200, height: 900, close() {} });
  globalThis.document = { createElement: () => ({
    getContext: () => ({ drawImage() {} }),
    toBlob: callback => callback(new Blob(['png'], { type: 'image/png' })),
  }) };
  try {
    const input = sample('image/jpeg');
    assert.strictEqual(await optimizeImageAttachment(input), input);
  } finally {
    if (originalBitmap === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = originalBitmap;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('cancelled optimization sends nothing', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => optimizeImageAttachment(sample('image/jpeg'), controller.signal),
    /ABORTED/);
});
