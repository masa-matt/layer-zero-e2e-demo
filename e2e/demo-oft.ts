import { task } from 'hardhat/config'
import { ActionType } from 'hardhat/types'
import { getEidForNetworkName } from '@layerzerolabs/devtools-evm-hardhat'
import { addressToBytes32, Options } from '@layerzerolabs/lz-v2-utilities'
import { MyOFT, MyOFTAdapter } from '@e2e/oapp'
import { write } from '@e2e/utils'
import { ethers } from 'ethers'
import { hexlify, parseUnits } from 'ethers/lib/utils'

interface TaskArgs {
    dstNetwork: string
}

const action: ActionType<TaskArgs> = async ({ dstNetwork }, hre) => {
    const { getNamedAccounts } = hre
    const namedAccounts = await getNamedAccounts()
    const namedSigners: { [key: string]: ethers.Signer } = {}
    for (const [accountName, accountAddress] of Object.entries(namedAccounts)) {
        const signer = await hre.ethers.getSigner(accountAddress)
        namedSigners[accountName] = signer
    }
    const { oAppOwner, user1 } = namedSigners

    const dstEid = getEidForNetworkName(dstNetwork)
    let srcOFTDeployment
    if (hre.network.name == 'sepolia') {
        write.reloadDeployments(hre, 'MyOFTAdapter')
        srcOFTDeployment = await hre.deployments.get('MyOFTAdapter')
    } else {
        write.reloadDeployments(hre, 'MyOFT')
        srcOFTDeployment = await hre.deployments.get('MyOFT')
    }
    const srcOFTAddress = srcOFTDeployment.address
    const srcOFT = (await hre.ethers.getContractAt(srcOFTDeployment.abi, srcOFTAddress)) as MyOFTAdapter

    const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString()

    const sendAmount = parseUnits('0.0001', 18)

    if (hre.network.name == 'sepolia') {
        const srcOFTDeployment = await hre.deployments.get('MyOFT')
        const srcOFT = (await hre.ethers.getContractAt(srcOFTDeployment.abi, srcOFTDeployment.address)) as MyOFT
        await srcOFT.connect(user1).approve(srcOFTAddress, sendAmount)
    }

    const params = {
        dstEid: dstEid,
        to: hexlify(addressToBytes32(await user1.getAddress())),
        amountLD: sendAmount,
        minAmountLD: parseUnits('0.000001', 18),
        extraOptions: options,
        composeMsg: '0x',
        oftCmd: '0x',
    }
    const fee = await srcOFT.connect(user1).quoteSend(params, false)

    const tx = await srcOFT.connect(user1).send(params, fee, await oAppOwner.getAddress(), { value: fee[0].toString() })
    console.dir(tx)
}

task('demo-oft', 'Demonstration of Layer Zero', action).addParam('dstNetwork', 'Destination network name')
