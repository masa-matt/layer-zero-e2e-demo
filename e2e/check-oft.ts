import { task } from 'hardhat/config'
import { ActionType } from 'hardhat/types'
import { MyOFT } from '@e2e/oapp'
import { write } from '@e2e/utils'
import { ethers } from 'ethers'
import { parseUnits } from 'ethers/lib/utils'

interface TaskArgs {}

const action: ActionType<TaskArgs> = async ({}, hre) => {
    const { getNamedAccounts } = hre
    const namedAccounts = await getNamedAccounts()
    const namedSigners: { [key: string]: ethers.Signer } = {}
    for (const [accountName, accountAddress] of Object.entries(namedAccounts)) {
        const signer = await hre.ethers.getSigner(accountAddress)
        namedSigners[accountName] = signer
    }
    const { user1 } = namedSigners

    write.reloadDeployments(hre, 'MyOFT')
    const srcOFTDeployment = await hre.deployments.get('MyOFT')
    const srcOFT = (await hre.ethers.getContractAt(srcOFTDeployment.abi, srcOFTDeployment.address)) as MyOFT

    const sendAmount = parseUnits('0.0001', 18)

    const balance = await srcOFT.balanceOf(await user1.getAddress())

    console.log(`${sendAmount} was sent from source chain, and now balance is ${balance}`)
}

task('check-oft', 'Check the result of demonstration', action)
