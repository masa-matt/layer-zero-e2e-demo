import { type DeployFunction } from 'hardhat-deploy/types'
import hardhatconfig from '../hardhat.config'
import { messagelib } from '@e2e/typechain'
import { config, read, write } from '@e2e/utils'
import { BigNumber, ethers } from 'ethers'
import { keccak256, parseUnits, toUtf8Bytes } from 'ethers/lib/utils'
import assert from 'assert'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const tagName = 'LayerZero'

const deploy: DeployFunction = async (hre) => {
    const networksConfigs = config.getNetworksConfigs(hardhatconfig)
    for (const networks of networksConfigs) {
        if (hre.network.name == networks.local.name) {
            console.log(
                `Deploying local: ${networks.local.name} [${networks.local.network.eid}], remote: ${networks.remote.name} [${networks.remote.network.eid}]`,
            )
            await deployToNetwork(hre, networks)
        }
    }
}

const deployToNetwork = async (hre: HardhatRuntimeEnvironment, networks: config.NetworksConfig) => {
    const { getNamedAccounts } = hre

    const localNetwork = networks.local.network
    const remoteNetwork = networks.remote.network
    assert(localNetwork.eid, `[${localNetwork.tags}] eid must be configured`)
    assert(remoteNetwork.eid, `[${remoteNetwork.tags}] eid must be configured`)

    const namedAccounts = await getNamedAccounts()
    const namedSigners: { [key: string]: ethers.Signer } = {}
    for (const [accountName, accountAddress] of Object.entries(namedAccounts)) {
        const signer = await hre.ethers.getSigner(accountAddress)
        namedSigners[accountName] = signer
    }
    const { layerzero, executorRoleAdmin, executorAdmin, verifierAdmin, signer1, signer2 } = namedSigners

    // deploy EndpointV2
    const endpointArtifact = read.readLZArtifact('lz-evm-protocol-v2', 'EndpointV2')
    const endpointV2Factory = new hre.ethers.ContractFactory(endpointArtifact.abi, endpointArtifact.bytecode, layerzero)
    const endpoint = await endpointV2Factory.deploy(localNetwork.eid, await layerzero.getAddress())
    await endpoint.deployTransaction.wait()
    console.log(`[${hre.network.name}] Deployed contract: EndpointV2, address: ${endpoint.address}`)
    write.writeDeployments(hre, endpoint, 'EndpointV2')

    // deploy PriceFeed
    const priceFeedArtifact = read.readLZArtifact('lz-evm-messagelib-v2', 'PriceFeed')
    const priceFeedFactory = new hre.ethers.ContractFactory(priceFeedArtifact.abi, priceFeedArtifact.bytecode, layerzero)
    const priceFeed = await priceFeedFactory.deploy()
    await priceFeed.deployTransaction.wait()
    await priceFeed.initialize(hre.ethers.constants.AddressZero)
    console.log(`[${hre.network.name}] Deployed contract: PriceFeed, address: ${priceFeed.address}`)
    write.writeDeployments(hre, priceFeed, 'PriceFeed')

    // configure PriceFeed
    await priceFeed.setEndpoint(endpoint.address)
    await priceFeed.setPrice([
        {
            eid: remoteNetwork.eid % 30_000,
            price: {
                priceRatio: BigNumber.from(10).pow(20).toString(),
                gasPriceInUnit: BigNumber.from(10).pow(10).toString(),
                gasPerByte: 1,
            },
        },
    ])
    await priceFeed.setPriceRatioDenominator(BigNumber.from(10).pow(20).toString())
    await priceFeed.setNativeTokenPriceUSD(BigNumber.from(5).pow(20).toString())

    // deploy send library
    const sendUln302Artifact = read.readLZArtifact('lz-evm-messagelib-v2', 'SendUln302', 'uln', 'uln302')
    const sendUln302Factory = new hre.ethers.ContractFactory(sendUln302Artifact.abi, sendUln302Artifact.bytecode, layerzero)
    const sendLibrary = await sendUln302Factory.deploy(endpoint.address, 0, 0)
    await sendLibrary.deployTransaction.wait()
    await sendLibrary.setTreasury(await layerzero.getAddress())
    console.log(`[${hre.network.name}] Deployed contract: SendUln302, address: ${sendLibrary.address}`)
    write.writeDeployments(hre, sendLibrary, 'SendUln302')

    // deploy receive library
    const receiveUln302Artifact = read.readLZArtifact('lz-evm-messagelib-v2', 'ReceiveUln302', 'uln', 'uln302')
    const receiveUln302Factory = new hre.ethers.ContractFactory(receiveUln302Artifact.abi, receiveUln302Artifact.bytecode, layerzero)
    const receiveLibrary = await receiveUln302Factory.deploy(endpoint.address)
    await receiveLibrary.deployTransaction.wait()
    console.log(`[${hre.network.name}] Deployed contract: ReceiveUln302, address: ${receiveLibrary.address}`)
    write.writeDeployments(hre, receiveLibrary, 'ReceiveUln302')

    // register send and receive libraries
    await endpoint.connect(layerzero).registerLibrary(sendLibrary.address)
    await endpoint.connect(layerzero).registerLibrary(receiveLibrary.address)

    // deploy executor fee library
    const executorFeeLibArtifact = read.readLZArtifact('lz-evm-messagelib-v2', 'ExecutorFeeLib')
    const executorFeeLibFactory = new hre.ethers.ContractFactory(executorFeeLibArtifact.abi, executorFeeLibArtifact.bytecode, layerzero)
    const executorFeeLib = await executorFeeLibFactory.deploy(0)
    await executorFeeLib.deployTransaction.wait()
    console.log(`[${hre.network.name}] Deployed contract: ExecutorFeeLib, address: ${executorFeeLib.address}`)
    write.writeDeployments(hre, executorFeeLib, 'ExecutorFeeLib')

    // deploy executor
    const executorArtifact = read.readLZArtifact('lz-evm-messagelib-v2', 'Executor')
    const executorFactory = new hre.ethers.ContractFactory(executorArtifact.abi, executorArtifact.bytecode, layerzero)
    const executor = await executorFactory.deploy()
    await executor.deployTransaction.wait()
    console.log(`[${hre.network.name}] Deployed contract: Executor, address: ${executor.address}`)
    write.writeDeployments(hre, executor, 'Executor')

    // configure executor
    await executor.initialize(
        endpoint.address,
        receiveLibrary.address,
        [sendLibrary.address, receiveLibrary.address],
        priceFeed.address,
        await executorRoleAdmin.getAddress(),
        [await executorAdmin.getAddress()],
    )
    await executor.connect(executorAdmin).setWorkerFeeLib(executorFeeLib.address)
    await executor.connect(executorAdmin).setDefaultMultiplierBps(12000)
    await executor.connect(executorRoleAdmin).grantRole(keccak256(toUtf8Bytes('MESSAGE_LIB_ROLE')), sendLibrary.address)

    const executorDstConfig: messagelib.IExecutor.DstConfigParamStruct = {
        dstEid: remoteNetwork.eid,
        lzReceiveBaseGas: 120000,
        lzComposeBaseGas: 0,
        multiplierBps: 12000,
        floorMarginUSD: parseUnits('0.01', 20),
        nativeCap: parseUnits('800'),
    }
    await executor.connect(executorAdmin).setDstConfig([executorDstConfig])

    // deploy verifier fee library
    const dvnFeeLibArtifact = read.readLZArtifact('lz-evm-messagelib-v2', 'DVNFeeLib', 'uln', 'dvn')
    const dvnFeeLibFactory = new hre.ethers.ContractFactory(dvnFeeLibArtifact.abi, dvnFeeLibArtifact.bytecode, layerzero)
    const dvnFeeLib = await dvnFeeLibFactory.deploy(parseUnits('0.01', 10))
    await dvnFeeLib.deployTransaction.wait()
    console.log(`[${hre.network.name}] Deployed contract: DVNFeeLib, address: ${dvnFeeLib.address}`)
    write.writeDeployments(hre, dvnFeeLib, 'DVNFeeLib')

    // deploy verifier
    const dvnArtifact = read.readLZArtifact('lz-evm-messagelib-v2', 'DVN', 'uln', 'dvn')
    const dvnFactory = new hre.ethers.ContractFactory(dvnArtifact.abi, dvnArtifact.bytecode, layerzero)
    const dvn = await dvnFactory.deploy(
        localNetwork.eid % 30_000,
        [sendLibrary.address, receiveLibrary.address],
        priceFeed.address,
        [await signer2.getAddress(), await signer1.getAddress()],
        2,
        [await verifierAdmin.getAddress()],
    )
    await dvn.deployTransaction.wait()
    console.log(`[${hre.network.name}] Deployed contract: DVN, address: ${dvn.address}`)
    write.writeDeployments(hre, dvn, 'DVN')

    // configure verifier
    await dvn.connect(verifierAdmin).setWorkerFeeLib(dvnFeeLib.address)
    await dvn.connect(verifierAdmin).setDefaultMultiplierBps(12000)
    await dvn.connect(verifierAdmin).grantRole(keccak256(toUtf8Bytes('ADMIN_ROLE')), await verifierAdmin.getAddress())
    await dvn.connect(verifierAdmin).grantRole(keccak256(toUtf8Bytes('ADMIN_ROLE')), await signer1.getAddress())
    await dvn.connect(verifierAdmin).grantRole(keccak256(toUtf8Bytes('ADMIN_ROLE')), await signer2.getAddress())

    const dvnDstConfig: messagelib.IDVN.DstConfigParamStruct = {
        dstEid: remoteNetwork.eid,
        gas: 90000,
        multiplierBps: 12000,
        floorMarginUSD: parseUnits('0.01', 20),
    }
    await dvn.connect(verifierAdmin).setDstConfig([dvnDstConfig])

    // configure send library
    const sendUlnConfig = {
        confirmations: 1,
        requiredDVNCount: 1,
        optionalDVNCount: 1,
        optionalDVNThreshold: 1,
        requiredDVNs: [dvn.address],
        optionalDVNs: [dvn.address],
    }
    await sendLibrary.setDefaultUlnConfigs([{ config: sendUlnConfig, eid: remoteNetwork.eid }])

    const executorConfig = { maxMessageSize: 10000, executor: executor.address }
    await sendLibrary.setDefaultExecutorConfigs([{ config: executorConfig, eid: remoteNetwork.eid }])

    // configure receive library
    const receiveUlnConfig = {
        confirmations: 1,
        requiredDVNCount: 1,
        optionalDVNCount: 0,
        optionalDVNThreshold: 0,
        requiredDVNs: [dvn.address],
        optionalDVNs: [],
    }
    await receiveLibrary.setDefaultUlnConfigs([{ config: receiveUlnConfig, eid: remoteNetwork.eid }])

    // configure endpoint with message libraries
    await endpoint.connect(layerzero).setDefaultSendLibrary(remoteNetwork.eid, sendLibrary.address)
    await endpoint.connect(layerzero).setDefaultReceiveLibrary(remoteNetwork.eid, receiveLibrary.address, 0)
}

deploy.tags = [tagName]

export default deploy
