pragma solidity ^0.6.10;

import { Tx } from "../libs/Tx.sol";

contract TestTx {
  using Tx for bytes;

  function t0_fromWord(uint256 _tx)
    external
    pure
    returns (
      uint256 from,
      uint256 to,
      uint256 amount,
      uint256 index,
      bytes32 leaf
    )
  {
    return Tx.t0_fromWord(_tx);
  }

  function t0_amountFromWord(uint256 _tx) external pure returns (uint256) {
    return Tx.t0_amountFromWord(_tx);
  }

  function t0_hasExcessData(bytes calldata txs) external pure returns (bool) {
    return txs.t0_hasExcessData();
  }

  function t0_size(bytes calldata txs) external pure returns (uint256) {
    return txs.t0_size();
  }

  function t0_amountOf(bytes calldata txs, uint256 index) external pure returns (uint256) {
    return txs.t0_amountOf(index);
  }

  function t0_senderOf(bytes calldata txs, uint256 index) external pure returns (uint256) {
    return txs.t0_senderOf(index);
  }

  function t0_receiverOf(bytes calldata txs, uint256 index) external pure returns (uint256) {
    return txs.t0_receiverOf(index);
  }

  function t0_hashOf(bytes calldata txs, uint256 index) external pure returns (bytes32) {
    return txs.t0_hashOf(index);
  }

  function t0_mapToPoint(bytes calldata txs, uint256 index) external view returns (uint256[2] memory) {
    return txs.t0_mapToPoint(index);
  }

  function t1_hasExcessData(bytes calldata txs) external pure returns (bool) {
    return txs.t1_hasExcessData();
  }

  function t1_size(bytes calldata txs) external pure returns (uint256) {
    return txs.t1_size();
  }

  function t1_accountIdOf(bytes calldata txs, uint256 index) external pure returns (uint256) {
    return txs.t1_accountIdOf(index);
  }

  function t1_tokenIdOf(bytes calldata txs, uint256 index) external pure returns (uint256) {
    return txs.t1_tokenIdOf(index);
  }

  function t1_amountOf(bytes calldata txs, uint256 index) external pure returns (uint256) {
    return txs.t1_amountOf(index);
  }

  function t1_stateIdOf(bytes calldata txs, uint256 index) external pure returns (uint256) {
    return txs.t1_stateIdOf(index);
  }

  function t1_hashOf(bytes calldata txs, uint256 index) external pure returns (bytes32) {
    return txs.t1_hashOf(index);
  }

  function t1_depositHashOf(bytes calldata txs, uint256 index) external pure returns (bytes32) {
    return txs.t1_depositHashOf(index);
  }

  function t2_hasExcessData(bytes memory txs) external pure returns (bool) {
    return txs.t2_hasExcessData();
  }

  function t2_size(bytes memory txs) external pure returns (uint256) {
    return txs.t2_size();
  }

  function t2_amountOf(bytes memory txs, uint256 index) external pure returns (uint256) {
    return txs.t2_amountOf(index);
  }

  function t2_tokenIdOf(bytes memory txs, uint256 index) external pure returns (uint256) {
    return txs.t2_tokenIdOf(index);
  }

  function t2_stateIdOf(bytes memory txs, uint256 index) external pure returns (uint256) {
    return txs.t2_stateIdOf(index);
  }

  function t2_hashOf(bytes memory txs, uint256 index) external pure returns (bytes32) {
    return txs.t2_hashOf(index);
  }

  function t3_hasExcessData(bytes memory txs) external pure returns (bool) {
    return txs.t3_hasExcessData();
  }

  function t3_size(bytes memory txs) external pure returns (uint256) {
    return txs.t3_size();
  }

  function t3_amountOf(bytes memory txs, uint256 index) external pure returns (uint256) {
    return txs.t3_amountOf(index);
  }

  function t3_senderOf(bytes memory txs, uint256 index) external pure returns (uint256) {
    return txs.t3_senderOf(index);
  }

  function t3_receiverOf(bytes memory txs, uint256 index) external pure returns (uint256) {
    return txs.t3_receiverOf(index);
  }

  function t3_receiverAccountIdOf(bytes memory txs, uint256 index) external pure returns (uint256) {
    return txs.t3_receiverAccountIdOf(index);
  }

  function t3_hashOf(bytes memory txs, uint256 index) external pure returns (bytes32) {
    return txs.t3_hashOf(index);
  }

  function t3_mapToPoint(bytes memory txs, uint256 index) external view returns (uint256[2] memory) {
    return txs.t3_mapToPoint(index);
  }
}
