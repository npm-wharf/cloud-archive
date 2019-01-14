const config = require('../src/config')
const bucketApi = require('../src/bucketApi')
const bucket = require('../src/bucket')(bucketApi)
const tar = require('../src/tar')
const api = require('../src/backup')(config, tar, bucket)

module.exports = {
  backupFrom: api.backupFrom,
  restoreTo: api.restoreTo
}
