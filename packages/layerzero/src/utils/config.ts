import { NetworkUserConfig } from 'hardhat/types'
import config from '../../hardhat.config'
import assert from 'assert'

export type NetworkConfig = {
    name: string
    network: NetworkUserConfig
}

export type NetworksConfig = {
    local: NetworkConfig
    remote: NetworkConfig
}

export const getNetworksConfigs = (): NetworksConfig[] => {
    assert(config.networks, 'Networks must be configured')
    const networks: NetworkConfig[] = Object.entries(config.networks).flatMap(([name, network]) => {
        assert(network, 'Network must be configured')
        return { name, network }
    })
    return getNetworkCombinations(networks)
}

const getNetworkCombinations = (networks: NetworkConfig[]): NetworksConfig[] => {
    const combinations: NetworksConfig[] = []

    for (let i = 0; i < networks.length; i++) {
        for (let j = 0; j < networks.length; j++) {
            if (i !== j) {
                combinations.push({
                    local: {
                        name: networks[i].name,
                        network: networks[i].network,
                    },
                    remote: {
                        name: networks[j].name,
                        network: networks[j].network,
                    },
                })
            }
        }
    }

    return combinations
}
