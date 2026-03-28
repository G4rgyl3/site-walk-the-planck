import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";

function getEntropyExplorerChainParam() {
    const chainId = Number(getWalletState().chainId);

    if (chainId === 84532) {
        return "base-sepolia-testnet";
    }

    if (chainId === 8453) {
        return "base-mainnet";
    }

    return "";
}

function getEntropyExplorerUrl(match) {
    const sequenceNumber = String(match?.sequenceNumber ?? "").trim();
    const chain = getEntropyExplorerChainParam();

    if (!sequenceNumber || !chain) {
        return "";
    }

    const params = new URLSearchParams({
        chain,
        search: sequenceNumber
    });

    return `https://entropy-explorer.pyth.network/?${params.toString()}`;
}

export {
    getEntropyExplorerChainParam,
    getEntropyExplorerUrl
};
