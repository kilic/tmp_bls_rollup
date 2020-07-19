pragma solidity ^0.6.10;
pragma experimental ABIEncoderV2;

import { Batch as batch } from "../libs/Batch.sol";

import { BLSAccountRegistry } from "../BLSAccountRegistry.sol";
import { Rollup } from "../Rollup.sol";
import { FraudProof } from "../FraudProof.sol";
import { TokenRegistry } from "../TokenRegistry.sol";

contract MockRollup is Rollup {
  constructor(
    uint256 _stakeAmount,
    uint256 _disputePeriod,
    FraudProof _fraudProof,
    TokenRegistry _tokenRegistry,
    bytes32 genesisState
  ) public Rollup(_stakeAmount, _disputePeriod, _fraudProof, _tokenRegistry) {
    if (genesisState != bytes32(0)) {
      batches[0] = Batch({ state: genesisState, ID: keccak256(abi.encode("genesis_state", address(this))) });
    } else {
      bytes32 emptyState = bytes32(0x27ae5ba08d7291c96c8cbddcc148bf48a6d68c7974b94356f53754ef6171d757);
      batches[0] = Batch({ state: emptyState, ID: keccak256(abi.encode("genesis_state", address(this))) });
    }
    batchPointer = 1;
  }

  function _rollback(uint256 _invalidBatchIndex, address payable challenger) external {
    rollback(_invalidBatchIndex, challenger);
  }

  function _addTestQue(bytes32 root) external {
    depositQues[depositPointer] = DepositQue({ root: root, newAccounts: true, submitted: false, exist: true });
    depositPointer++;
  }

  function _submitTestBatchWithDeposits(
    bytes32 batchID,
    bytes32 newState,
    uint256 queID
  ) external payable {
    stake(batchPointer);

    DepositQue memory depositQue = depositQues[queID];
    require(depositQue.exist, "Rollup: deposit que doesn't exist");
    require(depositQue.newAccounts, "Rollup: deposit que is not for new accounts");
    require(!depositQue.submitted, "Rollup: deposit que is already submitted");
    depositQues[queID].submitted = true;
    submittedQues[batchPointer] = queID;
    batches[batchPointer] = Batch({ ID: batchID, state: newState });
    batchPointer += 1;
  }

  function _submitTestBatch(bytes32 batchID, bytes32 newState) external payable {
    stake(batchPointer);

    batches[batchPointer] = Batch({ ID: batchID, state: newState });
    batchPointer += 1;
  }

  function idType0(batch.HeaderType0 memory header) external view returns (bytes32) {
    return batch.idType0(header);
  }

  function idType1(batch.HeaderType1 memory header) external view returns (bytes32) {
    return batch.idType1(header);
  }

  function idType2(batch.HeaderType2 memory header) external view returns (bytes32) {
    return batch.idType2(header);
  }

  function idType3(batch.HeaderType3 memory header) external view returns (bytes32) {
    return batch.idType3(header);
  }
}
