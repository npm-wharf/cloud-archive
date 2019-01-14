const { backupFrom, restoreTo } = require('../src/index.js')
console.log(process.argv, 'ARGUMENTS')

if (process.argv[2] === 'backup') backupFrom()
if (process.argv[2] === 'restore') restoreTo()
