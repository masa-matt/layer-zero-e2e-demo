import 'dotenv/config'
import { ethers, providers } from 'ethers'
import { AppConfig, Networks, NetworksConfig } from './types'
import { messagelib, protocol } from '@e2e/typechain'
import ReceiveUln302__factory = messagelib.factories.uln.uln302._ReceiveUln302__factory.ReceiveUln302__factory
import read from '@e2e/utils/read'
import fs from 'fs'
import path from 'path'

const getConfig = (): NetworksConfig => {
    const env = process.env.ENV ? `.${process.env.ENV}` : ''
    const __root = process.cwd()
    const configpath = path.join(__root, `/networks.config${env}.json`)
    if (!fs.existsSync(configpath)) {
        throw Error(`${configpath} is not exists`)
    }
    return JSON.parse(fs.readFileSync(configpath, 'utf8'))
}

const createNetworks = (): Networks => {
    let networks: Networks = {}
    const networksConfig: NetworksConfig = getConfig()

    for (const network in networksConfig) {
        const provider = new providers.JsonRpcProvider(networksConfig[network].rpcUrl)

        const endpointAddress = read.readDevloyments(network, 'EndpointV2').address
        const endpoint = protocol.ILayerZeroEndpointV2__factory.connect(endpointAddress, provider)

        const receiveUlnAddress = read.readDevloyments(network, 'ReceiveUln302').address
        const receiveUln = ReceiveUln302__factory.connect(receiveUlnAddress, provider)

        const wallet = new ethers.Wallet(networksConfig[network].privateKey, provider)

        networks[network] = {
            provider,
            endpoint,
            receiveUln,
            wallet,
        }
    }

    return networks
}

export const createConfig = (): AppConfig => {
    return {
        networks: createNetworks(),
        delay: process.env.DELAY ? parseInt(process.env.DELAY) : 10000,
        missedEvent: {
            interval: process.env.INTERVAL ? parseInt(process.env.INTERVAL) : 1000,
            blockRange: process.env.BLOCK_RANGE ? parseInt(process.env.BLOCK_RANGE) : 1000,
        },
    }
}
