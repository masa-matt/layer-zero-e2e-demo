import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import dts from 'rollup-plugin-dts';

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
  },
  {
    input: 'src/messagelib/index.ts',
    output: [
      {
        file: 'dist/messagelib/messagelib.cjs',
        format: 'cjs',
        sourcemap: true
      },
      {
        file: 'dist/messagelib/messagelib.mjs',
        format: 'es',
        sourcemap: true
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        useTsconfigDeclarationDir: true
      })
    ]
  },
  {
    input: 'dist/messagelib/index.d.ts',
    output: [
      { file: 'dist/messagelib/messagelib.d.ts', format: 'es' }
    ],
    plugins: [dts()],
  },
  {
    input: 'src/oapp/index.ts',
    output: [
      {
        file: 'dist/oapp/oapp.cjs',
        format: 'cjs',
        sourcemap: true
      },
      {
        file: 'dist/oapp/oapp.mjs',
        format: 'es',
        sourcemap: true
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        useTsconfigDeclarationDir: true
      })
    ]
  },
  {
    input: 'dist/oapp/index.d.ts',
    output: [
      { file: 'dist/oapp/oapp.d.ts', format: 'es' }
    ],
    plugins: [dts()],
  },
  {
    input: 'src/protocol/index.ts',
    output: [
      {
        file: 'dist/protocol/protocol.cjs',
        format: 'cjs',
        sourcemap: true
      },
      {
        file: 'dist/protocol/protocol.mjs',
        format: 'es',
        sourcemap: true
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        useTsconfigDeclarationDir: true
      })
    ]
  },
  {
    input: 'dist/protocol/index.d.ts',
    output: [
      { file: 'dist/protocol/protocol.d.ts', format: 'es' }
    ],
    plugins: [dts()],
  }
];
