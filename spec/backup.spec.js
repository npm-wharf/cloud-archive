require('./setup')
const path = require('path')
const LOCAL_PATH = path.resolve('./')
const Backup = require('../src/backup')
const tk = require('timekeeper')
const { DateTime } = require('luxon')

const bucket = {
  uploadFile: () => {},
  downloadFile: () => {},
  getLatestFile: () => {},
  enforceLifecycle: () => {}
}

const tar = {
  unzipFiles: () => {},
  zipFiles: () => {}
}

const globulesce = {
  glob: () => {}
}

describe('Backup', function () {
  const DATE_TIME = `yyyy-MM-dd_HH:mm:ss`
  const DATE = `yyyy-MM-dd`
  const TIME = `HH:mm:ss`
  let now
  before(function () {
    now = DateTime.utc()
    tk.freeze(Date.now())
  })

  describe('when getting file name', function () {
    it('should get default', function () {
      let backup = Backup({
        fileName: 'archive_{{date}}'
      })
      let date = now.toFormat(DATE)
      backup.getFileName().should.eql(`archive_${date}`)
    })

    it('should get date based template', function () {
      let backup = Backup({
        fileName: 'my-file-name-{{date}}.tgz'
      })
      let date = now.toFormat(DATE)
      backup.getFileName().should.eql(`my-file-name-${date}.tgz`)
    })

    it('should get time based template', function () {
      let backup = Backup({
        fileName: 'my-file-name-{{time}}.tgz'
      })
      let time = now.toFormat(TIME)
      backup.getFileName().should.eql(`my-file-name-${time}.tgz`)
    })

    it('should get datetime based template', function () {
      let backup = Backup({
        fileName: 'my-file-name-{{dateTime}}.tgz'
      })
      let dateTime = now.toFormat(DATE_TIME)
      backup.getFileName().should.eql(`my-file-name-${dateTime}.tgz`)
    })
  })

  describe('when backing up from', function () {
    describe('and glob fails', function () {
      let backup, globMock, bucketMock
      before(function () {
        bucketMock = sinon.mock(bucket)
        globMock = sinon.mock(globulesce)

        globMock.expects('glob')
          .withArgs(`${LOCAL_PATH}/spec/tmp`, ['**/*'])
          .rejects(new Error('alas'))

        bucketMock.expects('enforceLifecycle')
          .once()
          .resolves()

        backup = Backup({
          basePath: './spec',
          dataPath: 'tmp',
          patterns: [ '**/*' ]
        }, globulesce.glob, tar, bucket)
      })

      it('should reject with error', function () {
        return backup.backupFrom()
          .should.be.rejectedWith(
            new RegExp(`File selection for backup from '${LOCAL_PATH}\\/spec\\/tmp' with the pattern '\\*\\*\\/\\*' failed with Error: alas.*`)
          )
      })

      it('should call glob', function () {
        globMock.verify()
        bucketMock.verify()
      })
    })

    describe('and tar fails', function () {
      let backup, tarMock, globMock, bucketMock
      before(function () {
        bucketMock = sinon.mock(bucket)
        globMock = sinon.mock(globulesce)
        tarMock = sinon.mock(tar)

        bucketMock.expects('enforceLifecycle')
          .once()
          .resolves()

        globMock.expects('glob')
          .withArgs(`${LOCAL_PATH}/spec/tmp`, [ '**/*' ])
          .resolves([
            `${LOCAL_PATH}/spec/tmp/one.txt`,
            `${LOCAL_PATH}/spec/tmp/two.txt`
          ])

        tarMock.expects('zipFiles')
          .withArgs(`${LOCAL_PATH}/spec/tmp`,
          [
            `${LOCAL_PATH}/spec/tmp/one.txt`,
            `${LOCAL_PATH}/spec/tmp/two.txt`,
            `${LOCAL_PATH}/spec/tmp/info.json`
          ])
          .rejects(new Error('nope'))

        backup = Backup({
          basePath: './spec',
          dataPath: 'tmp',
          patterns: ['**/*']
        }, globulesce.glob, tar, bucket)
      })

      it('should reject with error', function () {
        return backup.backupFrom()
          .should.be.rejectedWith(
            `Zipping files for upload failed. Backup cannot continue. nope`
          )
      })

      it('should call tar and glob', function () {
        bucketMock.verify()
        tarMock.verify()
        globMock.verify()
      })
    })

    describe('and upload fails', function () {
      let backup, tarMock, globMock, bucketMock
      before(function () {
        bucketMock = sinon.mock(bucket)
        tarMock = sinon.mock(tar)
        globMock = sinon.mock(globulesce)

        bucketMock.expects('enforceLifecycle')
          .once()
          .resolves()

        globMock.expects('glob')
          .withArgs(`${LOCAL_PATH}/spec/tmp`, ['**/*'])
          .resolves([
            `${LOCAL_PATH}/spec/tmp/one.txt`,
            `${LOCAL_PATH}/spec/tmp/two.txt`
          ])

        tarMock.expects('zipFiles')
          .withArgs(`${LOCAL_PATH}/spec/tmp`,
          [
            `${LOCAL_PATH}/spec/tmp/one.txt`,
            `${LOCAL_PATH}/spec/tmp/two.txt`,
            `${LOCAL_PATH}/spec/tmp/info.json`
          ])
          .resolves('./spec/metrics.tgz')

        bucketMock.expects('uploadFile')
          .withArgs('./spec/metrics.tgz')
          .rejects(new Error('oops'))

        backup = Backup({
          basePath: './spec',
          dataPath: 'tmp',
          patterns: ['**/*']
        }, globulesce.glob, tar, bucket)
      })

      it('should exit with error code', function () {
        return backup.backupFrom()
          .should.be.rejectedWith(
            `Failed to upload tarball to configured object store. Backup has failed.`
          )
      })

      it('should call glob, tar and upload', function () {
        globMock.verify()
        tarMock.verify()
        bucketMock.verify()
      })
    })

    describe('and all calls succeed', function () {
      let backup, tarMock, globMock, bucketMock
      before(function () {
        bucketMock = sinon.mock(bucket)
        tarMock = sinon.mock(tar)
        globMock = sinon.mock(globulesce)

        globMock.expects('glob')
          .withArgs(`${LOCAL_PATH}/spec/tmp`, ['**/*'])
          .resolves([
            `${LOCAL_PATH}/spec/tmp/one.txt`,
            `${LOCAL_PATH}/spec/tmp/two.txt`
          ])

        tarMock.expects('zipFiles')
          .withArgs(`${LOCAL_PATH}/spec/tmp`,
          [
            `${LOCAL_PATH}/spec/tmp/one.txt`,
            `${LOCAL_PATH}/spec/tmp/two.txt`,
            `${LOCAL_PATH}/spec/tmp/info.json`
          ], `tar-${now.toFormat(DATE_TIME)}.tgz`)
          .resolves({ escaped: `./spec/tar-${now.toFormat(DATE_TIME)}.tgz`, destination: `tar-${now.toFormat(DATE_TIME)}.tgz` })

        bucketMock.expects('enforceLifecycle')
          .once()
          .resolves()

        bucketMock.expects('uploadFile')
          .withArgs({ escaped: `./spec/tar-${now.toFormat(DATE_TIME)}.tgz`, destination: `tar-${now.toFormat(DATE_TIME)}.tgz` })
          .resolves({
            dir: `${LOCAL_PATH}/spec/`,
            files: [
              `${LOCAL_PATH}/spec/tmp/one.txt`,
              `${LOCAL_PATH}/spec/tmp/two.txt`,
              `${LOCAL_PATH}/spec/tmp/info.json`
            ]
          })

        backup = Backup({
          basePath: './spec',
          dataPath: 'tmp',
          fileName: 'tar-{{dateTime}}.tgz',
          patterns: ['**/*']
        }, globulesce.glob, tar, bucket)
      })

      it('should return tarball metadata', function () {
        return backup.backupFrom()
          .should.eventually.eql({
            tar: { escaped: `./spec/tar-${now.toFormat(DATE_TIME)}.tgz`, destination: `tar-${now.toFormat(DATE_TIME)}.tgz` },
            files: [
              `${LOCAL_PATH}/spec/tmp/one.txt`,
              `${LOCAL_PATH}/spec/tmp/two.txt`
            ]
          })
      })

      it('should call glob, tar and upload', function () {
        globMock.verify()
        tarMock.verify()
        bucketMock.verify()
      })
    })
  })

  describe('when restoring', function () {
    describe('and download errors', function () {
      let backup, bucketMock
      before(function () {
        bucketMock = sinon.mock(bucket)

        bucketMock.expects('getLatestFile')
          .once()
          .resolves('archive-1234.tgz')

        bucketMock.expects('downloadFile')
          .withArgs('archive-1234.tgz')
          .rejects(new Error('no such tarball'))

        backup = Backup({
          basePath: './spec',
          dataPath: 'tmp',
          patterns: ['**/*'],
          storage: {
          }
        }, globulesce.glob, tar, bucket)
      })

      it('should be rejected with error', function () {
        return backup.restoreTo()
          .should.be.rejectedWith(
            `Restore attempt failed with: Error: Failed to download file - no such tarball`
          )
      })

      it('should make expected calls', function () {
        bucketMock.verify()
      })
    })

    describe('and tarball is missing', function () {
      let backup, bucketMock
      before(function () {
        bucketMock = sinon.mock(bucket)

        bucketMock.expects('getLatestFile')
          .never()

        bucketMock.expects('downloadFile')
          .withArgs('archive-1234.tgz')
          .resolves(null)

        backup = Backup({
          basePath: './spec',
          dataPath: 'tmp',
          patterns: ['**/*'],
          storage: {
            archive: 'archive-1234.tgz'
          }
        }, globulesce.glob, tar, bucket)
      })

      it('should exit with error code', function () {
        return backup.restoreTo()
          .should.be.rejectedWith('')
      })

      it('should make expected calls', function () {
        bucketMock.verify()
      })
    })

    describe('and untar fails', function () {
      let backup, bucketMock, tarMock
      before(function () {
        bucketMock = sinon.mock(bucket)
        tarMock = sinon.mock(tar)

        bucketMock.expects('getLatestFile')
          .once()
          .resolves('archive-4-3-2-1.tgz')

        bucketMock.expects('downloadFile')
          .withArgs('archive-4-3-2-1.tgz')
          .resolves({
            file: './spec/archive-4-3-2-1.tgz',
            dir: './spec'
          })
        tarMock.expects('unzipFiles')
          .withArgs(path.resolve('./spec/tmp'),
          {
            file: './spec/archive-4-3-2-1.tgz',
            dir: './spec'
          })
          .rejects(new Error('boo'))

        backup = Backup({
          basePath: './spec',
          dataPath: 'tmp',
          patterns: ['**/*'],
          storage: {}
        }, globulesce.glob, tar, bucket)
      })

      it('should reject with error', function () {
        return backup.restoreTo()
          .should.be.rejectedWith(
            `Restore attempt failed with: Error: The tarball was missing or corrupt. boo`
          )
      })

      it('should make expected calls', function () {
        bucketMock.verify()
        tarMock.verify()
      })
    })

    describe('and all calls succeed', function () {
      let backup, bucketMock, tarMock
      before(function () {
        bucketMock = sinon.mock(bucket)
        tarMock = sinon.mock(tar)

        bucketMock.expects('getLatestFile')
          .once()
          .resolves('archive-2018-10-10_12:10:10Z.tgz')

        bucketMock.expects('downloadFile')
          .withArgs('archive-2018-10-10_12:10:10Z.tgz')
          .resolves({
            file: './spec/archive-2018-10-10_12:10:10Z.tgz',
            dir: './spec'
          })
        tarMock.expects('unzipFiles')
          .withArgs(path.resolve('./spec/tmp'),
          {
            file: './spec/archive-2018-10-10_12:10:10Z.tgz',
            dir: './spec'
          })
          .resolves({
            path: `./spec`,
            files: [
              './spec/one.text',
              './spec/two.text'
            ]
          })

        backup = Backup({
          basePath: './spec',
          dataPath: 'tmp',
          patterns: ['**/*'],
          storage: {}
        }, globulesce.glob, tar, bucket)
      })

      it('should resolve with files unzipped', function () {
        return backup.restoreTo()
          .should.eventually.eql({
            path: `./spec`,
            files: [
              './spec/one.text',
              './spec/two.text'
            ]
          })
      })

      it('should make expected calls', function () {
        bucketMock.verify()
        tarMock.verify()
      })
    })
  })

  after(function () {
    tk.reset()
  })
})
