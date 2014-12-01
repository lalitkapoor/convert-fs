// This is a modified version of https://github.com/bcle/fuse4js/blob/master/example/mirrorFS.js

var f4js = require('fuse4js')
var fs = require('fs')
var pth = require('path')
var stream = require('stream')

/*
 * Convert a node.js file system exception to a numerical errno value.
 * This is necessary because node's exc.errno property appears to have wrong
 * values based on experiments.
 * On the other hand, the exc.code string seems like a correct representation
 * of the error, so we use that instead.
 */

var errnoMap = {
    EPERM: 1
  , ENOENT: 2
  , EACCES: 13
  , EINVAL: 22
  , ENOTEMPTY: 39
}

function excToErrno(exc) {
  var errno = errnoMap[exc.code]
  if (!errno)
    errno = errnoMap.EPERM // default to EPERM
  return errno
}

var Handler = function (originalDir, mountPoint, transformer) {

  // map file handlers to their 2 streams: passthrough and write
  fhStreams = {}

  /*
   * Handler for the getattr() system call.
   * path: the path to the file
   * cb: a callback of the form cb(err, stat), where err is the Posix return code
   *     and stat is the result in the form of a stat structure (when err === 0)
   */
  this.getattr = function (path, cb) {
    // console.log('getattr')
    var path = pth.join(originalDir, path)
    return fs.lstat(path, function lstatCb(err, stats) {
      if (err)
        return cb(-excToErrno(err))
      return cb(0, stats)
    })
  }

  /*
   * Handler for the setxattr() FUSE hook.
   * The arguments differ between different operating systems.
   * Darwin(Mac OSX):
   *  * a = position
   *  * b = options
   *  * c = cmd
   * Other:
   *  * a = flags
   *  * b = cmd
   *  * c = undefined
   */
  // this.setxattr = function(path, name, value, size, a, b, c, cb) {
  //   console.log("setxattr called:", path, name, value, size, a, b, c, cb)
  //   cb(0)
  // }

  /*
   * Handler for the readdir() system call.
   * path: the path to the file
   * cb: a callback of the form cb(err, names), where err is the Posix return code
   *     and names is the result in the form of an array of file names (when err === 0).
   */
  this.readdir = function (path, cb) {
    var path = pth.join(originalDir, path)
    return fs.readdir(path, function readdirCb(err, files) {
      if (err)
        return cb(-excToErrno(err))
      return cb(0, files)
    })
  }

  /*
   * Handler for the readlink() system call.
   * path: the path to the file
   * cb: a callback of the form cb(err, name), where err is the Posix return code
   *     and name is symlink target (when err === 0).
   */
  this.readlink = function (path, cb) {
    console.log('readlink')
    var path = pth.join(originalDir, path)
    return fs.readlink(path, function readlinkCb(err, name) {
      if (err)
        return cb(-excToErrno(err))
      var name = pth.resolve(originalDir, name)
      return cb(0, name)
    })
  }

  /*
   * Handler for the chmod() system call.
   * path: the path to the file
   * mode: the desired permissions
   * cb: a callback of the form cb(err), where err is the Posix return code.
   */
  Handler.prototypechmod = function (path, mode, cb) {
    console.log('chmod')
    var path = pth.join(originalDir, path)
    return fs.chmod(path, mode, function chmodCb(err) {
      if (err)
        return cb(-excToErrno(err))
      return cb(0)
    })
  }

  /*
   * Converts numerical open() flags to node.js fs.open() 'flags' string.
   */
  convertOpenFlags = function (openFlags) {
    console.log('convertOpenFlags')
    switch (openFlags & 3) {
    case 0:
      return 'r'              // O_RDONLY
    case 1:
      return 'w'              // O_WRONLY
    case 2:
      return 'r+'             // O_RDWR
    }
  }

  /*
   * Handler for the open() system call.
   * path: the path to the file
   * flags: requested access flags as documented in open(2)
   * cb: a callback of the form cb(err, [fh]), where err is the Posix return code
   *     and fh is an optional numerical file handle, which is passed to subsequent
   *     read(), write(), and release() calls (set to 0 if fh is unspecified)
   */
  this.open = function (path, flags, cb) {
    console.log('open')
    var path = pth.join(originalDir, path)
    var flags = convertOpenFlags(flags)
    fs.open(path, flags, 0666, function openCb(err, fd) {
      if (err)
        return cb(-excToErrno(err))
      cb(0, fd)
    })
  }

  /*
   * Handler for the read() system call.
   * path: the path to the file
   * offset: the file offset to read from
   * len: the number of bytes to read
   * buf: the Buffer to write the data to
   * fh:  the optional file handle originally returned by open(), or 0 if it wasn't
   * cb: a callback of the form cb(err), where err is the Posix return code.
   *     A positive value represents the number of bytes actually read.
   */
  this.read = function (path, offset, len, buf, fh, cb) {
    console.log('read')
    fs.read(fh, buf, 0, len, offset, function readCb(err, bytesRead, buffer) {
      if (err)
        return cb(-excToErrno(err))
      cb(bytesRead)
    })
  }

  /*
   * Handler for the write() system call.
   * path: the path to the file
   * offset: the file offset to write to
   * len: the number of bytes to write
   * buf: the Buffer to read data from
   * fh:  the optional file handle originally returned by open(), or 0 if it wasn't
   * cb: a callback of the form cb(err), where err is the Posix return code.
   *     A positive value represents the number of bytes actually written.
   */
  this.write = function (path, offset, len, buf, fh, cb) {
    var originalPath = pth.join(originalDir, path);
    console.log('write')
    console.log('path', path)

    var self = this

    if (!fhStreams[fh]) {
      fhStreams[fh] = {
        through: new stream.PassThrough()
      , write: null
      // , write: fs.createWriteStream(originalPath)
      }

      // TODO: Handle Errors properly

      // fhStreams[fh].write.on('error', function (error) {
      //   if (error) {
      //     console.error(error)
      //     delete self.fhStreams[fh]
      //     return
      //   }
      // })

      var transformedStream = transformer(fhStreams[fh].through, originalPath, fh)
      // transformedStream.on('error', function (error) {
      //   if (error) {
      //     console.log(error)
      //     self.fhStreams[fh].write.close()
      //     delete self.fhStreams[fh]
      //     return
      //   }
      // })

      fhStreams[fh].write = transformedStream
      // transformedStream.pipe(fhStreams[fh].write)

      fhStreams[fh].through.push(buf)

      return cb(len)
    } else {
      fhStreams[fh].through.push(buf)
      return cb(len)
    }
  }

  /*
   * Handler for the release() system call.
   * path: the path to the file
   * fh:  the optional file handle originally returned by open(), or 0 if it wasn't
   * cb: a callback of the form cb(err), where err is the Posix return code.
   */
  this.release = function (path, fh, cb) {
    console.log('release', fh)
    var self = this

    if (fhStreams[fh]) {
      fhStreams[fh].write.on('finish', function () {
        console.log('finish')
        delete self.fhStreams[fh]

        fs.fstat(fh, function (error, info) {
          fs.close(fh, function closeCb(err) {
            if (err)
              return cb(-excToErrno(err))
            cb(0)
          })
        })
      })
      fhStreams[fh].through.push(null)
    } else {
      fs.fstat(fh, function (error, info) {
        fs.close(fh, function closeCb(err) {
          if (err)
            return cb(-excToErrno(err))
          cb(0)
        })
      })
    }
  }

  /*
   * Handler for the create() system call.
   * path: the path of the new file
   * mode: the desired permissions of the new file
   * cb: a callback of the form cb(err, [fh]), where err is the Posix return code
   *     and fh is an optional numerical file handle, which is passed to subsequent
   *     read(), write(), and release() calls (it's set to 0 if fh is unspecified)
   */
  this.create = function (path, mode, cb) {
    console.log('create')
    var path = pth.join(originalDir, path)
    fs.open(path, 'w', mode, function openCb(err, fd) {
      if (err)
        return cb(-excToErrno(err))
      cb(0, fd)
    })
  }

  /*
   * Handler for the unlink() system call.
   * path: the path to the file
   * cb: a callback of the form cb(err), where err is the Posix return code.
   */
  this.unlink = function (path, cb) {
    console.log('unlink')
    var path = pth.join(originalDir, path)
    fs.unlink(path, function unlinkCb(err) {
      if (err)
        return cb(-excToErrno(err))
      cb(0)
    })
  }

  /*
   * Handler for the rename() system call.
   * src: the path of the file or directory to rename
   * dst: the new path
   * cb: a callback of the form cb(err), where err is the Posix return code.
   */
  this.rename = function (src, dst, cb) {
    console.log('rename')
    src = pth.join(originalDir, src)
    dst = pth.join(originalDir, dst)
    fs.rename(src, dst, function renameCb(err) {
      if (err)
        return cb(-excToErrno(err))
      cb(0)
    })
  }

  /*
   * Handler for the mkdir() system call.
   * path: the path of the new directory
   * mode: the desired permissions of the new directory
   * cb: a callback of the form cb(err), where err is the Posix return code.
   */
  this.mkdir = function (path, mode, cb) {
    console.log('mkdir')
    var path = pth.join(originalDir, path)
    fs.mkdir(path, mode, function mkdirCb(err) {
      if (err)
        return cb(-excToErrno(err))
      cb(0)
    })
  }

  /*
   * Handler for the rmdir() system call.
   * path: the path of the directory to remove
   * cb: a callback of the form cb(err), where err is the Posix return code.
   */
  this.rmdir = function (path, cb) {
    console.log('rmdir')
    var path = pth.join(originalDir, path)
    fs.rmdir(path, function rmdirCb(err) {
      if (err)
        return cb(-excToErrno(err))
      cb(0)
    })

  }

  /*
   * Handler for the init() FUSE hook. You can initialize your file system here.
   * cb: a callback to call when you're done initializing. It takes no arguments.
   */
  this.init = function (cb) {
    console.log("File system started at " + mountPoint)
    console.log("To stop it, type this in another shell: fusermount -u " + mountPoint)
    cb()
  }

  /*
   * Handler for the destroy() FUSE hook. You can perform clean up tasks here.
   * cb: a callback to call when you're done. It takes no arguments.
   */
  this.destroy = function (cb) {
    console.log("File system stopped")
    cb()
  }

  /*
   * Handler for the statfs() FUSE hook.
   * cb: a callback of the form cb(err, stat), where err is the Posix return code
   *     and stat is the result in the form of a statvfs structure (when err === 0)
   */
  this.statfs = function (cb) {
    cb(0, {
        bsize: 1000000
      , frsize: 1000000
      , blocks: 1000000
      , bfree: 1000000
      , bavail: 1000000
      , files: 1000000
      , ffree: 1000000
      , favail: 1000000
      , fsid: 1000000
      , flag: 1000000
      , namemax: 1000000
    })
  }
}

module.exports = Handler