// ESLint flat config (ESLint 9 / Next.js 16).
// Next 16 eliminó `next lint`; eslint-config-next 16 publica flat configs.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      // Las páginas cargan caché local + datos remotos al montar (patrón
      // estándar fetch-on-mount / hidratación). Tratarlo como error bloquearía
      // el build; lo dejamos como warning para que siga visible.
      'react-hooks/set-state-in-effect': 'warn',
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
]

export default eslintConfig
