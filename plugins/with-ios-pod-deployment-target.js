const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# [chap] raise pod deployment targets';

/**
 * Xcode 26+ refuses to build pod targets whose IPHONEOS_DEPLOYMENT_TARGET is
 * below iOS 15 (several transitive pods such as GoogleMaps resource bundles,
 * SDWebImage and AsyncStorage still declare 9.0–14.0). This plugin appends a
 * snippet to the Podfile's post_install hook that lifts every pod target to at
 * least the app's own deployment target, so `expo prebuild` output builds
 * cleanly with current Xcode releases.
 */
function withIosPodDeploymentTarget(config, { minimumTarget = '15.1' } = {}) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return cfg;

      let podfile = fs.readFileSync(podfilePath, 'utf8');
      if (podfile.includes(MARKER)) return cfg;

      const snippet = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current.to_s) < Gem::Version.new('${minimumTarget}')
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${minimumTarget}'
        end
      end
    end
`;

      const hook = 'post_install do |installer|';
      if (!podfile.includes(hook)) {
        throw new Error('[with-ios-pod-deployment-target] Could not find post_install hook in Podfile');
      }
      podfile = podfile.replace(hook, `${hook}${snippet}`);
      fs.writeFileSync(podfilePath, podfile);
      return cfg;
    },
  ]);
}

module.exports = withIosPodDeploymentTarget;
