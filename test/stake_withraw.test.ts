const MockRollup = artifacts.require('MockRollup');
import { MockRollupInstance } from '../types/truffle-contracts';
import { DUMMY_ADDRESS, ZERO, DUMMY_BYTES } from './dummies';

const { time } = require('@openzeppelin/test-helpers');

function bn(n: number | string) {
  return web3.utils.toBN(n);
}

async function balBN(adr: string) {
  return bn(await web3.eth.getBalance(adr));
}

contract('Stake Withdraw', (eth_accounts) => {
  let rollup: MockRollupInstance;
  const coordinator = eth_accounts[1];
  const beneficiary = DUMMY_ADDRESS;
  const STAKE = web3.utils.toWei('1', 'gwei');
  const STAKE_IN_BN = bn(STAKE);
  const DISPUTE_PERIOD = 10;

  beforeEach(async function () {
    rollup = await MockRollup.new(STAKE, DISPUTE_PERIOD, DUMMY_ADDRESS, DUMMY_ADDRESS, ZERO); // yay :)
  });
  it('withraw stake', async function () {
    const headers = [];
    const batchCount = 1;
    for (let i = 0; i < batchCount; i++) {
      const block = await web3.eth.getBlock('latest');
      const header = {
        state: ZERO,
        coordinator,
        blockNumber: block.number + 1,
        batchIndex: i + 1,
        signature: [DUMMY_BYTES, DUMMY_BYTES],
        txRoot: DUMMY_BYTES,
        txCommit: DUMMY_BYTES,
      };
      const batchID = await rollup.idType0(header);
      headers.push(header);
      await rollup._submitTestBatch(batchID, ZERO, { from: coordinator, value: STAKE });
    }
    const block = await web3.eth.getBlock('latest');
    await time.advanceBlockTo(block.number + DISPUTE_PERIOD + 1);
    const initialBeneficiaryBal = await balBN(beneficiary);
    const expectedBalDiff = STAKE_IN_BN.mul(bn(batchCount));
    await rollup.withdrawStake0(headers, Array(batchCount).fill(beneficiary), { from: coordinator });
    const beneficiaryBal = await balBN(beneficiary);
    assert.isTrue(initialBeneficiaryBal.add(expectedBalDiff).eq(beneficiaryBal));
  });
});
