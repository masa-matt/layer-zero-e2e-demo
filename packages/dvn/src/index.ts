import { DVN } from './dvn'
import { createConfig } from './config'

async function main() {
    const config = createConfig()
    const dvn = new DVN(config)

    await dvn.start()
}

main().catch((error) => {
    console.error('Error:', error)
})
