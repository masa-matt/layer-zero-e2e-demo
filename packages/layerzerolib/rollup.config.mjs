import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import dts from 'rollup-plugin-dts';
import json from '@rollup/plugin-json';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.cjs',
        format: 'cjs',
        sourcemap: true
      },
      {
        file: 'dist/index.mjs',
        format: 'es',
        sourcemap: true
      }
    ],
    plugins: [
      json(),
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        useTsconfigDeclarationDir: true
      })
    ]
  },
  {
    input: 'dist/index.d.ts',
    output: [
      { file: 'dist/index.d.ts', format: 'es' }
    ],
    plugins: [dts()],
  }
];
