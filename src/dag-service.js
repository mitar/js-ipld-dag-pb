const DAGNode = require('./dag-node').DAGNode
const Block = require('ipfs-blocks').Block
const isIPFS = require('is-ipfs')
const base58 = require('bs58')

exports = module.exports = DAGService

function DAGService (blockService) {
  if (!blockService) {
    throw new Error('DAGService requires a BlockService instance')
  }

  this.bs = blockService

  // add a DAGNode to the service, storing it on the block service
  this.add = (node, callback) => {
    var data = node.encoded()

    var block = new Block(data)

    this.bs.addBlock(block, callback)
  }

  // DEPRECATED - https://github.com/ipfs/go-ipfs/issues/2262
  // this.addRecursive

  // get retrieves a DAGNode, using the Block Service
  this.get = function (multihash, callback) {
    if (Buffer.isBuffer(multihash)) {
      var mhString = base58.encode(multihash)
      if (!isIPFS.multihash(mhString)) { return callback(new Error('Invalid Key')) }
      this.getWith(multihash, callback)
    }

    if (typeof multihash === 'string') {
      var isMhash = isIPFS.multihash(multihash)
      var isPath = isIPFS.path(multihash)
      if (!isMhash && !isPath) {
        return callback(new Error('Invalid Key'))
      }
      if (isMhash) {
        var mhBuffer = new Buffer(base58.decode(multihash))
        this.getWith(mhBuffer, callback)
      }
      if (isPath) {
        var ipfsKey = new Buffer(base58.decode(multihash.replace('/ipfs/', '')))
        this.getWith(ipfsKey, callback)
      }
    }
  }

  this.getWith = function (key, callback) {
    this.bs.getBlock(key, (err, block) => {
      if (err) { return callback(err) }
      var node = new DAGNode()
      node.unMarshal(block.data)
      return callback(null, node)
    })
  }

  // getRecursive fetches a node and all of the nodes on its links recursively
  // TODO add depth param
  this.getRecursive = (multihash, callback, linkStack, nodeStack) => {
    this.get(multihash, (err, node) => {
      if (err && nodeStack.length > 0) {
        return callback(new Error('Could not complete the recursive get'), nodeStack)
      }
      if (err) {
        return callback(err)
      }

      if (!linkStack) { linkStack = [] }
      if (!nodeStack) { nodeStack = [] }

      nodeStack.push(node)

      var keys = []
      for (var i = 0; i < node.links.length; i++) {
        var link = node.links[i]
        keys.push(link.hash)
      }
      linkStack = linkStack.concat(keys)

      var next = linkStack.pop()

      if (next) {
        this.getRecursive(next, callback, linkStack, nodeStack)
      } else {
        for (var k = 0; k < nodeStack.length; k++) {
          var current = nodeStack[k]
          for (var j = 0; j < current.links.length; j++) {
            link = current.links[j]
            var index = nodeStack.findIndex((node) => {
              return node.multihash().equals(link.hash)
            })
            if (index !== -1) {
              link.node = nodeStack[index]
            }
          }
        }
        return callback(null, nodeStack)
      }
    })
  }

  // remove deletes a node with given multihash from the blockService
  this.remove = (multihash, cb) => {
    if (!multihash) { return cb(new Error('Invalid multihash')) }

    this.bs.deleteBlock(multihash, cb)
  }

  // DEPRECATED - https://github.com/ipfs/go-ipfs/issues/2262
  // this.removeRecursive = (key, callback) => { }
}
