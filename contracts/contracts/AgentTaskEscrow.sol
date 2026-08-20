// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentTaskEscrow
/// @notice Task escrow for Agent Market. The economic rules are frozen in docs/decisions.md
///         and must be changed there first: D1 (single-sided stake), D5a (replaceable arbiter),
///         D5b (stake is a bond, never a penalty) and D7 (two independent timeout clocks).
contract AgentTaskEscrow is Ownable, ReentrancyGuard {
    /// @notice D1: the Agent alone stakes 6% of the budget. The requester posts no bond.
    uint16 public constant STAKE_BPS = 600;
    uint16 public constant BPS_DENOMINATOR = 10_000;

    /// @notice D7: a submitted task settles to the Agent once the requester stays silent this long.
    uint64 public constant REVIEW_WINDOW = 7 days;

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
        uint64 submittedAt;
        Status status;
    }

    mapping(uint256 taskId => Task task) public tasks;
    uint256 public nextTaskId;

    /// @notice D5a: arbitration is a role, not the owner, so a multisig or governance contract
    ///         can take it over without redeploying the escrow.
    address public arbiter;

    error InvalidBudget();
    error InvalidDeadline();
    error InvalidStatus();
    error InvalidArbiter();
    error NotRequester();
    error NotAgent();
    error NotParty();
    error NotArbiter();
    error InvalidStake(uint256 expected, uint256 actual);
    error DeadlineNotReached(uint64 deadline);
    error ReviewWindowOpen(uint64 settlesAt);
    error TransferFailed();

    event TaskCreated(uint256 indexed taskId, bytes32 indexed externalTaskId, address indexed requester, uint256 budget, uint64 deadline);
    event TaskAccepted(uint256 indexed taskId, address indexed agent, uint256 stake);
    event TaskSubmitted(uint256 indexed taskId, uint64 submittedAt);
    event TaskCompleted(uint256 indexed taskId, address indexed recipient, uint256 amount, bool autoApproved);
    event TaskDisputed(uint256 indexed taskId, address indexed opener);
    event DisputeResolved(uint256 indexed taskId, bool favorAgent, uint256 requesterAmount, uint256 agentAmount);
    event TaskTimedOut(uint256 indexed taskId, uint256 refund, uint256 stakeReturned);
    event TaskCancelled(uint256 indexed taskId);
    event ArbiterUpdated(address indexed previousArbiter, address indexed newArbiter);

    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert NotArbiter();
        _;
    }

    constructor(address initialOwner, address initialArbiter) Ownable(initialOwner) {
        _setArbiter(initialArbiter);
    }

    /// @notice Hands arbitration to another address, typically a multisig once one exists.
    function setArbiter(address newArbiter) external onlyOwner {
        _setArbiter(newArbiter);
    }

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
            submittedAt: 0,
            status: Status.Open
        });

        emit TaskCreated(taskId, externalTaskId, msg.sender, msg.value, deadline);
    }

    /// @notice Accepts an open task and locks the 6% Agent stake.
    /// @dev Rejects expired tasks so an Agent cannot accept work that is already timed out.
    function acceptTask(uint256 taskId) external payable {
        Task storage task = _task(taskId);
        if (task.status != Status.Open) revert InvalidStatus();
        if (block.timestamp >= task.deadline) revert InvalidDeadline();

        uint256 expectedStake = (task.budget * STAKE_BPS) / BPS_DENOMINATOR;
        if (expectedStake == 0 || msg.value != expectedStake) {
            revert InvalidStake(expectedStake, msg.value);
        }

        task.agent = msg.sender;
        task.stake = msg.value;
        task.status = Status.InProgress;
        emit TaskAccepted(taskId, msg.sender, msg.value);
    }

    /// @notice Marks work as submitted and starts the review clock.
    function submitTask(uint256 taskId) external {
        Task storage task = _task(taskId);
        if (task.agent != msg.sender) revert NotAgent();
        if (task.status != Status.InProgress) revert InvalidStatus();

        task.status = Status.Submitted;
        task.submittedAt = uint64(block.timestamp);
        emit TaskSubmitted(taskId, task.submittedAt);
    }

    /// @notice Releases budget and returns the stake after requester approval.
    function approveTask(uint256 taskId) external nonReentrant {
        Task storage task = _task(taskId);
        if (task.requester != msg.sender) revert NotRequester();
        if (task.status != Status.Submitted) revert InvalidStatus();

        _payAgent(taskId, task, false);
    }

    /// @notice D7: settles to the Agent once the requester has left a submission unreviewed
    ///         for REVIEW_WINDOW, so an inactive requester cannot lock the funds forever.
    function claimReviewTimeout(uint256 taskId) external nonReentrant {
        Task storage task = _task(taskId);
        _requireParty(task);
        if (task.status != Status.Submitted) revert InvalidStatus();

        uint64 settlesAt = task.submittedAt + REVIEW_WINDOW;
        if (block.timestamp < settlesAt) revert ReviewWindowOpen(settlesAt);

        _payAgent(taskId, task, true);
    }

    /// @notice D7: refunds the requester once the Agent misses the delivery deadline.
    /// @dev The stake goes back to the Agent — D5b keeps it a bond rather than a penalty.
    function claimDeliveryTimeout(uint256 taskId) external nonReentrant {
        Task storage task = _task(taskId);
        _requireParty(task);
        if (task.status != Status.InProgress) revert InvalidStatus();
        if (block.timestamp <= task.deadline) revert DeadlineNotReached(task.deadline);

        address requester = task.requester;
        address agent = task.agent;
        uint256 refund = task.budget;
        uint256 stake = task.stake;

        task.status = Status.Cancelled;
        _send(requester, refund);
        _send(agent, stake);
        emit TaskTimedOut(taskId, refund, stake);
    }

    /// @notice Opens a dispute before final settlement.
    function disputeTask(uint256 taskId) external {
        Task storage task = _task(taskId);
        _requireParty(task);
        if (task.status != Status.Submitted) revert InvalidStatus();

        task.status = Status.Disputed;
        emit TaskDisputed(taskId, msg.sender);
    }

    /// @notice D5b: the loser forfeits the budget, never the stake. A requester who wins gets the
    ///         budget back while the Agent still recovers its bond.
    function resolveDispute(uint256 taskId, bool favorAgent) external onlyArbiter nonReentrant {
        Task storage task = _task(taskId);
        if (task.status != Status.Disputed) revert InvalidStatus();

        address requester = task.requester;
        address agent = task.agent;
        uint256 budget = task.budget;
        uint256 stake = task.stake;

        if (favorAgent) {
            task.status = Status.Completed;
            _send(agent, budget + stake);
            emit DisputeResolved(taskId, true, 0, budget + stake);
            return;
        }

        task.status = Status.Cancelled;
        _send(requester, budget);
        _send(agent, stake);
        emit DisputeResolved(taskId, false, budget, stake);
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

    function _payAgent(uint256 taskId, Task storage task, bool autoApproved) private {
        address agent = task.agent;
        uint256 amount = task.budget + task.stake;

        task.status = Status.Completed;
        _send(agent, amount);
        emit TaskCompleted(taskId, agent, amount, autoApproved);
    }

    function _setArbiter(address newArbiter) private {
        if (newArbiter == address(0)) revert InvalidArbiter();
        emit ArbiterUpdated(arbiter, newArbiter);
        arbiter = newArbiter;
    }

    function _requireParty(Task storage task) private view {
        if (msg.sender != task.requester && msg.sender != task.agent) revert NotParty();
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
