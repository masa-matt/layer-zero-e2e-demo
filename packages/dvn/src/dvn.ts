import { AppConfig, LastBlocks, Networks, Pool } from './types'
import { protocol } from '@e2e/typechain'
type PacketSentEvent = protocol.interfaces._ILayerZeroEndpointV2.PacketSentEvent
import { lz_utils } from '@e2e/layerzerolib'
import { arrayify, concat, defaultAbiCoder, hexlify, hexZeroPad, id, joinSignature, keccak256, toUtf8Bytes } from 'ethers/lib/utils'
import assert from 'assert'

/**
 * DVN
 * https://docs.layerzero.network/v2/developers/evm/off-chain/build-dvns
 *
 * 1. The DVN first listens for the PacketSent event.
 * 2. After the PacketSent event, the DVNFeePaid is how you know your DVN has been assigned to verify the packet's payloadHash.
 * 3. After receiving the fee, your DVN should query the address of the MessageLib on the destination chain.
 * 4. After your DVN has retrieved the receive MessageLib, you should read the MessageLib configuration from it. In the configuration is the required block confirmations to wait before calling verify on the destination chain.
 * 5. Your DVN should next do an idempotency check.
 */
class DVN {
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
                setInterval(async () => {
                    for (const key in this.pool[network]) {
                        const event = this.pool[network][key]
                        delete this.pool[network][key]
                        await this.verify(network, event)
                    }
                }, this.config.delay)
            }),
        ])
    }

    async missedEvents() {
        const missedEvents = this.config.missedEvent
        const lastBlocks: LastBlocks = {}
        Object.keys(this.config.networks).map((network) => {
            lastBlocks[network] = 1
        })

        const fetchSentPackets = async (network: string, fromBlock: number, toBlock: number) => {
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

        return Promise.all(
            Object.keys(this.config.networks).map(async (network) => {
                const latest = await this.config.networks[network].provider.getBlockNumber()
                while (lastBlocks[network] < latest) {
                    const toBlock =
                        latest < lastBlocks[network] + missedEvents.blockRange ? latest : lastBlocks[network] + missedEvents.blockRange
                    console.log(`[${network}] Fetch block ${lastBlocks[network]} ~ ${toBlock}`)
                    await fetchSentPackets(network, lastBlocks[network], toBlock)
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

        const dvnFeePaidEventSignature = id('DVNFeePaid(address[],address[],uint256[])')

        const feePaidEvent = receipt.logs.find((log) => log.topics[0] === dvnFeePaidEventSignature)

        if (feePaidEvent) {
            const decodedData = defaultAbiCoder.decode(['address', 'uint256'], feePaidEvent.data)
            const fee = decodedData[1] as bigint

            if (fee > 0) {
                const packet = lz_utils.PacketSerializer.deserialize(event.args.encodedPayload)
                this.pool[network] = {
                    [packet.guid]: event,
                }
                console.log(`[${network}] Packet received of guid: ${packet.guid}`)
            }
        }
    }

    async verify(network: string, event: PacketSentEvent) {
        const packet = lz_utils.PacketSerializer.deserialize(event.args.encodedPayload)
        const findDstNetwork = async (networks: Networks, dstEid: number) => {
            for (const network of Object.keys(networks)) {
                const endpoint = this.config.networks[network].endpoint
                const eid = await endpoint.eid()
                if (eid === dstEid) {
                    return network
                }
            }
            return undefined
        }
        const dstNetwork = await findDstNetwork(this.config.networks, packet.dstEid)
        if (typeof dstNetwork == undefined) {
            console.log(`Error: Unsupported eid ${packet.dstEid}`)
            return
        }
        network = dstNetwork as string

        const receiveUln = this.config.networks[network].receiveUln
        const ulnConfig = await receiveUln.getUlnConfig(lz_utils.bytes32ToEthAddress(packet.receiver), packet.srcEid)
        const encodedPacket = lz_utils.PacketV1Codec.encodeBytes(packet)
        const codec = lz_utils.PacketV1Codec.fromBytes(encodedPacket)
        const verifiable = await receiveUln.verifiable(
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
        if (!verifiable) {
            // Build verify transaction
            const txVerify = await receiveUln.populateTransaction.verify(codec.header(), codec.payloadHash(), ulnConfig.confirmations)

            // Build execute transaction
            const blockNumber = await this.config.networks[network].provider.getBlockNumber()
            const latestBlock = await this.config.networks[network].provider.getBlock(blockNumber)
            assert(latestBlock, 'Failed to get latest block')

            const vid = await this.config.networks[network].self.vid()
            const target = receiveUln.address
            const callData = txVerify.data as string
            const expiration = latestBlock.timestamp + 86400
            const data = hexlify(concat([hexZeroPad(hexlify(vid), 4), target, hexZeroPad(hexlify(expiration), 32), callData]))
            const txHash = keccak256(data)
            const messagePrefix = '\x19Ethereum Signed Message:\n32'
            const prefixBytes = toUtf8Bytes(messagePrefix)
            const message = keccak256(concat([prefixBytes, arrayify(txHash)]))
            const signed = []
            for (const [, signer] of this.config.networks[network].wallets.signers.entries()) {
                signed.push(joinSignature(await signer._signingKey().signDigest(message)))
            }
            const signatures = hexlify(concat(signed))

            const txExecute = await this.config.networks[network].self.populateTransaction.execute([
                {
                    vid,
                    target,
                    callData,
                    expiration,
                    signatures,
                },
            ])

            // Send transaction on destination network
            const txExecuteResponse = await this.config.networks[network].wallets.admin.sendTransaction(txExecute)
            console.log(`[${network}] Transaction sent: ${txExecuteResponse.hash}`)
            await txExecuteResponse.wait()

            const verifiable = await receiveUln.verifiable(
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
            console.log(`[${network}] Verify done`)
        }
    }
}

export { DVN }
