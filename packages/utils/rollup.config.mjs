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
    ],
    external: ['fsevents']
  },
  {
    input: 'dist/index.d.ts',
    output: [
      { file: 'dist/index.d.ts', format: 'es' }
    ],
    plugins: [dts()],
  },
  {
    input: 'src/config.ts',
    output: [
      {
        file: 'dist/config/config.cjs',
        format: 'cjs',
        sourcemap: true
      },
      {
        file: 'dist/config/config.mjs',
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
    ],
    external: ['fsevents']
  },
  {
    input: 'dist/config.d.ts',
    output: [
      { file: 'dist/config/config.d.ts', format: 'es' }
    ],
    plugins: [dts()],
  },
  {
    input: 'src/read.ts',
    output: [
      {
        file: 'dist/read/read.cjs',
        format: 'cjs',
        sourcemap: true
      },
      {
        file: 'dist/read/read.mjs',
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
    ],
    external: ['fsevents']
  },
  {
    input: 'dist/read.d.ts',
    output: [
      { file: 'dist/read/read.d.ts', format: 'es' }
    ],
    plugins: [dts()],
  },
  {
    input: 'src/write.ts',
    output: [
      {
        file: 'dist/write/write.cjs',
        format: 'cjs',
        sourcemap: true
      },
      {
        file: 'dist/write/write.mjs',
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
    ],
    external: ['fsevents']
  },
  {
    input: 'dist/write.d.ts',
    output: [
      { file: 'dist/write/write.d.ts', format: 'es' }
    ],
    plugins: [dts()],
  }
];
