import { AppConfig, LastBlocks, Pool } from './types'
import { protocol } from '@e2e/typechain'
type PacketSentEvent = protocol.interfaces._ILayerZeroEndpointV2.PacketSentEvent
type PacketVerifiedEvent = protocol.interfaces._ILayerZeroEndpointV2.PacketVerifiedEvent
type OriginStructOutput = protocol.interfaces._ILayerZeroEndpointV2.OriginStructOutput
import { lz_utils } from '@e2e/layerzerolib'
import { defaultAbiCoder, hexlify, hexZeroPad, id, toUtf8Bytes } from 'ethers/lib/utils'
import { MaxUint256 } from './utils'
import { BigNumber } from 'ethers/lib/ethers'

/**
 * Executor
 * https://docs.layerzero.network/v2/developers/evm/off-chain/build-executors
 *
 * 1. The Executor role first listens for the PacketSent event:
 * 2. After the PacketSent event, the ExecutorFeePaid is how you know your Executor has been assigned to commit and execute the packet.
 * 3. After receiving the fee, your Executor should listen for the PacketVerified event, signaling that the packet can now be executed.
 * 4. After listening for the previous events, your Executor should perform an idempotency check:
 */
class Executor {
    private config: AppConfig
    private pool: Pool

    constructor(config: AppConfig) {
        this.config = config
        this.pool = {}
    }

    async start() {
        console.log('Start executor')
        await this.listen()
    }

    async listen() {
        await this.missedEvents()
        return Promise.all([
            ...Object.keys(this.config.networks).map(async (network) => {
                const endpoint = this.config.networks[network].endpoint
                console.log(`[${network}] Start listen PacketSent event of EndpointV2 ${endpoint.address}`)
                endpoint.on(endpoint.filters.PacketSent(), async (...args) => {
                    const event = args[args.length - 1] as PacketSentEvent
                    await this.receivePaidFee(network, event)
                })
            }),
            ...Object.keys(this.config.networks).map(async (network) => {
                const endpoint = this.config.networks[network].endpoint
                console.log(`[${network}] Start listen PacketVerified event of EndpointV2 ${endpoint.address}`)
                endpoint.on(endpoint.filters.PacketVerified(), async (...args) => {
                    const event = args[args.length - 1] as PacketVerifiedEvent
                    await this.execute(network, event)
                })
            }),
        ])
    }

    async missedEvents() {
        const missedEvents = this.config.missedEvent
        const lastBlocks: LastBlocks = {}
        Object.keys(this.config.networks).map((network) => {
            lastBlocks[network] = 1
        })

        const fetchPacketSent = async (network: string, fromBlock: number, toBlock: number) => {
            const endpoint = this.config.networks[network].endpoint
            console.log(`[${network}] Start fetch missed PacketSent events of EndpointV2 ${endpoint.address}`)

            const packetSents = await endpoint.queryFilter(endpoint.filters.PacketSent(), fromBlock, toBlock)

            if (packetSents.length == 0) {
                return
            }

            Promise.all(
                packetSents.map(async (event) => {
                    await this.receivePaidFee(network, event)
                }),
            )
        }

        const fetchPacketVerified = async (network: string, fromBlock: number, toBlock: number) => {
            const endpoint = this.config.networks[network].endpoint
            console.log(`[${network}] Start fetch missed PacketVerified events of EndpointV2 ${endpoint.address}`)

            const packetSents = await endpoint.queryFilter(endpoint.filters.PacketVerified(), fromBlock, toBlock)

            if (packetSents.length == 0) {
                return
            }

            Promise.all(
                packetSents.map(async (event) => {
                    await this.execute(network, event)
                }),
            )
        }

        return Promise.all(
            Object.keys(this.config.networks).map(async (network) => {
                const latest = await this.config.networks[network].provider.getBlockNumber()
                while (lastBlocks[network] < latest) {
                    const toBlock =
                        latest < lastBlocks[network] + missedEvents.blockRange ? latest : lastBlocks[network] + missedEvents.blockRange
                    console.log(`[${network}] Fetch block ${lastBlocks[network]} ~ ${toBlock}`)
                    await fetchPacketSent(network, lastBlocks[network], toBlock)
                    await fetchPacketVerified(network, lastBlocks[network], toBlock)
                    lastBlocks[network] = toBlock + 1
                    await new Promise((resolve) => setTimeout(resolve, missedEvents.interval))
                }
            }),
        )
    }

    async receivePaidFee(network: string, event: PacketSentEvent) {
        const receipt = await this.config.networks[network].provider.getTransactionReceipt(event.transactionHash)

        if (!receipt) {
            console.log(`[${network}] Failed to get transaction receipt ${event.transactionHash}`)
        }

        const executorFeePaidEventSignature = id('ExecutorFeePaid(address,uint256)')

        const feePaidEvent = receipt.logs.find((log) => log.topics[0] === executorFeePaidEventSignature)

        if (feePaidEvent) {
            const decodedData = defaultAbiCoder.decode(['address', 'uint256'], feePaidEvent.data)
            const fee = decodedData[1] as bigint

            if (fee > 0) {
                const packet = lz_utils.PacketSerializer.deserialize(event.args.encodedPayload)
                this.pool[packet.dstEid] = {
                    [packet.guid]: [event, []],
                }
                console.log(`[${network}] Packet received of guid: ${packet.guid}`)
            }
        }
    }

    async executable(
        network: string,
        packet: lz_utils.Packet,
        codec: lz_utils.PacketV1Codec,
        origin: OriginStructOutput,
    ): Promise<boolean> {
        const payloadHash = codec.payloadHash()

        if (
            payloadHash == hexZeroPad(toUtf8Bytes(''), 32) &&
            origin.nonce <=
                (await this.config.networks[network].endpoint.lazyInboundNonce(
                    lz_utils.bytes32ToEthAddress(packet.receiver),
                    origin.srcEid,
                    origin.sender,
                ))
        ) {
            console.log(`[${network}] Packet ${packet.guid} has already been executed, aborting`)
            return false
        }

        if (
            payloadHash != MaxUint256.toString() &&
            origin.nonce <=
                (await this.config.networks[network].endpoint.inboundNonce(
                    lz_utils.bytes32ToEthAddress(packet.receiver),
                    origin.srcEid,
                    origin.sender,
                ))
        ) {
            console.log(`[${network}] Packet ${packet.guid} is executable`)
            return true
        }

        if (payloadHash != hexZeroPad(toUtf8Bytes(''), 32) && payloadHash != MaxUint256.toString()) {
            console.log(`[${network}] Packet ${packet.guid} is verified but not executable`)
            return false
        }

        console.log(`[${network}] executable: true`)
        return true
    }

    async execute(network: string, event: PacketVerifiedEvent) {
        const origin = event.args.origin
        const eid = await this.config.networks[network].endpoint.eid()
        for (const key in this.pool[eid]) {
            const [event] = this.pool[eid][key]

            const packet = lz_utils.PacketSerializer.deserialize(event.args.encodedPayload)
            const encodedPacket = lz_utils.PacketV1Codec.encodeBytes(packet)
            const codec = lz_utils.PacketV1Codec.fromBytes(encodedPacket)

            if (await this.executable(network, packet, codec, origin)) {
                delete this.pool[eid][key]

                const options = lz_utils.Options.fromOptions(hexlify(event.args.options))
                const lzReceiverOptions = options.decodeExecutorLzReceiveOption()

                if (!lzReceiverOptions) {
                    console.log(`[${network}] Packet does not contain executor options, aborting`)
                    return
                }

                const origin = {
                    srcEid: packet.srcEid,
                    sender: packet.sender,
                    nonce: packet.nonce,
                }

                // Build lzReceive transaction
                const tx = await this.config.networks[network].endpoint.populateTransaction.lzReceive(
                    origin,
                    lz_utils.bytes32ToEthAddress(packet.receiver),
                    lz_utils.hexZeroPadTo32(packet.guid),
                    packet.message,
                    '0x', // Extra data unsupported at this time
                )

                tx.gasLimit = BigNumber.from(lzReceiverOptions?.gas)
                tx.value = BigNumber.from(lzReceiverOptions?.value)

                // Send transaction on destination network
                const txResponse = await this.config.networks[network].wallet.sendTransaction(tx)
                console.log(`[${network}] Transaction sent: ${txResponse.hash}`)
                await txResponse.wait()
                console.log(`[${network}] Execute done`)
            }
        }
    }
}

export { Executor }
