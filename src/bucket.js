const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const log = require('bole')('bucket')
const { DateTime } = require('luxon')

function downloadFile (api, config, fileName) {
  const dir = path.join(path.resolve(config.basePath), config.dataPath)
  if (!fs.existsSync(dir)) {
    mkdirp.sync(dir)
  }
  const file = path.join(dir, fileName.replace(new RegExp(path.sep, 'g'), '_'))
  if (api.gs) {
    log.info(`Attempting to download '${fileName}' from '${config.storage.bucket}'`)
    return api.gs
      .bucket(config.storage.bucket)
      .file(fileName)
      .download({
        destination: file
      })
      .then(
        () => {
          log.info(`Downloaded tarball '${fileName}' successfully`)
          return { file, dir }
        },
        err => {
          log.info(`Could not download tarball '${fileName}':\n\t${err.message}`)
          return undefined
        }
      )
  } else {
    log.info(`Attempting to download '${fileName}' from '${config.storage.bucket}'`)
    return new Promise((resolve, reject) => {
      const download = api.s3.downloadFile({
        localFile: file,
        s3Params: {
          Bucket: config.storage.bucket,
          Key: fileName
        }
      })
      download.on('error', err => {
        const msg = `Could not download tarball '${fileName}':\n\t${err.message}`
        log.error(msg)
        reject(new Error(msg))
      })
      download.on('end', () => {
        log.info(`Downloaded tarball '${fileName}' successfully`)
        resolve({
          file, dir
        })
      })
    })
  }
}

function enforceLifecycle (api, config) {
  return getLifecycle(api, config)
    .then(
      data => {
        let changes = {}
        if (config.limits.deleteAfter && config.limits.deleteAfter !== data.deleteAfter) {
          changes.deleteAfter = config.limits.deleteAfter
        }
        if (config.limits.coldlineAfter && config.limits.coldlineAfter !== data.coldlineAfter) {
          changes.coldlineAfter = config.limits.coldlineAfter
        }
        if (Object.keys(changes).length > 0) {
          return setLifecycle(api, config, changes)
        } else {
          return config.limits
        }
      },
      err => {
        log.error(`Cannot enforce lifecycle settings for '${config.storage.bucket}'`)
        throw new Error(`Failed to set enforce lifecycle settings for '${config.storage.bucket}' ${err.stack}`)
      }
    )
}

function getFilePrefix (fileName) {
  if (fileName) {
    let [prefix] = fileName.split('{{')
    return prefix
  } else {
    return ''
  }
}

function getLatestFile (api, config) {
  const prefix = getFilePrefix(config.fileName)
  log.info(`Attempting to find latest file in '${config.storage.bucket}' starting with '${prefix}'`)
  if (api.gs) {
    const options = {
      autoPaginate: false
    }
    if (prefix !== '') {
      options.prefix = prefix
    }
    return api.gs
      .bucket(config.storage.bucket)
      .getFiles(options)
      .then(
        ([files]) => {
          const sorted = files.map(f => {
            return {
              ...f,
              ...f.metadata
            }
          }).sort(sortByDate)
          return sorted.length ? sorted[0].name : undefined
        },
        e => {
          const msg = `Could not determine latest file from bucket '${config.storage.bucket}':\n\t${e.message}`
          log.error(msg)
          throw new Error(msg)
        }
      )
  } else {
    const options = {
      Bucket: config.storage.bucket
    }
    if (prefix !== '') {
      options.Prefix = prefix
    }
    return new Promise((resolve, reject) => {
      api.s3.listObjectsV2(options, (e, data) => {
        if (e) {
          const msg = `Could not determine latest file from bucket '${config.storage.bucket}':\n\t${e.message}`
          log.error(msg)
          reject(new Error(msg))
        } else {
          data.Contents.sort(sortByDate)
          resolve(data.Contents.length ? data.Contents[0].Key : undefined)
        }
      })
    })
  }
}

function getLifecycle (api, config) {
  if (api.gs) {
    const bucket = api.gs
      .bucket(config.storage.bucket)
    return new Promise((resolve, reject) => {
      bucket.request({
        method: 'GET',
        uri: '',
        qs: {fields: 'lifecycle'}
      }, (err, response) => {
        if (err) {
          reject(err)
        } else {
          resolve(parseLifecycle(response.body || response))
        }
      })
    })
  } else {
    return new Promise((resolve, reject) => {
      api.s3.getBucketLifecycleConfiguration({Bucket: config.storage.bucket}, (err, result) => {
        if (err) {
          reject(err)
        } else {
          resolve(parseLifecycle(result))
        }
      })
    })
  }
}

function parseLifecycle (data) {
  if (data.lifecycle) {
    const lifecycle = data.lifecycle.rule.reduce((data, rule) => {
      if (rule.action.type === 'Delete') {
        data.deleteAfter = rule.condition.age - 1
      } else if (rule.action.type === 'SetStorageClass') {
        data.coldlineAfter = rule.condition.age - 1
      }
      return data
    }, {})
    return lifecycle
  } else if (data.Rules && data.Rules.length > 0) {
    const lifecycle = data.Rules.reduce((data, rule) => {
      if (rule.Status && rule.Status === 'Enabled') {
        if (rule.Transitions && rule.Transitions[0]) {
          data.coldlineAfter = rule.Transitions[0].Days
        }
        if (rule.Expiration && rule.Status === 'Enabled') {
          data.deleteAfter = rule.Expiration.Days
        }
      }
      return data
    }, {})
    return lifecycle
  } else {
    return {}
  }
}

function setLifecycle (api, config, changes = { deleteAfter: 0, coldlineAfter: 0 }) {
  if (api.gs) {
    const data = {
      lifecycle: {
        rule: []
      }
    }
    if (changes.deleteAfter) {
      data.lifecycle.rule.push({
        action: {
          type: 'Delete'
        },
        condition: {
          age: config.limits.deleteAfter + 1,
          matchesStorageClass: [ 'MULTI_REGIONAL', 'REGIONAL', 'NEARLINE', 'STANDARD', 'COLDLINE' ]
        }
      })
    }
    if (changes.coldlineAfter) {
      data.lifecycle.rule.push({
        action: {
          type: 'SetStorageClass',
          storageClass: 'COLDLINE'
        },
        condition: {
          age: config.limits.coldlineAfter + 1,
          matchesStorageClass: ['MULTI_REGIONAL', 'REGIONAL', 'NEARLINE', 'STANDARD']
        }
      })
    }
    const bucket = api.gs
      .bucket(config.storage.bucket)
    return new Promise((resolve, reject) => {
      bucket.request({
        method: 'PATCH',
        uri: '',
        json: data,
        qs: { fields: 'lifecycle' }
      }, (err, response) => {
        if (err) {
          reject(err)
        }
        resolve(parseLifecycle(response.body || response))
      }).bind(bucket)
    })
  } else {
    const Rules = []
    if (changes.deleteAfter) {
      Rules.push({
        Status: 'Enabled',
        Expiration: { Days: config.limits.deleteAfter }
      })
    }
    if (changes.coldlineAfter) {
      Rules.push({
        Status: 'Enabled',
        Transitions: [
          {
            Days: config.limits.coldlineAfter,
            StorageClass: 'GLACIER'
          }
        ]
      })
    }
    const params = {
      Bucket: config.storage.bucket,
      LifecycleConfiguration: {
        Rules: Rules
      }
    }
    return new Promise((resolve, reject) => {
      api.s3.putBucketLifecycleConfiguration(params, (err, result) => {
        if (err) {
          reject(err)
        }
        resolve(parseLifecycle(result))
      })
    })
  }
}

function sortByDate (a, b) {
  const aDate = DateTime.fromISO(a.updated || a.timeCreated || a.LastModified)
  const bDate = DateTime.fromISO(b.updated || b.timeCreated || b.LastModified)
  if (aDate === bDate) {
    return 0
  } else if (aDate > bDate) {
    return -1
  } else {
    return 1
  }
}

function uploadFile (api, config, file) {
  const dir = path.dirname(file.escaped)
  if (api.gs) {
    return api.gs
      .bucket(config.storage.bucket)
      .upload(file.escaped, { destination: file.destination })
      .then(
        () => {
          log.info(`Uploaded tarball '${file.destination}' to bucket '${config.storage.bucket}' successfully`)
          return { file, dir }
        },
        err => {
          log.info(`Could not upload tarball '${file.destination}' to bucket '${config.storage.bucket}':\n\t${err.message}`)
          throw err
        }
      )
  } else {
    return new Promise((resolve, reject) => {
      const upload = api.s3.uploadFile({
        localFile: file.escaped,
        s3Params: {
          Bucket: config.storage.bucket,
          Key: file.destination
        }
      })
      upload.on('error', err => {
        log.info(`Could not upload tarball '${file.destination}' to bucket '${config.storage.bucket}':\n\t${err.message}`)
        reject(err)
      })
      upload.on('end', () => {
        log.info(`Uploaded tarball '${file.destination}' to bucket '${config.storage.bucket}' successfully`)
        resolve({ file, dir })
      })
    })
  }
}

module.exports = function (api = require('./bucketApi'), config = require('./config')) {
  return {
    downloadFile: downloadFile.bind(null, api, config),
    enforceLifecycle: enforceLifecycle.bind(null, api, config),
    getFilePrefix: getFilePrefix.bind(null, api, config),
    getLifecycle: getLifecycle.bind(null, api, config),
    getLatestFile: getLatestFile.bind(null, api, config),
    setLifecycle: setLifecycle.bind(null, api, config),
    uploadFile: uploadFile.bind(null, api, config)
  }
}
