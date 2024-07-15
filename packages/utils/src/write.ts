import 'hardhat-deploy/dist/src/type-extensions'
import '@nomiclabs/hardhat-ethers'
import fs from 'fs'
import { ethers } from 'ethers'
import { readDevloyments } from './read'
import { HardhatRuntimeEnvironment } from 'hardhat/types/runtime'

export const writeDeployments = async (hre: HardhatRuntimeEnvironment, contract: ethers.Contract, name: string) => {
    const deploymentsDir = `./deployments/${hre.network.name}`
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true })
    }
    fs.writeFileSync(`${deploymentsDir}/.chainId`, (await hre.ethers.provider.getNetwork()).chainId.toString())
    const deploymentData = {
        address: contract.address,
        abi: JSON.parse(contract.interface.format('json').toString()),
    }
    fs.writeFileSync(`${deploymentsDir}/${name}.json`, JSON.stringify(deploymentData, null, 2))
    hre.deployments.save(name, deploymentData)
    console.log(`Deployment data saved to ${deploymentsDir}/${name}.json`)
}

export const reloadDeployments = async (hre: HardhatRuntimeEnvironment, name: string) => {
    const deploymentData = readDevloyments(hre.network.name, name)
    hre.deployments.save(name, deploymentData)
    console.log(`Reload deployment data of ${name}`)
}
