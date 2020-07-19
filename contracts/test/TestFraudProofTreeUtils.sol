pragma solidity ^0.6.10;

import { FraudProofTreeUtils } from "../FraudProof.sol";

contract TestFraudProofTreeUtils is FraudProofTreeUtils {
  function _checkInclusion(
    bytes32 root,
    uint256 index,
    bytes32 leaf,
    bytes32[] memory witness
  ) external pure returns (bool) {
    return checkInclusion(root, index, leaf, witness);
  }

  function _checkStateInclusion(
    bytes32 root,
    uint256 stateIndex,
    uint256 account,
    bytes32[STATE_WITNESS_LENGTH] memory witness
  ) external pure returns (bool) {
    return checkStateInclusion(root, stateIndex, account, witness);
  }

  function _updateStateRootWithAccount(
    uint256 stateIndex,
    uint256 account,
    bytes32[STATE_WITNESS_LENGTH] memory witness
  ) external pure returns (bytes32) {
    return updateStateRoot(stateIndex, account, witness);
  }

  function _updateStateRootWithAccountHash(
    uint256 stateIndex,
    bytes32 account,
    bytes32[STATE_WITNESS_LENGTH] memory witness
  ) external pure returns (bytes32) {
    return updateStateRoot(stateIndex, account, witness);
  }

  function _calculateRoot(bytes32[] calldata buf) external pure returns (bytes32) {
    return calculateRoot(buf);
  }

  function _calculateRootTruncated(bytes32[] calldata buf) external view returns (bytes32) {
    return calculateRootTruncated(buf);
  }
}
