var path = require('path')
var fuse4js = require('fuse4js')
var Handlers = require('./lib/handlers')


module.exports.mount = function (originalDir, transformDir, transformer, fuseDebug) {
  var handlers = new Handlers(originalDir, transformDir, transformer)

  fuse4js.start(transformDir, handlers, fuseDebug || false, ['-o', 'volname=' + path.basename(transformDir)])
}