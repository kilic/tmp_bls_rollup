pragma solidity ^0.6.10;
pragma experimental ABIEncoderV2;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract TokenRegistry is Ownable {
  struct Token {
    uint256 denominator;
    address addr;
    bool exist;
  }

  event Requested(address token, uint256 requestIndex);
  event Finalized(uint256 indexed tokenIndex);

  mapping(uint256 => Token) public requests;
  mapping(uint256 => Token) public registered;
  uint256 public requestCounter = 1;

  function request(address token, uint256 denominator) external {
    require(token != address(0), "TokenRegistry: empty address");
    require(denominator != 0, "TokenRegistry: zero denominator");
    requests[requestCounter] = Token({ addr: token, denominator: denominator, exist: true });
    emit Requested(token, requestCounter);
    requestCounter++;
  }

  function finalize(uint256 requestIndex) external onlyOwner {
    require(requestIndex != 0, "TokenRegistry: no zero indexed token");
    require(requestIndex < requestCounter, "TokenRegistry: no such request");
    registered[requestIndex] = requests[requestIndex];
    emit Finalized(requestIndex);
  }

  function getToken(uint256 tokenIndex) external view returns (Token memory) {
    return registered[tokenIndex];
  }

  function getTokenFromRequests(uint256 requestIndex) external view returns (Token memory) {
    return requests[requestIndex];
  }
}
