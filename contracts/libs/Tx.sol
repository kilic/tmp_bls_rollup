pragma solidity ^0.6.10;

import { BLS } from "./BLS.sol";

library Tx {
  uint256 public constant MASK_ACCOUNT_ID = 0xffffffff;
  uint256 public constant MASK_STATE_ID = 0xffffffff;
  uint256 public constant MASK_AMOUNT = 0xffffffff;
  uint256 public constant MASK_TOKEN_ID = 0xffff;
  // transaction_type_0:
  // [sender_state_id<4>|receiver_state_id<4>|amount<4>]
  uint256 public constant TX_LEN_0 = 12;
  uint256 public constant MASK_TX_0 = 0xffffffffffffffffffffffff;
  uint256 public constant MASK_TX_IN_WORD_0 = 0xffffffffffffffffffffffffffffffff;
  // positions in bytes
  uint256 public constant POSITION_SENDER_0 = 4;
  uint256 public constant POSITION_RECEIVER_0 = 8;
  uint256 public constant POSITION_AMOUNT_0 = 12;

  // transaction_type_1:
  // [account_id<4>|token_id<2>|amount<4>|state_id<4>]
  uint256 public constant TX_LEN_1 = 14;
  uint256 public constant TX_DEPOSIT_LEN_1 = 10;
  uint256 public constant MASK_TX_1 = 0xffffffffffffffffffff;
  // positions in bytes
  uint256 public constant POSITION_ACCOUNT_ID_1 = 4;
  uint256 public constant POSITION_TOKEN_ID_1 = 6;
  uint256 public constant POSITION_AMOUNT_1 = 10;
  uint256 public constant POSITION_STATE_ID_1 = 14;

  // transaction_type_2:
  // [state_id<4>|token_id<2>|amount<4>]
  uint256 public constant TX_LEN_2 = 10;
  uint256 public constant MASK_TX_2 = 0xffffffffffffffffffff;
  // positions in bytes
  uint256 public constant POSITION_STATE_ID_2 = 4;
  uint256 public constant POSITION_TOKEN_ID_2 = 6;
  uint256 public constant POSITION_AMOUNT_2 = 10;

  // transaction_type_3:
  // [sender_state_id<4>|receiver_state_id<4>|amount<4>|receiver_account_id<4>]
  uint256 public constant TX_LEN_3 = 16;
  uint256 public constant MASK_TX_3 = 0xffffffffffffffffffffffff;
  // positions in bytes
  uint256 public constant POSITION_SENDER_3 = 4;
  uint256 public constant POSITION_RECEIVER_3 = 8;
  uint256 public constant POSITION_AMOUNT_3 = 12;
  uint256 public constant POSITION_RECEIVER_ACCOUNT_ID = 16;

  // encoding transaction_type_0 into uint256:
  // [tx_index<4>|sender_state_id<4>|receiver_state_id<4>|amount<4>]
  function t0_fromWord(uint256 _tx)
    internal
    pure
    returns (
      uint256 from,
      uint256 to,
      uint256 amount,
      uint256 index,
      bytes32 leaf
    )
  {
    require(_tx | MASK_TX_IN_WORD_0 == MASK_TX_IN_WORD_0, "Tx: invalid uint256 tx encoding");
    amount = _tx & 0xffffffff;
    to = (_tx >> 32) & 0xffffffff;
    from = (_tx >> 64) & 0xffffffff;
    index = (_tx >> 96) & 0xffffffff;
    leaf = keccak256(abi.encodePacked(uint32(from), uint32(to), uint32(amount)));
  }

  function t0_amountFromWord(uint256 _tx) internal pure returns (uint256) {
    require(_tx | MASK_TX_IN_WORD_0 == MASK_TX_IN_WORD_0, "Tx: invalid uint256 tx encoding");
    return _tx & 0xffffffff;
  }

  function t0_hasExcessData(bytes memory txs) internal pure returns (bool) {
    uint256 txSize = txs.length / TX_LEN_0;
    return txSize * TX_LEN_0 != txs.length;
  }

  function t0_size(bytes memory txs) internal pure returns (uint256) {
    uint256 txSize = txs.length / TX_LEN_0;
    return txSize;
  }

  function t0_amountOf(bytes memory txs, uint256 index) internal pure returns (uint256 amount) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_0))
      amount := and(mload(add(p_tx, POSITION_AMOUNT_0)), MASK_AMOUNT)
    }
    return amount;
  }

  function t0_senderOf(bytes memory txs, uint256 index) internal pure returns (uint256 sender) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_0))
      sender := and(mload(add(p_tx, POSITION_SENDER_0)), MASK_STATE_ID)
    }
  }

  function t0_receiverOf(bytes memory txs, uint256 index) internal pure returns (uint256 receiver) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_0))
      receiver := and(mload(add(p_tx, POSITION_RECEIVER_0)), MASK_STATE_ID)
    }
  }

  function t0_hashOf(bytes memory txs, uint256 index) internal pure returns (bytes32 result) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, add(mul(index, TX_LEN_0), 32))
      result := keccak256(p_tx, TX_LEN_0)
    }
  }

  function t0_toLeafs(bytes memory txs) internal pure returns (bytes32[] memory) {
    uint256 batchSize = t0_size(txs);
    bytes32[] memory buf = new bytes32[](batchSize);
    for (uint256 i = 0; i < batchSize; i++) {
      buf[i] = t0_hashOf(txs, i);
    }
    return buf;
  }

  function t0_mapToPoint(bytes memory txs, uint256 index) internal view returns (uint256[2] memory) {
    bytes32 r;
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, add(mul(index, TX_LEN_0), 32))
      r := keccak256(p_tx, TX_LEN_0)
    }
    return BLS.mapToPoint(r);
  }

  function t1_size(bytes memory txs) internal pure returns (uint256) {
    uint256 txSize = txs.length / TX_LEN_1;
    return txSize;
  }

  function t1_hasExcessData(bytes memory txs) internal pure returns (bool) {
    uint256 txSize = txs.length / TX_LEN_1;
    return txSize * TX_LEN_1 != txs.length;
  }

  function t1_newDepositHash(
    uint256 accountID,
    uint256 tokenID,
    uint256 amount
  ) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(uint32(accountID), uint16(tokenID), uint32(amount)));
  }

  function t1_accountIdOf(bytes memory txs, uint256 index) internal pure returns (uint256 destination) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_1))
      destination := and(mload(add(p_tx, POSITION_ACCOUNT_ID_1)), MASK_ACCOUNT_ID)
    }
  }

  function t1_tokenIdOf(bytes memory txs, uint256 index) internal pure returns (uint256 tokenID) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_1))
      tokenID := and(mload(add(p_tx, POSITION_TOKEN_ID_1)), MASK_TOKEN_ID)
    }
  }

  function t1_amountOf(bytes memory txs, uint256 index) internal pure returns (uint256 amount) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_1))
      amount := and(mload(add(p_tx, POSITION_AMOUNT_1)), MASK_AMOUNT)
    }
    return amount;
  }

  function t1_stateIdOf(bytes memory txs, uint256 index) internal pure returns (uint256 destination) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_1))
      destination := and(mload(add(p_tx, POSITION_STATE_ID_1)), MASK_STATE_ID)
    }
  }

  function t1_hashOf(bytes memory txs, uint256 index) internal pure returns (bytes32 result) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, add(mul(index, TX_LEN_1), 32))
      result := keccak256(p_tx, TX_LEN_1)
    }
  }

  function t1_depositHashOf(bytes memory txs, uint256 index) internal pure returns (bytes32 result) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, add(mul(index, TX_LEN_1), 32))
      result := keccak256(p_tx, TX_DEPOSIT_LEN_1)
    }
  }

  function t1_toLeafs(bytes memory txs) internal pure returns (bytes32[] memory) {
    uint256 batchSize = t1_size(txs);
    bytes32[] memory buf = new bytes32[](batchSize);
    for (uint256 i = 0; i < batchSize; i++) {
      buf[i] = t1_hashOf(txs, i);
    }
    return buf;
  }

  function t1_toDepositLeafs(bytes memory txs) internal pure returns (bytes32[] memory) {
    uint256 batchSize = t1_size(txs);
    bytes32[] memory buf = new bytes32[](batchSize);
    for (uint256 i = 0; i < batchSize; i++) {
      buf[i] = t1_depositHashOf(txs, i);
    }
    return buf;
  }

  function t2_newDepositHash(
    uint256 destination,
    uint256 tokenID,
    uint256 amount
  ) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(uint32(destination), uint16(tokenID), uint32(amount)));
  }

  function t2_size(bytes memory txs) internal pure returns (uint256) {
    uint256 txSize = txs.length / TX_LEN_2;
    return txSize;
  }

  function t2_hasExcessData(bytes memory txs) internal pure returns (bool) {
    uint256 txSize = txs.length / TX_LEN_2;
    return txSize * TX_LEN_2 != txs.length;
  }

  function t2_stateIdOf(bytes memory txs, uint256 index) internal pure returns (uint256 destination) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_2))
      destination := and(mload(add(p_tx, POSITION_STATE_ID_2)), MASK_ACCOUNT_ID)
    }
  }

  function t2_tokenIdOf(bytes memory txs, uint256 index) internal pure returns (uint256 tokenID) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_2))
      tokenID := and(mload(add(p_tx, POSITION_TOKEN_ID_2)), MASK_TOKEN_ID)
    }
  }

  function t2_amountOf(bytes memory txs, uint256 index) internal pure returns (uint256 amount) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_2))
      amount := and(mload(add(p_tx, POSITION_AMOUNT_2)), MASK_AMOUNT)
    }
    return amount;
  }

  function t2_hashOf(bytes memory txs, uint256 index) internal pure returns (bytes32 result) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, add(mul(index, TX_LEN_2), 32))
      result := keccak256(p_tx, TX_LEN_2)
    }
  }

  function t2_toLeafs(bytes memory txs) internal pure returns (bytes32[] memory) {
    uint256 batchSize = t2_size(txs);
    bytes32[] memory buf = new bytes32[](batchSize);
    for (uint256 i = 0; i < batchSize; i++) {
      buf[i] = t2_hashOf(txs, i);
    }
    return buf;
  }

  function t3_hasExcessData(bytes memory txs) internal pure returns (bool) {
    uint256 txSize = txs.length / TX_LEN_3;
    return txSize * TX_LEN_3 != txs.length;
  }

  function t3_size(bytes memory txs) internal pure returns (uint256) {
    uint256 txSize = txs.length / TX_LEN_3;
    return txSize;
  }

  function t3_senderOf(bytes memory txs, uint256 index) internal pure returns (uint256 sender) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_3))
      sender := and(mload(add(p_tx, POSITION_SENDER_3)), MASK_STATE_ID)
    }
  }

  function t3_receiverOf(bytes memory txs, uint256 index) internal pure returns (uint256 receiver) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_3))
      receiver := and(mload(add(p_tx, POSITION_RECEIVER_3)), MASK_STATE_ID)
    }
  }

  function t3_amountOf(bytes memory txs, uint256 index) internal pure returns (uint256 amount) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_3))
      amount := and(mload(add(p_tx, POSITION_AMOUNT_3)), MASK_AMOUNT)
    }
    return amount;
  }

  function t3_receiverAccountIdOf(bytes memory txs, uint256 index) internal pure returns (uint256 receiver) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, mul(index, TX_LEN_3))
      receiver := and(mload(add(p_tx, POSITION_RECEIVER_ACCOUNT_ID)), MASK_ACCOUNT_ID)
    }
  }

  function t3_hashOf(bytes memory txs, uint256 index) internal pure returns (bytes32 result) {
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, add(mul(index, TX_LEN_3), 32))
      result := keccak256(p_tx, TX_LEN_3)
    }
  }

  function t3_toLeafs(bytes memory txs) internal pure returns (bytes32[] memory) {
    uint256 batchSize = t3_size(txs);
    bytes32[] memory buf = new bytes32[](batchSize);
    for (uint256 i = 0; i < batchSize; i++) {
      buf[i] = t3_hashOf(txs, i);
    }
    return buf;
  }

  function t3_mapToPoint(bytes memory txs, uint256 index) internal view returns (uint256[2] memory) {
    bytes32 r;
    // solium-disable-next-line security/no-inline-assembly
    assembly {
      let p_tx := add(txs, add(mul(index, TX_LEN_3), 32))
      r := keccak256(p_tx, TX_LEN_3)
    }
    return BLS.mapToPoint(r);
  }
}
