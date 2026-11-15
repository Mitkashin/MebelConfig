import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'test-results/**', 'playwright-report/**'] },
  ...nextVitals,
  ...nextTs,
  {
    // All user-facing text must come from the message catalogues.
    files: ['src/components/**/*.tsx', 'src/app/**/*.tsx'],
    rules: {
      'react/jsx-no-literals': [
        'error',
        { noStrings: true, ignoreProps: true, allowedStrings: ['×', '·', '−', '+', '–', '/', ':', '(', ')', '%', '✓'] },
      ],
    },
  },
  {
    // The engine must stay framework-free.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react', 'react-*', 'next', 'next/*', 'next-intl', 'three', '@react-three/*', 'zustand', '@/components/*', '@/store/*'] }],
    },
  },
];

export default config;
