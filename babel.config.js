module.exports = function (api) {
  api.cache(true);

  const isProduction = process.env.NODE_ENV === 'production';

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Les appels console coûtent cher en release (sérialisation des arguments
      // + passage de pont). api.ts en contient à lui seul plus de 150, dont
      // plusieurs qui sérialisent des réponses entières à chaque requête.
      ...(isProduction ? [[
        'transform-remove-console',
        // Les traces bavardes disparaissent en release, mais jamais les
        // avertissements et erreurs nécessaires pour diagnostiquer un crash.
        { exclude: ['warn', 'error'] },
      ]] : []),
      // Doit rester en dernier (redirige vers react-native-worklets/plugin).
      'react-native-reanimated/plugin',
    ],
  };
};
