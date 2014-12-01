var fs = require('fs')
var path = require('path')
var stream = require('stream')
var mkdirp = require('mkdirp')
var youtubedl = require('youtube-dl')
var xml2js = require('xml2js')
var convertFS = require('../index')

var transformer = function (inStream, filepath, fh) {
  var newFilePath = filepath

  console.log('filepath', newFilePath)
  if (path.extname(filepath) === '.webloc') {
    var newFilePath = path.join(path.dirname(filepath), path.basename(filepath, '.webloc') + '.mp4')
    console.log(newFilePath)
  }

  // var outStream = new stream.PassThrough()
  var outStream = fs.createWriteStream(newFilePath)

  var contents = ""

  inStream.on('data', function (chunk) {
    if (path.extname(filepath) != '.webloc') {
      return outStream.write(contents)
    }

    contents += chunk.toString()
  })

  inStream.on('end', function () {
    if (path.extname(filepath) != '.webloc') {
      return outStream.end()
    }

    xml2js.parseString(contents, function (error, result) {
      if (error) return console.error(error)
      var video = youtubedl(result.plist.dict[0].string[0],  ['--max-quality=18'], {})
      video.on('info', function(info) {
        console.log('Download started');
        console.log('filename: ' + info.filename);
        console.log('size: ' + info.size);
      });
      video.pipe(outStream)
    })
  })

  outStream.on('finish', function () {
    fs.unlink(filepath, function (error) {
      if (error) {
        console.error('error unlinking', filepath)
        console.error(error)
      }
    })
  })

  return outStream
}

var originalDir = path.join(__dirname, 'dirs', 'youtube', 'original')
var mountDir = path.join(__dirname, 'dirs', 'youtube', 'transform')

mkdirp.sync(originalDir)
mkdirp.sync(mountDir)

convertFS.mount(
  originalDir
, mountDir
, transformer
, false
)