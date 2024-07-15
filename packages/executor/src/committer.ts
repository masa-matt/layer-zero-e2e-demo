import { AppConfig, LastBlocks, Pool } from './types'
import { messagelib, protocol } from '@e2e/typechain'
type PacketSentEvent = protocol.interfaces._ILayerZeroEndpointV2.PacketSentEvent
type PayloadVerifiedEvent = messagelib.uln.uln302._ReceiveUln302.PayloadVerifiedEvent
type UlnConfigStructOutput = messagelib.uln.uln302._ReceiveUln302.UlnConfigStructOutput
import { lz_utils } from '@e2e/layerzerolib'
import { defaultAbiCoder, id, keccak256 } from 'ethers/lib/utils'

/**
 * Committer
 * https://docs.layerzero.network/v2/developers/evm/off-chain/build-executors
 *
 * 1. The Committer role first listens for the PacketSent event.
 * 2. After the PacketSent event, the ExecutorFeePaid is how you know your Executor has been assigned to commit and execute the packet.
 * 3. After receiving the fee, your Executor should listen for the PayloadVerified event, signaling that the packet can now be committed to the destination messaging channel.
 * 4. After listening for the previous events, your Executor should perform an idempotency check by calling Ultra Light Node 301 and Ultra Light Node 302.
 */
class Committer {
    private config: AppConfig
    private pool: Pool

    constructor(config: AppConfig) {
        this.config = config
        this.pool = {}
    }

    async start() {
        console.log('Start committer')
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
                const receiveUln = this.config.networks[network].receiveUln
                console.log(`[${network}] Start listen PayloadVerified event of ReceiveUln302 ${receiveUln.address}`)
                receiveUln.on(receiveUln.filters.PayloadVerified(), async (...args) => {
                    const event = args[args.length - 1] as PayloadVerifiedEvent
                    await this.commitVerification(network, event)
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

        const fetchPayloadVerified = async (network: string, fromBlock: number, toBlock: number) => {
            const receiveUln = this.config.networks[network].receiveUln
            console.log(`[${network}] Start fetch missed PayloadVerified events of ReceiveUln203 ${receiveUln.address}`)

            const payloadVerifieds = await receiveUln.queryFilter(receiveUln.filters.PayloadVerified(), fromBlock, toBlock)

            if (payloadVerifieds.length == 0) {
                return
            }

            Promise.all(
                payloadVerifieds.map(async (event) => {
                    await this.commitVerification(network, event)
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
                    await fetchPayloadVerified(network, lastBlocks[network], toBlock)
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

    async verifiable(network: string, codec: lz_utils.PacketV1Codec, ulnConfig: UlnConfigStructOutput): Promise<boolean> {
        const verifiable = await this.config.networks[network].receiveUln.verifiable(
            {
                confirmations: ulnConfig.confirmations,
                requiredDVNCount: ulnConfig.requiredDVNCount,
                optionalDVNCount: ulnConfig.optionalDVNCount,
                optionalDVNThreshold: ulnConfig.optionalDVNThreshold,
                requiredDVNs: [...ulnConfig.requiredDVNs],
                optionalDVNs: [...ulnConfig.optionalDVNs],
            },
            codec.headerHash(),
            codec.payloadHash(),
        )
        console.log(`[${network}] verifiable: ${verifiable}`)
        return verifiable
    }

    async commitVerification(network: string, event: PayloadVerifiedEvent) {
        const packetHeaderHash = keccak256(event.args.header)
        const proofHash = event.args.proofHash

        const eid = await this.config.networks[network].endpoint.eid()
        for (const key in this.pool[eid]) {
            const [event] = this.pool[eid][key]

            const packet = lz_utils.PacketSerializer.deserialize(event.args.encodedPayload)
            const encodedPacket = lz_utils.PacketV1Codec.encodeBytes(packet)
            const codec = lz_utils.PacketV1Codec.fromBytes(encodedPacket)

            if (codec.headerHash() === packetHeaderHash) {
                this.pool[eid][key][1].push(proofHash)
                const [, proofHashes] = this.pool[eid][key]

                const ulnConfig = await this.config.networks[network].receiveUln.getUlnConfig(
                    lz_utils.bytes32ToEthAddress(packet.receiver),
                    packet.srcEid,
                )

                if (
                    proofHashes.length >= ulnConfig.requiredDVNCount + ulnConfig.optionalDVNThreshold &&
                    (await this.verifiable(network, codec, ulnConfig))
                ) {
                    delete this.pool[eid][key]

                    // Build commitVerification transaction
                    const tx = await this.config.networks[network].receiveUln.populateTransaction.commitVerification(
                        codec.header(),
                        codec.payloadHash(),
                    )
                    // Send transaction on destination network
                    const txResponse = await this.config.networks[network].wallet.sendTransaction(tx)
                    console.log(`[${network}] Transaction sent: ${txResponse.hash}`)
                    await txResponse.wait()
                    console.log(`[${network}] Commit Verification done`)
                }
            }
        }
    }
}

export { Committer }
