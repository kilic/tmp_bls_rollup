pragma solidity ^0.6.10;
pragma experimental ABIEncoderV2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { BLS } from "./libs/BLS.sol";
import { Tx } from "./libs/Tx.sol";
import { BLSAccountRegistry } from "./BLSAccountRegistry.sol";
import { TokenRegistry } from "./TokenRegistry.sol";
import { StakeManager } from "./StakeManager.sol";

contract DepositManager {
  uint256 public constant QUE_TREE_DEPTH = 4;
  uint256 public constant QUE_SIZE = 1 << QUE_TREE_DEPTH;
  bytes32[QUE_TREE_DEPTH + 1] public filledSubtreesNewAccounts;
  bytes32[QUE_TREE_DEPTH + 1] public filledSubtreesTopUps;

  constructor(TokenRegistry _tokenRegistry) public {
    tokenRegistry = _tokenRegistry;
  }

  struct DepositQue {
    bytes32 root;
    bool newAccounts;
    bool submitted;
    bool exist;
  }

  TokenRegistry public tokenRegistry;
  uint256 public queIndex = 0;
  mapping(uint256 => DepositQue) public depositQues;
  mapping(uint256 => uint256) public submittedQues;
  uint256 public depositPointer = 1;

  function depositWithNewAccount(
    uint256 accountID,
    uint256 tokenID,
    uint256 amount
  ) external {
    TokenRegistry.Token memory tokenInfo = tokenRegistry.getToken(tokenID);
    require(tokenInfo.exist, "Rollup: no such token");
    uint256 denominator = tokenInfo.denominator;

    IERC20 token = IERC20(tokenInfo.addr);
    require(token.allowance(msg.sender, address(this)) >= amount, "Rollup: token amount is not approved");
    require(token.transferFrom(msg.sender, address(this), amount), "Rollup: token transfer not approved");
    uint256 path = queIndex;
    uint256 level = 0;
    uint256 rollupAmt = amount / denominator;
    bytes32 acc = Tx.t1_newDepositHash(accountID, tokenID, rollupAmt);
    while (true) {
      if (path & 1 == 0) {
        filledSubtreesNewAccounts[level] = acc;
        break;
      }
      acc = keccak256(abi.encodePacked(filledSubtreesNewAccounts[level], acc));
      level += 1;
      path >>= 1;
    }
    queIndex += 1;
    if (queIndex == QUE_SIZE) {
      depositQues[depositPointer] = DepositQue({ root: filledSubtreesNewAccounts[QUE_TREE_DEPTH], newAccounts: true, submitted: false, exist: true });
      queIndex = 0;
      depositPointer += 1;
    }
  }

  function deposit(
    uint256 destination,
    uint256 tokenID,
    uint256 amount
  ) external {
    TokenRegistry.Token memory tokenInfo = tokenRegistry.getToken(tokenID);
    require(tokenInfo.exist, "Rollup: no such token");
    uint256 denominator = tokenInfo.denominator;
    IERC20 token = IERC20(tokenInfo.addr);
    require(token.allowance(msg.sender, address(this)) >= amount, "Rollup: token amount is not approved");
    require(token.transferFrom(msg.sender, address(this), amount), "Rollup: token transfer not approved");
    uint256 path = queIndex;
    uint256 level = 0;
    uint256 rollupAmt = amount / denominator;
    bytes32 acc = Tx.t2_newDepositHash(destination, tokenID, rollupAmt);
    while (true) {
      if (path & 1 == 0) {
        filledSubtreesTopUps[level] = acc;
        break;
      }
      acc = keccak256(abi.encodePacked(filledSubtreesTopUps[level], acc));
      level += 1;
      path >>= 1;
    }
    queIndex += 1;
    if (queIndex == QUE_SIZE) {
      depositQues[depositPointer] = DepositQue({ root: filledSubtreesTopUps[QUE_TREE_DEPTH], newAccounts: false, submitted: false, exist: true });
      queIndex = 0;
      depositPointer += 1;
    }
  }
}
