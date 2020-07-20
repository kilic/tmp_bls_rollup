pragma solidity ^0.6.10;
pragma experimental ABIEncoderV2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { BLS } from "./libs/BLS.sol";
import { Tx } from "./libs/Tx.sol";
import { Withdraw } from "./libs/Withdraw.sol";
import { StateAccount } from "./libs/StateAccount.sol";
import { BLSAccountRegistry } from "./BLSAccountRegistry.sol";
import { StakeManager } from "./StakeManager.sol";

contract FraudProofTreeUtils {
  using StateAccount for uint256;
  using Tx for bytes;

  uint256 public constant STATE_TREE_DEPTH = 32;
  uint256 public constant ACCOUNT_WITNESS_LENGTH = 31;
  uint256 public constant STATE_WITNESS_LENGTH = 32;

  // TODO: should be less zeros depending on batch sizes
  bytes32[STATE_TREE_DEPTH] public ZEROS = [
    bytes32(0x0000000000000000000000000000000000000000000000000000000000000000),
    bytes32(0xad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5),
    bytes32(0xb4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d30),
    bytes32(0x21ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba85),
    bytes32(0xe58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a19344),
    bytes32(0x0eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d),
    bytes32(0x887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a1968),
    bytes32(0xffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f83),
    bytes32(0x9867cc5f7f196b93bae1e27e6320742445d290f2263827498b54fec539f756af),
    bytes32(0xcefad4e508c098b9a7e1d8feb19955fb02ba9675585078710969d3440f5054e0),
    bytes32(0xf9dc3e7fe016e050eff260334f18a5d4fe391d82092319f5964f2e2eb7c1c3a5),
    bytes32(0xf8b13a49e282f609c317a833fb8d976d11517c571d1221a265d25af778ecf892),
    bytes32(0x3490c6ceeb450aecdc82e28293031d10c7d73bf85e57bf041a97360aa2c5d99c),
    bytes32(0xc1df82d9c4b87413eae2ef048f94b4d3554cea73d92b0f7af96e0271c691e2bb),
    bytes32(0x5c67add7c6caf302256adedf7ab114da0acfe870d449a3a489f781d659e8becc),
    bytes32(0xda7bce9f4e8618b6bd2f4132ce798cdc7a60e7e1460a7299e3c6342a579626d2),
    bytes32(0x2733e50f526ec2fa19a22b31e8ed50f23cd1fdf94c9154ed3a7609a2f1ff981f),
    bytes32(0xe1d3b5c807b281e4683cc6d6315cf95b9ade8641defcb32372f1c126e398ef7a),
    bytes32(0x5a2dce0a8a7f68bb74560f8f71837c2c2ebbcbf7fffb42ae1896f13f7c7479a0),
    bytes32(0xb46a28b6f55540f89444f63de0378e3d121be09e06cc9ded1c20e65876d36aa0),
    bytes32(0xc65e9645644786b620e2dd2ad648ddfcbf4a7e5b1a3a4ecfe7f64667a3f0b7e2),
    bytes32(0xf4418588ed35a2458cffeb39b93d26f18d2ab13bdce6aee58e7b99359ec2dfd9),
    bytes32(0x5a9c16dc00d6ef18b7933a6f8dc65ccb55667138776f7dea101070dc8796e377),
    bytes32(0x4df84f40ae0c8229d0d6069e5c8f39a7c299677a09d367fc7b05e3bc380ee652),
    bytes32(0xcdc72595f74c7b1043d0e1ffbab734648c838dfb0527d971b602bc216c9619ef),
    bytes32(0x0abf5ac974a1ed57f4050aa510dd9c74f508277b39d7973bb2dfccc5eeb0618d),
    bytes32(0xb8cd74046ff337f0a7bf2c8e03e10f642c1886798d71806ab1e888d9e5ee87d0),
    bytes32(0x838c5655cb21c6cb83313b5a631175dff4963772cce9108188b34ac87c81c41e),
    bytes32(0x662ee4dd2dd7b2bc707961b1e646c4047669dcb6584f0d8d770daf5d7e7deb2e),
    bytes32(0x388ab20e2573d171a88108e79d820e98f26c0b84aa8b2f4aa4968dbb818ea322),
    bytes32(0x93237c50ba75ee485f4c22adf2f741400bdf8d6a9cc7df7ecae576221665d735),
    bytes32(0x8448818bb4ae4562849e949e17ac16e0be16688e156b5cf15e098c627c0056a9)
  ];

  function checkInclusion(
    bytes32 root,
    uint256 index,
    bytes32 leaf,
    bytes32[] memory witness
  ) internal pure returns (bool) {
    bytes32 acc = leaf;
    uint256 path = index;
    for (uint256 i = 0; i < witness.length; i++) {
      if (path & 1 == 1) {
        acc = keccak256(abi.encode(witness[i], acc));
      } else {
        acc = keccak256(abi.encode(acc, witness[i]));
      }
      path >>= 1;
    }
    return root == acc;
  }

  function checkStateInclusion(
    bytes32 root,
    uint256 stateIndex,
    uint256 account,
    bytes32[STATE_WITNESS_LENGTH] memory witness
  ) internal pure returns (bool) {
    bytes32 acc = account.hash();
    uint256 path = stateIndex;
    for (uint256 i = 0; i < STATE_WITNESS_LENGTH; i++) {
      if (path & 1 == 1) {
        acc = keccak256(abi.encode(witness[i], acc));
      } else {
        acc = keccak256(abi.encode(acc, witness[i]));
      }
      path >>= 1;
    }
    return root == acc;
  }

  function updateStateRoot(
    uint256 stateIndex,
    uint256 account,
    bytes32[STATE_WITNESS_LENGTH] memory witness
  ) internal pure returns (bytes32) {
    bytes32 acc = account.hash();
    uint256 path = stateIndex;
    for (uint256 i = 0; i < STATE_WITNESS_LENGTH; i++) {
      if (path & 1 == 1) {
        acc = keccak256(abi.encode(witness[i], acc));
      } else {
        acc = keccak256(abi.encode(acc, witness[i]));
      }
      path >>= 1;
    }
    return acc;
  }

  function updateStateRoot(
    uint256 stateIndex,
    bytes32 account,
    bytes32[STATE_WITNESS_LENGTH] memory witness
  ) internal pure returns (bytes32) {
    bytes32 acc = account;
    uint256 path = stateIndex;
    for (uint256 i = 0; i < STATE_WITNESS_LENGTH; i++) {
      if (path & 1 == 1) {
        acc = keccak256(abi.encode(witness[i], acc));
      } else {
        acc = keccak256(abi.encode(acc, witness[i]));
      }
      path >>= 1;
    }
    return acc;
  }

  function calculateRoot(bytes32[] memory buf) internal pure returns (bytes32) {
    uint256 n = buf.length;
    require(n & (n - 1) == 0, "RollupTree: input lenght must be power of 2");
    n >>= 1;
    while (true) {
      if (n == 0) {
        break;
      }
      for (uint256 j = 0; j < n; j++) {
        uint256 k = j << 1;
        buf[j] = keccak256(abi.encode(buf[k], buf[k + 1]));
      }
      n >>= 1;
    }
    return buf[0];
  }

  function calculateRootTruncated(bytes32[] memory buf) internal view returns (bytes32) {
    uint256 odd = buf.length & 1;
    uint256 n = (buf.length + 1) >> 1;
    uint256 level = 0;
    while (true) {
      uint256 i = 0;
      for (; i < n - odd; i++) {
        uint256 j = i << 1;
        buf[i] = keccak256(abi.encode(buf[j], buf[j + 1]));
      }
      if (odd == 1) {
        buf[i] = keccak256(abi.encode(buf[i << 1], ZEROS[level]));
      }
      if (n == 1) {
        break;
      }
      odd = (n & 1);
      n = (n + 1) >> 1;
      level += 1;
    }
    return buf[0];
  }
}

contract FraudProof is FraudProofTreeUtils {
  using Tx for bytes;

  struct InvalidTransitionBatchType0 {
    uint256[] senderAccounts;
    uint256[] receiverAccounts;
    bytes32[STATE_WITNESS_LENGTH][] senderWitnesses;
    bytes32[STATE_WITNESS_LENGTH][] receiverWitnesses;
  }

  struct InvalidSignatureBatchType0 {
    uint256[4][] pubkeys;
    bytes32[ACCOUNT_WITNESS_LENGTH][] witnesses;
  }

  struct InvalidTransitionBatchType1 {
    uint256[] accounts;
    bytes32[STATE_WITNESS_LENGTH][] witnesses;
  }

  struct InvalidTransitionBatchType2 {
    uint256[] accounts;
    bytes32[STATE_WITNESS_LENGTH][] witnesses;
  }

  struct InvalidTransitionBatchType3 {
    uint256[] senderAccounts;
    uint256[] receiverAccounts;
    bytes32[STATE_WITNESS_LENGTH][] senderWitnesses;
    bytes32[STATE_WITNESS_LENGTH][] receiverWitnesses;
  }

  struct InvalidSignatureBatchType3 {
    uint256[4][] pubkeys;
    bytes32[ACCOUNT_WITNESS_LENGTH][] witnesses;
  }

  BLSAccountRegistry public accountRegistry;

  constructor(BLSAccountRegistry _accountRegistry) public {
    accountRegistry = _accountRegistry;
  }

  function verifyWithdrawRequest(
    Withdraw.Proof memory proof,
    bytes32 stateRoot,
    bytes32 txRoot
  ) public view returns (uint256) {
    uint256 from;
    uint256 to;
    uint256 index;
    bytes32 leaf;
    (from, to, , index, leaf) = Tx.t0_fromWord(proof._tx);
    if (!checkInclusion(txRoot, index, leaf, proof.txWitness)) {
      return 1;
    }
    // check burn address
    if (to != 0) {
      return 2;
    }
    if (!checkStateInclusion(stateRoot, from, proof.stateAccount, proof.stateWitness)) {
      return 3;
    }
    if (!accountRegistry.exists(proof.stateAccount.accountID(), proof.pubkey, proof.accountWitness)) {
      return 4;
    }
    return 0;
  }

  function shouldRollbackInvalidTxRootBatchType0(bytes32 txRoot, bytes memory txs) external view returns (uint256) {
    if (txRoot != calculateRootTruncated(txs.t0_toLeafs())) {
      return 1;
    }
    return 0;
  }

  function shouldRollbackInvalidSignatureBatchType0(
    uint256[2] memory signature,
    InvalidSignatureBatchType0 memory proof,
    bytes memory txs
  ) external view returns (uint256) {
    uint256 batchSize = txs.t0_size();
    require(batchSize > 0, "Rollup: empty batch");
    require(!txs.t0_hasExcessData(), "Rollup: excess data");
    uint256[2][] memory messages = new uint256[2][](batchSize);
    for (uint256 i = 0; i < batchSize; i++) {
      uint256 accountID = txs.t0_senderOf(i);
      // What if account not exists?
      // Then this batch must be subjected to invalid state transition
      require(accountRegistry.exists(accountID, proof.pubkeys[i], proof.witnesses[i]), "Rollup: account does not exists");
      messages[i] = txs.t0_mapToPoint(i);
    }
    if (!BLS.verifyMultiple(signature, proof.pubkeys, messages)) {
      return 1;
    }
    return 0;
  }

  function shouldRollbackInvalidTransitionBatchType0(
    bytes32 s0,
    bytes32 s1,
    InvalidTransitionBatchType0 memory proof,
    bytes memory txs
  ) public pure returns (uint256) {
    uint256 batchSize = txs.t0_size();
    require(batchSize > 0, "Rollup: empty batch");
    require(!txs.t0_hasExcessData(), "Rollup: excess tx data");
    bytes32 state = s0;
    uint256 senderAccount;
    uint256 receiverAccount;
    bool safe;
    for (uint256 i = 0; i < batchSize; i++) {
      // A. check sender inclusion in state
      uint256 senderID = txs.t0_senderOf(i);
      require(checkStateInclusion(state, senderID, proof.senderAccounts[i], proof.senderWitnesses[i]), "Rollup: state inclusion sender");
      // cannot be an empty account
      if (proof.senderAccounts[i].isEmptyAccount()) {
        return 1;
      }

      // B. apply diff for sender
      uint256 amount = txs.t0_amountOf(i);
      (senderAccount, safe) = proof.senderAccounts[i].balanceSafeSub(amount);
      if (!safe) {
        return 2;
      }
      (senderAccount, safe) = senderAccount.incrementNonce();
      if (!safe) {
        return 3;
      }
      state = updateStateRoot(senderID, senderAccount, proof.senderWitnesses[i]);

      // C. check receiver inclusion in state
      uint256 receiverID = txs.t0_receiverOf(i);
      require(checkStateInclusion(state, receiverID, proof.receiverAccounts[i], proof.receiverWitnesses[i]), "Rollup: state inclusion receiver");
      // cannot be an empty account
      if (proof.receiverAccounts[i].isEmptyAccount()) {
        return 4;
      }

      // D. apply diff for receiver
      (receiverAccount, safe) = proof.receiverAccounts[i].balanceSafeAdd(amount);
      if (!safe) {
        return 5;
      }
      state = updateStateRoot(receiverID, receiverAccount, proof.receiverWitnesses[i]);
      if (senderAccount.tokenID() != receiverAccount.tokenID()) {
        return 6;
      }
    }
    if (state != s1) {
      return 7;
    }
    return 0;
  }

  function shouldRollbackInvalidTxRootBatchType1(bytes32 txRoot, bytes memory txs) external pure returns (uint256) {
    if (txRoot != calculateRoot(txs.t1_toLeafs())) {
      return 1;
    }
    return 0;
  }

  function shouldRollbackInvalidDepositRootBatchType1(bytes32 depositRoot, bytes memory txs) external pure returns (uint256) {
    if (depositRoot != calculateRoot(txs.t1_toDepositLeafs())) {
      return 1;
    }
    return 0;
  }

  function shouldRollbackInvalidTransitionBatchType1(
    bytes32 s0,
    bytes32 s1,
    InvalidTransitionBatchType1 memory proof,
    bytes memory txs
  ) external pure returns (uint256) {
    uint256 batchSize = txs.t1_size();
    require(batchSize > 0, "Rollup: empty batch");
    require(!txs.t1_hasExcessData(), "Rollup: excess tx data");
    bytes32 state = s0;
    for (uint256 i = 0; i < batchSize; i++) {
      // check empty leaf
      uint256 stateIndex = txs.t1_stateIdOf(i);
      require(checkStateInclusion(state, stateIndex, proof.accounts[i], proof.witnesses[i]), "Rollup: state inclusion new account");
      if (!proof.accounts[i].isEmptyAccount()) {
        return 1;
      }
      // append new account
      uint256 accountID = txs.t1_accountIdOf(i);
      uint256 amount = txs.t1_amountOf(i);
      uint256 tokenID = txs.t1_tokenIdOf(i);
      bytes32 accountHash = StateAccount.newAccountHash(accountID, tokenID, amount);
      state = updateStateRoot(stateIndex, accountHash, proof.witnesses[i]);
    }
    if (state != s1) {
      return 2;
    }
    return 0;
  }

  function shouldRollbackInvalidDepositRootBatchType2(bytes32 depositRoot, bytes memory txs) external pure returns (uint256) {
    if (depositRoot != calculateRoot(txs.t2_toLeafs())) {
      return 1;
    }
    return 0;
  }

  function shouldRollbackInvalidTransitionBatchType2(
    bytes32 s0,
    bytes32 s1,
    InvalidTransitionBatchType2 memory proof,
    bytes memory txs
  ) external pure returns (uint256) {
    uint256 batchSize = txs.t2_size();
    require(batchSize > 0, "Rollup: empty batch");
    require(!txs.t2_hasExcessData(), "Rollup: excess tx data");
    bytes32 state = s0;
    for (uint256 i = 0; i < batchSize; i++) {
      // check depositor inclusion in the state
      uint256 stateIndex = txs.t2_stateIdOf(i);
      require(checkStateInclusion(state, stateIndex, proof.accounts[i], proof.witnesses[i]), "Rollup: state inclusion top up");
      // apply tx if account exists
      if (!proof.accounts[i].isEmptyAccount()) {
        // check token type
        if (txs.t2_tokenIdOf(i) != proof.accounts[i].tokenID()) {
          return 1;
        }
        // apply deposit diff
        uint256 amount = txs.t2_amountOf(i);
        (uint256 account, bool safe) = proof.accounts[i].balanceSafeAdd(amount);
        if (safe) {
          // apply deposit diff if it request is safe
          state = updateStateRoot(stateIndex, account, proof.witnesses[i]);
        }
      }
    }
    if (state != s1) {
      return 3;
    }
    return 0;
  }

  function shouldRollbackInvalidTxRootBatchType3(bytes32 txRoot, bytes memory txs) external view returns (uint256) {
    if (txRoot != calculateRootTruncated(txs.t3_toLeafs())) {
      return 1;
    }
    return 0;
  }

  function shouldRollbackInvalidSignatureBatchType3(
    uint256[2] memory signature,
    InvalidSignatureBatchType3 memory proof,
    bytes memory txs
  ) external view returns (uint256) {
    uint256 batchSize = txs.t3_size();
    require(batchSize > 0, "Rollup: empty batch");
    require(!txs.t3_hasExcessData(), "Rollup: excess data");
    uint256[2][] memory messages = new uint256[2][](batchSize);
    for (uint256 i = 0; i < batchSize; i++) {
      uint256 accountID = txs.t3_senderOf(i);
      require(accountRegistry.exists(accountID, proof.pubkeys[i], proof.witnesses[i]), "account does not exists");
      messages[i] = txs.t3_mapToPoint(i);
    }
    if (!BLS.verifyMultiple(signature, proof.pubkeys, messages)) {
      return 1;
    }
    return 0;
  }

  function shouldRollbackInvalidTransitionBatchType3(
    bytes32 s0,
    bytes32 s1,
    InvalidTransitionBatchType3 memory proof,
    bytes memory txs
  ) external pure returns (uint256) {
    uint256 batchSize = txs.t3_size();
    require(batchSize > 0, "Rollup: empty batch");
    require(!txs.t3_hasExcessData(), "Rollup: excess tx data");
    bytes32 state = s0;
    for (uint256 i = 0; i < batchSize; i++) {
      // A. check sender inclusion in state
      uint256 senderID = txs.t3_senderOf(i);
      require(checkStateInclusion(state, senderID, proof.senderAccounts[i], proof.senderWitnesses[i]), "Rollup: state inclusion sender");
      // cannot be an empty account
      if (proof.senderAccounts[i].isEmptyAccount()) {
        return 1;
      }
      // B. apply diff for sender
      uint256 amount = txs.t3_amountOf(i);
      (uint256 senderAccount, bool safe) = proof.senderAccounts[i].balanceSafeSub(amount);
      if (!safe) {
        return 2;
      }
      (senderAccount, safe) = senderAccount.incrementNonce();
      if (!safe) {
        return 3;
      }
      state = updateStateRoot(senderID, senderAccount, proof.senderWitnesses[i]);
      // C. check empty account for receiver
      uint256 receiverID = txs.t3_receiverOf(i);
      require(checkStateInclusion(state, receiverID, proof.receiverAccounts[i], proof.receiverWitnesses[i]), "Rollup: state inclusion new account");
      if (!proof.receiverAccounts[i].isEmptyAccount()) {
        return 4;
      }
      // D. append new account
      uint256 receiverAccountID = txs.t3_receiverAccountIdOf(i);
      bytes32 newReceiverAccount = StateAccount.newAccountHash(receiverAccountID, senderAccount.tokenID(), amount);
      // return newReceiverAccount;
      state = updateStateRoot(receiverID, newReceiverAccount, proof.receiverWitnesses[i]);
    }
    if (state != s1) {
      return 5;
    }
    return 0;
  }
}
