module.exports = {
  basePath: process.env.BASE_PATH || process.cwd(),
  dataPath: process.env.DATA_PATH || 'archive',
  fileName: process.env.FILE_NAME_FORMAT || 'archive_{{date}}.tgz',
  patterns: (process.env.FILE_PATTERNS || '**/*').split(','),
  storage: {
    bucket: process.env.OBJECT_STORE,
    archive: process.env.FILE_NAME
  },
  limits: {
    deleteAfter: process.env.DISCARD_AFTER || 0,
    coldAfter: process.env.COLDLINE_AFTER || 0
  }
}
