// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentTaskEscrow
/// @notice Minimal task escrow boundary for the first Agent Market prototype.
/// @dev The 6% rule is a product placeholder and must be confirmed before production use.
contract AgentTaskEscrow is Ownable, ReentrancyGuard {
    uint16 public constant STAKE_BPS = 600;
    uint16 public constant BPS_DENOMINATOR = 10_000;

    enum Status {
        Open,
        InProgress,
        Submitted,
        Completed,
        Disputed,
        Cancelled
    }

    struct Task {
        bytes32 externalTaskId;
        address requester;
        address agent;
        uint256 budget;
        uint256 stake;
        uint64 deadline;
        Status status;
    }

    mapping(uint256 taskId => Task task) public tasks;
    uint256 public nextTaskId;

    error InvalidBudget();
    error InvalidDeadline();
    error InvalidStatus();
    error NotRequester();
    error NotAgent();
    error InvalidStake(uint256 expected, uint256 actual);
    error TransferFailed();

    event TaskCreated(uint256 indexed taskId, bytes32 indexed externalTaskId, address indexed requester, uint256 budget, uint64 deadline);
    event TaskAccepted(uint256 indexed taskId, address indexed agent, uint256 stake);
    event TaskSubmitted(uint256 indexed taskId);
    event TaskCompleted(uint256 indexed taskId, address indexed recipient, uint256 amount);
    event TaskDisputed(uint256 indexed taskId, address indexed opener);
    event DisputeResolved(uint256 indexed taskId, bool favorAgent, address indexed recipient, uint256 amount);
    event TaskCancelled(uint256 indexed taskId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Creates a task and locks the requester budget in the contract.
    function createTask(bytes32 externalTaskId, uint64 deadline)
        external
        payable
        returns (uint256 taskId)
    {
        if (msg.value == 0) revert InvalidBudget();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        taskId = nextTaskId++;
        tasks[taskId] = Task({
            externalTaskId: externalTaskId,
            requester: msg.sender,
            agent: address(0),
            budget: msg.value,
            stake: 0,
            deadline: deadline,
            status: Status.Open
        });

        emit TaskCreated(taskId, externalTaskId, msg.sender, msg.value, deadline);
    }

    /// @notice Accepts an open task and locks the prototype 6% Agent stake.
    function acceptTask(uint256 taskId) external payable {
        Task storage task = _task(taskId);
        if (task.status != Status.Open) revert InvalidStatus();

        uint256 expectedStake = (task.budget * STAKE_BPS) / BPS_DENOMINATOR;
        if (expectedStake == 0 || msg.value != expectedStake) {
            revert InvalidStake(expectedStake, msg.value);
        }

        task.agent = msg.sender;
        task.stake = msg.value;
        task.status = Status.InProgress;
        emit TaskAccepted(taskId, msg.sender, msg.value);
    }

    /// @notice Marks work as submitted for requester review.
    function submitTask(uint256 taskId) external {
        Task storage task = _task(taskId);
        if (task.agent != msg.sender) revert NotAgent();
        if (task.status != Status.InProgress) revert InvalidStatus();

        task.status = Status.Submitted;
        emit TaskSubmitted(taskId);
    }

    /// @notice Releases budget and returns stake after requester approval.
    function approveTask(uint256 taskId) external nonReentrant {
        Task storage task = _task(taskId);
        if (task.requester != msg.sender) revert NotRequester();
        if (task.status != Status.Submitted) revert InvalidStatus();

        task.status = Status.Completed;
        uint256 amount = task.budget + task.stake;
        _send(task.agent, amount);
        emit TaskCompleted(taskId, task.agent, amount);
    }

    /// @notice Opens a dispute before final settlement.
    function disputeTask(uint256 taskId) external {
        Task storage task = _task(taskId);
        if (msg.sender != task.requester && msg.sender != task.agent) revert NotRequester();
        if (task.status != Status.Submitted) revert InvalidStatus();

        task.status = Status.Disputed;
        emit TaskDisputed(taskId, msg.sender);
    }

    /// @notice Resolves a dispute. Production arbitration policy is not finalized yet.
    function resolveDispute(uint256 taskId, bool favorAgent) external onlyOwner nonReentrant {
        Task storage task = _task(taskId);
        if (task.status != Status.Disputed) revert InvalidStatus();

        task.status = favorAgent ? Status.Completed : Status.Cancelled;
        address recipient = favorAgent ? task.agent : task.requester;
        uint256 amount = favorAgent ? task.budget + task.stake : task.budget + task.stake;
        _send(recipient, amount);
        emit DisputeResolved(taskId, favorAgent, recipient, amount);
    }

    /// @notice Cancels a task before an Agent accepts it and refunds the requester.
    function cancelTask(uint256 taskId) external nonReentrant {
        Task storage task = _task(taskId);
        if (task.requester != msg.sender) revert NotRequester();
        if (task.status != Status.Open) revert InvalidStatus();

        task.status = Status.Cancelled;
        _send(task.requester, task.budget);
        emit TaskCancelled(taskId);
    }

    function _task(uint256 taskId) private view returns (Task storage task) {
        task = tasks[taskId];
        if (task.requester == address(0)) revert InvalidStatus();
    }

    function _send(address recipient, uint256 amount) private {
        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) revert TransferFailed();
    }
}
