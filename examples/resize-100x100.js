var path = require('path')
var stream = require('stream')
var mkdirp = require('mkdirp')
var gm = require('gm')
var convertFS = require('../index')

var transformer = function (inStream) {
  var outStream = new stream.PassThrough()

  gm(inStream)
  .resize(100, 100)
  .stream(function(error, stdout, stderr) {
    if (error) return outStream.emit('error', stderr)
    stdout.pipe(outStream)
  })

  return outStream
}

var originalDir = path.join(__dirname, 'dirs', 'resize', 'original')
var mountDir = path.join(__dirname, 'dirs', 'resize', 'transform')

mkdirp.sync(originalDir)
mkdirp.sync(mountDir)

convertFS.mount(
  originalDir
, mountDir
, transformer
, false
)