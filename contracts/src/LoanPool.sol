// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {CollateralRegistry} from "./CollateralRegistry.sol";

/// @notice 팩토리 없이 단독 배포 가능한 대출 풀(테스트용). 약정서에 대한 서명 검증은 팩토리 단계에서 진행
contract LoanPool {
    using SafeERC20 for IERC20;

    struct Settings {
        uint16 advanceRateBps;
        uint16 delinquencyCutoffDays;
        uint32 amountToleranceCents;
        uint16 obligorConcBps;
        uint16 dealerConcBps;
        uint256 maxCommitment;
    }

    IERC20 public immutable usdc;
    CollateralRegistry public immutable registry;
    address public immutable lender;
    address public immutable operator;
    address public immutable oracle;
    bytes32 public immutable agreementHash;
    bytes32 public immutable settingsHash;

    Settings private _settings;
    bytes public lenderSig;
    bytes public operatorSig;

    uint256 public limit;
    uint256 public borrowed;

    error NotOracle();
    error NotLender();
    error ExceedsLimit(uint256 requested, uint256 available);
    error SettingsLocked();
    error ZeroAmount();

    event LimitUpdated(
        bytes32 agreementHash,
        bytes32 docBundleHash,
        bytes32 attestationHash,
        bytes32 ruleHash,
        uint256 eligibleCount,
        uint256 eligibleAmount,
        uint256 newLimit,
        uint64 timestamp
    );
    event Borrowed(address indexed lender, uint256 amount);
    event Repaid(address indexed lender, uint256 amount);

    /// @notice 풀을 배포하고 설정과 서명을 저장. 한도는 0이고, 서명 검증x
    constructor(
        IERC20 usdc_,
        CollateralRegistry registry_,
        address lender_,
        address operator_,
        address oracle_,
        bytes32 agreementHash_,
        Settings memory s,
        bytes memory lenderSig_,
        bytes memory operatorSig_
    ) {
        usdc = usdc_;
        registry = registry_;
        lender = lender_;
        operator = operator_;
        oracle = oracle_;
        agreementHash = agreementHash_;
        _settings = s;
        settingsHash = keccak256(abi.encode(s));
        lenderSig = lenderSig_;
        operatorSig = operatorSig_;
    }

    /// @notice 오라클이 VIN 해시를 등록하고 담보 한도를 갱신. 둘 중 하나라도 실패하면 revert
    function postLimit(
        bytes32 docBundleHash,
        bytes32 attestationHash,
        bytes32 ruleHash,
        uint256 eligibleCount,
        uint256 eligibleAmount,
        uint256 newLimit,
        bytes32[] calldata vinHashes
    ) external {
        if (msg.sender != oracle) revert NotOracle();

        registry.registerBatch(vinHashes);
        limit = newLimit;

        emit LimitUpdated(
            agreementHash,
            docBundleHash,
            attestationHash,
            ruleHash,
            eligibleCount,
            eligibleAmount,
            newLimit,
            uint64(block.timestamp)
        );
    }

    /// @notice 오라클이 상환이 끝난 차량의 VIN 등록을 해제
    function releaseVins(bytes32[] calldata vinHashes) external {
        if (msg.sender != oracle) revert NotOracle();
        registry.releaseBatch(vinHashes);
    }

    /// @notice 대출사(할부금융사)가 한도 안에서 USDC를 차입
    function borrow(uint256 amount) external {
        if (msg.sender != lender) revert NotLender();
        if (amount == 0) revert ZeroAmount();

        uint256 available = availableToBorrow();
        if (amount > available) revert ExceedsLimit(amount, available);

        borrowed += amount;
        usdc.safeTransfer(lender, amount);
        emit Borrowed(lender, amount);
    }

    /// @notice 대출 상환
    function repay(uint256 amount) external {
        if (msg.sender != lender) revert NotLender();
        if (amount == 0) revert ZeroAmount();

        uint256 outstanding = borrowed;
        if (amount > outstanding) revert ExceedsLimit(amount, outstanding);

        borrowed = outstanding - amount;
        usdc.safeTransferFrom(lender, address(this), amount);
        emit Repaid(lender, amount);
    }

    /// @notice 배포 후 설정 변경은 항상 거부
    function updateSettings(Settings calldata) external pure {
        revert SettingsLocked();
    }

    /// @notice 빌릴 수 있는 금액. 한도와 최대 약정 중 작은 쪽에서 이미 빌린 금액을 차감한 나머지
    function availableToBorrow() public view returns (uint256) {
        uint256 cap = _cap();
        return cap > borrowed ? cap - borrowed : 0;
    }

    /// @notice 배포 때 고정된 설정값 6개 리턴
    function settings() external view returns (Settings memory) {
        return _settings;
    }

    /// @dev 대출 상한: 게시된 한도와 최대 약정 중 작은 값
    function _cap() internal view returns (uint256) {
        uint256 maxCommitment = _settings.maxCommitment;
        return limit < maxCommitment ? limit : maxCommitment;
    }
}
