pragma solidity ^0.6.10;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
  constructor(address[] memory accounts, uint256[] memory amounts) public ERC20("MockToken", "MOCK") {
    require(accounts.length == amounts.length, "MockToken: holder & amount size should match");
    for (uint256 i = 0; i < accounts.length; i++) {
      _mint(accounts[i], amounts[i]);
    }
  }
}
