pragma solidity ^0.6.10;

import { BLS } from "./BLS.sol";

library Withdraw {
  // copied from FraudProof.sol :/
  uint256 public constant ACCOUNT_WITNESS_LENGTH = 31;
  uint256 public constant STATE_WITNESS_LENGTH = 32;

  struct Proof {
    uint256 stateAccount;
    bytes32[STATE_WITNESS_LENGTH] stateWitness;
    uint256[4] pubkey;
    bytes32[ACCOUNT_WITNESS_LENGTH] accountWitness;
    uint256 _tx;
    bytes32[] txWitness;
  }
}
