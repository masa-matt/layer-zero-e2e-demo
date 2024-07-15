import fs from 'fs'
import path from 'path'

export const readLZArtifact = (packageName: string, contractName: string, ...subPackages: string[]) => {
    const __root = process.cwd()
    const artifactPath = path.join(
        __root,
        'node_modules',
        '@layerzerolabs',
        packageName,
        'artifacts',
        'contracts',
        ...subPackages,
        `${contractName}.sol`,
        `${contractName}.json`,
    )

    if (fs.existsSync(artifactPath)) {
        return JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
    }

    return undefined
}

export const readDevloyments = (networkName: string, contractName: string) => {
    const __root = process.cwd()
    const deploymentsPath = path.join(__root, 'deployments', networkName, `${contractName}.json`)
    if (fs.existsSync(deploymentsPath)) {
        return JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
    }
}