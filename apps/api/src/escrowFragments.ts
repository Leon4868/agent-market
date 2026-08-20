// Every contract fragment the API touches: the events the settlement check decodes, plus the
// arbiter lookup behind /v1/chain/config. Kept in sync with the compiled contract by
// `npm run check:abi`, which is what makes duplicating the fragments here safe.
export const escrowFragments = [
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
] as const;
