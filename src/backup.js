const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const log = require('bole')('backup')
const { DateTime } = require('luxon')
const template = require('lodash.template')
const templateSettings = require('lodash.templatesettings')
templateSettings.interpolate = /{{([\s\S]+?)}}/g

const DATE_TIME = `yyyy-MM-dd_HH:mm:ss`
const DATE = `yyyy-MM-dd`
const TIME = `HH:mm:ss`

function backupFrom (config, glob, tar, bucket, patterns = config.patterns) {
  const dataPath = getDataPath(config)
  if (!fs.existsSync(dataPath)) {
    mkdirp.sync(dataPath)
  }
  return bucket.enforceLifecycle()
    .then(
      () => glob(dataPath, patterns)
    ).then(
      files => {
        return zipFiles(config, tar, bucket, files)
          .then(
            tgz => {
              return uploadTarball(config, bucket, tgz)
                .then(
                  () => {
                    return { tar: tgz, files }
                  }
                )
            },
            e => {
              const msg = `Zipping files for upload failed. Backup cannot continue. ${e.message}`
              const err = new Error(msg)
              log.error(msg)
              throw err
            }
          )
      },
      e => {
        const msg = `File selection for backup from '${dataPath}' with the pattern '${patterns.join(', ')}' failed with ${e.stack}`
        const err = new Error(msg)
        log.error(msg)
        throw err
      }
    )
}

function getDataPath (config, fileName = '') {
  return path.join(path.resolve(config.basePath), config.dataPath, fileName)
}

function getFileName (config) {
  const create = template(config.fileName)
  const now = DateTime.utc()
  return create({
    dateTime: now.toFormat(DATE_TIME),
    date: now.toFormat(DATE),
    time: now.toFormat(TIME)
  })
}

function onDownloadFailed (config, err) {
  const msg = `Failed to download file - ${err.message}`
  log.error(msg)
  throw new Error(msg)
}

function restoreTo (config, tar, bucket, fileName = config.storage.archive) {
  let archiveName
  if (fileName) {
    archiveName = Promise.resolve(fileName)
  } else {
    archiveName = bucket.getLatestFile()
  }
  return archiveName
    .then(
      file => bucket.downloadFile(file)
    )
    .then(
      unzipFiles.bind(null, config, tar),
      onDownloadFailed.bind(null, config)
    )
    .then(
      output => {
        log.info(`Restore complete.`)
        return output
      },
      err => {
        const msg = `Restore attempt failed with: ${err.stack}`
        log.error(msg)
        throw new Error(msg)
      }
    )
}

function unzipFiles (config, tar, tarball) {
  const fail = err => {
    const msg = `The tarball was missing or corrupt. ${err.message}`
    log.error(msg)
    throw new Error(msg)
  }
  if (tarball) {
    const dataPath = getDataPath(config)
    return tar.unzipFiles(dataPath, tarball)
      .then(
        files => {
          if (fs.existsSync(tarball)) {
            fs.unlinkSync(tarball)
          }
          return files
        },
        fail
      )
  } else {
    fail(new Error('tarball is empty or write failed.'))
  }
}

function uploadTarball (config, bucket, tgz) {
  return bucket.uploadFile(tgz)
    .then(
      () => {
        log.info(`Backup completed successfully.`)
        if (fs.existsSync(tgz.escaped)) {
          fs.unlinkSync(tgz.escaped)
        }
        return {}
      },
      e => {
        const msg = `Failed to upload tarball to configured object store. Backup has failed. ${e.stack}`
        const err = new Error(msg)
        log.error(msg)
        if (fs.existsSync(tgz.escaped)) {
          fs.unlinkSync(tgz.escaped)
        }
        throw err
      }
    )
}

function writeMetadata (config, files) {
  const file = getDataPath(config, 'info.json')
  try {
    const base = {
      files,
      createdOn: DateTime.utc().toISO()
    }
    const metadata = Object.assign({}, base)
    fs.writeFileSync(file, JSON.stringify(metadata), 'utf8')
  } catch (err) {
    log.error(`Failed to write metadata to '${file}' (zip creation and upload will fail):\n\t${err.message}`)
  }
  return file
}

function zipFiles (config, tar, bucket, files) {
  const metaFile = writeMetadata(config, files)
  const list = files.concat(metaFile)
  const dataPath = path.resolve(getDataPath(config))
  const archive = getFileName(config)
  return tar.zipFiles(dataPath, list, archive)
}

module.exports = function (config, glob, tar, bucket) {
  return {
    backupFrom: backupFrom.bind(null, config, glob, tar, bucket),
    getFileName: getFileName.bind(null, config),
    restoreTo: restoreTo.bind(null, config, tar, bucket)
  }
}
