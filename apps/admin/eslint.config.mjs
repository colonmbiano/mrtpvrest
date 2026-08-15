// ESLint 9 (flat config) — reemplaza a .eslintrc.json.
//
// El script `lint` del panel era `next lint`, que Next 16 eliminó: llevaba
// tiempo fallando con "Invalid project directory: …/lint" sin que nadie lo
// notara, porque el panel no tenía gate propio de CI. Ahora corre el CLI.
//
// `eslint-config-next` 16 ya exporta flat config nativo (arrays), así que no
// hace falta FlatCompat ni @eslint/eslintrc.
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

export default [
  {
    ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts', 'public/**'],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // Mismos ajustes que traía .eslintrc.json. Son deuda conocida del panel
    // (any sueltos, <img> sin next/image, deps de hooks) y quedan en `warn`
    // para que CI falle por problemas NUEVOS, no por el inventario heredado.
    rules: {
      // Reglas NUEVAS que trae eslint-plugin-react-hooks 6 (era del React
      // Compiler). No son bugs: son avisos de patrones que el compilador no
      // puede optimizar. Hoy hay 91 en código preexistente de esta app, y
      // arreglarlos es refactor con riesgo de comportamiento, no limpieza.
      // Quedan en `warn` para que el gate falle por problemas NUEVOS; bajarlos
      // a cero es trabajo aparte y se puede ir haciendo por pantalla.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',

      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@next/next/no-img-element': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
  {
    // next.config.js es CommonJS por definición: el require ahí no es deuda.
    files: ['next.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
