import { ethers, providers } from 'ethers'
import { messagelib, protocol } from '@e2e/typechain'
type ReceiveUln302 = messagelib.uln.uln302._ReceiveUln302.ReceiveUln302
type PacketSentEvent = protocol.interfaces._ILayerZeroEndpointV2.PacketSentEvent

export interface NetworksConfig {
    [network: string]: NetworkConfig
}

export interface NetworkConfig {
    rpcUrl: string
    privateKey: string
}

export type AppConfig = {
    networks: Networks
    delay: number
    missedEvent: MissedEvent
}

export type MissedEvent = {
    interval: number
    blockRange: number
}

export type LastBlocks = {
    [network: string]: number
}

export type Networks = {
    [network: string]: Network
}

export type Network = {
    provider: providers.JsonRpcProvider
    endpoint: protocol.ILayerZeroEndpointV2
    receiveUln: ReceiveUln302
    wallet: ethers.Wallet
}

export type Pool = {
    [eid: string]: EventData
}

export type EventData = {
    [key: string]: [PacketSentEvent, string[]]
}
