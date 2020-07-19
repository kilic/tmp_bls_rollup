pragma solidity ^0.6.10;
pragma experimental ABIEncoderV2;

import { FraudProof } from "../FraudProof.sol";
import { BLSAccountRegistry } from "../BLSAccountRegistry.sol";

contract MockFraudProof is FraudProof {
  constructor(BLSAccountRegistry _accountRegistry) public FraudProof(_accountRegistry) {}

  function txCommit(bytes memory txs) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(txs));
  }

  function txRoot0(bytes memory txs) public view returns (bytes32) {
    require(txs.t0_size() > 0, "MockRollup: empty batch");
    require(!txs.t0_hasExcessData(), "MockRollup: excess data");
    return calculateRootTruncated(txs.t0_toLeafs());
  }

  function txRoot1(bytes memory txs) public pure returns (bytes32) {
    require(txs.t1_size() > 0, "MockRollup: empty batcha");
    require(!txs.t1_hasExcessData(), "MockRollup: excess data");
    return calculateRoot(txs.t1_toLeafs());
  }

  function depositRoot1(bytes memory txs) public pure returns (bytes32) {
    require(txs.t1_size() > 0, "MockRollup: empty batcha");
    require(!txs.t1_hasExcessData(), "MockRollup: excess data");
    return calculateRoot(txs.t1_toDepositLeafs());
  }

  function depositRoot2(bytes memory txs) public pure returns (bytes32) {
    require(txs.t2_size() > 0, "MockRollup: empty batcha");
    require(!txs.t2_hasExcessData(), "MockRollup: excess data");
    return calculateRoot(txs.t2_toLeafs());
  }

  function txRoot3(bytes memory txs) public pure returns (bytes32) {
    require(txs.t3_size() > 0, "MockRollup: empty batcha");
    require(!txs.t3_hasExcessData(), "MockRollup: excess data");
    return calculateRoot(txs.t3_toLeafs());
  }
}
