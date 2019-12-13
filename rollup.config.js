import fs from 'fs'

const files = fs.readdirSync('./').filter(file => /(?<!(test|config))\.js$/.test(file))

export default [{
  input: './test.js',
  output: {
    dir: './dist',
    format: 'iife',
    sourcemap: true
  }
}, {
  input: files,
  output: {
    dir: './dist',
    format: 'cjs',
    sourcemap: true
  }
}, {
  input: './index.js',
  output: {
    dir: './dist',
    format: 'cjs',
    sourcemap: true
  }
}]
