/**
 * Expo Config Plugin: withPodfileSwift5
 *
 * Forces HaishinKit and AMFFoundation pods to compile with Swift 5
 * instead of Swift 6, fixing compilation errors on Xcode 15+.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withPodfileSwift5 = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      if (!fs.existsSync(podfilePath)) {
        console.warn('[withPodfileSwift5] Podfile not found, skipping.');
        return config;
      }

      let contents = fs.readFileSync(podfilePath, 'utf8');

      const marker = '# [withPodfileSwift5] HaishinKit Swift 5 patch';

      if (contents.includes(marker)) {
        console.log('[withPodfileSwift5] Patch already applied, skipping.');
        return config;
      }

      const patch = `
  ${marker}
  installer.pods_project.targets.each do |target|
    if ['HaishinKit', 'AMFFoundation', 'Logboard'].include?(target.name)
      target.build_configurations.each do |config|
        config.build_settings['SWIFT_VERSION'] = '5.0'
      end
    end
  end
  # [/withPodfileSwift5]
`;

      if (contents.includes('post_install do |installer|')) {
        contents = contents.replace('post_install do |installer|', `post_install do |installer|\n${patch}`);
      } else {
        // Add post_install block at end if none exists
        contents += `\npost_install do |installer|\n${patch}\nend\n`;
      }

      fs.writeFileSync(podfilePath, contents);
      console.log('[withPodfileSwift5] Patch applied successfully!');

      return config;
    },
  ]);
};

module.exports = withPodfileSwift5;
