const MockFraudProof = artifacts.require('MockFraudProof');
const BLSAccountRegistry = artifacts.require('BLSAccountRegistry');
import { MockFraudProofInstance } from '../types/truffle-contracts';
import { Tx0, calculateRoot, witness as txWitness } from './app/tx';
import * as mcl from './app/mcl';
import { StateTree } from './app/state_tree';
import { Account } from './app/state_account';
import { AccountRegistry } from './app/account_tree';

let STATE_TREE_DEPTH: number;

contract('Withdraw', (eth_accounts) => {
  let fraudProof: MockFraudProofInstance;
  let registry: AccountRegistry;
  const tokenID = 1;
  const burnerAccountID = 0;
  const burnerStateID = 22;
  const burnerInitialBalance = 100;
  let account: Account;
  let stateTree: StateTree;
  let accountWitness: string[] = [];

  beforeEach(async function () {
    await mcl.init();
    const registryContract = await BLSAccountRegistry.new();
    registry = await AccountRegistry.new(registryContract);
    fraudProof = await MockFraudProof.new(registryContract.address);
    STATE_TREE_DEPTH = (await fraudProof.STATE_TREE_DEPTH()).toNumber();
    stateTree = StateTree.new(STATE_TREE_DEPTH);
    account = Account.new(burnerAccountID, tokenID, burnerInitialBalance, 0);
    const burningAccount = Account.new(0, tokenID, 0, 0); // FIX: use token id 0
    account.newKeyPair();
    burningAccount.setStateID(0);
    stateTree.createAccount(burningAccount);
    account.setStateID(burnerStateID);
    stateTree.createAccount(account);
    await registry.register(account.encodePubkey());
    accountWitness = registry.witness(burnerAccountID);
  });
  it('verify withdraw request', async function () {
    let batchSize = 16;
    let txIndex = 3;
    const burnAmount = 20;
    const txs: Tx0[] = [];
    let burnerTx: Tx0;
    for (let i = 0; i < batchSize; i++) {
      if (i == txIndex) {
        // burner tx
        burnerTx = new Tx0(burnerStateID, 0, burnAmount);
        txs.push(burnerTx);
        const { safe } = stateTree.applyTx0(burnerTx);
        assert.isTrue(safe, 'must be a safe tx');
      } else {
        // mock txs
        const senderID = i + 100;
        const reciverID = i + 200;
        const tx = new Tx0(senderID, reciverID, 10);
        txs.push(tx);
      }
    }
    const txRoot = calculateRoot(txs);
    const tx = burnerTx!.encodeToWord(txIndex);
    const _txWitness = txWitness(txIndex, txs);
    const stateAccount = stateTree.getAccount(burnerStateID);
    const proof = {
      stateAccount: stateAccount.encoded,
      stateWitness: stateAccount.witness,
      pubkey: account.encodePubkey(),
      accountWitness,
      _tx: tx,
      txWitness: _txWitness,
    };
    const verified = await fraudProof.verifyWithdrawRequest(proof, stateTree.root, txRoot);
    assert.equal(0, verified.toNumber());
  });
});
