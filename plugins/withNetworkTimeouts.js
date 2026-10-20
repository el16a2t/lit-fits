// React Native's Android HTTP client (OkHttp 4.9, no "happy eyeballs") ships with no connect timeout, so a dead
// route such as a black-holed IPv6 address can stall a request for ~2 minutes before the next address is tried.
// Fix: try IPv4 addresses first, and cap connects at 10s so any other dead route falls through quickly.
// Read/write stay unbounded so long AI responses still stream.
const { withMainApplication } = require('expo/config-plugins');

const MARKER = '// lit-fits: network timeouts';
const SNIPPET = `
    ${MARKER}
    com.facebook.react.modules.network.OkHttpClientProvider.setOkHttpClientFactory(
      object : com.facebook.react.modules.network.OkHttpClientFactory {
        override fun createNewNetworkModuleClient(): okhttp3.OkHttpClient =
          com.facebook.react.modules.network.OkHttpClientProvider.createClientBuilder(this@MainApplication)
            .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
            .dns(object : okhttp3.Dns {
              override fun lookup(hostname: String): List<java.net.InetAddress> =
                okhttp3.Dns.SYSTEM.lookup(hostname).sortedBy { if (it is java.net.Inet4Address) 0 else 1 }
            })
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
