// ESLint flat config (ESLint 9 / Next.js 16), misma base que apps/tpv.
//
// El TPV de retail vive casi entero en src/app/page.jsx, y ese archivo es JS:
// `tsc --noEmit` lo ignora, así que hasta aquí NADA revisaba que un
// identificador existiera. Dos veces llegó a runtime un ReferenceError por un
// hook usado sin importar. Por eso `no-undef` se enciende a mano para JS/JSX:
// eslint-config-next lo deja apagado porque da por hecho que TypeScript cubre
// ese caso, y en los .jsx de este proyecto no hay TypeScript que lo cubra.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Reglas del React Compiler. Se dejan en `warn` A PROPÓSITO, no porque
    // sobren: al encender ESLint marcaron 25 `set-state-in-effect` repartidos
    // por casi todas las pantallas del admin, y son señales legítimas. Pero
    // arreglarlas es una refactorización aparte (el TPV la resolvió con el
    // patrón `queueMicrotask`, ver 725bd13), y dejarlas en `error` significaba
    // no poder encender la puerta hoy.
    //
    // Al bajarlas: el gate SÍ falla por lo que motivó todo esto —un
    // identificador que no existe— y estas quedan a la vista para atacarlas.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  {
    // Solo JS/JSX: en .ts/.tsx `no-undef` estorba (no entiende los tipos y
    // marca falsos positivos), y ahí el compilador ya hace el trabajo.
    //
    // `no-unused-vars` base NO se agrega: @typescript-eslint/no-unused-vars ya
    // cubre los .jsx, y tenerlas las dos reportaba cada hallazgo por duplicado.
    files: ['**/*.js', '**/*.jsx', '**/*.mjs'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        globalThis: 'readonly',
        console: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        requestAnimationFrame: 'readonly',
        Intl: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        AbortController: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
]

export default eslintConfig
