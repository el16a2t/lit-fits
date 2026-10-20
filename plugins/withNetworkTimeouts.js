// React Native's Android HTTP client ships with no connect timeout, so a dead route (e.g. a black-holed IPv6
// address) can stall a request for ~2 minutes before OkHttp tries the next address. A 10s connect timeout makes
// it fall through to a working address quickly. Read/write stay unbounded so long AI responses still stream.
const { withMainApplication } = require('expo/config-plugins');

const MARKER = '// lit-fits: network timeouts';
const SNIPPET = `
    ${MARKER}
    com.facebook.react.modules.network.OkHttpClientProvider.setOkHttpClientFactory(
      object : com.facebook.react.modules.network.OkHttpClientFactory {
        override fun createNewNetworkModuleClient(): okhttp3.OkHttpClient =
          com.facebook.react.modules.network.OkHttpClientProvider.createClientBuilder(this@MainApplication)
            .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
            .build()
      }
    )`;

module.exports = function withNetworkTimeouts(config) {
  return withMainApplication(config, (cfg) => {
    const src = cfg.modResults.contents;
    if (cfg.modResults.language !== 'kt') throw new Error('withNetworkTimeouts expects a Kotlin MainApplication');
    if (src.includes(MARKER)) return cfg;
    const anchor = /super\.onCreate\(\)\s*\n/;
    if (!anchor.test(src)) throw new Error('withNetworkTimeouts: super.onCreate() not found in MainApplication');
    cfg.modResults.contents = src.replace(anchor, (m) => `${m}${SNIPPET}\n`);
    return cfg;
  });
};
