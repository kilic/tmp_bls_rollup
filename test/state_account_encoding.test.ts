const TestStateAccount = artifacts.require('TestStateAccount');
import { TestStateAccountInstance } from '../types/truffle-contracts';
import { Account } from './app/state_account';
import { Tree } from './app/tree';

contract('Account encoding', (accounts) => {
  let c: TestStateAccountInstance;
  const account0 = Account.new(10, 1, 200, 8);
  before(async function () {
    c = await TestStateAccount.new();
    const tree = Tree.new(32);
  });

  it('encoding', async function () {
    const encoded = account0.encode();
    assert.equal(account0.accountID, (await c.accountID(encoded)).toNumber());
    assert.equal(account0.tokenId, (await c.tokenID(encoded)).toNumber());
    assert.equal(account0.balance, (await c.balance(encoded)).toNumber());
    assert.equal(account0.nonce, (await c.nonce(encoded)).toNumber());
    assert.equal(account0.toStateLeaf(), await c.hash(encoded));
  });

  it('encoding uint256', async function () {
    const encoded = account0.encode();
    assert.equal(account0.accountID, (await c.accountID(encoded)).toNumber());
    assert.equal(account0.tokenId, (await c.tokenID(encoded)).toNumber());
    assert.equal(account0.balance, (await c.balance(encoded)).toNumber());
    assert.equal(account0.nonce, (await c.nonce(encoded)).toNumber());
    assert.equal(account0.toStateLeaf(), await c.hash(encoded));
  });

  it('empty account', async function () {
    let emptyAccount = '0x8000000000000000000000000000000000000000000000000000000000000000';
    let zero = '0x0000000000000000000000000000000000000000000000000000000000000000';
    assert.isTrue(await c.isEmptyAccount(emptyAccount));
    let emptyAccountHash = await c.hash(emptyAccount);
    assert.equal(emptyAccountHash, zero);
  });

  it('increment nonce', async function () {
    const encoded0 = account0.encode();
    const res = await c.incrementNonce(encoded0);
    assert.isTrue(res[1]);
    const encoded1 = web3.utils.padLeft(res[0].toString(16), 64);
    const account1 = Account.decode(encoded1);
    assert.equal(account0.accountID, account1.accountID);
    assert.equal(account0.tokenId, account1.tokenId);
    assert.equal(account0.balance, account1.balance);
    assert.equal(account0.nonce + 1, account1.nonce);
  });

  it('balance safe add', async function () {
    const amount = 500;
    const encoded0 = account0.encode();
    const res = await c.balanceSafeAdd(encoded0, amount);
    assert.isTrue(res[1]);
    const encoded1 = web3.utils.padLeft(res[0].toString(16), 64);
    const account1 = Account.decode(encoded1);
    assert.equal(account0.accountID, account1.accountID);
    assert.equal(account0.tokenId, account1.tokenId);
    assert.equal(account0.balance + amount, account1.balance);
    assert.equal(account0.nonce, account1.nonce);
    // TODO: test overflow
  });

  it('balance safe sub', async function () {
    const amount = 150;
    const encoded0 = account0.encode();
    const res = await c.balanceSafeSub(encoded0, amount);
    assert.isTrue(res[1]);
    const encoded1 = web3.utils.padLeft(res[0].toString(16), 64);
    const account1 = Account.decode(encoded1);
    assert.equal(account0.accountID, account1.accountID);
    assert.equal(account0.tokenId, account1.tokenId);
    assert.equal(account0.balance - amount, account1.balance);
    assert.equal(account0.nonce, account1.nonce);
    // TODO: test overflow
  });
});
