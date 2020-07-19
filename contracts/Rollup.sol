pragma solidity ^0.6.10;
pragma experimental ABIEncoderV2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { BLS } from "./libs/BLS.sol";
import { Tx } from "./libs/Tx.sol";
import { StateAccount } from "./libs/StateAccount.sol";
import { Withdraw } from "./libs/Withdraw.sol";
import { Batch as batch } from "./libs/Batch.sol";

import { BLSAccountRegistry } from "./BLSAccountRegistry.sol";
import { TokenRegistry } from "./TokenRegistry.sol";
import { StakeManager } from "./StakeManager.sol";
import { FraudProof } from "./FraudProof.sol";
import { DepositManager } from "./DepositManager.sol";

contract Rollup is StakeManager, DepositManager {
  using Tx for bytes;
  using StateAccount for uint256;

  constructor(
    uint256 _stakeAmount,
    uint256 _disputePeriod,
    FraudProof _fraudProof,
    TokenRegistry _tokenRegistry
  ) public DepositManager(_tokenRegistry) {
    stakeAmount = _stakeAmount;
    disputePeriod = _disputePeriod;
    fraudProof = _fraudProof;
  }

  struct Batch {
    bytes32 ID;
    bytes32 state;
  }

  FraudProof fraudProof;
  uint256 public disputePeriod;
  uint256 public constant MAX_TXS_PER_BATCH = 1024;
  mapping(uint256 => Batch) public batches;
  uint256 public batchPointer = 0;
  bool public isRollingBack = false;
  uint256 public invalidBatchIndex = 0;
  mapping(bytes32 => bool) processedWithdrawals;

  function rollback(uint256 _invalidBatchIndex, address payable challenger) internal {
    uint256 totalStake = 0;
    uint256 batchCounter = 0;
    for (uint256 batchIndex = batchPointer - 1; batchIndex >= _invalidBatchIndex; batchIndex--) {
      // TODO : check gas
      // if (gasleft() <= governance.MIN_GAS_LIMIT_LEFT()) {
      //   break;
      // };
      totalStake += stakes[batchIndex];
      batchCounter += 1;
      uint256 queID = submittedQues[batchIndex];
      if (queID != 0) {
        // rollback deposit ques
        depositQues[queID].submitted = false;
        submittedQues[batchIndex] = 0;
      }
    }

    uint256 rewardAmount = (totalStake * 2) / 3;
    uint256 burnAmount = (totalStake - rewardAmount);
    reward(challenger, rewardAmount);
    burn(burnAmount);
    batchPointer -= batchCounter;
    if (batchPointer != _invalidBatchIndex) {
      isRollingBack = true;
      invalidBatchIndex = _invalidBatchIndex;
    }
  }

  function withdraw(
    batch.HeaderType0 calldata header,
    Withdraw.Proof calldata proof,
    uint256[2] calldata signature,
    address beneficiary
  ) external {
    uint256 batchIndex = header.batchIndex;
    bytes32 batchID = batch.idType0(header);
    require(batches[batchIndex].ID == batchID, "Rollup: cannot reconstruct batch");
    require(header.blockNumber + disputePeriod < block.number, "Rollup: batch is not finalized");
    // verify witdhraw request
    require(0 == fraudProof.verifyWithdrawRequest(proof, header.state, header.txRoot), "Rollup: bad withdrawal request");
    // verify signature
    bytes32 message = keccak256(abi.encodePacked(proof._tx, beneficiary)); // TODO: not sure if it is a safe message hash construction
    uint256[2] memory M = BLS.mapToPoint(message);
    require(BLS.verifySingle(signature, proof.pubkey, M), "Rollup: signature is not verified");

    uint256 tokenID = proof.stateAccount.tokenID();
    TokenRegistry.Token memory tokenInfo = tokenRegistry.getToken(tokenID);
    uint256 amount = Tx.t0_amountFromWord(proof._tx) * tokenInfo.denominator;
    IERC20 token = IERC20(tokenInfo.addr);
    token.transfer(beneficiary, amount);
  }

  function submitBatchType0(
    bytes calldata txs,
    bytes32 txRoot,
    bytes32 newState,
    uint256[2] calldata signature
  ) external payable {
    stake(batchPointer);

    uint256 batchSize = txs.t0_size();
    require(batchSize <= MAX_TXS_PER_BATCH, "Rollup: batch contains more tx than the limit");
    require(!txs.t0_hasExcessData(), "Rollup: excess data");
    // signature data validity check can be done optimisticly
    // but since it's so cheap let's just apply it here
    require(BLS.isValidSignature(signature), "Rollup: signature is not valid");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    batch.HeaderType0 memory header = batch.HeaderType0({
      state: newState,
      coordinator: msg.sender,
      blockNumber: block.number,
      batchIndex: batchPointer,
      signature: signature,
      txRoot: txRoot,
      txCommit: txCommit
    });
    bytes32 batchID = batch.idType0(header);
    batches[batchPointer] = Batch({ ID: batchID, state: newState });
    batchPointer += 1;
  }

  function submitBatchType1(
    bytes32 txRoot,
    uint256 queID,
    bytes32 newState,
    bytes calldata txs
  ) external payable {
    stake(batchPointer);

    require(!txs.t1_hasExcessData(), "Rollup: excess data");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    batch.HeaderType1 memory header = batch.HeaderType1({
      state: newState,
      coordinator: msg.sender,
      blockNumber: block.number,
      batchIndex: batchPointer,
      queID: queID,
      txRoot: txRoot,
      txCommit: txCommit
    });
    DepositQue memory depositQue = depositQues[queID];
    require(depositQue.exist, "Rollup: deposit que doesn't exist");
    require(depositQue.newAccounts, "Rollup: deposit que is not for new accounts");
    require(!depositQue.submitted, "Rollup: deposit que is already submitted");
    depositQues[queID].submitted = true;
    submittedQues[batchPointer] = queID;
    batches[batchPointer] = Batch({ ID: batch.idType1(header), state: newState });
    batchPointer += 1;
  }

  function submitBatchType2(
    uint256 queID,
    bytes32 newState,
    bytes calldata txs
  ) external payable {
    stake(batchPointer);

    require(!txs.t2_hasExcessData(), "Rollup: excess data");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    batch.HeaderType2 memory header = batch.HeaderType2({
      state: newState,
      coordinator: msg.sender,
      blockNumber: block.number,
      batchIndex: batchPointer,
      queID: queID,
      txCommit: txCommit
    });
    DepositQue memory depositQue = depositQues[queID];
    require(depositQue.exist, "Rollup: deposit que doesn't exist");
    require(!depositQue.newAccounts, "Rollup: deposit que is for new accounts");
    require(!depositQue.submitted, "Rollup: deposit que is already submitted");
    depositQues[queID].submitted = true;
    submittedQues[batchPointer] = queID;
    batches[batchPointer] = Batch({ ID: batch.idType2(header), state: newState });
    batchPointer += 1;
  }

  function submitBatchType3(
    bytes calldata txs,
    bytes32 txRoot,
    bytes32 newState,
    uint256[2] calldata signature
  ) external payable {
    stake(batchPointer);

    uint256 batchSize = txs.t3_size();
    require(batchSize <= MAX_TXS_PER_BATCH, "Rollup: batch contains more tx than the limit");
    require(!txs.t3_hasExcessData(), "Rollup: excess data");
    require(BLS.isValidSignature(signature), "Rollup: signature is not valid");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    batch.HeaderType3 memory header = batch.HeaderType3({
      state: newState,
      coordinator: msg.sender,
      blockNumber: block.number,
      batchIndex: batchPointer,
      signature: signature,
      txRoot: txRoot,
      txCommit: txCommit
    });
    bytes32 batchID = batch.idType3(header);
    batches[batchPointer] = Batch({ ID: batchID, state: newState });
    batchPointer += 1;
  }

  function fraudInvalidTxRootBatchType0(batch.HeaderNoCommitType0 memory header, bytes memory txs) public {
    require(header.batchIndex > 0 && header.batchIndex < batchPointer, "Rollup: invalid batch index");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    bytes32 batchID = batch.idType0(header, txCommit);
    require(batches[header.batchIndex].ID == batchID, "Rollup: cannot reconstruct batch");
    require(header.blockNumber + disputePeriod > block.number, "Rollup: batch is finalized");

    if (0 != fraudProof.shouldRollbackInvalidTxRootBatchType0(header.txRoot, txs)) {
      address payable challenger = msg.sender;
      uint256 _invalidBatchIndex = header.batchIndex;
      rollback(_invalidBatchIndex, challenger);
    }
  }

  function fraudInvalidSignatureBatchType0(
    batch.HeaderNoCommitType0 memory header,
    FraudProof.InvalidSignatureBatchType0 memory proof,
    bytes memory txs
  ) public {
    require(header.batchIndex > 0 && header.batchIndex < batchPointer, "Rollup: invalid batch index");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    bytes32 batchID = batch.idType0(header, txCommit);
    require(batches[header.batchIndex].ID == batchID, "Rollup: cannot reconstruct batch");
    require(header.blockNumber + disputePeriod > block.number, "Rollup: batch is finalized");

    if (0 != fraudProof.shouldRollbackInvalidSignatureBatchType0(header.signature, proof, txs)) {
      address payable challenger = msg.sender;
      uint256 _invalidBatchIndex = header.batchIndex;
      rollback(_invalidBatchIndex, challenger);
    }
  }

  function fraudInvalidTransitionBatchType0(
    batch.HeaderNoCommitType0 memory header,
    FraudProof.InvalidTransitionBatchType0 memory proof,
    bytes memory txs
  ) public {
    require(header.batchIndex > 0 && header.batchIndex < batchPointer, "Rollup: invalid batch index");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    bytes32 batchID = batch.idType0(header, txCommit);
    require(batches[header.batchIndex].ID == batchID, "Rollup: cannot reconstruct batch b0");
    require(header.blockNumber + disputePeriod > block.number, "Rollup: batch is finalized");

    if (0 != fraudProof.shouldRollbackInvalidTransitionBatchType0(batches[header.batchIndex - 1].state, header.state, proof, txs)) {
      address payable challenger = msg.sender;
      uint256 _invalidBatchIndex = header.batchIndex;
      rollback(_invalidBatchIndex, challenger);
    }
  }

  function fraudInvalidTxRootBatchType1(batch.HeaderNoCommitType1 memory header, bytes memory txs) public {
    require(header.batchIndex > 0 && header.batchIndex < batchPointer, "Rollup: invalid batch index");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    bytes32 batchID = batch.idType1(header, txCommit);
    require(batches[header.batchIndex].ID == batchID, "Rollup: cannot reconstruct batch");
    require(header.blockNumber + disputePeriod > block.number, "Rollup: batch is finalized");

    if (0 != fraudProof.shouldRollbackInvalidTxRootBatchType1(header.txRoot, txs)) {
      address payable challenger = msg.sender;
      uint256 _invalidBatchIndex = header.batchIndex;
      rollback(_invalidBatchIndex, challenger);
    }
  }

  function fraudInvalidDepositRootBatchType1(batch.HeaderNoCommitType1 memory header, bytes memory txs) public {
    require(header.batchIndex > 0 && header.batchIndex < batchPointer, "Rollup: invalid batch index");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    bytes32 batchID = batch.idType1(header, txCommit);
    require(batches[header.batchIndex].ID == batchID, "Rollup: cannot reconstruct batch");
    require(header.blockNumber + disputePeriod > block.number, "Rollup: batch is finalized");

    if (0 != fraudProof.shouldRollbackInvalidDepositRootBatchType1(depositQues[header.queID].root, txs)) {
      address payable challenger = msg.sender;
      uint256 _invalidBatchIndex = header.batchIndex;
      rollback(_invalidBatchIndex, challenger);
    }
  }

  function fraudInvalidTransitionBatchType1(
    batch.HeaderNoCommitType1 memory header,
    FraudProof.InvalidTransitionBatchType1 memory proof,
    bytes memory txs
  ) public {
    require(header.batchIndex > 0 && header.batchIndex < batchPointer, "Rollup: invalid batch index");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    bytes32 batchID = batch.idType1(header, txCommit);
    require(batches[header.batchIndex].ID == batchID, "Rollup: cannot reconstruct batch b0");
    require(header.blockNumber + disputePeriod > block.number, "Rollup: batch is finalized");

    if (0 != fraudProof.shouldRollbackInvalidTransitionBatchType1(batches[header.batchIndex - 1].state, header.state, proof, txs)) {
      address payable challenger = msg.sender;
      uint256 _invalidBatchIndex = header.batchIndex;
      rollback(_invalidBatchIndex, challenger);
    }
  }

  function fraudInvalidDepositRootBatchType2(batch.HeaderNoCommitType2 memory header, bytes memory txs) public {
    require(header.batchIndex > 0 && header.batchIndex < batchPointer, "Rollup: invalid batch index");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    bytes32 batchID = batch.idType2(header, txCommit);
    require(batches[header.batchIndex].ID == batchID, "Rollup: cannot reconstruct batch");
    require(header.blockNumber + disputePeriod > block.number, "Rollup: batch is finalized");

    if (0 != fraudProof.shouldRollbackInvalidDepositRootBatchType2(depositQues[header.queID].root, txs)) {
      address payable challenger = msg.sender;
      uint256 _invalidBatchIndex = header.batchIndex;
      rollback(_invalidBatchIndex, challenger);
    }
  }

  function fraudInvalidTransitionBatchType2(
    batch.HeaderNoCommitType2 memory header,
    FraudProof.InvalidTransitionBatchType2 memory proof,
    bytes memory txs
  ) public {
    require(header.batchIndex > 0 && header.batchIndex < batchPointer, "Rollup: invalid batch index");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    bytes32 batchID = batch.idType2(header, txCommit);
    require(batches[header.batchIndex].ID == batchID, "Rollup: cannot reconstruct batch b0");
    require(header.blockNumber + disputePeriod > block.number, "Rollup: batch is finalized");

    if (0 != fraudProof.shouldRollbackInvalidTransitionBatchType2(batches[header.batchIndex - 1].state, header.state, proof, txs)) {
      address payable challenger = msg.sender;
      uint256 _invalidBatchIndex = header.batchIndex;
      rollback(_invalidBatchIndex, challenger);
    }
  }

  function fraudInvalidTxRootBatchType3(batch.HeaderNoCommitType3 memory header, bytes memory txs) public {
    require(header.batchIndex > 0 && header.batchIndex < batchPointer, "Rollup: invalid batch index");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    bytes32 batchID = batch.idType3(header, txCommit);
    require(batches[header.batchIndex].ID == batchID, "Rollup: cannot reconstruct batch");
    require(header.blockNumber + disputePeriod > block.number, "Rollup: batch is finalized");

    if (0 != fraudProof.shouldRollbackInvalidTxRootBatchType3(header.txRoot, txs)) {
      address payable challenger = msg.sender;
      uint256 _invalidBatchIndex = header.batchIndex;
      rollback(_invalidBatchIndex, challenger);
    }
  }

  function fraudInvalidSignatureBatchType3(
    batch.HeaderNoCommitType3 memory header,
    FraudProof.InvalidSignatureBatchType3 memory proof,
    bytes memory txs
  ) public {
    require(header.batchIndex > 0 && header.batchIndex < batchPointer, "Rollup: invalid batch index");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    bytes32 batchID = batch.idType3(header, txCommit);
    require(batches[header.batchIndex].ID == batchID, "Rollup: cannot reconstruct batch");
    require(header.blockNumber + disputePeriod > block.number, "Rollup: batch is finalized");

    if (0 != fraudProof.shouldRollbackInvalidSignatureBatchType3(header.signature, proof, txs)) {
      address payable challenger = msg.sender;
      uint256 _invalidBatchIndex = header.batchIndex;
      rollback(_invalidBatchIndex, challenger);
    }
  }

  function fraudInvalidTransitionBatchType3(
    batch.HeaderNoCommitType3 memory header,
    FraudProof.InvalidTransitionBatchType3 memory proof,
    bytes memory txs
  ) public {
    require(header.batchIndex > 0 && header.batchIndex < batchPointer, "Rollup: invalid batch index");
    bytes32 txCommit = keccak256(abi.encodePacked(txs));
    bytes32 batchID = batch.idType3(header, txCommit);
    require(batches[header.batchIndex].ID == batchID, "Rollup: cannot reconstruct batch b0");
    require(header.blockNumber + disputePeriod > block.number, "Rollup: batch is finalized");

    if (0 != fraudProof.shouldRollbackInvalidTransitionBatchType3(batches[header.batchIndex - 1].state, header.state, proof, txs)) {
      address payable challenger = msg.sender;
      uint256 _invalidBatchIndex = header.batchIndex;
      rollback(_invalidBatchIndex, challenger);
    }
  }

  function withdrawStake0(batch.HeaderType0[] calldata headers, address payable[] calldata beneficiaries) external {
    uint256 len = headers.length;
    require(len == beneficiaries.length, "Rollup: len mismatch");
    for (uint256 i = 0; i < len; i++) {
      uint256 batchIndex = headers[i].batchIndex;
      bytes32 batchID = batch.idType0(headers[i]);
      require(batches[batchIndex].ID == batchID, "Rollup: cannot reconstruct batch");
      require(headers[i].blockNumber + disputePeriod < block.number, "Rollup: batch is not finalized");
      uint256 stake = stakes[batchIndex];
      require(stake > 0, "Rollup: already withdrawn");
      require(beneficiaries[i] == headers[i].coordinator || msg.sender == headers[i].coordinator, "Rollup: invalid beneficiary");
      beneficiaries[i].transfer(stake);
      stakes[batchIndex] = 0;
    }
  }

  function withdrawStake1(batch.HeaderType1[] calldata headers, address payable[] calldata beneficiaries) external {
    uint256 len = headers.length;
    require(len == beneficiaries.length, "Rollup: len mismatch");
    for (uint256 i = 0; i < len; i++) {
      uint256 batchIndex = headers[i].batchIndex;
      bytes32 batchID = batch.idType1(headers[i]);
      require(batches[batchIndex].ID == batchID, "Rollup: cannot reconstruct batch");
      require(headers[i].blockNumber + disputePeriod < block.number, "Rollup: batch is not finalized");
      uint256 stake = stakes[batchIndex];
      require(stake > 0, "Rollup: already withdrawn");
      require(beneficiaries[i] == headers[i].coordinator || msg.sender == headers[i].coordinator, "Rollup: invalid beneficiary");
      beneficiaries[i].transfer(stake);
      stakes[batchIndex] = 0;
    }
  }

  function withdrawStake2(batch.HeaderType2[] calldata headers, address payable[] calldata beneficiaries) external {
    uint256 len = headers.length;
    require(len == beneficiaries.length, "Rollup: len mismatch");
    for (uint256 i = 0; i < len; i++) {
      uint256 batchIndex = headers[i].batchIndex;
      bytes32 batchID = batch.idType2(headers[i]);
      require(batches[batchIndex].ID == batchID, "Rollup: cannot reconstruct batch");
      require(headers[i].blockNumber + disputePeriod < block.number, "Rollup: batch is not finalized");
      uint256 stake = stakes[batchIndex];
      require(stake > 0, "Rollup: already withdrawn");
      require(beneficiaries[i] == headers[i].coordinator || msg.sender == headers[i].coordinator, "Rollup: invalid beneficiary");
      beneficiaries[i].transfer(stake);
      stakes[batchIndex] = 0;
    }
  }

  function withdrawStake3(batch.HeaderType3[] calldata headers, address payable[] calldata beneficiaries) external {
    uint256 len = headers.length;
    require(len == beneficiaries.length, "Rollup: len mismatch");
    for (uint256 i = 0; i < len; i++) {
      uint256 batchIndex = headers[i].batchIndex;
      bytes32 batchID = batch.idType3(headers[i]);
      require(batches[batchIndex].ID == batchID, "Rollup: cannot reconstruct batch");
      require(headers[i].blockNumber + disputePeriod < block.number, "Rollup: batch is not finalized");
      uint256 stake = stakes[batchIndex];
      require(stake > 0, "Rollup: already withdrawn");
      require(beneficiaries[i] == headers[i].coordinator || msg.sender == headers[i].coordinator, "Rollup: invalid beneficiary");
      beneficiaries[i].transfer(stake);
      stakes[batchIndex] = 0;
    }
  }
}
