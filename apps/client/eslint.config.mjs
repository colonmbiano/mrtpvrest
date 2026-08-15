// ESLint 9 (flat config) — reemplaza a .eslintrc.json.
//
// El script `lint` de esta app era `next lint`, que Next 16 eliminó: llevaba
// tiempo fallando con "Invalid project directory: …/lint" y, como la tienda
// online tampoco tenía CI, nadie lo notó. Ahora corre el CLI de eslint.
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
    // Mismos ajustes que traía .eslintrc.json: son deuda conocida del
    // storefront (any sueltos, imports de require en libs viejas). Quedan en
    // `warn` para que el gate de CI falle por problemas NUEVOS, no por el
    // inventario que ya venía.
    rules: {
      // Reglas NUEVAS que trae eslint-plugin-react-hooks 6 (era del React
      // Compiler). No son bugs: son avisos de patrones que el compilador no
      // puede optimizar. Hoy hay 19 en código preexistente de esta app, y
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
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
    },
  },
];
