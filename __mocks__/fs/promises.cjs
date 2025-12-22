// Mock for Node.js 'fs/promises' module using memfs
const { fs } = require('memfs')

module.exports = fs.promises
