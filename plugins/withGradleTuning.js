// Gives Gradle enough memory on CI runners and enables parallel/caching for faster release builds.
const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withGradleTuning(config) {
  return withGradleProperties(config, (cfg) => {
    const set = (key, value) => {
      const existing = cfg.modResults.find((p) => p.type === 'property' && p.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    };
    set('org.gradle.jvmargs', '-Xmx6g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8');
    set('org.gradle.parallel', 'true');
    set('org.gradle.caching', 'true');
    return cfg;
  });
};
