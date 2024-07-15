import { BigNumber } from 'ethers/lib/ethers'

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
export const MaxUint256: BigNumber = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
