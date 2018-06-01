# cloud-archive

A module to help with the task of archiving data tarballed, gzipped data to an object store (GS or S3 now). Includes retrieval

[![Build Status][travis-image]][travis-url]
[![Coverage Status][coveralls-image]][coveralls-url]

## Environment

Endpoints and connection configuration are set via environment variables:

 * `OBJECT_STORE` - the object store where tasks and grafs are stored and retrieved from
 * `FILE_NAME_FORMAT` - uses templating to specify a pattern for creating tarball names. Tokens are escaped with `<%=` `%>`.
    * All dates and times for tokens are UTC
      * `dateTime` - provides date and time: `mm_dd_yy_HH_MM_SS`
      * `date` - provides date: `mm_dd_yy`
      * `time` - provides time: `HH_MM_SS`
 * `FILE_PATTERNS` - a comma delimited list of glob patterns to tar when creating a backup. defaults to `**/*`
 * `BASE_PATH` - defaults to the processes' path
 * `DATA_PATH` - a subfolder off the base path, defaults to `archive`
 * `FILE_NAME` - a default archive name to use when restoring rather than finding the most recent. Useful in cases where you want to restore from a known archive. 

AWS:

 * `AWS_ACCESS_KEY_ID`
 * `AWS_SECRET_ACCESS_KEY`

GS:

 * `GS_PROJECT_ID`
 * `GS_USER_ID`
 * `GS_USER_KEY`

Archive limitations:

 * `DISCARD_AFTER` - how many days to keep archives for before removing them
 * `COLDLINE_AFTER` - how many days before a file is moved to "cold storage" this is primarily offerred as a way to move unliked files into a cheaper tier of slower/low priority storage.

## API

### `backupFrom([glob])`

Backs up files from `dataPath` and can selectively filter for files using the optional `glob` argument.

Returns a promise that will resolve on success with the filename or reject with an error on failure.

### `restoreTo([fileName])`

Download the latest (or optionally, a specific `filename`) to `dataPath`.

Returns a promise that will resolve on success with the full path and file listing or a reject with an error on failure.

On success, the resulting data structure looks like:

```js
{
  path: '/full/path/to/files',
  files: [
    'file1.txt',
    'file2.txt',
    'file3.txt',
    'file4.txt'
  ]
}
```

[travis-url]: https://travis-ci.org/npm-wharf/k8s-tickbot
[travis-image]: https://travis-ci.org/npm-wharf/k8s-tickbot.svg?branch=master
[coveralls-url]: https://coveralls.io/github/npm-wharf/k8s-tickbot?branch=master
[coveralls-image]: https://coveralls.io/repos/github/npm-wharf/k8s-tickbot/badge.svg?branch=master
