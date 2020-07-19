pragma solidity ^0.6.10;

contract StakeManager {
  uint256 public stakeAmount;

  mapping(uint256 => uint256) public stakes;

  function stake(uint256 stakeIndex) internal {
    require(msg.value == stakeAmount, "StakeManager: not enough stake committed");
    stakes[stakeIndex] = stakeAmount;
  }

  function reward(address payable challenger, uint256 amount) internal {
    challenger.transfer(amount);
  }

  function burn(uint256 amount) internal {
    address(0).transfer(amount);
  }

  function changeStakeAmount(uint256 _stakeAmount) internal {
    stakeAmount = _stakeAmount;
  }
}
