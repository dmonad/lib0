import fs from 'fs'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

const files = fs.readdirSync('./').filter(file => /(?<!(test|config))\.js$/.test(file))

export default [{
  input: './test',
  output: {
    file: './dist/test',
    format: 'iife',
    sourcemap: true
  },
  plugins: [
    resolve({ mainFields: ['browser', 'main'] }),
    commonjs()
  ]
}, {
  input: files,
  output: {
    dir: './dist',
    format: 'cjs',
    sourcemap: true,
    entryFileNames: '[name].cjs',
    chunkFileNames: '[name]-[hash].cjs'
  },
  external: ['isomorphic']
}, {
  input: './test',
  output: {
    dir: './dist',
    format: 'cjs',
    sourcemap: true,
    entryFileNames: '[name].cjs',
    chunkFileNames: '[name]-[hash].cjs'
  },
  external: ['isomorphic']
}]
