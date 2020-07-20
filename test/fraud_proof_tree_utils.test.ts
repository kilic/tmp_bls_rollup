const TestFraudProofTreeUtils = artifacts.require('TestFraudProofTreeUtils');
import { TestFraudProofTreeUtilsInstance } from '../types/truffle-contracts';
import { Tree, Hasher } from './app/tree';
import { Account } from './app/state_account';
const STATE_DEPTH: number = 32;

// TODO: use the one at ./app
class StateTree {
  static new(): StateTree {
    return new StateTree();
  }

  private readonly tree: Tree;
  constructor() {
    this.tree = Tree.new(STATE_DEPTH);
  }

  public get root(): string {
    return this.tree.root;
  }

  public insertAccount(index: number, account: Account) {
    const leaf = account.toStateLeaf();
    this.tree.updateSingle(index, leaf);
  }
  public witness(index: number) {
    return this.tree.witness(index).nodes;
  }
}

contract('Fraud Proof Tree Utils', (accounts) => {
  let treeUtils: TestFraudProofTreeUtilsInstance;
  let stateTree: StateTree;
  beforeEach(async function () {
    treeUtils = await TestFraudProofTreeUtils.new();
    stateTree = StateTree.new();
  });

  it('check inclusion', async function () {
    const tree = Tree.new(4);
    for (let j = 0; j < tree.setSize; j++) {
      const leaf = web3.utils.randomHex(32);
      tree.updateSingle(j, leaf);
      const witness = tree.witness(j).nodes;
      assert.isTrue(await treeUtils._checkInclusion(tree.root, j, leaf, witness));
    }
  });

  it('check state inclusion', async function () {
    for (let i = 0; i < 1024; i += 65) {
      const account = Account.new(1 + i, 1, 10, 0);
      const stateIndex = i;
      stateTree.insertAccount(stateIndex, account);
      const encoded = account.encode();
      const witness = stateTree.witness(stateIndex);
      let exist: boolean;
      exist = await treeUtils._checkStateInclusion(stateTree.root, stateIndex, encoded, witness);
      assert.isTrue(exist);
      exist = await treeUtils._checkStateInclusion(stateTree.root, stateIndex + 1, encoded, witness);
      assert.isFalse(exist);
    }
  });
  it('update state root', async function () {
    for (let i = 0; i < 1024; i += 65) {
      const account = Account.new(1 + i, 1, 10, 0);
      const stateIndex = i;
      const witness = stateTree.witness(i);
      stateTree.insertAccount(stateIndex, account);
      const encoded = account.encode();
      const root0 = stateTree.root;
      const root1 = await treeUtils._updateStateRootWithAccount(stateIndex, encoded, witness);
      assert.equal(root0, root1);
    }
    for (let i = 1; i < 1025; i += 65) {
      const account = Account.new(1 + i, 1, 10, 0);
      const stateIndex = i;
      const witness = stateTree.witness(i);
      stateTree.insertAccount(stateIndex, account);
      const accountHash = account.toStateLeaf();
      const root0 = stateTree.root;
      const root1 = await treeUtils._updateStateRootWithAccountHash(stateIndex, accountHash, witness);
      assert.equal(root0, root1);
    }
  });
  it('calculate root', async function () {
    const DEPTH = 10;
    const tree = Tree.new(DEPTH);
    const leafs = [];
    for (let i = 0; i < 1 << 10; i++) {
      leafs.push(web3.utils.randomHex(32));
    }
    tree.updateBatch(0, leafs);
    const root0 = tree.root;
    const root1 = await treeUtils._calculateRoot(leafs);
    assert.equal(root0, root1);
  });
  it('calculate root truncated', async function () {
    const DEPTH = 6;
    const from = (1 << (DEPTH - 1)) + 1;
    const to = 1 << DEPTH;
    for (let i = from; i < to; i++) {
      const tree = Tree.new(DEPTH);
      const leafs = [];
      for (let j = 0; j < i; j++) {
        leafs.push(web3.utils.randomHex(32));
        tree.updateSingle(j, leafs[j]);
      }
      const root0 = tree.root;
      const root1 = await treeUtils._calculateRootTruncated(leafs);
      assert.equal(root0, root1);
    }
  });

  it.skip('gas cost: check state inclusion', async function () {
    const account = Account.new(10, 10, 10, 0);
    stateTree.insertAccount(10, account);
    const witness = stateTree.witness(10);
    const encoded = account.encode();
    const cost = await treeUtils.gasCostCheckStateInclusion.call(stateTree.root, 10, encoded, witness);
    console.log(`gas cost check state inclusion: ${cost}`);
  });
  it.skip('update state root', async function () {
    const account = Account.new(10, 10, 10, 0);
    stateTree.insertAccount(10, account);
    const witness = stateTree.witness(10);
    const encoded = account.encode();
    const cost = await treeUtils.gasCostUpdateStateRoot.call(10, encoded, witness);
    console.log(`gas cost update state root: ${cost}`);
    console.log(`gas cost update state root: ${cost.toNumber()}`);
  });
});
