const TestTx = artifacts.require('TestTx');
import { TestTxInstance } from '../types/truffle-contracts';
import * as mcl from './app/mcl';
import { bnToHex } from './app/mcl';
import { Tx0, Tx1, Tx2, Tx3, serialize } from './app/tx';

contract('Tx Serialization', (accounts) => {
  let c: TestTxInstance;
  before(async function () {
    await mcl.init();
    c = await TestTx.new();
  });

  it('parse transaction t0', async function () {
    const txSize = 1;
    const txs: Tx0[] = [];
    for (let i = 0; i < txSize; i++) {
      txs.push(Tx0.rand());
    }
    const { serialized } = serialize(txs);
    assert.equal(txSize, (await c.t0_size(serialized)).toNumber());
    assert.isFalse(await c.t0_hasExcessData(serialized));
    for (let i = 0; i < txSize; i++) {
      let amount = (await c.t0_amountOf(serialized, i)).toNumber();
      assert.equal(amount, txs[i].amount);
      let sender = (await c.t0_senderOf(serialized, i)).toNumber();
      assert.equal(sender, txs[i].sender);
      let receiver = (await c.t0_receiverOf(serialized, i)).toNumber();
      assert.equal(receiver, txs[i].receiver);
      let h0 = txs[i].hash();
      let h1 = await c.t0_hashOf(serialized, i);
      assert.equal(h0, h1);
      let p0 = await c.t0_mapToPoint(serialized, i);
      let p1 = txs[i].mapToPoint();
      assert.equal(p1[0], bnToHex(p0[0].toString(16)));
      assert.equal(p1[1], bnToHex(p0[1].toString(16)));
      const index = 0xaaaabbbb;
      const word = txs[i].encodeToWord(index);
      let res = await c.t0_fromWord(word);
      assert.equal(txs[i].sender, res[0].toNumber());
      assert.equal(txs[i].receiver, res[1].toNumber());
      assert.equal(txs[i].amount, res[2].toNumber());
      assert.equal(index, res[3].toNumber());
      assert.equal(h0, res[4]);
      amount = (await c.t0_amountFromWord(word)).toNumber();
      assert.equal(amount, txs[i].amount);
    }
  });

  it('parse transaction t1', async function () {
    const txSize = 32;
    const txs: Tx1[] = [];
    for (let i = 0; i < txSize; i++) {
      txs.push(Tx1.rand());
    }
    const { serialized } = serialize(txs);
    assert.equal(txSize, (await c.t1_size(serialized)).toNumber());
    assert.isFalse(await c.t1_hasExcessData(serialized));
    for (let i = 0; i < txSize; i++) {
      let accountID = (await c.t1_accountIdOf(serialized, i)).toNumber();
      assert.equal(accountID, txs[i].accountID);
      let tokenID = (await c.t1_tokenIdOf(serialized, i)).toNumber();
      assert.equal(tokenID, txs[i].tokenID);
      let amount = (await c.t1_amountOf(serialized, i)).toNumber();
      assert.equal(amount, txs[i].amount);
      let stateID = (await c.t1_stateIdOf(serialized, i)).toNumber();
      assert.equal(stateID, txs[i].stateID);
      let h0 = txs[i].hash();
      let h1 = await c.t1_hashOf(serialized, i);
      assert.equal(h0, h1);
      h0 = txs[i].depositHash();
      h1 = await c.t1_depositHashOf(serialized, i);
      assert.equal(h0, h1);
    }
  });

  it('parse transaction t2', async function () {
    const txSize = 32;
    const txs: Tx2[] = [];
    for (let i = 0; i < txSize; i++) {
      txs.push(Tx2.rand());
    }
    const { serialized } = serialize(txs);
    assert.equal(txSize, (await c.t2_size(serialized)).toNumber());
    assert.isFalse(await c.t2_hasExcessData(serialized));
    for (let i = 0; i < txSize; i++) {
      let stateID = (await c.t2_stateIdOf(serialized, i)).toNumber();
      assert.equal(stateID, txs[i].stateID);
      let tokenID = (await c.t2_tokenIdOf(serialized, i)).toNumber();
      assert.equal(tokenID, txs[i].tokenID);
      let amount = (await c.t2_amountOf(serialized, i)).toNumber();
      assert.equal(amount, txs[i].amount);
      let h0 = txs[i].hash();
      let h1 = await c.t2_hashOf(serialized, i);
      assert.equal(h0, h1);
    }
  });

  it('parse transaction t3', async function () {
    const txSize = 32;
    const txs: Tx3[] = [];
    for (let i = 0; i < txSize; i++) {
      txs.push(Tx3.rand());
    }
    const { serialized } = serialize(txs);
    assert.equal(txSize, (await c.t3_size(serialized)).toNumber());
    assert.isFalse(await c.t3_hasExcessData(serialized));
    for (let i = 0; i < txSize; i++) {
      let amount = (await c.t3_amountOf(serialized, i)).toNumber();
      assert.equal(amount, txs[i].amount);
      let sender = (await c.t3_senderOf(serialized, i)).toNumber();
      assert.equal(sender, txs[i].sender);
      let receiver = (await c.t3_receiverOf(serialized, i)).toNumber();
      assert.equal(receiver, txs[i].receiver);
      let accountID = (await c.t3_receiverAccountIdOf(serialized, i)).toNumber();
      assert.equal(accountID, txs[i].accountID);
      let h0 = txs[i].hash();
      let h1 = await c.t3_hashOf(serialized, i);
      assert.equal(h0, h1);
      let p0 = await c.t3_mapToPoint(serialized, i);
      let p1 = txs[i].mapToPoint();
      assert.equal(p1[0], bnToHex(p0[0].toString(16)));
      assert.equal(p1[1], bnToHex(p0[1].toString(16)));
    }
  });
});
