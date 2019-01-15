require('./setup')
const path = require('path')
const EventEmitter = require('events')

const gsBucket = {
  file: () => {},
  getFiles: () => {},
  upload: () => {},
  request: () => {}
}

const gsFile = {
  download: () => {}
}

const gsAPI = {
  gs: {
    bucket: () => {}
  }
}

const s3API = {
  s3: {
    downloadFile: () => {},
    uploadFile: () => {},
    getBucketLifecycleConfiguration: () => {},
    listObjectsV2: () => {},
    putBucketLifecycleConfiguration: () => {}
  }
}

const Bucket = require('../src/bucket')

describe('Bucket', function () {
  describe('with S3', function () {
    describe('when downloading file', function () {
      describe('and download fails', function () {
        let s3Mock, bucket, result
        before(function (done) {
          const downloads = new EventEmitter()
          const fullPath = path.resolve('./spec/data/metrics.tgz')
          bucket = Bucket(s3API, {
            storage: {
              bucket: 'test-bucket'
            },
            basePath: './spec',
            dataPath: 'data'
          })
          s3Mock = sinon.mock(s3API.s3)
          s3Mock
            .expects('downloadFile')
            .withArgs({
              localFile: fullPath,
              s3Params: {
                Bucket: 'test-bucket',
                Key: 'metrics.tgz'
              }
            })
            .returns(downloads)

          bucket.downloadFile('metrics.tgz')
            .then(
              null,
              x => {
                result = x
                done()
              }
            )

          setTimeout(() => {
            downloads.emit('error', new Error('ohno'))
          }, 10)
        })

        it('should be rejected with error', function () {
          console.log(result.stack)
          expect(result.message).to.equal(
            `Could not download tarball 'metrics.tgz':\n\tohno`
          )
          s3Mock.verify()
        })
      })

      describe('and download succeeds', function () {
        let s3Mock, bucket, result, fullPath
        before(function () {
          const downloads = new EventEmitter()
          fullPath = path.resolve('./spec/data/metrics.tgz')
          bucket = Bucket(s3API, {
            storage: {
              bucket: 'test-bucket'
            },
            basePath: './spec',
            dataPath: 'data'
          })
          s3Mock = sinon.mock(s3API.s3)
          s3Mock
            .expects('downloadFile')
            .withArgs({
              localFile: fullPath,
              s3Params: {
                Bucket: 'test-bucket',
                Key: 'metrics.tgz'
              }
            })
            .returns(downloads)

          bucket.downloadFile('metrics.tgz')
            .then(
              x => { result = x }
            )
          process.nextTick(() => {
            downloads.emit('end')
          })
        })

        it('should resolve with metadata', function () {
          expect(result).to.eql({
            dir: path.dirname(fullPath),
            file: fullPath
          })
          s3Mock.verify()
        })
      })
    })

    describe('when uploading file', function () {
      describe('and upload fails', function () {
        let s3Mock, bucket, result
        before(function () {
          const uploads = new EventEmitter()
          const fullPath = path.resolve('./spec/metrics.tgz')
          bucket = Bucket(s3API, {
            storage: {
              bucket: 'test-bucket'
            },
            basePath: './spec',
            dataPath: 'data'
          })
          s3Mock = sinon.mock(s3API.s3)
          s3Mock
            .expects('uploadFile')
            .withArgs({
              localFile: fullPath,
              s3Params: {
                Bucket: 'test-bucket',
                Key: 'metrics.tgz'
              }
            })
            .returns(uploads)

          bucket.uploadFile(fullPath)
            .then(
              null,
              err => { result = err }
            )
          process.nextTick(() => {
            uploads.emit('error', new Error('ohno'))
          })
        })

        it('should reject with error', function () {
          expect(result.message).to.equal('ohno')
          s3Mock.verify()
        })
      })

      describe('and upload succeeds', function () {
        let s3Mock, bucket, result, fullPath
        before(function () {
          const uploads = new EventEmitter()
          fullPath = path.resolve('./spec/metrics.tgz')
          bucket = Bucket(s3API, {
            storage: {
              bucket: 'test-bucket'
            },
            basePath: './spec',
            dataPath: 'data'
          })
          s3Mock = sinon.mock(s3API.s3)
          s3Mock
            .expects('uploadFile')
            .withArgs({
              localFile: fullPath,
              s3Params: {
                Bucket: 'test-bucket',
                Key: 'metrics.tgz'
              }
            })
            .returns(uploads)

          bucket.uploadFile(fullPath)
            .then(
              x => { result = x }
            )
          process.nextTick(() => {
            uploads.emit('end')
          })
        })

        it('should resolve with metadata', function () {
          expect(result).to.eql({
            dir: path.dirname(fullPath),
            file: fullPath
          })
          s3Mock.verify()
        })
      })
    })

    describe('when enforcing lifecycle configuration', function () {
      describe('and get fails', function () {
        let s3Mock, bucket, result
        before(function () {
          bucket = Bucket(s3API, {
            storage: {
              bucket: 'test-bucket'
            }
          })
          s3Mock = sinon.mock(s3API.s3)
          s3Mock
            .expects('getBucketLifecycleConfiguration')
            .withArgs({
              Bucket: 'test-bucket'
            })
            .yields(new Error('get failed'))

          return bucket.enforceLifecycle()
            .then(
              null,
              err => { result = err }
            )
        })

        it('should reject with error', function () {
          expect(result.message.split('\n')[0]).to.equal(
            `Failed to set enforce lifecycle settings for 'test-bucket' Error: get failed`
          )
          s3Mock.verify()
        })
      })

      describe('and only cold storage changes', function () {
        let s3Mock, bucket, result
        before(function () {
          bucket = Bucket(s3API, {
            storage: {
              bucket: 'test-bucket'
            },
            limits: {
              deleteAfter: 20,
              coldlineAfter: 10
            }
          })
          s3Mock = sinon.mock(s3API.s3)
          s3Mock
            .expects('getBucketLifecycleConfiguration')
            .withArgs({
              Bucket: 'test-bucket'
            })
            .yields(null, {
              Rules: [
                {
                  Status: 'Enabled',
                  Transitions: [
                    {
                      Days: 5,
                      StorageClass: 'GLACIER'
                    }
                  ]
                },
                {
                  Status: 'Enabled',
                  Expiration: {
                    Days: 20
                  }
                }
              ]
            })

          s3Mock
            .expects('putBucketLifecycleConfiguration')
            .withArgs({
              Bucket: 'test-bucket',
              LifecycleConfiguration: {
                Rules: [
                  {
                    Status: 'Enabled',
                    Transitions: [
                      {
                        Days: 10,
                        StorageClass: 'GLACIER'
                      }
                    ]
                  }
                ]
              }
            })
            .yields(null, {
              Rules: [
                {
                  Status: 'Enabled',
                  Transitions: [
                    {
                      Days: 10,
                      StorageClass: 'GLACIER'
                    }
                  ]
                },
                {
                  Status: 'Enabled',
                  Expiration: {
                    Days: 20
                  }
                }
              ]
            })

          return bucket.enforceLifecycle()
            .then(
              x => { result = x }
            )
        })

        it('should resolve with resulting settings', function () {
          expect(result).to.eql({ coldlineAfter: 10, deleteAfter: 20 })
          s3Mock.verify()
        })
      })

      describe('and only delete changes', function () {
        let s3Mock, bucket, result
        before(function () {
          bucket = Bucket(s3API, {
            storage: {
              bucket: 'test-bucket'
            },
            limits: {
              deleteAfter: 20,
              coldlineAfter: 10
            }
          })
          s3Mock = sinon.mock(s3API.s3)
          s3Mock
            .expects('getBucketLifecycleConfiguration')
            .withArgs({
              Bucket: 'test-bucket'
            })
            .yields(null, {
              Rules: [
                {
                  Status: 'Enabled',
                  Transitions: [
                    {
                      Days: 10,
                      StorageClass: 'GLACIER'
                    }
                  ]
                },
                {
                  Status: 'Enabled',
                  Expiration: {
                    Days: 10
                  }
                }
              ]
            })

          s3Mock
            .expects('putBucketLifecycleConfiguration')
            .withArgs({
              Bucket: 'test-bucket',
              LifecycleConfiguration: {
                Rules: [
                  {
                    Status: 'Enabled',
                    Expiration: {
                      Days: 20
                    }
                  }
                ]
              }
            })
            .yields(null, {
              Rules: [
                {
                  Status: 'Enabled',
                  Transitions: [
                    {
                      Days: 10,
                      StorageClass: 'GLACIER'
                    }
                  ]
                },
                {
                  Status: 'Enabled',
                  Expiration: {
                    Days: 20
                  }
                }
              ]
            })

          return bucket.enforceLifecycle()
            .then(
              x => { result = x }
            )
        })

        it('should resolve with resulting settings', function () {
          expect(result).to.eql({ coldlineAfter: 10, deleteAfter: 20 })
          s3Mock.verify()
        })
      })

      describe('and no settings change', function () {
        let s3Mock, bucket, result
        before(function () {
          bucket = Bucket(s3API, {
            storage: {
              bucket: 'test-bucket'
            },
            limits: {
              deleteAfter: 20,
              coldlineAfter: 10
            }
          })
          s3Mock = sinon.mock(s3API.s3)
          s3Mock
            .expects('getBucketLifecycleConfiguration')
            .withArgs({
              Bucket: 'test-bucket'
            })
            .yields(null, {
              Rules: [
                {
                  Status: 'Enabled',
                  Transitions: [
                    {
                      Days: 10,
                      StorageClass: 'GLACIER'
                    }
                  ]
                },
                {
                  Status: 'Enabled',
                  Expiration: {
                    Days: 20
                  }
                }
              ]
            })

          s3Mock
            .expects('putBucketLifecycleConfiguration')
            .never()

          return bucket.enforceLifecycle()
            .then(
              x => { result = x }
            )
        })

        it('should resolve with settings (no set call made)', function () {
          expect(result).to.eql({ coldlineAfter: 10, deleteAfter: 20 })
          s3Mock.verify()
        })
      })

      describe('and both settings change', function () {
        let s3Mock, bucket, result
        before(function () {
          bucket = Bucket(s3API, {
            storage: {
              bucket: 'test-bucket'
            },
            limits: {
              deleteAfter: 20,
              coldlineAfter: 10
            }
          })
          s3Mock = sinon.mock(s3API.s3)
          s3Mock
            .expects('getBucketLifecycleConfiguration')
            .withArgs({
              Bucket: 'test-bucket'
            })
            .yields(null, {
              Rules: []
            })

          s3Mock
            .expects('putBucketLifecycleConfiguration')
            .withArgs({
              Bucket: 'test-bucket',
              LifecycleConfiguration: {
                Rules: [
                  {
                    Status: 'Enabled',
                    Expiration: {
                      Days: 20
                    }
                  },
                  {
                    Status: 'Enabled',
                    Transitions: [
                      {
                        Days: 10,
                        StorageClass: 'GLACIER'
                      }
                    ]
                  }
                ]
              }
            })
            .yields(null, {
              Rules: [
                {
                  Status: 'Enabled',
                  Transitions: [
                    {
                      Days: 10,
                      StorageClass: 'GLACIER'
                    }
                  ]
                },
                {
                  Status: 'Enabled',
                  Expiration: {
                    Days: 20
                  }
                }
              ]
            })

          return bucket.enforceLifecycle()
            .then(
              x => { result = x }
            )
        })

        it('should resolve with resulting settings', function () {
          expect(result).to.eql({ coldlineAfter: 10, deleteAfter: 20 })
          s3Mock.verify()
        })
      })
    })

    describe('when getting the latest file', function () {
      describe('when call fails', function () {
        let s3Mock, bucket
        before(function () {
          s3Mock = sinon.mock(s3API.s3)
          s3Mock.expects('listObjectsV2')
            .withArgs({
              Bucket: 'test-bucket',
              Prefix: 'archive.tgz'
            })
            .yields(new Error('ohnoes'))

          bucket = Bucket(s3API, {
            fileName: 'archive.tgz',
            storage: {
              bucket: 'test-bucket'
            }
          })
        })

        it('should be rejected with error', function () {
          return bucket.getLatestFile()
            .should.be.rejectedWith(
              `Could not determine latest file from bucket 'test-bucket':\n\tohnoes`
            )
        })

        it('should call listObjectsV2', function () {
          s3Mock.verify()
        })
      })

      describe('when no files exist', function () {
        let s3Mock, bucket
        before(function () {
          s3Mock = sinon.mock(s3API.s3)
          s3Mock.expects('listObjectsV2')
            .withArgs({
              Bucket: 'test-bucket',
              Prefix: 'archive.tgz'
            })
            .yields(null, {Contents: []})

          bucket = Bucket(s3API, {
            fileName: 'archive.tgz',
            storage: {
              bucket: 'test-bucket'
            }
          })
        })

        it('should resolve to undefined', function () {
          return bucket.getLatestFile()
            .should.eventually.eql(undefined)
        })

        it('should call listObjectsV2', function () {
          s3Mock.verify()
        })
      })

      describe('when files exist', function () {
        let s3Mock, bucket
        before(function () {
          s3Mock = sinon.mock(s3API.s3)
          s3Mock.expects('listObjectsV2')
            .withArgs({
              Bucket: 'test-bucket',
              Prefix: 'archive-'
            })
            .yields(null, {Contents: [
              {
                Key: 'archive-2018-05-30_02:00:00.tgz',
                LastModified: '2018-05-30T02:00:00Z'
              },
              {
                Key: 'archive-2018-05-31_02:00:00.tgz',
                LastModified: '2018-05-31T02:00:00Z'
              },
              {
                Key: 'archive-2018-05-29_02:00:00.tgz',
                LastModified: '2018-05-29T02:00:00Z'
              },
              {
                Key: 'archive-2018-06-01_02:00:00.tgz',
                LastModified: '2018-06-01T02:00:00Z'
              },
              {
                Key: 'archive-2018-05-28_02:00:00.tgz',
                LastModified: '2018-05-28T02:00:00Z'
              }
            ]})

          bucket = Bucket(s3API, {
            fileName: 'archive-{{date}}.tgz',
            storage: {
              bucket: 'test-bucket'
            }
          })
        })

        it('should resolve to the latest file name', function () {
          return bucket.getLatestFile()
            .should.eventually.eql('archive-2018-06-01_02:00:00.tgz')
        })

        it('should call listObjectsV2', function () {
          s3Mock.verify()
        })
      })
    })
  })

  describe('with GS', function () {
    describe('when downloading file', function () {
      describe('and download fails', function () {
        let gsMock, bucketMock, fileMock, bucket, result
        before(function () {
          const fullPath = path.resolve('./spec/data/metrics.tgz')
          bucket = Bucket(gsAPI, {
            storage: {
              bucket: 'test-bucket'
            },
            basePath: './spec',
            dataPath: 'data'
          })
          gsMock = sinon.mock(gsAPI.gs)
          bucketMock = sinon.mock(gsBucket)
          fileMock = sinon.mock(gsFile)
          gsMock
            .expects('bucket')
            .withArgs('test-bucket')
            .returns(gsBucket)
          bucketMock
            .expects('file')
            .withArgs('metrics.tgz')
            .returns(gsFile)
          fileMock
            .expects('download')
            .withArgs({
              destination: fullPath
            })
            .rejects(new Error('ohno'))

          return bucket.downloadFile('metrics.tgz')
            .then(
              x => { result = x }
            )
        })

        it('should return undefined', function () {
          expect(result).to.equal(undefined)
          gsMock.verify()
          bucketMock.verify()
          fileMock.verify()
        })
      })

      describe('and download succeeds', function () {
        let gsMock, bucketMock, fileMock, bucket, result, fullPath
        before(function () {
          fullPath = path.resolve('./spec/data/metrics.tgz')
          bucket = Bucket(gsAPI, {
            storage: {
              bucket: 'test-bucket'
            },
            basePath: './spec',
            dataPath: 'data'
          })
          gsMock = sinon.mock(gsAPI.gs)
          bucketMock = sinon.mock(gsBucket)
          fileMock = sinon.mock(gsFile)
          gsMock
            .expects('bucket')
            .withArgs('test-bucket')
            .returns(gsBucket)
          bucketMock
            .expects('file')
            .withArgs('metrics.tgz')
            .returns(gsFile)
          fileMock
            .expects('download')
            .withArgs({
              destination: fullPath
            })
            .resolves({
              file: fullPath,
              dir: path.dirname(fullPath)
            })

          return bucket.downloadFile('metrics.tgz')
            .then(
              x => { result = x }
            )
        })

        it('should resolve with metadata', function () {
          expect(result).to.eql({
            dir: path.dirname(fullPath),
            file: fullPath
          })
          gsMock.verify()
          bucketMock.verify()
          fileMock.verify()
        })
      })
    })

    describe('when uploading file', function () {
      describe('and upload fails', function () {
        let gsMock, bucketMock, bucket, result
        before(function () {
          const fullPath = path.resolve('./spec/metrics.tgz')
          bucket = Bucket(gsAPI, {
            storage: {
              bucket: 'test-bucket'
            },
            basePath: './spec',
            dataPath: 'data'
          })
          gsMock = sinon.mock(gsAPI.gs)
          bucketMock = sinon.mock(gsBucket)
          gsMock
            .expects('bucket')
            .withArgs('test-bucket')
            .returns(gsBucket)
          bucketMock
            .expects('upload')
            .withArgs(fullPath)
            .rejects(new Error('ohno'))

          return bucket.uploadFile(fullPath)
            .then(
              null,
              err => { result = err }
            )
        })

        it('should return undefined', function () {
          result.message.should.equal('ohno')
          gsMock.verify()
          bucketMock.verify()
        })
      })

      describe('and upload succeeds', function () {
        let gsMock, bucketMock, bucket, result, fullPath
        before(function () {
          fullPath = path.resolve('./spec/metrics.tgz')
          bucket = Bucket(gsAPI, {
            storage: {
              bucket: 'test-bucket'
            },
            basePath: './spec',
            dataPath: 'data'
          })
          gsMock = sinon.mock(gsAPI.gs)
          bucketMock = sinon.mock(gsBucket)
          gsMock
            .expects('bucket')
            .withArgs('test-bucket')
            .returns(gsBucket)
          bucketMock
            .expects('upload')
            .withArgs(fullPath)
            .resolves({})

          return bucket.uploadFile(fullPath)
          .then(
            x => { result = x }
          )
        })

        it('should return undefined', function () {
          result.should.eql({
            dir: path.dirname(fullPath),
            file: fullPath
          })
          gsMock.verify()
          bucketMock.verify()
        })
      })
    })

    describe('when enforcing lifecycle configuration', function () {
      describe('and get fails', function () {
        let gsMock, bucketMock, bucket, result
        before(function () {
          bucket = Bucket(gsAPI, {
            storage: {
              bucket: 'test-bucket'
            }
          })
          gsMock = sinon.mock(gsAPI.gs)
          bucketMock = sinon.mock(gsBucket)
          gsMock
            .expects('bucket')
            .withArgs('test-bucket')
            .returns(gsBucket)
          bucketMock
            .expects('request')
            .withArgs({
              method: 'GET',
              uri: '',
              qs: { fields: 'lifecycle' }
            })
            .yields(new Error('bad request'))

          return bucket.enforceLifecycle()
            .then(
              null,
              err => { result = err }
            )
        })

        it('should reject with error', function () {
          expect(result.message.split('\n')[0]).to.equal(
            `Failed to set enforce lifecycle settings for 'test-bucket' Error: bad request`
          )
          bucketMock.verify()
          gsMock.verify()
        })
      })

      describe('and only cold storage changes', function () {
        let gsMock, bucketMock, bucket, result
        before(function () {
          bucket = Bucket(gsAPI, {
            storage: {
              bucket: 'test-bucket'
            },
            limits: {
              deleteAfter: 30,
              coldlineAfter: 15
            }
          })
          gsMock = sinon.mock(gsAPI.gs)
          bucketMock = sinon.mock(gsBucket)
          gsMock
            .expects('bucket')
            .withArgs('test-bucket')
            .returns(gsBucket)
            .twice()
          bucketMock
            .expects('request')
            .withArgs({
              method: 'GET',
              uri: '',
              qs: { fields: 'lifecycle' }
            })
            .yields(null, {
              lifecycle: {
                rule: [
                  {
                    action: {
                      type: 'SetStorageClass',
                      storageClass: 'COLDLINE'
                    },
                    condition: {
                      age: 11
                    }
                  },
                  {
                    action: {
                      type: 'Delete'
                    },
                    condition: {
                      age: 31
                    }
                  }
                ]
              }
            })

          bucketMock
            .expects('request')
            .withArgs({
              method: 'PATCH',
              uri: '',
              json: {
                lifecycle: {
                  rule: [
                    {
                      action: {
                        storageClass: 'COLDLINE',
                        type: 'SetStorageClass'
                      },
                      condition: {
                        age: 16,
                        matchesStorageClass: ['MULTI_REGIONAL', 'REGIONAL', 'NEARLINE', 'STANDARD']
                      }
                    }
                  ]
                }
              },
              qs: { fields: 'lifecycle' }
            })
            .yields(null, {
              lifecycle: {
                rule: [
                  {
                    action: {
                      type: 'SetStorageClass',
                      storageClass: 'COLDLINE'
                    },
                    condition: {
                      age: 16
                    }
                  },
                  {
                    action: {
                      type: 'Delete'
                    },
                    condition: {
                      age: 31
                    }
                  }
                ]
              }
            })

          return bucket.enforceLifecycle()
            .then(
              x => { result = x }
            )
        })

        it('should resolve with configuration', function () {
          result.should.eql({ deleteAfter: 30, coldlineAfter: 15 })
          bucketMock.verify()
          gsMock.verify()
        })
      })

      describe('and only delete changes', function () {
        let gsMock, bucketMock, bucket, result
        before(function () {
          bucket = Bucket(gsAPI, {
            storage: {
              bucket: 'test-bucket'
            },
            limits: {
              deleteAfter: 30,
              coldlineAfter: 15
            }
          })
          gsMock = sinon.mock(gsAPI.gs)
          bucketMock = sinon.mock(gsBucket)
          gsMock
            .expects('bucket')
            .withArgs('test-bucket')
            .returns(gsBucket)
            .twice()
          bucketMock
            .expects('request')
            .withArgs({
              method: 'GET',
              uri: '',
              qs: { fields: 'lifecycle' }
            })
            .yields(null, {
              lifecycle: {
                rule: [
                  {
                    action: {
                      type: 'SetStorageClass',
                      storageClass: 'COLDLINE'
                    },
                    condition: {
                      age: 16
                    }
                  }
                ]
              }
            })

          bucketMock
            .expects('request')
            .withArgs({
              method: 'PATCH',
              uri: '',
              json: {
                lifecycle: {
                  rule: [
                    {
                      action: {
                        type: 'Delete'
                      },
                      condition: {
                        age: 31,
                        matchesStorageClass: [ 'MULTI_REGIONAL', 'REGIONAL', 'NEARLINE', 'STANDARD', 'COLDLINE' ]
                      }
                    }
                  ]
                }
              },
              qs: { fields: 'lifecycle' }
            })
            .yields(null, {
              lifecycle: {
                rule: [
                  {
                    action: {
                      type: 'SetStorageClass',
                      storageClass: 'COLDLINE'
                    },
                    condition: {
                      age: 16
                    }
                  },
                  {
                    action: {
                      type: 'Delete'
                    },
                    condition: {
                      age: 31
                    }
                  }
                ]
              }
            })

          return bucket.enforceLifecycle()
            .then(
              x => { result = x }
            )
        })

        it('should resolve with configuration', function () {
          result.should.eql({ deleteAfter: 30, coldlineAfter: 15 })
          bucketMock.verify()
          gsMock.verify()
        })
      })

      describe('and no settings change', function () {
        let gsMock, bucketMock, bucket, result
        before(function () {
          bucket = Bucket(gsAPI, {
            storage: {
              bucket: 'test-bucket'
            },
            limits: {
              deleteAfter: 30,
              coldlineAfter: 15
            }
          })
          gsMock = sinon.mock(gsAPI.gs)
          bucketMock = sinon.mock(gsBucket)
          gsMock
            .expects('bucket')
            .withArgs('test-bucket')
            .returns(gsBucket)
          bucketMock
            .expects('request')
            .withArgs({
              method: 'GET',
              uri: '',
              qs: { fields: 'lifecycle' }
            })
            .yields(null, {
              lifecycle: {
                rule: [
                  {
                    action: {
                      type: 'SetStorageClass',
                      storageClass: 'COLDLINE'
                    },
                    condition: {
                      age: 16
                    }
                  },
                  {
                    action: {
                      type: 'Delete'
                    },
                    condition: {
                      age: 31
                    }
                  }
                ]
              }
            })

          bucketMock
            .expects('request')
            .never()

          return bucket.enforceLifecycle()
            .then(
              x => { result = x }
            )
        })

        it('should resolve with configuration', function () {
          result.should.eql({ deleteAfter: 30, coldlineAfter: 15 })
          bucketMock.verify()
          gsMock.verify()
        })
      })

      describe('and both settings change', function () {
        let gsMock, bucketMock, bucket, result
        before(function () {
          bucket = Bucket(gsAPI, {
            storage: {
              bucket: 'test-bucket'
            },
            limits: {
              deleteAfter: 30,
              coldlineAfter: 15
            }
          })
          gsMock = sinon.mock(gsAPI.gs)
          bucketMock = sinon.mock(gsBucket)
          gsMock
            .expects('bucket')
            .withArgs('test-bucket')
            .returns(gsBucket)
            .twice()
          bucketMock
            .expects('request')
            .withArgs({
              method: 'GET',
              uri: '',
              qs: { fields: 'lifecycle' }
            })
            .yields(null, {})

          bucketMock
            .expects('request')
            .withArgs({
              method: 'PATCH',
              uri: '',
              json: {
                lifecycle: {
                  rule: [
                    {
                      action: {
                        type: 'Delete'
                      },
                      condition: {
                        age: 31,
                        matchesStorageClass: ['MULTI_REGIONAL', 'REGIONAL', 'NEARLINE', 'STANDARD', 'COLDLINE']
                      }
                    },
                    {
                      action: {
                        storageClass: 'COLDLINE',
                        type: 'SetStorageClass'
                      },
                      condition: {
                        age: 16,
                        matchesStorageClass: ['MULTI_REGIONAL', 'REGIONAL', 'NEARLINE', 'STANDARD']
                      }
                    }
                  ]
                }
              },
              qs: { fields: 'lifecycle' }
            })
            .yields(null, {
              lifecycle: {
                rule: [
                  {
                    action: {
                      type: 'SetStorageClass',
                      storageClass: 'COLDLINE'
                    },
                    condition: {
                      age: 16
                    }
                  },
                  {
                    action: {
                      type: 'Delete'
                    },
                    condition: {
                      age: 31
                    }
                  }
                ]
              }
            })

          return bucket.enforceLifecycle()
            .then(
              x => { result = x }
            )
        })

        it('should resolve with configuration', function () {
          result.should.eql({ deleteAfter: 30, coldlineAfter: 15 })
          bucketMock.verify()
          gsMock.verify()
        })
      })
    })

    describe('when getting the latest file', function () {
      describe('when get fails', function () {
        let gsMock, bucketMock, bucket
        before(function () {
          gsMock = sinon.mock(gsAPI.gs)
          bucketMock = sinon.mock(gsBucket)
          gsMock
            .expects('bucket')
            .withArgs('test-bucket')
            .returns(gsBucket)

          bucketMock
            .expects('getFiles')
            .withArgs({
              autoPaginate: false,
              prefix: 'archive-'
            })
            .rejects(new Error('nope'))

          bucket = Bucket(gsAPI, {
            fileName: 'archive-{{date}}.tgz',
            storage: {
              bucket: 'test-bucket'
            }
          })
        })

        it('should reject with error', function () {
          return bucket.getLatestFile()
            .should.be.rejectedWith(
              `Could not determine latest file from bucket 'test-bucket':\n\tnope`
            )
        })

        it('should call gs and bucket mocks', function () {
          gsMock.verify()
          bucketMock.verify()
        })
      })

      describe('when no files exist', function () {
        let gsMock, bucketMock, bucket
        before(function () {
          gsMock = sinon.mock(gsAPI.gs)
          bucketMock = sinon.mock(gsBucket)
          gsMock
            .expects('bucket')
            .withArgs('test-bucket')
            .returns(gsBucket)

          bucketMock
            .expects('getFiles')
            .withArgs({
              autoPaginate: false,
              prefix: 'archive-'
            })
            .resolves([])

          bucket = Bucket(gsAPI, {
            fileName: 'archive-{{date}}.tgz',
            storage: {
              bucket: 'test-bucket'
            }
          })
        })

        it('should resolve to undefined', function () {
          return bucket.getLatestFile()
            .should.eventually.eql(undefined)
        })

        it('should call gs and bucket mocks', function () {
          gsMock.verify()
          bucketMock.verify()
        })
      })

      describe('when files exist', function () {
        let gsMock, bucketMock, bucket
        before(function () {
          gsMock = sinon.mock(gsAPI.gs)
          bucketMock = sinon.mock(gsBucket)
          gsMock
            .expects('bucket')
            .withArgs('test-bucket')
            .returns(gsBucket)

          bucketMock
            .expects('getFiles')
            .withArgs({
              autoPaginate: false,
              prefix: 'archive-'
            })
            .resolves([
              {
                name: 'archive-2018-05-29_03:00:00.tgz',
                timeCreated: '2018-05-29T03:00:00Z',
                updated: undefined
              },
              {
                name: 'archive-2018-05-28_03:00:00.tgz',
                timeCreated: '2018-05-26T03:00:00Z',
                updated: '2018-05-28T03:00:00Z'
              },
              {
                name: 'archive-2018-06-01_03:00:00.tgz',
                timeCreated: '2018-05-24T03:00:00Z',
                updated: '2018-06-01T03:00:00Z'
              },
              {
                name: 'archive-2018-05-30_03:00:00.tgz',
                timeCreated: '2018-05-27T03:00:00Z',
                updated: '2018-05-30T03:00:00Z'
              },
              {
                name: 'archive-2018-05-31_03:00:00.tgz',
                timeCreated: '2018-05-25T03:00:00Z',
                updated: '2018-05-31T03:00:00Z'
              }
            ])

          bucket = Bucket(gsAPI, {
            fileName: 'archive-{{date}}.tgz',
            storage: {
              bucket: 'test-bucket'
            }
          })
        })

        it('should resolve to latest file', function () {
          return bucket.getLatestFile()
            .should.eventually.eql('archive-2018-06-01_03:00:00.tgz')
        })

        it('should call gs and bucket mocks', function () {
          gsMock.verify()
          bucketMock.verify()
        })
      })
    })
  })
})
