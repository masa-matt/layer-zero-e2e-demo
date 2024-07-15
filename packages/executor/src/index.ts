import { Committer } from './committer'
import { createConfig } from './config'
import { Executor } from './executor'

async function main() {
    const config = createConfig()

    if (process.env.ROLE == 'committer') {
        console.log('committer')
        const committer = new Committer(config)
        await committer.start()
    } else {
        console.log('executor')
        const executor = new Executor(config)
        await executor.start()
    }
}

main().catch((error) => {
    console.error('Error:', error)
})
