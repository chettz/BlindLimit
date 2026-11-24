// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice 공유 VIN 레지스트리. 풀이 registerBatch 를 직접 호출
/// @dev postLimit 한 트랜잭션 안에서 VIN 등록과 한도 갱신이 같이 끝나서,
/// 오라클이 다른 풀 이름으로 등록하는 경로는 없다.
/// vinHash 는 keccak256(정규화된 VIN + 서버 솔트)이고, VIN 원문은 체인에 저장 X
/// 등록 권한은 owner 또는 factory 가 승인한 풀에만 있다.
contract CollateralRegistry {
    mapping(bytes32 vinHash => address pool) public pledgedTo;
    mapping(address pool => bool) public isPool;
    address public owner;
    address public factory;

    error NotOwner();
    error NotAuthorized();
    error AlreadyPledged(bytes32 vinHash, address existingPool);
    error NotOwnerPool(bytes32 vinHash);

    event PoolAuthorized(address indexed pool);
    event FactorySet(address indexed factory);
    event VinsRegistered(address indexed pool, uint256 count);
    event VinsReleased(address indexed pool, uint256 count);

    /// @notice 배포한 계정을 owner로 지정
    constructor() {
        owner = msg.sender;
    }

    /// @notice 풀이 VIN 을 등록할 수 있게 승인. owner 또는 factory 만 호출 가능
    function authorizePool(address pool) external {
        if (msg.sender != owner && msg.sender != factory) revert NotOwner();
        isPool[pool] = true;
        emit PoolAuthorized(pool);
    }

    function setFactory(address f) external {
        if (msg.sender != owner) revert NotOwner();
        factory = f;
        emit FactorySet(f);
    }

    /// @notice 승인된 풀이 VIN 해시를 자기 담보로 등록. 다른 풀에 등록되어 있으면 revert
    function registerBatch(bytes32[] calldata vinHashes) external {
        if (!isPool[msg.sender]) revert NotAuthorized();

        uint256 added;
        uint256 len = vinHashes.length;
        for (uint256 i; i < len; ++i) {
            bytes32 vinHash = vinHashes[i];
            address existing = pledgedTo[vinHash];
            if (existing == address(0)) {
                pledgedTo[vinHash] = msg.sender;
                added += 1;
            } else if (existing != msg.sender) {
                revert AlreadyPledged(vinHash, existing);
            }
        }

        emit VinsRegistered(msg.sender, added);
    }

    /// @notice 이 풀에 등록된 VIN 해시를 해제. 다른 풀에 등록되어 있으면 revert
    function releaseBatch(bytes32[] calldata vinHashes) external {
        uint256 len = vinHashes.length;
        for (uint256 i; i < len; ++i) {
            bytes32 vinHash = vinHashes[i];
            if (pledgedTo[vinHash] != msg.sender) revert NotOwnerPool(vinHash);
            delete pledgedTo[vinHash];
        }

        emit VinsReleased(msg.sender, len);
    }

    /// @notice 이 VIN 해시가 어떤 풀에든 등록돼 있는지 확인
    function isPledged(bytes32 vinHash) external view returns (bool) {
        return pledgedTo[vinHash] != address(0);
    }

    /// @notice 해시마다 어느 풀에 등록돼 있는지 한 번에 조회. 없으면 주소 0
    function checkBatch(bytes32[] calldata vinHashes) external view returns (address[] memory pools) {
        uint256 len = vinHashes.length;
        pools = new address[](len);
        for (uint256 i; i < len; ++i) {
            pools[i] = pledgedTo[vinHashes[i]];
        }
    }
}
