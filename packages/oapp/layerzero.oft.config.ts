import { EndpointId } from '@layerzerolabs/lz-definitions'

import type { OAppOmniGraphHardhat, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'

const sepoliaContract: OmniPointHardhat = {
    eid: EndpointId.SEPOLIA_V2_TESTNET,
    contractName: 'MyOFTAdapter',
}

const bcsContract: OmniPointHardhat = {
    eid: EndpointId.BSC_V2_TESTNET,
    contractName: 'MyOFT',
}

const config: OAppOmniGraphHardhat = {
    contracts: [
        {
            contract: bcsContract,
        },
        {
            contract: sepoliaContract,
        },
    ],
    connections: [
        {
            from: bcsContract,
            to: sepoliaContract,
        },
        {
            from: sepoliaContract,
            to: bcsContract,
        },
    ],
}

export default config
