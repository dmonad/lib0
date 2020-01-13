import fs from 'fs'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

const files = fs.readdirSync('./').filter(file => /(?<!(test|config))\.js$/.test(file))

export default [{
  input: './test.js',
  output: {
    file: './dist/test.js',
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
  external: ['isomorphic.js']
}, {
  input: './test.js',
  output: {
    dir: './dist',
    format: 'cjs',
    sourcemap: true,
    entryFileNames: '[name].cjs',
    chunkFileNames: '[name]-[hash].cjs'
  },
  external: ['isomorphic.js']
}]
