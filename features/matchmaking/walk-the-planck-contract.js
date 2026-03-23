import { contractIndex } from "@ohlabs/configuration/contract-index.mjs";
import { CHAIN_SLUGS } from "@ohlabs/configuration/chain-slugs";
import { BaseContract } from "@ohlabs/js-chain/contract/base-contract.js";
import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";

const CONTRACT_ENVIRONMENTS = ["test", "production"];

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
}

async function joinPublishedLobby(maxPlayers, entryFeeWei) {
    const contract = new WalkThePlanckContract();
    return contract.joinQueue(maxPlayers, entryFeeWei);
}

export {
    WalkThePlanckContract,
    getPublishedGameMetadata,
    joinPublishedLobby
};
