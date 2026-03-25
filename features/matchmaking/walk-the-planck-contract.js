import { contractIndex } from "@ohlabs/configuration/contract-index.mjs";
import { CHAIN_SLUGS } from "@ohlabs/configuration/chain-slugs";
import { BaseContract } from "@ohlabs/js-chain/contract/base-contract.js";
import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";

const CONTRACT_ENVIRONMENTS = ["test", "production"];
const MATCH_STATUSES = {
    0: "Open",
    1: "Resolving",
    2: "Resolved",
    3: "Cancelled"
};

function getEthers() {
    if (!window.ethers) {
        throw new Error("ethers.js is not loaded yet.");
    }

    return window.ethers;
}

function normalizeChainId(chainId) {
    if (chainId == null) return null;

    try {
        return Number(getEthers().BigNumber.from(chainId).toString());
    } catch (error) {
        console.error(error);
        return null;
    }
}

function getConfiguredChainId(environment, chainSlug) {
    if (chainSlug === CHAIN_SLUGS.Base) {
        return environment === "test" ? 84532 : 8453;
    }

    return null;
}

function getPublishedGameMetadata() {
    const walletState = getWalletState();
    const currentChainId = normalizeChainId(walletState.chainId);

    if (!currentChainId) {
        throw new Error("Connect wallet to a supported chain first.");
    }

    for (const environment of CONTRACT_ENVIRONMENTS) {
        const environmentContracts = contractIndex?.[environment] ?? {};

        for (const [chainSlug, contracts] of Object.entries(environmentContracts)) {
            if (getConfiguredChainId(environment, chainSlug) !== currentChainId) {
                continue;
            }

            const gameContract = contracts?.WalkThePlanck?.Game;
            if (gameContract?.address && Array.isArray(gameContract.abi)) {
                return {
                    environment,
                    chainSlug,
                    address: gameContract.address,
                    abi: gameContract.abi
                };
            }
        }
    }

    throw new Error(`No published WalkThePlanck deployment found for chain ${currentChainId}.`);
}

function getErrorData(err) {
    return (
        err?.data?.data ??
        err?.data?.originalError?.data ??
        err?.error?.data?.data ??
        err?.error?.data?.originalError?.data ??
        err?.error?.data ??
        err?.data ??
        null
    );
}

function decodeContractError(err, metadata = null) {
    const errorData = getErrorData(err);

    if (typeof errorData !== "string" || !errorData.startsWith("0x")) {
        return null;
    }

    try {
        const resolvedMetadata = metadata ?? getPublishedGameMetadata();
        const contractInterface = new getEthers().utils.Interface(resolvedMetadata.abi);
        const parsed = contractInterface.parseError(errorData);

        if (!parsed) {
            return null;
        }

        return {
            name: parsed.name,
            signature: parsed.signature,
            args: parsed.args
        };
    } catch (error) {
        return null;
    }
}

class WalkThePlanckContract extends BaseContract {
    constructor(metadata = getPublishedGameMetadata()) {
        super(metadata.address, metadata.abi);
        this.metadata = metadata;
    }

    async joinQueue(maxPlayers, entryFeeWei) {
        if (!this.contract || !this.provider) {
            throw new Error("WalkThePlanck contract is not available.");
        }

        return this.contract
            .connect(this.provider.getSigner())
            .joinQueue(maxPlayers, entryFeeWei, { value: entryFeeWei });
    }

    async claim(matchId) {
        if (!this.contract || !this.provider) {
            throw new Error("WalkThePlanck contract is not available.");
        }

        return this.contract.connect(this.provider.getSigner()).claim(matchId);
    }

    async claimRefund(matchId) {
        if (!this.contract || !this.provider) {
            throw new Error("WalkThePlanck contract is not available.");
        }

        return this.contract.connect(this.provider.getSigner()).claimRefund(matchId);
    }

    async getPlayerMatches(player) {
        return this.contract.getPlayerMatches(player);
    }

    async getClaimableMatches(player) {
        return this.contract.getClaimableMatches(player);
    }

    async getRefundableMatches(player) {
        return this.contract.getRefundableMatches(player);
    }

    async getMatch(matchId) {
        return this.contract.matches(matchId);
    }

    async getMatchPlayers(matchId) {
        return this.contract.getMatchPlayers(matchId);
    }

    getLobbyIdFromReceipt(receipt) {
        if (!this.contract?.interface || !Array.isArray(receipt?.logs)) {
            return null;
        }

        for (const log of receipt.logs) {
            try {
                const parsedLog = this.contract.interface.parseLog(log);

                if (parsedLog?.name === "PlayerJoined") {
                    return parsedLog.args?.matchId?.toString?.() ?? null;
                }
            } catch (error) {
                continue;
            }
        }

        return null;
    }
}

function toNumber(value) {
    return Number(value?.toString?.() ?? value ?? 0);
}

function toStringValue(value) {
    return value?.toString?.() ?? String(value ?? "");
}

function normalizeMatchRecord(matchId, record, players, claimableSet, refundableSet, playerAddress) {
    const normalizedMatchId = toStringValue(matchId);
    const normalizedStatus = toNumber(record?.status);
    const normalizedPlayers = Array.isArray(players)
        ? players.map((player) => player.toLowerCase())
        : [];
    const normalizedPlayerAddress = playerAddress.toLowerCase();
    const loser = (record?.loser ?? "").toLowerCase();
    const isClaimable = claimableSet.has(normalizedMatchId);
    const isRefundable = refundableSet.has(normalizedMatchId);

    let playerStatus = MATCH_STATUSES[normalizedStatus] ?? `Status ${normalizedStatus}`;

    if (isClaimable) {
        playerStatus = "Claimable";
    } else if (isRefundable) {
        playerStatus = "Refund available";
    } else if (normalizedStatus === 2) {
        playerStatus = loser && loser === normalizedPlayerAddress ? "Eliminated" : "Survived";
    } else if (normalizedStatus === 0) {
        playerStatus = toNumber(record?.playerCount) >= toNumber(record?.maxPlayers) ? "Ready" : "Joined";
    }

    return {
        id: normalizedMatchId,
        maxPlayers: toNumber(record?.maxPlayers),
        playerCount: toNumber(record?.playerCount),
        entryFeeWei: toStringValue(record?.entryFee),
        totalPotWei: toStringValue(record?.totalPot),
        deadline: toNumber(record?.deadline),
        statusCode: normalizedStatus,
        statusLabel: MATCH_STATUSES[normalizedStatus] ?? `Status ${normalizedStatus}`,
        playerStatus,
        loser,
        loserIndex: toNumber(record?.loserIndex),
        deathTurn: toNumber(record?.deathTurn),
        sequenceNumber: toStringValue(record?.sequenceNumber),
        players: normalizedPlayers,
        isClaimable,
        isRefundable
    };
}

async function getPlayerMatchDetails(playerAddress) {
    const contract = new WalkThePlanckContract();
    const [matchIds, claimableIds, refundableIds] = await Promise.all([
        contract.getPlayerMatches(playerAddress),
        contract.getClaimableMatches(playerAddress),
        contract.getRefundableMatches(playerAddress)
    ]);

    const claimableSet = new Set((claimableIds ?? []).map((value) => toStringValue(value)));
    const refundableSet = new Set((refundableIds ?? []).map((value) => toStringValue(value)));
    const uniqueMatchIds = [...new Set((matchIds ?? []).map((value) => toStringValue(value)))];

    const matches = await Promise.all(
        uniqueMatchIds.map(async (matchId) => {
            const [record, players] = await Promise.all([
                contract.getMatch(matchId),
                contract.getMatchPlayers(matchId)
            ]);

            return normalizeMatchRecord(
                matchId,
                record,
                players,
                claimableSet,
                refundableSet,
                playerAddress
            );
        })
    );

    return matches.sort((left, right) => Number(right.id) - Number(left.id));
}

async function joinPublishedLobby(maxPlayers, entryFeeWei) {
    const contract = new WalkThePlanckContract();
    const tx = await contract.joinQueue(maxPlayers, entryFeeWei);

    return {
        contract,
        tx
    };
}

async function claimPublishedMatch(matchId) {
    const contract = new WalkThePlanckContract();
    const tx = await contract.claim(matchId);

    return {
        contract,
        tx
    };
}

async function claimPublishedRefund(matchId) {
    const contract = new WalkThePlanckContract();
    const tx = await contract.claimRefund(matchId);

    return {
        contract,
        tx
    };
}

export {
    claimPublishedMatch,
    claimPublishedRefund,
    decodeContractError,
    getPlayerMatchDetails,
    WalkThePlanckContract,
    getPublishedGameMetadata,
    joinPublishedLobby
};
