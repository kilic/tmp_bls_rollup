pragma solidity ^0.6.10;
pragma experimental ABIEncoderV2;

library Batch {
  uint256 public constant BATCH_TYPE_0_ID = 0x01;
  uint256 public constant BATCH_TYPE_1_ID = 0x02;
  uint256 public constant BATCH_TYPE_2_ID = 0x03;
  uint256 public constant BATCH_TYPE_3_ID = 0x04;

  struct HeaderType0 {
    bytes32 state;
    address coordinator;
    uint256 blockNumber;
    uint256 batchIndex;
    uint256[2] signature;
    bytes32 txRoot;
    bytes32 txCommit;
  }

  struct HeaderNoCommitType0 {
    bytes32 state;
    address coordinator;
    uint256 blockNumber;
    uint256 batchIndex;
    uint256[2] signature;
    bytes32 txRoot;
  }

  struct HeaderType1 {
    bytes32 state;
    address coordinator;
    uint256 blockNumber;
    uint256 batchIndex;
    uint256 queID;
    bytes32 txRoot;
    bytes32 txCommit;
  }

  struct HeaderNoCommitType1 {
    bytes32 state;
    address coordinator;
    uint256 blockNumber;
    uint256 batchIndex;
    uint256 queID;
    bytes32 txRoot;
  }

  struct HeaderType2 {
    bytes32 state;
    address coordinator;
    uint256 blockNumber;
    uint256 batchIndex;
    uint256 queID;
    bytes32 txCommit;
  }

  struct HeaderNoCommitType2 {
    bytes32 state;
    address coordinator;
    uint256 blockNumber;
    uint256 batchIndex;
    uint256 queID;
  }

  struct HeaderType3 {
    bytes32 state;
    address coordinator;
    uint256 blockNumber;
    uint256 batchIndex;
    uint256[2] signature;
    bytes32 txRoot;
    bytes32 txCommit;
  }

  struct HeaderNoCommitType3 {
    bytes32 state;
    address coordinator;
    uint256 blockNumber;
    uint256 batchIndex;
    uint256[2] signature;
    bytes32 txRoot;
  }

  function idType0(HeaderType0 memory header) internal view returns (bytes32) {
    return
      keccak256(
        abi.encodePacked(address(this), BATCH_TYPE_0_ID, header.blockNumber, header.batchIndex, header.coordinator, header.state, header.signature, header.txRoot, header.txCommit)
      );
  }

  function idType0(HeaderNoCommitType0 memory header, bytes32 txCommit) internal view returns (bytes32) {
    return
      keccak256(
        abi.encodePacked(address(this), BATCH_TYPE_0_ID, header.blockNumber, header.batchIndex, header.coordinator, header.state, header.signature, header.txRoot, txCommit)
      );
  }

  function idType1(HeaderType1 memory header) internal view returns (bytes32) {
    return
      keccak256(
        abi.encodePacked(address(this), BATCH_TYPE_0_ID, header.blockNumber, header.batchIndex, header.coordinator, header.state, header.queID, header.txRoot, header.txCommit)
      );
  }

  function idType1(HeaderNoCommitType1 memory header, bytes32 txCommit) internal view returns (bytes32) {
    return
      keccak256(abi.encodePacked(address(this), BATCH_TYPE_0_ID, header.blockNumber, header.batchIndex, header.coordinator, header.state, header.queID, header.txRoot, txCommit));
  }

  function idType2(HeaderType2 memory header) internal view returns (bytes32) {
    return keccak256(abi.encodePacked(address(this), BATCH_TYPE_2_ID, header.blockNumber, header.batchIndex, header.coordinator, header.state, header.queID, header.txCommit));
  }

  function idType2(HeaderNoCommitType2 memory header, bytes32 txCommit) internal view returns (bytes32) {
    return keccak256(abi.encodePacked(address(this), BATCH_TYPE_2_ID, header.blockNumber, header.batchIndex, header.coordinator, header.state, header.queID, txCommit));
  }

  function idType3(HeaderType3 memory header) internal view returns (bytes32) {
    return
      keccak256(
        abi.encodePacked(address(this), BATCH_TYPE_3_ID, header.blockNumber, header.batchIndex, header.coordinator, header.state, header.signature, header.txRoot, header.txCommit)
      );
  }

  function idType3(HeaderNoCommitType3 memory header, bytes32 txCommit) internal view returns (bytes32) {
    return
      keccak256(
        abi.encodePacked(address(this), BATCH_TYPE_3_ID, header.blockNumber, header.batchIndex, header.coordinator, header.state, header.signature, header.txRoot, txCommit)
      );
  }
}
