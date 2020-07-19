const MockRollup = artifacts.require('MockRollup');
const MockFraudProof = artifacts.require('MockFraudProof');
const BLSAccountRegistry = artifacts.require('BLSAccountRegistry');
import { MockRollupInstance, MockFraudProofInstance } from '../types/truffle-contracts';
import { Tx0, serialize, calculateRoot } from './app/tx';
import * as mcl from './app/mcl';
import { StateTree } from './app/state_tree';
import { Account } from './app/state_account';
import { AccountRegistry } from './app/account_tree';
import { DUMMY_ADDRESS, ZERO } from './dummies';

let STATE_TREE_DEPTH: number;

interface Batch {
  ID: string;
  state: string;
}

contract('Rollup transfer', (eth_accounts) => {
  let rollup: MockRollupInstance;
  let fraudProof: MockFraudProofInstance;
  let registry: AccountRegistry;
  const coordinator = eth_accounts[1];
  const accounts: Account[] = [];
  const tokenID = 1;
  const accountSize = 16;
  let stateTree: StateTree;

  beforeEach(async function () {
    await mcl.init();
    const registryContract = await BLSAccountRegistry.new();
    registry = await AccountRegistry.new(registryContract);
    fraudProof = await MockFraudProof.new(registryContract.address);
    rollup = await MockRollup.new(0, 0, fraudProof.address, DUMMY_ADDRESS, ZERO); // yay :)
    STATE_TREE_DEPTH = (await fraudProof.STATE_TREE_DEPTH()).toNumber();
    stateTree = StateTree.new(STATE_TREE_DEPTH);
    // create accounts
    for (let i = 0; i < accountSize; i++) {
      const accountID = i;
      const stateID = i;
      const initialBalance = 100;
      const account = Account.new(accountID, tokenID, initialBalance, 0);
      account.setStateID(stateID);
      stateTree.createAccount(stateID, account);
      account.newKeyPair();
      accounts.push(account);
      await registry.register(account.encodePubkey());
    }
  });
  it('submit batch', async function () {
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
});
