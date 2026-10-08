// Test-only preload: routes the hard-coded production origin to a local stub server.
const port = process.env.SHOPSCOUT_TEST_LOOPBACK;
if (port) {
  const real = globalThis.fetch;
  globalThis.fetch = (url, init) => real(String(url).replace('https://shopscout.forgemesh.io', `http://127.0.0.1:${port}`), init);
}
