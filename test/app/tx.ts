import * as mcl from './mcl';
import { Tree } from './tree';

const amountLen = 4;
const accountIDLen = 4;
const stateIDLen = 4;
const indexLen = 4;
const tokenIdLen = 2;

function log2(n: number) {
  return Math.ceil(Math.log2(n));
}

export interface Tx {
  hash(): string;
  encode(prefix?: boolean): string;
}

export function witness(index: number, txs: Tx[]) {
  const depth = log2(txs.length);
  const tree = Tree.new(depth);
  for (let i = 0; i < txs.length; i++) {
    const leaf = txs[i].hash();
    tree.updateSingle(i, leaf);
  }
  return tree.witness(index).nodes;
}

export function calculateRoot(txs: Tx[]) {
  const depth = log2(txs.length);
  const tree = Tree.new(depth);
  for (let i = 0; i < txs.length; i++) {
    const leaf = txs[i].hash();
    tree.updateSingle(i, leaf);
  }
  return tree.root;
}

export function serialize(txs: Tx[]) {
  const serialized = '0x' + txs.map((tx) => tx.encode()).join('');
  const commit = web3.utils.soliditySha3({ t: 'bytes', v: serialized });
  return { serialized, commit };
}

export class Tx0 {
  public static rand(): Tx0 {
    const sender = web3.utils.hexToNumber(web3.utils.randomHex(stateIDLen));
    const receiver = web3.utils.hexToNumber(web3.utils.randomHex(stateIDLen));
    const amount = web3.utils.hexToNumber(web3.utils.randomHex(amountLen));
    return new Tx0(sender, receiver, amount);
  }
  constructor(readonly sender: number, readonly receiver: number, readonly amount: number) {}

  public hash(): string {
    return web3.utils.soliditySha3(
      { v: this.sender, t: 'uint32' },
      { v: this.receiver, t: 'uint32' },
      { v: this.amount, t: 'uint32' }
    );
  }

  public mapToPoint() {
    const e = this.hash();
    return mcl.g1ToHex(mcl.mapToPoint(e));
  }

  public encode(prefix: boolean = false): string {
    let sender = web3.utils.padLeft(web3.utils.toHex(this.sender), stateIDLen * 2);
    let receiver = web3.utils.padLeft(web3.utils.toHex(this.receiver), stateIDLen * 2);
    let amount = web3.utils.padLeft(web3.utils.toHex(this.amount), amountLen * 2);
    let encoded = sender.slice(2) + receiver.slice(2) + amount.slice(2);
    if (prefix) {
      encoded = '0x' + encoded;
    }
    return encoded;
  }

  public encodeToWord(index: number): string {
    let sender = web3.utils.padLeft(web3.utils.toHex(this.sender), stateIDLen * 2);
    let receiver = web3.utils.padLeft(web3.utils.toHex(this.receiver), stateIDLen * 2);
    let amount = web3.utils.padLeft(web3.utils.toHex(this.amount), amountLen * 2);
    let _index = web3.utils.padLeft(web3.utils.toHex(index), indexLen * 2);
    let encoded = '0x' + _index.slice(2) + sender.slice(2) + receiver.slice(2) + amount.slice(2);
    return web3.utils.padLeft(encoded, 64);
  }
}

export class Tx1 {
  public static depositRoot(txs: Tx1[]) {
    const depth = log2(txs.length);
    const tree = Tree.new(depth);
    const leafs = txs.map((tx) => tx.depositHash());
    tree.updateBatch(0, leafs);
    return tree.root;
  }

  public static depositHash(accountID: number, tokenID: number, amount: number) {
    return web3.utils.soliditySha3(
      { v: accountID, t: 'uint32' },
      { v: tokenID, t: 'uint16' },
      { v: amount, t: 'uint32' }
    );
  }

  public static rand(): Tx1 {
    const accountID = web3.utils.hexToNumber(web3.utils.randomHex(accountIDLen));
    const tokenID = web3.utils.hexToNumber(web3.utils.randomHex(tokenIdLen));
    const amount = web3.utils.hexToNumber(web3.utils.randomHex(amountLen));
    const stateID = web3.utils.hexToNumber(web3.utils.randomHex(stateIDLen));
    return new Tx1(accountID, tokenID, amount, stateID);
  }

  constructor(
    readonly accountID: number,
    readonly tokenID: number,
    readonly amount: number,
    readonly stateID: number
  ) {}

  public hash() {
    return web3.utils.soliditySha3(
      { v: this.accountID, t: 'uint32' },
      { v: this.tokenID, t: 'uint16' },
      { v: this.amount, t: 'uint32' },
      { v: this.stateID, t: 'uint32' }
    );
  }

  public depositHash() {
    return web3.utils.soliditySha3(
      { v: this.accountID, t: 'uint32' },
      { v: this.tokenID, t: 'uint16' },
      { v: this.amount, t: 'uint32' }
    );
  }

  public encode(prefix: boolean = false) {
    let accountID = web3.utils.padLeft(web3.utils.toHex(this.accountID), accountIDLen * 2);
    let tokenID = web3.utils.padLeft(web3.utils.toHex(this.tokenID), tokenIdLen * 2);
    let amount = web3.utils.padLeft(web3.utils.toHex(this.amount), amountLen * 2);
    let additional = web3.utils.padLeft(web3.utils.toHex(this.stateID), stateIDLen * 2);
    let encoded = accountID.slice(2) + tokenID.slice(2) + amount.slice(2) + additional.slice(2);
    if (prefix) {
      encoded = '0x' + encoded;
    }
    return encoded;
  }
}

export class Tx2 {
  public static depositHash(accountID: number, tokenID: number, amount: number) {
    return web3.utils.soliditySha3(
      { v: accountID, t: 'uint32' },
      { v: tokenID, t: 'uint16' },
      { v: amount, t: 'uint32' }
    );
  }

  public static rand(): Tx2 {
    const stateID = web3.utils.hexToNumber(web3.utils.randomHex(stateIDLen));
    const tokenID = web3.utils.hexToNumber(web3.utils.randomHex(tokenIdLen));
    const amount = web3.utils.hexToNumber(web3.utils.randomHex(amountLen));
    return new Tx2(stateID, tokenID, amount);
  }
  constructor(readonly stateID: number, readonly tokenID: number, readonly amount: number) {}

  public hash(): string {
    return web3.utils.soliditySha3(
      { v: this.stateID, t: 'uint32' },
      { v: this.tokenID, t: 'uint16' },
      { v: this.amount, t: 'uint32' }
    );
  }

  public mapToPoint() {
    const e = this.hash();
    return mcl.g1ToHex(mcl.mapToPoint(e));
  }

  public encode(prefix: boolean = false): string {
    let stateID = web3.utils.padLeft(web3.utils.toHex(this.stateID), stateIDLen * 2);
    let tokenID = web3.utils.padLeft(web3.utils.toHex(this.tokenID), tokenIdLen * 2);
    let amount = web3.utils.padLeft(web3.utils.toHex(this.amount), amountLen * 2);
    let encoded = stateID.slice(2) + tokenID.slice(2) + amount.slice(2);
    if (prefix) {
      encoded = '0x' + encoded;
    }
    return encoded;
  }
}

export class Tx3 {
  public static rand(): Tx3 {
    const sender = web3.utils.hexToNumber(web3.utils.randomHex(stateIDLen));
    const receiver = web3.utils.hexToNumber(web3.utils.randomHex(stateIDLen));
    const amount = web3.utils.hexToNumber(web3.utils.randomHex(amountLen));
    const accountID = web3.utils.hexToNumber(web3.utils.randomHex(accountIDLen));
    return new Tx3(sender, receiver, amount, accountID);
  }
  constructor(
    readonly sender: number,
    readonly receiver: number,
    readonly amount: number,
    readonly accountID: number
  ) {}

  public hash(): string {
    return web3.utils.soliditySha3(
      { v: this.sender, t: 'uint32' },
      { v: this.receiver, t: 'uint32' },
      { v: this.amount, t: 'uint32' },
      { v: this.accountID, t: 'uint32' }
    );
  }

  public mapToPoint() {
    const e = this.hash();
    return mcl.g1ToHex(mcl.mapToPoint(e));
  }

  public encode(prefix: boolean = false): string {
    let sender = web3.utils.padLeft(web3.utils.toHex(this.sender), stateIDLen * 2);
    let receiver = web3.utils.padLeft(web3.utils.toHex(this.receiver), stateIDLen * 2);
    let amount = web3.utils.padLeft(web3.utils.toHex(this.amount), amountLen * 2);
    let accountID = web3.utils.padLeft(web3.utils.toHex(this.accountID), accountIDLen * 2);
    let encoded = sender.slice(2) + receiver.slice(2) + amount.slice(2) + accountID.slice(2);
    if (prefix) {
      encoded = '0x' + encoded;
    }
    return encoded;
  }
}
