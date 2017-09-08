'use strict'

const crypto = require('crypto-js')
const express = require('express')
const bodyParser = require('body-parser')
const WebSocket = require('ws')
const assert = require('assert')
const merkle = require('merkle')

const API_PORT = process.env.API_PORT || 3000
const P2P_PORT = process.env.P2P_PORT || 4000
const PEERS = process.env.PEERS ? process.env.PEERS.split(',') : []

const VERSION = 1
const COMPLEX = 4 // the block's hash required zero bits (in Proof of Work)

/**
 * @exports blockchain
 * @type {Object}
 */

/**
 * @property {Class} PoW - Proof-of-Work
 */

function PoW() {
    let hash = this.hash = (block)=> {
        let {version, prevBlockHash, merkleHash, time, nonce, bits} = block.head
        return crypto.SHA256(`${version}-${prevBlockHash}-${merkleHash}-${time}-${bits}-${nonce}`).toString()
    }

    let check = this.check = (block)=> {
        let hv = hash(block)
        let bits = block.head.bits
        let key = hv.substring(0, bits)
        let result = key.match(/0/g)
        if(result && result.length == bits) 
            return true
        return false
    }

    let mining = this.mining = (block)=> {
        while(true) {
            let hv = hash(block)
            let bits = block.head.bits
            let key = hv.substring(0, bits)
            let result = key.match(/0/g)
            if(result && result.length == bits) 
                break

            block.head.nonce = block.head.nonce + 1
        }

        block.head.hash = hash(block)

        return block
    }
}

/**
 * @property {Class} Trade - Trade Data Structure
 */

function Trade(from, to, amount) {
    this.constructor = Trade

    this.from = from
    this.to = to
    this.amount = amount

    Trade.prototype.toString = ()=> `${from}-${to}-${amount}`
}

/**
 * @property {Class} BlockHeader - Block Header Structure
 * @property {Class} BlockPlayload - Block Body Structure
 * @property {Class} Block - Block Structure
 * @property {Class} BlockChain - Block Chain Structure
 */

function BlockHeader(version, prevBlockHash, merkleHash, bits) {
    this.constructor = BlockHeader 
    
    this.version = version
    this.prevBlockHash = prevBlockHash
    this.merkleHash = merkleHash
    this.time = new Date().getTime()
    this.bits = bits
    this.nonce = 0
}

function BlockPayload(data) {
    this.constructor = BlockPayload 

    this.data = data
}

function Block(version, prevBlockHash, bits, trades) {
    this.constructor = Block 
    let pow = new PoW()

    assert(version)
    assert(prevBlockHash)
    assert(bits)

    let merkleTree = merkle('sha256').sync(trades)
    let merkleHash = merkleTree.root()

    this.head = new BlockHeader(version, prevBlockHash, merkleHash, bits)
    this.payload = new BlockPayload(trades)

    this.verify = ()=> pow.check(this)
    this.mining = ()=> pow.mining(this)
}

function BlockChain(trades) {
    this.constructor = BlockChain

    let chain = this.chain = [ ]

    if(trades) 
        chain = this.chain = [ new Block(VERSION, '0', COMPLEX, trades).mining() ] 

    let getLatestBlock = this.getLatestBlock = ()=> chain[chain.length-1]

    let addBlock = this.addBlock = (block)=> {
        assert(block)
        assert.equal(block.constructor, Block)
        assert.equal(block.head.prevBlockHash, chain[chain.length - 1].head.hash)
        if(block.verify() == false) return false
        block.head.index = chain.length
        chain.push(block)
    }

    let removeBlock = this.removeBlock = ()=> {
        chain.splice(chain.length - 1 , 1)
    }

    let verify = this.verify = ()=> {
        for(let i = 0 ; i < chain.length ; i++) {
            if(chain[i].verify() == false) return false
            if(i > 0 && chain[i].head.prevBlockHash != chain[i-1].head.hash) return false
        }

        return true
    }

    let toJSON = this.toJSON = ()=> JSON.stringify(chain)

    let importJSON = this.importJSON = (json)=> {
        json = JSON.parse(json)

        chain.splice(0) 
        
        for(let i = 0 ; i < json.length ; i++) {
            let trades = []
            for(let j = 0 ; j < json[i].payload.data.length ; j++) {
                let { from, to, amount } = json[i].payload.data[j]
                let trade = new Trade(from, to, amount)
                trades.push(trade)
            }
            let { version, prevBlockHash, markleHash, time, bits, nonce, hash } = json[i].head
            let block = new Block(version, prevBlockHash, bits, trades)
            for(let key in json[i].head) block.head[key] = json[i].head[key]
            chain.push(block)
        }
    }

    let combine = this.combine = (blockchain)=> {
        if(!blockchain.getLatestBlock().head.index && !getLatestBlock().head.index) return 'Initialized Block'
        if(!blockchain.getLatestBlock().head.index && getLatestBlock().head.index) return 'Older Block'
        if(blockchain.getLatestBlock().head.index < getLatestBlock().head.index) return 'Older Block'

        let verified = blockchain.verify() 
        if(blockchain.getLatestBlock().head.index === getLatestBlock().head.index) {
            if(verified && verify()) {
                return 'Same Length'
            } else if(verified) {
                chain = this.chain = blockchain.chain
                return 'Success'
            } else {
                return 'Same Length, Fake Block'
            }
        } else {
            if(verified) {
                chain = this.chain = blockchain.chain
                return 'Success'
            }
        }
        
        return 'Fake Block'
    }
}

/**
 * running simulation service 
 *
 * @property {Function} createTrades - create dummy trades
 * @property {Function} createBlock - create new block
 * @property {Function} main - run p2p & api server
 *
 */

function createTrades() {
    let trades = []
    for(let i = 0 ; i < 5 ; i++) {
        let from = crypto.SHA256(`user-${Math.random()}`).toString()
        let to = crypto.SHA256(`user-${Math.random()}`).toString()
        let amount = Math.round(Math.random() * 10000) / 100

        let trade = new Trade(from, to, amount)
        trades.push(trade)
    }

    return trades
}

function createBlock(chain, trades) {
    return new Block(VERSION, chain.getLatestBlock().head.hash, COMPLEX, trades)
}

function main() {
    let blockchain = new BlockChain(createTrades())
    let sockets = {}

    function write(ws, message) {
        ws.send(JSON.stringify(message))
    }

    function broadcast(message) {
        for(let socket in sockets) {
            if(sockets[socket] && sockets[socket].readyState === WebSocket.OPEN )
                write(sockets[socket], message)
            else 
                delete sockets[socket]
        }
    }

    function onConnected(ws) {
        if(!ws) return 
        sockets[`${ws._socket.remoteAddress}:${ws._socket.remotePort}`] = ws

        ws.on('message', (data)=> {
            data = JSON.parse(data)
            let received = new BlockChain()
            received.importJSON(data)
            let result = blockchain.combine(received)
            console.log('P2P:', result)
            if(result == 'Success' || result == 'Older Block') {
                broadcast(blockchain.toJSON())
            }
        })

        broadcast(blockchain.toJSON())
    }

    function P2PServer() {
        let server = new WebSocket.Server({ port: P2P_PORT })
        server.on('connection', (ws)=> {
            onConnected(ws)
        })
        
        PEERS.forEach(peer=> {
            let ws = new WebSocket(peer)
            ws.on('open', ()=> {
                onConnected(ws)
            })
            ws.on('error', ()=> {
                console.log('Error on peer connection. ' + peer)
            })
        })
    }

    function APIServer() {
        let app = express()
        app.use(bodyParser.json())

        app.get('/', (req, res)=> res.send({
            API: API_PORT,
            P2P: P2P_PORT,
            PEERS: Object.keys(sockets),
            latest: blockchain.getLatestBlock().head 
        }))

        app.get('/blocks', (req, res)=> {
            res.send(blockchain.chain)
        })

        app.get('/mining', (req, res)=> {
            try {
                let newBlock = createBlock(blockchain, createTrades())
                newBlock.mining()
                blockchain.addBlock(newBlock)
                broadcast(blockchain.toJSON())
                res.send(true)
            } catch(e) {
                res.send(e)
            }
        })

        app.get('/peers/list', (req, res)=> res.send(Object.keys(sockets)))

        app.get('/peers/add', (req, res)=> {
            if(!req.query.peer) return res.send(false)

            let ws = new WebSocket(req.query.peer)
            ws.on('open', ()=> {
                onConnected(ws)
            })
            ws.on('error', ()=> {
                console.log('Error on peer connection. ' + req.query.peer)
            })

            res.send(true)
        })

        app.listen(API_PORT, ()=> console.log(`Listening API on 'http://localhost:${API_PORT}'`))
    }

    APIServer()
    P2PServer()
}

main()
