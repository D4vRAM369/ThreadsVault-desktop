const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT_DIR = path.resolve(__dirname, '..');
const TMP_DIR = path.join(ROOT_DIR, '.tmp');
const BUNDLE_PATH = path.join(TMP_DIR, 'post-extractor.bundle.cjs');

function ensureBundle() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  esbuild.buildSync({
    entryPoints: [path.join(ROOT_DIR, 'src/lib/utils/post-extractor.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outfile: BUNDLE_PATH,
    logLevel: 'silent',
  });
}

function makeTextResponse(text, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    async text() {
      return text;
    },
    async json() {
      throw new Error('Not a JSON response');
    },
  };
}

function makeJsonResponse(data, ok = true, status = ok ? 200 : 200) {
  return {
    ok,
    status,
    async text() {
      return JSON.stringify(data);
    },
    async json() {
      return data;
    },
  };
}

function withMockedFetch(mockImpl, fn) {
  const previousFetch = global.fetch;
  global.fetch = mockImpl;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      global.fetch = previousFetch;
    });
}

async function testSubPostMustNotInheritRootMedia(extractPostData) {
  const subUrl = 'https://www.threads.net/@demo/post/SUBPOST12345';
  const rootUrl = 'https://www.threads.net/@demo/post/ROOTPOST9999';
  const rootImage = 'https://cdn.example.com/root-video-thumb.jpg';

  const rootHtml = [
    '<html><head>',
    `<link rel="canonical" href="${rootUrl}">`,
    `<meta property="og:image" content="${rootImage}">`,
    '<meta property="og:description" content="Texto del post raiz">',
    '</head><body>root</body></html>',
  ].join('');

  const emptyJina = [
    `URL Source: ${subUrl}`,
    '',
    'Markdown Content:',
    '',
    'Profile preview only, without sub-post block.',
  ].join('\n');

  await withMockedFetch(async (url) => {
    const value = String(url);
    if (value.includes('/oembed?url=')) {
      return makeJsonResponse({ author_name: 'demo' });
    }
    if (value.startsWith('https://r.jina.ai/')) {
      return makeTextResponse(emptyJina);
    }
    if (value === subUrl) {
      return makeTextResponse(rootHtml);
    }
    throw new Error(`Unexpected URL in testSubPostMustNotInheritRootMedia: ${value}`);
  }, async () => {
    const result = await extractPostData(subUrl);
    const leakedRootImage = (result.media ?? []).some((item) => item.url === rootImage);
    assert.equal(
      leakedRootImage,
      false,
      'Sub-post inherited root post media (og:image), should not happen'
    );
  });
}

async function testLoginNoiseMustBeFiltered(extractPostData) {
  const postUrl = 'https://www.threads.net/@midu.dev/post/LOGINNOISE1';
  const loginNoise = 'Log in or sign up for Threads See what people are talking about and join the conversation.';
  const loginHtml = [
    '<html><head>',
    `<link rel="canonical" href="${postUrl}">`,
    `<meta property="og:description" content="${loginNoise}">`,
    '</head><body>login wall</body></html>',
  ].join('');

  await withMockedFetch(async (url) => {
    const value = String(url);
    if (value.includes('/oembed?url=')) {
      return makeJsonResponse({}, false, 404);
    }
    if (value.startsWith('https://r.jina.ai/')) {
      return makeTextResponse('', false, 503);
    }
    if (value === postUrl) {
      return makeTextResponse(loginHtml);
    }
    throw new Error(`Unexpected URL in testLoginNoiseMustBeFiltered: ${value}`);
  }, async () => {
    const result = await extractPostData(postUrl);
    assert.equal(
      result.text,
      undefined,
      'Extractor kept Threads login text; it must be filtered'
    );
  });
}

async function testUntrustedSourceMustNotOverrideRequestedPostText(extractPostData) {
  const requestedUrl = 'https://www.threads.net/@midu.dev/post/RIGHTPOST123';
  const wrongUrl = 'https://www.threads.net/@midu.dev/post/WRONGPOST999';
  const wrongText = 'Texto de otro post que nunca debe salir en Refrescar';
  const safeFallback = 'Texto correcto del post solicitado';
  const wrongHtml = [
    '<html><head>',
    `<link rel="canonical" href="${wrongUrl}">`,
    `<meta property="og:description" content="${wrongText}">`,
    '</head><body>wrong post html</body></html>',
  ].join('');

  await withMockedFetch(async (url) => {
    const value = String(url);
    if (value.includes('/oembed?url=')) {
      return makeJsonResponse({ title: safeFallback, author_name: 'midu.dev' });
    }
    if (value.startsWith('https://r.jina.ai/')) {
      return makeTextResponse('', false, 503);
    }
    if (value === requestedUrl) {
      return makeTextResponse(wrongHtml);
    }
    throw new Error(`Unexpected URL in testUntrustedSourceMustNotOverrideRequestedPostText: ${value}`);
  }, async () => {
    const result = await extractPostData(requestedUrl);
    assert.equal(
      result.text,
      safeFallback,
      'Extractor used text from an untrusted source instead of the requested post fallback'
    );
  });
}

async function main() {
  ensureBundle();
  const { extractPostData } = require(BUNDLE_PATH);
  await testSubPostMustNotInheritRootMedia(extractPostData);
  await testLoginNoiseMustBeFiltered(extractPostData);
  await testUntrustedSourceMustNotOverrideRequestedPostText(extractPostData);
  console.log('OK: regression-post-extractor');
}

main().catch((error) => {
  console.error('FAIL: regression-post-extractor');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

