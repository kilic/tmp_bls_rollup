const MockRollup = artifacts.require('MockRollup');
const MockFraudProof = artifacts.require('MockFraudProof');
const TokenRegistry = artifacts.require('TokenRegistry');
const MockToken = artifacts.require('MockToken');
import { Tree } from './app/tree';
import { MockTokenInstance, MockRollupInstance, MockFraudProofInstance } from '../types/truffle-contracts';
import { Tx1, Tx2, serialize, calculateRoot } from './app/tx';
import { StateTree } from './app/state_tree';
import { Account } from './app/state_account';
import { DUMMY_ADDRESS, ZERO } from './dummies';

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

contract('Rollup deposit', (accounts) => {
  let rollup: MockRollupInstance;
  let fraudProof: MockFraudProofInstance;
  let token: MockTokenInstance;
  let relayer = accounts[0];
  let coordinator = accounts[1];
  const tokenID = 1;
  beforeEach(async function () {
    token = await MockToken.new([relayer], [10000]);
    const tokenRegistry = await TokenRegistry.new({ from: coordinator });
    await tokenRegistry.request(token.address, 1);
    await tokenRegistry.finalize(tokenID, { from: coordinator });
    fraudProof = await MockFraudProof.new(DUMMY_ADDRESS); 
    rollup = await MockRollup.new(0, 0, fraudProof.address, tokenRegistry.address, ZERO); // yay :)
    QUE_TREE_DEPTH = (await rollup.QUE_TREE_DEPTH()).toNumber();
    QUE_SIZE = 1 << QUE_TREE_DEPTH;
    STATE_TREE_DEPTH = (await fraudProof.STATE_TREE_DEPTH()).toNumber();
  });
  it('deposit with new account', async function () {
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
  it('fill deposit que with new accounts', async function () {
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
  it('submit deposit batch with new accounts', async function () {
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

    const tx = await rollup.submitBatchType1(txRoot0, queID, stateTree.root, serialized, { from: coordinator });
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

  it('deposit', async function () {
    const stateID = 10;
    const amount = 50;
    const expectedDepositHash = Tx2.depositHash(stateID, tokenID, amount);
    await token.approve(rollup.address, amount, { from: relayer });
    await rollup.deposit(stateID, tokenID, amount, { from: relayer });
    const depositHash = await rollup.filledSubtreesTopUps(0);
    assert.equal(expectedDepositHash, depositHash);
  });
  it('fill deposit que', async function () {
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
  it('submit deposit', async function () {
    let stateTree = StateTree.new(STATE_TREE_DEPTH);
    let batch = ((await rollup.batches(0)) as unknown) as Batch;
    assert.equal(batch.state, stateTree.root);

    const queTree = Tree.new(QUE_TREE_DEPTH);
    const amount = 50;
    const txs: Tx2[] = [];
    await token.approve(rollup.address, amount * QUE_SIZE, { from: relayer });
    for (let i = 0; i < 1 << QUE_TREE_DEPTH; i++) {
      const stateID = i;
      const newAccount = Tx2.depositHash(stateID, tokenID, amount);
      queTree.updateSingle(i, newAccount);
      await rollup.deposit(stateID, tokenID, amount, { from: relayer });
      const tx = new Tx2(stateID, tokenID, amount);
      txs.push(tx);
    }

    let s0 = stateTree.root;
    let proof = stateTree.applyBatchType2(txs);
    assert.isFalse(proof.safe);

    const { serialized, commit } = serialize(txs);
    assert.equal(commit, await fraudProof.txCommit(serialized));

    const queID = 1;
    const depositQue = ((await rollup.depositQues(queID)) as unknown) as DepositQue;
    const depositRoot = depositQue.root;
    assert.equal(depositRoot, calculateRoot(txs));
    assert.equal(depositRoot, await fraudProof.depositRoot2(serialized));

    const tx = await rollup.submitBatchType2(queID, stateTree.root, serialized, { from: coordinator });
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
    assert.equal(1, shouldRollback.toNumber());

    stateTree = StateTree.new(STATE_TREE_DEPTH);
    for (let i = 0; i < txs.length; i++) {
      const accountID = i + 10;
      const account = Account.new(accountID, tokenID, 0, 0);
      stateTree.createAccount(txs[i].stateID, account);
    }
    s0 = stateTree.root;
    proof = stateTree.applyBatchType2(txs);
    shouldRollback = await fraudProof.shouldRollbackInvalidTransitionBatchType2(s0, stateTree.root, proof, serialized);
    assert.equal(0, shouldRollback.toNumber());
  });
});
