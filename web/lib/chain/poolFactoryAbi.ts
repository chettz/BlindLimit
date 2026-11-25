export const poolFactoryAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "registry_",
        "type": "address",
        "internalType": "contract CollateralRegistry"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createPool",
    "inputs": [
      {
        "name": "usdc",
        "type": "address",
        "internalType": "contract IERC20"
      },
      {
        "name": "lender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "oracle",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "agreementHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "s",
        "type": "tuple",
        "internalType": "struct LoanPool.Settings",
        "components": [
          {
            "name": "advanceRateBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "delinquencyCutoffDays",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "amountToleranceCents",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "obligorConcBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "dealerConcBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxCommitment",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "lenderSig",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "operatorSig",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "pool",
        "type": "address",
        "internalType": "contract LoanPool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract CollateralRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "PoolCreated",
    "inputs": [
      {
        "name": "pool",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "agreementHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "settingsHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BadLenderSig",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadOperatorSig",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignature",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignatureLength",
    "inputs": [
      {
        "name": "length",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignatureS",
    "inputs": [
      {
        "name": "s",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  }
] as const;
