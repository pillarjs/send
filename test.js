var Mocha = require('mocha')
var path = require('path')

// Instantiate a Mocha instance.
var mocha = new Mocha()

var testDir = '/test/'
mocha.addFile(
  path.join(__dirname, testDir, 'send.js')
)
// Run the tests.
mocha.run(function (failures) {
  // exit with non-zero status if there were failures
  process.exitCode = failures ? 1 : 0
})
