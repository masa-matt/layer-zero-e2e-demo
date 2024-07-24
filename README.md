# layer-zero-e2e-demo

This repository was created to promote understanding of the LayerZero protocol and how to use it.  
It is an end-to-end demonstration of LayerZero, with everything running locally.  
This is only a demo of personal development. Please refer to the ISC license for details.

## Packages

The following modules are docker-composed. This is because OApp developers can use contracts that have already been deployed to the network.  
Please check [List of deployed contracts](https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts) in the official documentation.

- LayerZero Protocol (On-Chain)
- LayerZero Message Library (On-Chain)
- LayerZero OApp (On-Chain)
- DVN (On-Chain / Off-Chain)
- Executor (On-Chain / Off-Chain)

### layerzero
Look at the `layerzero` package. Here are a set of LayerZero contracts and default Config settings.  
The [LICENSE-LZBL-1.2](https://github.com/LayerZero-Labs/LayerZero-v2/blob/main/LICENSE-LZBL-1.2) license covers the LayerZero contract. No modifications are made to the library in this repository and it is intended for personal use only.
I would appreciate it if you could point out any errors in my understanding.

### dvn and executor
I created the off-chain DVNs and executers basically according to the documentation. ([Build DVNs](https://docs.layerzero.network/v2/developers/evm/off-chain/build-dvns) / [Build Executor](https://docs.layerzero.network/v2/developers/evm/off-chain/build-executors))  
At this time only one DVN has been created, but theoretically, it is possible to have multiple DVNs.

### oapp
The demo OApp supports L1 lock → L2 mint and L2 burn → L1 unlock messaging using [OFT](https://docs.layerzero.network/v2/developers/evm/oft/native-transfer), which transfers the ERC20 token.

## Installation

``` shell
$ git submodule update --init --recursive
$ pushd lib/TypeChain && pnpm install && pnpm build && popd
$ pnpm install
$ pnpm build
$ pnpm build-image
```

## Demonstration

``` shell
$ pnpm start
```

Open another console and run the following.  
Run `demo-oft` to send OFTs from the source chain to the destination chain.  
`check-oft` can be used to check the token balance in the destination chain to see if the message succeeds.

``` shell
$ pnpm demo-oft
$ pnpm check-oft
```
