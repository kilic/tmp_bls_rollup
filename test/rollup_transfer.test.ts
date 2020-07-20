const MockRollup = artifacts.require('MockRollup');
const MockFraudProof = artifacts.require('MockFraudProof');
const BLSAccountRegistry = artifacts.require('BLSAccountRegistry');
import { MockRollupInstance, MockFraudProofInstance } from '../types/truffle-contracts';
import { Tx0, serialize, calculateRoot } from './app/tx';
import * as mcl from './app/mcl';
import { StateTree } from './app/state_tree';
import { Account } from './app/state_account';
import { AccountRegistry } from './app/account_tree';
import { DUMMY_ADDRESS, ZERO, DUMMY_BYTES, rand32 } from './dummies';

let STATE_TREE_DEPTH: number;

interface Batch {
  ID: string;
  state: string;
}

contract('Rollup transfer', (eth_accounts) => {
  let rollup: MockRollupInstance;
  let fraudProof: MockFraudProofInstance;
  let registry: AccountRegistry;
  let stateTree: StateTree;
  const coordinator = eth_accounts[1];
  const challenger = eth_accounts[2];
  const accounts: Account[] = [];
  const tokenID = 1;
  const accountSize = 16;
  const STAKE = web3.utils.toWei('1', 'gwei');
  const DISPUTE_PERIOD = 10;
  const initialBalance = 1000;

  beforeEach(async function () {
    await mcl.init();
  });
  
  beforeEach(async function () {
    const registryContract = await BLSAccountRegistry.new();
    registry = await AccountRegistry.new(registryContract);
    fraudProof = await MockFraudProof.new(registryContract.address);
    rollup = await MockRollup.new(STAKE, DISPUTE_PERIOD, fraudProof.address, DUMMY_ADDRESS, ZERO); // yay :)
    STATE_TREE_DEPTH = (await fraudProof.STATE_TREE_DEPTH()).toNumber();
    stateTree = StateTree.new(STATE_TREE_DEPTH);
    // create accounts
    for (let i = 0; i < accountSize; i++) {
      const accountID = i;
      const stateID = i;
      const account = Account.new(accountID, tokenID, initialBalance, 0);
      account.setStateID(stateID);
      stateTree.createAccount(stateID, account);
      account.newKeyPair();
      accounts.push(account);
      await registry.register(account.encodePubkey());
    }
  });
  it('batch type 0: submit', async function () {
    let batchSize = 16;
    const txs: Tx0[] = [];
    const amount = 20;
    let aggSignature = mcl.newG1();
    let s0 = stateTree.root;
    const pubkeys = [];
    const witnesses = [];
    for (let i = 0; i < batchSize; i++) {
      const senderIndex = i;
      const reciverIndex = (i + 5) % accountSize;
      const sender = accounts[senderIndex];
      const receiver = accounts[reciverIndex];
      const tx = new Tx0(sender.stateID, receiver.stateID, amount);
      pubkeys.push(sender.encodePubkey());
      witnesses.push(registry.witness(sender.accountID));
      const signature = sender.sign(tx);
      aggSignature = mcl.aggreagate(aggSignature, signature);
      txs.push(tx);
    }
    let signature = mcl.g1ToHex(aggSignature);
    let proof = stateTree.applyBatchType0(txs);

    const { serialized, commit } = serialize(txs);
    assert.equal(commit, await fraudProof.txCommit(serialized));

    const txRoot = calculateRoot(txs);
    assert.equal(txRoot, await fraudProof.txRoot0(serialized));
    const tx = await rollup.submitBatchType0(serialized, txRoot, stateTree.root, signature, { from: coordinator });

    const blockNumber = tx.receipt.blockNumber;
    const batchIndex = 1;
    const state = stateTree.root;

    const header = {
      state,
      coordinator,
      blockNumber,
      batchIndex,
      signature,
      txRoot,
      txCommit: commit,
    };
    const batchID = await rollup.idType0(header);
    const batch = ((await rollup.batches(batchIndex)) as unknown) as Batch;
    assert.equal(batchID, batch.ID);
    assert.equal(state, batch.state);

    let shouldRollback;
    shouldRollback = await fraudProof.shouldRollbackInvalidTxRootBatchType0(txRoot, serialized);
    assert.equal(0, shouldRollback.toNumber());

    const signatureProof = { witnesses, pubkeys };
    shouldRollback = await fraudProof.shouldRollbackInvalidSignatureBatchType0(signature, signatureProof, serialized);
    assert.equal(0, shouldRollback.toNumber());
    // TODO: mock with signature proof

    shouldRollback = await fraudProof.shouldRollbackInvalidTransitionBatchType0(s0, stateTree.root, proof, serialized);
    assert.equal(0, shouldRollback.toNumber());
  });

  it('batch type 0: recover from invalid tx root', async function () {
    let batchPointer = 1;
    // submit some dummy batches initially
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    let batchSize = 16;
    const amount = 20;
    const txs: Tx0[] = [];
    for (let i = 0; i < batchSize; i++) {
      const senderID = i;
      const reciverID = (i + 5) % accountSize;
      const tx = new Tx0(senderID, reciverID, amount);
      txs.push(tx);
    }

    const { serialized, commit } = serialize(txs);
    assert.equal(commit, await fraudProof.txCommit(serialized));

    const invalidTxRoot = rand32();
    const state = DUMMY_BYTES;
    const signature = mcl.g1ToHex(mcl.randG1());
    const batchIndex = 6;
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    const tx = await rollup.submitBatchType0(serialized, invalidTxRoot, state, signature, {
      from: coordinator,
      value: STAKE,
    });

    const blockNumber = tx.receipt.blockNumber;

    let fraudProofCode = await fraudProof.shouldRollbackInvalidTxRootBatchType0(invalidTxRoot, serialized);
    assert.equal(1, fraudProofCode.toNumber());

    const header = {
      state,
      coordinator,
      blockNumber,
      batchIndex,
      signature,
      txRoot: invalidTxRoot,
    };

    // submit some 5 more test batches on top of invalid batch
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    await rollup.fraudInvalidTxRootBatchType0(header, serialized, { from: challenger });
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    assert.isFalse(await rollup.isRollingBack());
  });

  it('batch type 0: recover from invalid signature', async function () {
    let batchPointer = 1;
    // submit some dummy batches initially
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    let batchSize = 16;
    const amount = 20;
    const pubkeys = [];
    const witnesses = [];
    const txs: Tx0[] = [];
    for (let i = 0; i < batchSize; i++) {
      const senderIndex = i;
      const reciverIndex = (i + 5) % accountSize;
      const sender = accounts[senderIndex];
      const receiver = accounts[reciverIndex];
      const tx = new Tx0(sender.stateID, receiver.stateID, amount);
      pubkeys.push(sender.encodePubkey());
      witnesses.push(registry.witness(sender.accountID));
      txs.push(tx);
    }
    const proof = { witnesses, pubkeys };
    const { serialized, commit } = serialize(txs);
    assert.equal(commit, await fraudProof.txCommit(serialized));

    const txRoot = calculateRoot(txs);
    const state = DUMMY_BYTES;
    const signature = mcl.g1ToHex(mcl.randG1());
    const batchIndex = batchPointer;
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    const tx = await rollup.submitBatchType0(serialized, txRoot, state, signature, {
      from: coordinator,
      value: STAKE,
    });

    const blockNumber = tx.receipt.blockNumber;

    let fraudProofCode = await fraudProof.shouldRollbackInvalidSignatureBatchType0(signature, proof, serialized);
    assert.equal(1, fraudProofCode.toNumber());

    const header = {
      state,
      coordinator,
      blockNumber,
      batchIndex,
      signature,
      txRoot,
    };

    // submit some 5 more test batches on top of invalid batch
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    await rollup.fraudInvalidSignatureBatchType0(header, proof, serialized, { from: challenger });
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    assert.isFalse(await rollup.isRollingBack());
  });
  it('batch type 0: recover invalid state transition: empty sender', async function () {
    let batchPointer = 1;
    // submit some dummy batches initially
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }
    await rollup._submitTestBatch(DUMMY_BYTES, stateTree.root, { from: coordinator, value: STAKE });
    batchPointer += 1;

    const batchSize = 16;
    const txs: Tx0[] = [];
    const amount = 20;
    const s0 = stateTree.root;
    for (let i = 0; i < batchSize; i++) {
      const receiverIndex = i;
      const receiver = accounts[receiverIndex];
      let senderID;
      if (i == 5) {
        // here we are mocking with sender account ID
        senderID = 1000;
      } else {
        const senderIndex = (i + 5) % accountSize;
        const sender = accounts[senderIndex];
        senderID = sender.stateID;
      }
      const tx = new Tx0(senderID, receiver.stateID, amount);
      txs.push(tx);
    }
    const proof = stateTree.applyBatchType0(txs);
    assert.isFalse(proof.safe);
    const { serialized, commit } = serialize(txs);
    const txRoot = DUMMY_BYTES;
    const state = stateTree.root;
    const signature = mcl.g1ToHex(mcl.randG1());
    const batchIndex = batchPointer;
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    const tx = await rollup.submitBatchType0(serialized, txRoot, state, signature, { from: coordinator, value: STAKE });
    const blockNumber = tx.receipt.blockNumber;

    let fraudProofCode = await fraudProof.shouldRollbackInvalidTransitionBatchType0(
      s0,
      stateTree.root,
      proof,
      serialized
    );
    assert.equal(1, fraudProofCode.toNumber());

    const header = {
      state,
      coordinator,
      blockNumber,
      batchIndex,
      signature,
      txRoot,
      txCommit: commit,
    };

    // submit some 5 more test batches on top of invalid batch
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    await rollup.fraudInvalidTransitionBatchType0(header, proof, serialized, { from: challenger });
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    assert.isFalse(await rollup.isRollingBack());
  });
  it('batch type 0: recover invalid state transition: not enough funds', async function () {
    let batchPointer = 1;
    // submit some dummy batches initially
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }
    // submit initial state as if it is an intermediate state
    await rollup._submitTestBatch(DUMMY_BYTES, stateTree.root, { from: coordinator, value: STAKE });
    batchPointer += 1;

    const batchSize = 16;
    const txs: Tx0[] = [];
    const s0 = stateTree.root;
    for (let i = 0; i < batchSize; i++) {
      const receiver = accounts[i];
      const sender = accounts[(i + 5) % accountSize];
      let amount = 20;
      if (i == 5) {
        amount = initialBalance + 1;
      }
      const tx = new Tx0(sender.stateID, receiver.stateID, amount);
      txs.push(tx);
    }
    const proof = stateTree.applyBatchType0(txs);
    assert.isFalse(proof.safe);
    const { serialized, commit } = serialize(txs);
    const txRoot = DUMMY_BYTES;
    const state = stateTree.root;
    const signature = mcl.g1ToHex(mcl.randG1());
    const batchIndex = batchPointer;
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    const tx = await rollup.submitBatchType0(serialized, txRoot, state, signature, { from: coordinator, value: STAKE });
    const blockNumber = tx.receipt.blockNumber;

    let fraudProofCode = await fraudProof.shouldRollbackInvalidTransitionBatchType0(
      s0,
      stateTree.root,
      proof,
      serialized
    );
    assert.equal(2, fraudProofCode.toNumber());

    const header = {
      state,
      coordinator,
      blockNumber,
      batchIndex,
      signature,
      txRoot,
      txCommit: commit,
    };

    // submit some 5 more test batches on top of invalid batch
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    await rollup.fraudInvalidTransitionBatchType0(header, proof, serialized, { from: challenger });
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    assert.isFalse(await rollup.isRollingBack());
  });
  it('batch type 0: recover invalid state transition: invalid nonce', async function () {
    let batchPointer = 1;
    // submit some dummy batches initially
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }
    // submit initial state as if it is an intermediate state
    await rollup._submitTestBatch(DUMMY_BYTES, stateTree.root, { from: coordinator, value: STAKE });
    batchPointer += 1;

    const batchSize = 16;
    const txs: Tx0[] = [];
    const s0 = stateTree.root;
    for (let i = 0; i < batchSize; i++) {
      const receiver = accounts[i];
      const sender = accounts[(i + 5) % accountSize];
      let amount = 20;
      if (i == 5) {
        amount = initialBalance + 1;
      }
      const tx = new Tx0(sender.stateID, receiver.stateID, amount);
      txs.push(tx);
    }
    const proof = stateTree.applyBatchType0(txs);
    assert.isFalse(proof.safe);
    const { serialized, commit } = serialize(txs);
    const txRoot = DUMMY_BYTES;
    const state = stateTree.root;
    const signature = mcl.g1ToHex(mcl.randG1());
    const batchIndex = batchPointer;
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    const tx = await rollup.submitBatchType0(serialized, txRoot, state, signature, { from: coordinator, value: STAKE });
    const blockNumber = tx.receipt.blockNumber;

    let fraudProofCode = await fraudProof.shouldRollbackInvalidTransitionBatchType0(
      s0,
      stateTree.root,
      proof,
      serialized
    );
    assert.equal(2, fraudProofCode.toNumber());

    const header = {
      state,
      coordinator,
      blockNumber,
      batchIndex,
      signature,
      txRoot,
      txCommit: commit,
    };

    // submit some 5 more test batches on top of invalid batch
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    await rollup.fraudInvalidTransitionBatchType0(header, proof, serialized, { from: challenger });
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    assert.isFalse(await rollup.isRollingBack());
  });
  // it('batch type 0: recover invalid state transition: empty receiver', async function () {}
  // it('batch type 0: recover invalid state transition: receiver balance overflow', async function () {}
  // it('batch type 0: recover invalid state transition: token id mismatch', async function () {}
  // it('batch type 0: recover invalid state transition: root mismatch', async function () {}
});
