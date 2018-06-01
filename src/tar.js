const fs = require('fs')
const path = require('path')
const tar = require('tar')
const log = require('bole')('tar')

function getFiles (dataPath) {
  const info = fs.readFileSync(path.join(dataPath, 'info.json'), 'utf8')
  return {
    files: JSON.parse(info).files
  }
}

function unzipFiles (dataPath, tarball) {
  return tar.x(
    {
      file: tarball.file,
      C: tarball.dir,
      unlink: true
    }
  ).then(
    () => {
      log.info(`Unpacked tarball to '${tarball.dir}'`)
      return {
        path: tarball.dataPath,
        files: getFiles(dataPath)
      }
    },
    err => {
      const msg = `Unpacking tarball failed with error:\n\t${err.message}`
      log.error(msg)
      throw new Error(msg)
    }
  )
}

function zipFiles (relativePath, files, archive) {
  const tgzFile = path.join(process.cwd(), archive)
  return tar.c(
    {
      gzip: true,
      file: tgzFile,
      follow: true,
      C: relativePath
    },
    files.map(f => `./${path.basename(f)}`)
  ).then(
    () => {
      log.info(`Created tarball with files '${files.join(', ')}'`)
      return tgzFile
    },
    err => {
      log.error(`Failed to create tarball for files - '${files.join(', ')}' with error:\n\t${err.message}`)
      throw err
    }
  )
}

module.exports = {
  unzipFiles,
  zipFiles
}
