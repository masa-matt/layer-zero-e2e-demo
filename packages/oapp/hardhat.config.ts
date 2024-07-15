// Get the environment configuration from .env file
//
// To make use of automatic environment setup:
// - Duplicate .env.example file and name it .env
// - Fill in the environment variables
import 'dotenv/config'

import 'hardhat-deploy'
import 'hardhat-contract-sizer'
import '@nomiclabs/hardhat-ethers'
import '@layerzerolabs/toolbox-hardhat'
import '@typechain/hardhat'
import { HardhatUserConfig, HttpNetworkAccountsUserConfig } from 'hardhat/types'
import { EndpointId } from '@layerzerolabs/lz-definitions'

// Set your preferred authentication method
//
// If you prefer using a mnemonic, set a MNEMONIC environment variable
// to a valid mnemonic
const MNEMONIC = process.env.MNEMONIC

// If you prefer to be authenticated using a private key, set a PRIVATE_KEY environment variable
const PRIVATE_KEY = process.env.PRIVATE_KEY

const accounts: HttpNetworkAccountsUserConfig | undefined = MNEMONIC
    ? {
          mnemonic: MNEMONIC,
          path: process.env.HD_PATH || "m/44'/60'/0'/0",
          initialIndex: parseInt(process.env.HD_INITIAL_INDEX || '0'),
          count: parseInt(process.env.HD_ACCOUNT_COUNT || '10'),
          passphrase: process.env.HD_PASSPHRASE || '',
      }
    : PRIVATE_KEY
      ? [PRIVATE_KEY]
      : undefined

if (accounts == null) {
    console.warn(
        'Could not find MNEMONIC or PRIVATE_KEY environment variables. It will not be possible to execute transactions in your example.',
    )
}

export const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: '0.8.22',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        ],
    },
    networks: {
        sepolia: {
            eid: EndpointId.SEPOLIA_V2_TESTNET,
            url: process.env.ENV == 'dev' ? 'http://127.0.0.1:8545' : 'http://sepolia:8545',
            accounts,
        },
        bcs: {
            eid: EndpointId.BSC_V2_TESTNET,
            url: process.env.ENV == 'dev' ? 'http://127.0.0.1:8546' : 'http://bcs:8545',
            accounts,
        },
    },
    namedAccounts: {
        layerzero: {
            default: 0,
        },
        executorRoleAdmin: {
            default: 1,
        },
        executorAdmin: {
            default: 2,
        },
        verifier: {
            default: 3,
        },
        verifierAdmin: {
            default: 4,
        },
        signer1: {
            default: 5,
        },
        signer2: {
            default: 6,
        },
        admin1: {
            default: 7,
        },
        oAppOwner: {
            default: 8,
        },
        user1: {
            default: 9,
        },
    },
    typechain: {
        outDir: 'src/typechain-types',
        target: 'ethers-v5',
        alwaysGenerateOverloads: false,
        dontOverrideCompile: false,
    },
}

export default config
