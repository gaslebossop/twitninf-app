const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * `inlineRequires` diffère l'évaluation de chaque module jusqu'à son premier
 * usage réel. C'est ce qui rend supportable le fait que MainNavigator importe
 * statiquement une quarantaine d'écrans : sans cela, tous sont évalués au
 * démarrage à froid, y compris ceux que l'utilisateur n'ouvrira jamais.
 */
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
