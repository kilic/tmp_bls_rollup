const MockRollup = artifacts.require('MockRollup');
const MockFraudProof = artifacts.require('MockFraudProof');
const TokenRegistry = artifacts.require('TokenRegistry');
const MockToken = artifacts.require('MockToken');
import { Tree } from './app/tree';
import {
  MockTokenInstance,
  MockRollupInstance,
  MockFraudProofInstance,
  TokenRegistryInstance,
} from '../types/truffle-contracts';
import { Tx1, Tx2, serialize, calculateRoot } from './app/tx';
import { StateTree } from './app/state_tree';
import { Account } from './app/state_account';
import { DUMMY_ADDRESS, ZERO, DUMMY_BYTES, rand32, randAdr } from './dummies';

let STATE_TREE_DEPTH: number;
let QUE_TREE_DEPTH: number;
let QUE_SIZE: number;

interface DepositQue {
  root: string;
  submitted: boolean;
  exist: boolean;
}

interface Batch {
  ID: string;
  state: string;
}

function bn(n: number | string) {
  return web3.utils.toBN(n);
}

contract('Rollup deposit', (accounts) => {
  let rollup: MockRollupInstance;
  let fraudProof: MockFraudProofInstance;
  let token: MockTokenInstance;
  let tokenRegistry: TokenRegistryInstance;
  let relayer = accounts[0];
  let coordinator = accounts[1];
  const tokenID = 1;
  const DISPUTE_PERIOD = 10;
  const challenger = accounts[2];
  const STAKE = web3.utils.toWei('1', 'gwei');

  before(async function () {
    token = await MockToken.new([relayer], [10000]);
    tokenRegistry = await TokenRegistry.new({ from: coordinator });
    await tokenRegistry.request(token.address, 1);
    await tokenRegistry.finalize(tokenID, { from: coordinator });
    fraudProof = await MockFraudProof.new(DUMMY_ADDRESS);
    STATE_TREE_DEPTH = (await fraudProof.STATE_TREE_DEPTH()).toNumber();
  });

  beforeEach(async function () {
    rollup = await MockRollup.new(STAKE, DISPUTE_PERIOD, fraudProof.address, tokenRegistry.address, ZERO); // yay :)
    QUE_TREE_DEPTH = (await rollup.QUE_TREE_DEPTH()).toNumber();
    QUE_SIZE = 1 << QUE_TREE_DEPTH;
  });

  it('que: deposit with new account', async function () {
    assert.equal(1, (await rollup.depositPointer()).toNumber());
    const accountID = 10;
    const amount = 50;
    const expectedDepositHash = Tx1.depositHash(accountID, tokenID, amount);
    await token.approve(rollup.address, amount, { from: relayer });
    await rollup.depositWithNewAccount(accountID, tokenID, amount, { from: relayer });
    const depositHash = await rollup.filledSubtreesNewAccounts(0);
    assert.equal(expectedDepositHash, depositHash);
    assert.equal(1, (await rollup.depositPointer()).toNumber());
  });
  it('que: fill deposit que with new accounts', async function () {
    assert.equal(1, (await rollup.depositPointer()).toNumber());
    const queTree = Tree.new(QUE_TREE_DEPTH);
    const amount = 50;
    await token.approve(rollup.address, amount * QUE_SIZE, { from: relayer });
    for (let i = 0; i < 1 << QUE_TREE_DEPTH; i++) {
      const accountID = i + 10;
      const newAccount = Tx1.depositHash(accountID, tokenID, amount);
      queTree.updateSingle(i, newAccount);
      await rollup.depositWithNewAccount(accountID, tokenID, amount, { from: relayer });
    }
    const expectedQueRoot = queTree.root;
    const queRoot = await rollup.filledSubtreesNewAccounts(QUE_TREE_DEPTH);
    assert.equal(queRoot, expectedQueRoot);
    assert.equal(2, (await rollup.depositPointer()).toNumber());
    const depositQue = ((await rollup.depositQues(1)) as unknown) as DepositQue;
    assert.isTrue(depositQue.exist);
    assert.isFalse(depositQue.submitted);
    assert.equal(queRoot, depositQue.root);
  });
  it('batch type 1: submit', async function () {
    const stateTree = StateTree.new(STATE_TREE_DEPTH);
    let batch = ((await rollup.batches(0)) as unknown) as Batch;
    assert.equal(batch.state, stateTree.root);

    const queTree = Tree.new(QUE_TREE_DEPTH);
    const amount = 50;
    const txs: Tx1[] = [];
    await token.approve(rollup.address, amount * QUE_SIZE, { from: relayer });
    for (let i = 0; i < 1 << QUE_TREE_DEPTH; i++) {
      const stateID = i;
      const accountID = i + 10;
      const newAccount = Tx1.depositHash(accountID, tokenID, amount);
      queTree.updateSingle(i, newAccount);
      await rollup.depositWithNewAccount(accountID, tokenID, amount, { from: relayer });
      const tx = new Tx1(accountID, tokenID, amount, stateID);
      txs.push(tx);
    }

    let s0 = stateTree.root;
    let proof = stateTree.applyBatchType1(txs);
    assert.isTrue(proof.safe);

    const { serialized, commit } = serialize(txs);
    assert.equal(commit, await fraudProof.txCommit(serialized));

    const txRoot0 = calculateRoot(txs);
    const txRoot1 = await fraudProof.txRoot1(serialized);
    assert.equal(txRoot0, txRoot1);
    const txRoot = txRoot0;

    const queID = 1;
    const depositQue = ((await rollup.depositQues(queID)) as unknown) as DepositQue;
    const depositRoot = depositQue.root;
    assert.equal(depositRoot, Tx1.depositRoot(txs));
    assert.equal(depositRoot, await fraudProof.depositRoot1(serialized));

    const tx = await rollup.submitBatchType1(txRoot0, queID, stateTree.root, serialized, {
      from: coordinator,
      value: STAKE,
    });
    const blockNumber = tx.receipt.blockNumber;
    const batchIndex = 1;
    const state = stateTree.root;

    const header = {
      state,
      coordinator,
      blockNumber,
      batchIndex,
      queID,
      txRoot,
      txCommit: commit,
    };
    const batchID = await rollup.idType1(header);
    batch = ((await rollup.batches(batchIndex)) as unknown) as Batch;
    assert.equal(batchID, batch.ID);
    assert.equal(state, batch.state);

    let shouldRollback;
    shouldRollback = await fraudProof.shouldRollbackInvalidTxRootBatchType1(txRoot, serialized);
    assert.equal(0, shouldRollback.toNumber());
    shouldRollback = await fraudProof.shouldRollbackInvalidDepositRootBatchType1(depositRoot, serialized);
    assert.equal(0, shouldRollback.toNumber());
    shouldRollback = await fraudProof.shouldRollbackInvalidTransitionBatchType1(s0, stateTree.root, proof, serialized);
    assert.equal(0, shouldRollback.toNumber());
  });

  it('batch type 1: recover from invalid tx root', async function () {
    // submit some dummy batches initially
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
    }

    const queTree = Tree.new(QUE_TREE_DEPTH);
    const amount = 50;
    const txs: Tx1[] = [];
    for (let i = 0; i < 1 << QUE_TREE_DEPTH; i++) {
      const stateID = i;
      const accountID = i + 10;
      const newAccount = Tx1.depositHash(accountID, tokenID, amount);
      queTree.updateSingle(i, newAccount);
      const tx = new Tx1(accountID, tokenID, amount, stateID);
      txs.push(tx);
    }
    const queID = 1;
    await rollup._addTestQue(queTree.root, true);

    const { serialized, commit } = serialize(txs);
    const invalidTxRoot = rand32();
    const state = rand32();
    const batchIndex = 6;
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    const tx = await rollup.submitBatchType1(invalidTxRoot, queID, state, serialized, {
      from: coordinator,
      value: STAKE,
    });
    const blockNumber = tx.receipt.blockNumber;
    let fraudProofCode = await fraudProof.shouldRollbackInvalidTxRootBatchType1(invalidTxRoot, serialized);
    assert.equal(1, fraudProofCode.toNumber());

    // submit some 5 more test batches on top of invalid batch
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
    }

    const header = {
      state,
      coordinator,
      blockNumber,
      batchIndex,
      queID,
      txRoot: invalidTxRoot,
    };

    await rollup.fraudInvalidTxRootBatchType1(header, serialized, { from: challenger });
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    assert.isFalse(await rollup.isRollingBack());
  });

  it('batch type 1: recover from invalid deposit root', async function () {
    // submit some dummy batches initially
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
    }

    const queTree = Tree.new(QUE_TREE_DEPTH);
    const amount = 50;
    const txs: Tx1[] = [];
    for (let i = 0; i < 1 << QUE_TREE_DEPTH; i++) {
      const stateID = i;
      const accountID = i + 10;
      const newAccount = Tx1.depositHash(accountID, tokenID, amount);
      queTree.updateSingle(i, newAccount);
      const tx = new Tx1(accountID, tokenID, amount, stateID);
      txs.push(tx);
    }
    const depositRoot = queTree.root;
    const queID = 1;
    await rollup._addTestQue(depositRoot, true);

    // make some funny bussiness here
    // and change tx order
    const tmp = txs[1];
    txs[1] = txs[0];
    txs[0] = tmp;

    const { serialized, commit } = serialize(txs);
    const txRoot = calculateRoot(txs);
    const state = rand32();
    const batchIndex = 6;
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    const tx = await rollup.submitBatchType1(txRoot, queID, state, serialized, {
      from: coordinator,
      value: STAKE,
    });
    const blockNumber = tx.receipt.blockNumber;
    let fraudProofCode = await fraudProof.shouldRollbackInvalidDepositRootBatchType1(depositRoot, serialized);
    assert.equal(1, fraudProofCode.toNumber());

    // submit some 5 more test batches on top of invalid batch
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
    }

    const header = {
      state,
      coordinator,
      blockNumber,
      batchIndex,
      queID,
      txRoot,
    };

    await rollup.fraudInvalidDepositRootBatchType1(header, serialized, { from: challenger });
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    assert.isFalse(await rollup.isRollingBack());
  });

  it('batch type 1: recover invalid transition: not a new account', async function () {
    // submit some dummy batches initially
    let batchPointer = 1;
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    const stateTree = StateTree.new(STATE_TREE_DEPTH);
    const invalidStateTree = StateTree.new(STATE_TREE_DEPTH);

    // This account will be the cause for dispute
    // Because 'invalidStateTree' is not aware of this account
    const account = Account.new(5, tokenID, 100, 5);
    const stateID = 5;
    account.setStateID(stateID);
    stateTree.createAccount(account);

    const queTree = Tree.new(QUE_TREE_DEPTH);
    const amount = 50;
    const txs: Tx1[] = [];
    for (let i = 0; i < 1 << QUE_TREE_DEPTH; i++) {
      const stateID = i;
      const accountID = i + 10;
      const newAccount = Tx1.depositHash(accountID, tokenID, amount);
      queTree.updateSingle(i, newAccount);
      const tx = new Tx1(accountID, tokenID, amount, stateID);
      txs.push(tx);
    }
    const queID = 1;
    await rollup._addTestQue(queTree.root, true);

    // First submit the batch with account '5' and save the root
    rollup._submitTestBatch(DUMMY_BYTES, stateTree.root, { from: coordinator, value: STAKE });
    batchPointer += 1;
    const s0 = stateTree.root;

    let proofMustBeUnsafe = stateTree.applyBatchType1(txs);
    assert.isFalse(proofMustBeUnsafe.safe);

    let proofMustBeSafe = invalidStateTree.applyBatchType1(txs);
    assert.isTrue(proofMustBeSafe.safe);

    // Submit batch with invalid transition
    const { serialized } = serialize(txs);
    const txRoot = calculateRoot(txs);
    const batchIndex = batchPointer;
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    const tx = await rollup.submitBatchType1(txRoot, queID, invalidStateTree.root, serialized, {
      from: coordinator,
      value: STAKE,
    });
    batchPointer += 1;
    const blockNumber = tx.receipt.blockNumber;

    // let's first just check valid transition in soft way
    let fraudProofCode = await fraudProof.shouldRollbackInvalidTransitionBatchType1(
      s0,
      invalidStateTree.root,
      proofMustBeUnsafe,
      serialized
    );
    assert.equal(1, fraudProofCode.toNumber());

    // submit some 5 more test batches on top of invalid batch
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    const header = {
      state: invalidStateTree.root,
      coordinator,
      blockNumber,
      batchIndex,
      queID,
      txRoot,
    };

    await rollup.fraudInvalidTransitionBatchType1(header, proofMustBeUnsafe, serialized, { from: challenger });
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    assert.isFalse(await rollup.isRollingBack());
  });

  it('batch type 1: recover from invalid transition: state root mismatch', async function () {
    // submit some dummy batches initially
    let batchPointer = 1;
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    const stateTree = StateTree.new(STATE_TREE_DEPTH);
    const queTree = Tree.new(QUE_TREE_DEPTH);
    const amount = 50;
    const txs: Tx1[] = [];
    for (let i = 0; i < 1 << QUE_TREE_DEPTH; i++) {
      const stateID = i;
      const accountID = i + 10;
      const newAccount = Tx1.depositHash(accountID, tokenID, amount);
      queTree.updateSingle(i, newAccount);
      const tx = new Tx1(accountID, tokenID, amount, stateID);
      txs.push(tx);
    }
    const queID = 1;
    await rollup._addTestQue(queTree.root, true);

    rollup._submitTestBatch(DUMMY_BYTES, stateTree.root, { from: coordinator, value: STAKE });
    batchPointer += 1;
    const s0 = stateTree.root;

    let proof = stateTree.applyBatchType1(txs);
    assert.isTrue(proof.safe);

    const { serialized } = serialize(txs);
    const txRoot = calculateRoot(txs);
    const batchIndex = batchPointer;
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    const invalidStateRoot = rand32();
    const tx = await rollup.submitBatchType1(txRoot, queID, invalidStateRoot, serialized, {
      from: coordinator,
      value: STAKE,
    });
    batchPointer += 1;
    const blockNumber = tx.receipt.blockNumber;

    let fraudProofCode = await fraudProof.shouldRollbackInvalidTransitionBatchType1(
      s0,
      invalidStateRoot,
      proof,
      serialized
    );
    assert.equal(2, fraudProofCode.toNumber());

    // submit some 5 more test batches on top of invalid batch
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    // reconstruct the batch
    const header = {
      state: invalidStateRoot,
      coordinator,
      blockNumber,
      batchIndex,
      queID,
      txRoot,
    };

    await rollup.fraudInvalidTransitionBatchType1(header, proof, serialized, { from: challenger });
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    assert.isFalse(await rollup.isRollingBack());
  });
  it('que: deposit', async function () {
    const stateID = 10;
    const amount = 50;
    const expectedDepositHash = Tx2.depositHash(stateID, tokenID, amount);
    await token.approve(rollup.address, amount, { from: relayer });
    await rollup.deposit(stateID, tokenID, amount, { from: relayer });
    const depositHash = await rollup.filledSubtreesTopUps(0);
    assert.equal(expectedDepositHash, depositHash);
  });
  it('que: fill the deposit que', async function () {
    const queTree = Tree.new(QUE_TREE_DEPTH);
    const amount = 50;
    await token.approve(rollup.address, amount * QUE_SIZE, { from: relayer });
    for (let i = 0; i < 1 << QUE_TREE_DEPTH; i++) {
      const stateID = i + 10;
      const newAccount = Tx2.depositHash(stateID, tokenID, amount);
      queTree.updateSingle(i, newAccount);
      await rollup.deposit(stateID, tokenID, amount, { from: relayer });
    }
    const expectedQueRoot = queTree.root;
    const queRoot = await rollup.filledSubtreesTopUps(QUE_TREE_DEPTH);
    assert.equal(queRoot, expectedQueRoot);
    assert.equal(2, (await rollup.depositPointer()).toNumber());
    const depositQue = ((await rollup.depositQues(1)) as unknown) as DepositQue;
    assert.isTrue(depositQue.exist);
    assert.isFalse(depositQue.submitted);
    assert.equal(queRoot, depositQue.root);
  });
  it('batch type 2: submit', async function () {
    let stateTree = StateTree.new(STATE_TREE_DEPTH);
    let batch = ((await rollup.batches(0)) as unknown) as Batch;
    assert.equal(batch.state, stateTree.root);

    const queTree = Tree.new(QUE_TREE_DEPTH);
    const amount = 50;
    const txs: Tx2[] = [];
    await token.approve(rollup.address, amount * QUE_SIZE, { from: relayer });
    for (let i = 0; i < 1 << QUE_TREE_DEPTH; i++) {
      const stateID = i + 1;
      const tx = new Tx2(stateID, tokenID, amount);
      queTree.updateSingle(i, tx.hash());
      await rollup.deposit(stateID, tokenID, amount, { from: relayer });
      txs.push(tx);
    }

    let s0 = stateTree.root;
    let proof = stateTree.applyBatchType2(txs);
    assert.isTrue(proof.safe);

    const { serialized, commit } = serialize(txs);
    assert.equal(commit, await fraudProof.txCommit(serialized));

    const queID = 1;
    const depositQue = ((await rollup.depositQues(queID)) as unknown) as DepositQue;
    const depositRoot = depositQue.root;
    assert.equal(depositRoot, calculateRoot(txs));
    assert.equal(depositRoot, await fraudProof.depositRoot2(serialized));

    const tx = await rollup.submitBatchType2(queID, stateTree.root, serialized, { from: coordinator, value: STAKE });
    const blockNumber = tx.receipt.blockNumber;
    const batchIndex = 1;
    const state = stateTree.root;

    const header = {
      state,
      coordinator,
      blockNumber,
      batchIndex,
      queID,
      txCommit: commit,
    };
    const batchID = await rollup.idType2(header);
    batch = ((await rollup.batches(batchIndex)) as unknown) as Batch;
    assert.equal(batchID, batch.ID);
    assert.equal(state, batch.state);

    let shouldRollback;
    shouldRollback = await fraudProof.shouldRollbackInvalidDepositRootBatchType2(depositRoot, serialized);
    assert.equal(0, shouldRollback.toNumber());
    shouldRollback = await fraudProof.shouldRollbackInvalidTransitionBatchType2(s0, stateTree.root, proof, serialized);
    assert.equal(0, shouldRollback.toNumber());

    stateTree = StateTree.new(STATE_TREE_DEPTH);
    for (let i = 0; i < txs.length; i++) {
      const accountID = i + 10;
      const account = Account.new(accountID, tokenID, 0, 0);
      account.setStateID(txs[i].stateID);
      stateTree.createAccount(account);
    }
    s0 = stateTree.root;
    proof = stateTree.applyBatchType2(txs);
    shouldRollback = await fraudProof.shouldRollbackInvalidTransitionBatchType2(s0, stateTree.root, proof, serialized);
    assert.equal(0, shouldRollback.toNumber());
  });
  it('batch type 2: recover from invalid deposit root', async function () {
    // submit some dummy batches initially
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
    }

    const queTree = Tree.new(QUE_TREE_DEPTH);
    const amount = 50;
    const txs: Tx2[] = [];
    for (let i = 0; i < 1 << QUE_TREE_DEPTH; i++) {
      const stateID = i;
      const newAccount = Tx2.depositHash(stateID, tokenID, amount);
      queTree.updateSingle(i, newAccount);
      const tx = new Tx2(stateID, tokenID, amount);
      txs.push(tx);
    }
    const depositRoot = queTree.root;
    const queID = 1;
    await rollup._addTestQue(depositRoot, false);

    // make some funny bussiness here
    // and change tx order
    const tmp = txs[1];
    txs[1] = txs[0];
    txs[0] = tmp;

    const { serialized, commit } = serialize(txs);
    const txRoot = calculateRoot(txs);
    const state = rand32();
    const batchIndex = 6;
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    const tx = await rollup.submitBatchType2(queID, state, serialized, {
      from: coordinator,
      value: STAKE,
    });
    const blockNumber = tx.receipt.blockNumber;
    let fraudProofCode = await fraudProof.shouldRollbackInvalidDepositRootBatchType2(depositRoot, serialized);
    assert.equal(1, fraudProofCode.toNumber());

    // submit some 5 more test batches on top of invalid batch
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
    }

    const header = {
      state,
      coordinator,
      blockNumber,
      batchIndex,
      queID,
      txRoot,
    };

    await rollup.fraudInvalidDepositRootBatchType2(header, serialized, { from: challenger });
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    assert.isFalse(await rollup.isRollingBack());
  });

  it('batch type 2: recover invalid transition: token id mismatch', async function () {
    // submit some dummy batches initially
    let batchPointer = 1;
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    const stateTree = StateTree.new(STATE_TREE_DEPTH);
    // const invalidStateTree = StateTree.new(STATE_TREE_DEPTH);

    const queTree = Tree.new(QUE_TREE_DEPTH);
    const depositAmount = 50;
    const initialBalance = 100;
    const txs: Tx2[] = [];
    for (let i = 0; i < 1 << QUE_TREE_DEPTH; i++) {
      const stateID = i;
      const accountID = i;
      const account = Account.new(accountID, tokenID, initialBalance, 0);
      account.setStateID(stateID);
      stateTree.createAccount(account);
      let tx: Tx2;
      if (i == 5) {
        // let's make funny bussiness here
        tx = new Tx2(stateID, tokenID + 1, depositAmount);
      } else {
        tx = new Tx2(stateID, tokenID, depositAmount);
      }
      queTree.updateSingle(i, tx.hash());
      txs.push(tx);
    }
    const queID = 1;
    await rollup._addTestQue(queTree.root, false);

    rollup._submitTestBatch(DUMMY_BYTES, stateTree.root, { from: coordinator, value: STAKE });
    batchPointer += 1;
    const s0 = stateTree.root;

    let proof = stateTree.applyBatchType2(txs);
    assert.isFalse(proof.safe);

    const { serialized } = serialize(txs);
    const txRoot = calculateRoot(txs);
    const batchIndex = batchPointer;
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    const tx = await rollup.submitBatchType2(queID, stateTree.root, serialized, {
      from: coordinator,
      value: STAKE,
    });
    batchPointer += 1;
    const blockNumber = tx.receipt.blockNumber;

    let fraudProofCode = await fraudProof.shouldRollbackInvalidTransitionBatchType2(
      s0,
      stateTree.root,
      proof,
      serialized
    );
    assert.equal(1, fraudProofCode.toNumber());

    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    const header = {
      state: stateTree.root,
      coordinator,
      blockNumber,
      batchIndex,
      queID,
      txRoot,
    };

    await rollup.fraudInvalidTransitionBatchType2(header, proof, serialized, { from: challenger });
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    assert.isFalse(await rollup.isRollingBack());
  });

  it('batch type 2: recover from invalid transition: state root mismatch', async function () {
    let batchPointer = 1;
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    const stateTree = StateTree.new(STATE_TREE_DEPTH);
    const queTree = Tree.new(QUE_TREE_DEPTH);
    const amount = 50;
    const initialBalance = 50;
    const txs: Tx2[] = [];
    for (let i = 0; i < 1 << QUE_TREE_DEPTH; i++) {
      const stateID = i;
      const accountID = i;
      const account = Account.new(accountID, tokenID, initialBalance, 0);
      account.setStateID(stateID);
      stateTree.createAccount(account);
      const tx = new Tx2(stateID, tokenID, amount);
      queTree.updateSingle(i, tx.hash());
      txs.push(tx);
    }
    const queID = 1;
    await rollup._addTestQue(queTree.root, false);

    rollup._submitTestBatch(DUMMY_BYTES, stateTree.root, { from: coordinator, value: STAKE });
    batchPointer += 1;
    const s0 = stateTree.root;

    let proof = stateTree.applyBatchType2(txs);
    assert.isTrue(proof.safe);

    const { serialized } = serialize(txs);
    const batchIndex = batchPointer;
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    const invalidStateRoot = rand32();
    const tx = await rollup.submitBatchType2(queID, invalidStateRoot, serialized, {
      from: coordinator,
      value: STAKE,
    });
    batchPointer += 1;
    const blockNumber = tx.receipt.blockNumber;

    let fraudProofCode = await fraudProof.shouldRollbackInvalidTransitionBatchType2(
      s0,
      invalidStateRoot,
      proof,
      serialized
    );
    assert.equal(3, fraudProofCode.toNumber());

    // submit some 5 more test batches on top of invalid batch
    for (let i = 0; i < 5; i++) {
      await rollup._submitTestBatch(DUMMY_BYTES, DUMMY_BYTES, { from: coordinator, value: STAKE });
      batchPointer += 1;
    }

    // reconstruct the batch
    const header = {
      state: invalidStateRoot,
      coordinator,
      blockNumber,
      batchIndex,
      queID,
    };

    await rollup.fraudInvalidTransitionBatchType2(header, proof, serialized, { from: challenger });
    assert.equal(batchIndex, (await rollup.batchPointer()).toNumber());
    assert.isFalse(await rollup.isRollingBack());
  });
});
