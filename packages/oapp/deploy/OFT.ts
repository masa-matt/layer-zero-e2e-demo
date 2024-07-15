import { type DeployFunction } from 'hardhat-deploy/types'
import hardhatconfig from '../hardhat.config'
import { messagelib, protocol } from '@e2e/typechain'
import { config, write } from '@e2e/utils'
import { ethers } from 'ethers'
import { parseUnits } from 'ethers/lib/utils'
import assert from 'assert'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { MyOFT } from '../src/typechain-types'

const tagName = 'OFT'

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
    const { getNamedAccounts, deployments } = hre
    const { deploy } = deployments

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
    const { oAppOwner, user1 } = namedSigners

    // get deployed endpoint
    write.reloadDeployments(hre, 'EndpointV2')
    const endpointDeployment = await hre.deployments.get('EndpointV2')
    const endpoint = (await hre.ethers.getContractAt(endpointDeployment.abi, endpointDeployment.address)) as protocol.ILayerZeroEndpointV2

    // deploy application
    const oAppOwnerAddress = await oAppOwner.getAddress()
    let { address } = await deploy('MyOFT', {
        from: oAppOwnerAddress,
        args: ['MyOFT', 'MOFT', 1000000000, endpoint.address, oAppOwnerAddress],
        log: true,
        skipIfAlreadyDeployed: false,
    })
    console.log(`[${hre.network.name}] Deployed contract: MyOFT, address: ${address}`)

    if (networks.local.name == 'sepolia') {
        const oAppOwnerAddress = await oAppOwner.getAddress()
        const deployed = await deploy('MyOFTAdapter', {
            from: oAppOwnerAddress,
            args: [address, endpoint.address, oAppOwnerAddress],
            log: true,
            skipIfAlreadyDeployed: false,
        })
        address = deployed.address
        console.log(`[${hre.network.name}] Deployed contract: MyOFTAdapter, address: ${address}`)

        // send token to user
        const srcOFTDeployment = await hre.deployments.get('MyOFT')
        const srcOFT = (await hre.ethers.getContractAt(srcOFTDeployment.abi, srcOFTDeployment.address)) as MyOFT
        await srcOFT.connect(oAppOwner).transfer(await user1.getAddress(), parseUnits('1', 20))
    }

    // get deployed dvn
    write.reloadDeployments(hre, 'DVN')
    const dvnDeployment = await hre.deployments.get('DVN')
    const dvn = (await hre.ethers.getContractAt(dvnDeployment.abi, dvnDeployment.address)) as messagelib.DVN
    // get deployed receive library
    write.reloadDeployments(hre, 'ReceiveUln302')
    const receiveUln302Deployment = await hre.deployments.get('ReceiveUln302')
    const receiveUln302 = (await hre.ethers.getContractAt(
        receiveUln302Deployment.abi,
        receiveUln302Deployment.address,
    )) as messagelib.IReceiveUln302
    // get deployed send library
    write.reloadDeployments(hre, 'SendUln302')
    const sendUln302Deployment = await hre.deployments.get('SendUln302')
    const sendUln302 = (await hre.ethers.getContractAt(sendUln302Deployment.abi, sendUln302Deployment.address)) as messagelib.SendUln302
    // get deployed executor
    write.reloadDeployments(hre, 'Executor')
    const executorDeployment = await hre.deployments.get('Executor')
    const executor = (await hre.ethers.getContractAt(executorDeployment.abi, executorDeployment.address)) as messagelib.IExecutor

    // configure
    const receiveUlnConfig = {
        confirmations: 1,
        requiredDVNCount: 1,
        optionalDVNCount: 0,
        optionalDVNThreshold: 0,
        requiredDVNs: [dvn.address],
        optionalDVNs: [],
    }
    const receiveConfigBytes = ethers.utils.defaultAbiCoder.encode(
        ['tuple(uint64, uint8, uint8, uint8, address[], address[])'],
        [
            [
                receiveUlnConfig.confirmations,
                receiveUlnConfig.requiredDVNCount,
                receiveUlnConfig.optionalDVNCount,
                receiveUlnConfig.optionalDVNThreshold,
                receiveUlnConfig.requiredDVNs,
                receiveUlnConfig.optionalDVNs,
            ],
        ],
    )
    await endpoint.connect(oAppOwner).setConfig(address, receiveUln302.address, [
        {
            eid: remoteNetwork.eid,
            configType: 2,
            config: receiveConfigBytes,
        },
    ])

    const executorConfig = { maxMessageSize: 10000, executor: executor.address }
    const executorConfigBytes = ethers.utils.defaultAbiCoder.encode(
        ['tuple(uint32, address)'],
        [[executorConfig.maxMessageSize, executorConfig.executor]],
    )
    await endpoint.connect(oAppOwner).setConfig(address, sendUln302.address, [
        {
            eid: remoteNetwork.eid,
            configType: 1,
            config: executorConfigBytes,
        },
    ])

    const sendUlnConfig = {
        confirmations: 1,
        requiredDVNCount: 1,
        optionalDVNCount: 1,
        optionalDVNThreshold: 1,
        requiredDVNs: [dvn.address],
        optionalDVNs: [dvn.address],
    }
    const sendUlnConfigBytes = ethers.utils.defaultAbiCoder.encode(
        ['tuple(uint64, uint8, uint8, uint8, address[], address[])'],
        [
            [
                sendUlnConfig.confirmations,
                sendUlnConfig.requiredDVNCount,
                sendUlnConfig.optionalDVNCount,
                sendUlnConfig.optionalDVNThreshold,
                sendUlnConfig.requiredDVNs,
                sendUlnConfig.optionalDVNs,
            ],
        ],
    )
    await endpoint.connect(oAppOwner).setConfig(address, sendUln302.address, [
        {
            eid: remoteNetwork.eid,
            configType: 2,
            config: sendUlnConfigBytes,
        },
    ])
}

deploy.tags = [tagName]

export default deploy
