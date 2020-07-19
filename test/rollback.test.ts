const MockRollup = artifacts.require('MockRollup');
import { MockRollupInstance } from '../types/truffle-contracts';
import { DUMMY_ADDRESS, ZERO } from './dummies';

function bn(n: number | string) {
  return web3.utils.toBN(n);
}

async function balBN(adr: string) {
  return bn(await web3.eth.getBalance(adr));
}

interface DepositQue {
  root: string;
  submitted: boolean;
  exist: boolean;
}

contract('Rollback', (eth_accounts) => {
  let rollup: MockRollupInstance;
  const coordinatorA = eth_accounts[1];
  const coordinatorB = eth_accounts[2];
  const challenger = DUMMY_ADDRESS;
  const STAKE = web3.utils.toWei('1', 'gwei');
  const STAKE_IN_BN = bn(STAKE);

  beforeEach(async function () {
    rollup = await MockRollup.new(STAKE, 0, DUMMY_ADDRESS, DUMMY_ADDRESS, ZERO); // yay :)
  });
  it('rollback', async function () {
    const initialChallengerBal = await balBN(challenger);

    // init with some batches
    const initialFillCount = 50;
    for (let i = 0; i < initialFillCount; i++) {
      await rollup._submitTestBatch(ZERO, ZERO, { from: coordinatorA, value: STAKE });
    }
    assert.equal(initialFillCount + 1, (await rollup.batchPointer()).toNumber());

    let rollbackBatchCount = 9;

    // make some filled deposit ques
    await rollup._addTestQue(ZERO, true);
    await rollup._addTestQue(ZERO, true);
    await rollup._addTestQue(ZERO, true);
    await rollup._addTestQue(ZERO, true);
    assert.equal(5, (await rollup.depositPointer()).toNumber());

    // add some more batches
    await rollup._submitTestBatch(ZERO, ZERO, { from: coordinatorA, value: STAKE });
    await rollup._submitTestBatch(ZERO, ZERO, { from: coordinatorB, value: STAKE });
    await rollup._submitTestBatch(ZERO, ZERO, { from: coordinatorA, value: STAKE });
    await rollup._submitTestBatch(ZERO, ZERO, { from: coordinatorB, value: STAKE });
    await rollup._submitTestBatch(ZERO, ZERO, { from: coordinatorA, value: STAKE });

    await rollup._submitTestBatchWithDeposits(ZERO, ZERO, 1, { from: coordinatorA, value: STAKE });
    await rollup._submitTestBatchWithDeposits(ZERO, ZERO, 2, { from: coordinatorB, value: STAKE });
    await rollup._submitTestBatchWithDeposits(ZERO, ZERO, 3, { from: coordinatorA, value: STAKE });
    await rollup._submitTestBatchWithDeposits(ZERO, ZERO, 4, { from: coordinatorA, value: STAKE });

    assert.equal(rollbackBatchCount + initialFillCount + 1, (await rollup.batchPointer()).toNumber());

    // rollback by 9 batches :)
    await rollup._rollback(initialFillCount + 1, challenger);

    const expectedDiff = STAKE_IN_BN.mul(bn(6));
    const challangerBal = await balBN(challenger);
    assert.isTrue(challangerBal.sub(initialChallengerBal).eq(expectedDiff));
    const rollupBal = await balBN(rollup.address);
    assert.isTrue(rollupBal.eq(bn(initialFillCount).mul(STAKE_IN_BN)));

    let depositQue;
    depositQue = ((await rollup.depositQues(1)) as unknown) as DepositQue;
    assert.isFalse(depositQue.submitted);
    assert.isTrue(depositQue.exist);
    depositQue = ((await rollup.depositQues(2)) as unknown) as DepositQue;
    assert.isFalse(depositQue.submitted);
    assert.isTrue(depositQue.exist);
    depositQue = ((await rollup.depositQues(3)) as unknown) as DepositQue;
    assert.isFalse(depositQue.submitted);
    assert.isTrue(depositQue.exist);
    depositQue = ((await rollup.depositQues(4)) as unknown) as DepositQue;
    assert.isFalse(depositQue.submitted);
    assert.isTrue(depositQue.exist);
  });

  it.skip('gas: rollback estimate cost for 250 batches', async function () {
    for (let i = 0; i < 250; i++) {
      await rollup._addTestQue(ZERO, true);
      await rollup._submitTestBatchWithDeposits(ZERO, ZERO, i + 1, { from: coordinatorA, value: STAKE });
    }
    assert.equal(250 + 1, (await rollup.batchPointer()).toNumber());
    // rollback by 9 batches :)
    let tx = await rollup._rollback(1, challenger);
    console.log('gas cost for rollback by 250 deposit batches:', tx.receipt.gasUsed);
  });
});
