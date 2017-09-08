## Simple BlockChain

Project for understanding bitcoin(blockchain) algorithm.

### Installation

```bash
git clone https://github.com/proin/simple-blockchain
cd simple-blockchain
npm install
```

### Run Code

```bash
API_PORT=3000 P2P_PORT=4000 node blockchain.js 
API_PORT=3001 P2P_PORT=4001 PEERS=ws://localhost:4000 node blockchain.js 
```

### API

> http://host:port/blocks

- Show list of blockchain

> http://host:port/mining

- create new block with Proof of Work

> http://host:port/peers/add?peer=ws://localhost:4000

- add peers


### Reference

- https://blog.iwanhae.ga/introduction_of_bitcoin
- https://www.slideshare.net/skimaza/ss-57356762
- https://organicmedialab.com/2014/01/11/virtuous-cycle-of-bitcoin-mining
- http://homoefficio.github.io/2016/01/23/BlockChain-기초-개념
- https://www.ddengle.com/board_free_voted/160514
- http://www.csharpstudy.com/bitcoin/article/7-%EB%B9%84%ED%8A%B8%EC%BD%94%EC%9D%B8-Peer-%EB%85%B8%EB%93%9C-%EA%B2%80%EC%83%89
