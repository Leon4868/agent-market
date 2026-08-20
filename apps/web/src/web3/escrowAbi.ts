// Only the fragments the web app actually uses. The source of truth is
// contracts/contracts/AgentTaskEscrow.sol; `npm run check:abi` verifies this stays in sync
// with the compiled artifact.
export const escrowAbi = [
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "externalTaskId",
        type: "bytes32"
      },
      {
        internalType: "uint64",
        name: "deadline",
        type: "uint64"
      }
    ],
    name: "createTask",
    outputs: [
      {
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      }
    ],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      }
    ],
    name: "acceptTask",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      }
    ],
    name: "submitTask",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      }
    ],
    name: "approveTask",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      }
    ],
    name: "disputeTask",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      },
      {
        internalType: "bool",
        name: "favorAgent",
        type: "bool"
      }
    ],
    name: "resolveDispute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      }
    ],
    name: "claimReviewTimeout",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      }
    ],
    name: "claimDeliveryTimeout",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      }
    ],
    name: "cancelTask",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "arbiter",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      }
    ],
    name: "tasks",
    outputs: [
      {
        internalType: "bytes32",
        name: "externalTaskId",
        type: "bytes32"
      },
      {
        internalType: "address",
        name: "requester",
        type: "address"
      },
      {
        internalType: "address",
        name: "agent",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "budget",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "stake",
        type: "uint256"
      },
      {
        internalType: "uint64",
        name: "deadline",
        type: "uint64"
      },
      {
        internalType: "uint64",
        name: "submittedAt",
        type: "uint64"
      },
      {
        internalType: "enum AgentTaskEscrow.Status",
        name: "status",
        type: "uint8"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "STAKE_BPS",
    outputs: [
      {
        internalType: "uint16",
        name: "",
        type: "uint16"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "REVIEW_WINDOW",
    outputs: [
      {
        internalType: "uint64",
        name: "",
        type: "uint64"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "externalTaskId",
        type: "bytes32"
      },
      {
        indexed: true,
        internalType: "address",
        name: "requester",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "budget",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "deadline",
        type: "uint64"
      }
    ],
    name: "TaskCreated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      },
      {
        indexed: true,
        internalType: "address",
        name: "agent",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "stake",
        type: "uint256"
      }
    ],
    name: "TaskAccepted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "submittedAt",
        type: "uint64"
      }
    ],
    name: "TaskSubmitted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      },
      {
        indexed: true,
        internalType: "address",
        name: "recipient",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "bool",
        name: "autoApproved",
        type: "bool"
      }
    ],
    name: "TaskCompleted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      },
      {
        indexed: true,
        internalType: "address",
        name: "opener",
        type: "address"
      }
    ],
    name: "TaskDisputed",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "bool",
        name: "favorAgent",
        type: "bool"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "requesterAmount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "agentAmount",
        type: "uint256"
      }
    ],
    name: "DisputeResolved",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "refund",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "stakeReturned",
        type: "uint256"
      }
    ],
    name: "TaskTimedOut",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "taskId",
        type: "uint256"
      }
    ],
    name: "TaskCancelled",
    type: "event"
  },
] as const;
