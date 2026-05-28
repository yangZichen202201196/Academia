// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GreenToken
 * @dev 校园环保链上积分（清园环保积分 / GCT），与后端审核、兑换流程配合演示。
 */
contract GreenToken is ERC20, Ownable {
    // 管理员地址（可以发放积分）
    mapping(address => bool) public admins;

    // 用户总积分记录（累计获得的积分，只增不减）
    mapping(address => uint256) public userTotalPoints;

    // 奖励池地址：所有兑换产生的 GCT 都集中到这里
    address public rewardPool;

    event PointsAwarded(address indexed user, uint256 amount, string reason);
    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);
    event RewardRedeemed(address indexed user, uint256 indexed rewardId, uint256 cost, string meta);

    constructor(address initialOwner) ERC20(unicode"清园环保积分", "GCT") Ownable(initialOwner) {
        admins[initialOwner] = true;
        rewardPool = initialOwner;
    }

    /**
     * @dev 添加管理员
     */
    function addAdmin(address admin) external onlyOwner {
        admins[admin] = true;
        emit AdminAdded(admin);
    }

    /**
     * @dev 移除管理员
     */
    function removeAdmin(address admin) external onlyOwner {
        admins[admin] = false;
        emit AdminRemoved(admin);
    }

    /**
     * @dev 设置奖励池地址（所有兑换产生的 GCT 都会转入该地址）
     */
    function setRewardPool(address _rewardPool) external onlyOwner {
        require(_rewardPool != address(0), "rewardPool required");
        rewardPool = _rewardPool;
    }

    /**
     * @dev 管理员发放积分（由合约铸币给 to，不消耗管理员钱包中的 GCT；管理员仅签名并支付 Gas）
     */
    function awardPoints(address to, uint256 amount, string memory reason) external {
        require(admins[msg.sender], "Only admins can award points");
        require(to != address(0), "Cannot award to zero address");
        require(amount > 0, "Amount must be greater than 0");
        _mint(to, amount);
        userTotalPoints[to] += amount;
        emit PointsAwarded(to, amount, reason);
    }

    /**
     * @dev 批量发放积分
     */
    function batchAwardPoints(
        address[] calldata recipients,
        uint256[] calldata amounts,
        string memory reason
    ) external {
        require(admins[msg.sender], "Only admins can award points");
        require(recipients.length == amounts.length, "Arrays length mismatch");

        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] != address(0) && amounts[i] > 0) {
                _mint(recipients[i], amounts[i]);
                userTotalPoints[recipients[i]] += amounts[i];
                emit PointsAwarded(recipients[i], amounts[i], reason);
            }
        }
    }

    /**
     * @dev 获取用户总积分
     */
    function getTotalPoints(address user) external view returns (uint256) {
        return userTotalPoints[user];
    }

    /**
     * @dev 一次性返回指定用户的当前可用积分与累计获得积分
     */
    function getUserPoints(address user)
        external
        view
        returns (uint256 current, uint256 total)
    {
        current = balanceOf(user);
        total = userTotalPoints[user];
    }

    /**
     * @dev 检查是否为管理员
     */
    function isAdmin(address account) external view returns (bool) {
        return admins[account];
    }

    /**
     * @dev 用户使用积分兑换奖品：扣减并销毁调用者对应数量的代币，用户即获得该奖励的兑换资格。
     *      链上只做“扣减+销毁”，不转给任何人；奖励发放由后端根据 txHash 记录并下发。
     */
    function redeemForReward(
        uint256 rewardId,
        uint256 cost,
        string calldata meta
    ) external {
        require(rewardId != 0, "rewardId required");
        require(cost > 0, "cost must be > 0");
        require(balanceOf(msg.sender) >= cost, "insufficient balance");

        _burn(msg.sender, cost);
        emit RewardRedeemed(msg.sender, rewardId, cost, meta);
    }

    /**
     * @dev 管理员代为用户兑换奖品：从指定用户地址扣减并销毁代币。
     *      用于后端托管私钥代表用户发起兑换交易，用户无需在前端签名。
     */
    function adminRedeem(
        address user,
        uint256 rewardId,
        uint256 cost,
        string calldata meta
    ) external {
        require(admins[msg.sender], "Only admins can redeem");
        require(user != address(0), "user required");
        require(rewardId != 0, "rewardId required");
        require(cost > 0, "cost must be > 0");
        require(balanceOf(user) >= cost, "insufficient balance");

        _burn(user, cost);
        emit RewardRedeemed(user, rewardId, cost, meta);
    }
}
