const config = require('../src/config')
const globulesce = require('globulesce')
const bucketApi = require('../src/bucketApi')
const bucket = require('../src/bucket')(bucketApi, config)
const tar = require('../src/tar')
const api = require('../src/backup')(config, globulesce, tar, bucket)

module.exports = {
  backupFrom: api.backupFrom,
  restoreTo: api.restoreTo
}
