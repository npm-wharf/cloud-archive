#!/usr/bin/env node

const bole = require('bole')

bole.output({
  level: 'info',
  stream: process.stdout
})

const { backupFrom, restoreTo } = require('../src/index.js')

if (process.argv[2] === 'backup') {
  backupFrom()
} else if (process.argv[2] === 'restore') {
  restoreTo()
} else {
  console.log(`usage:

  cloud-archive {backup|restore}

(pass config values as environment variables)
  `)
}
