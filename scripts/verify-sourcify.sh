#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../contracts"

forge verify-contract --verifier sourcify --verifier-url http://localhost:5555/api/ \
  --rpc-url http://127.0.0.1:8545 \
  0x0248dB5425E63F10b63A71463340F3A369653bb4 \
  src/LoanPool.sol:LoanPool

forge verify-contract --verifier sourcify --verifier-url http://localhost:5555/api/ \
  --rpc-url http://127.0.0.1:8545 \
  0x061E098ba0b0E7ba607641a027b639ecFD8cd035 \
  src/CollateralRegistry.sol:CollateralRegistry
