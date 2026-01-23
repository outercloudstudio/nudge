import * as path from "jsr:@std/path";
import { createHash, Hash } from 'node:crypto'

const botsDirectory = './example-bots/src/main'
const defaultMaps = 'DefaultLarge,DefaultMedium,DefaultSmall,Meow,Nofreecheese,ZeroDay,arrows,cheesefarm,cheeseguardians,combat-test,dirtfulcat,dirtpassageway,evileye,keepout,pipes,popthecork,rift,sittingducks,starvation,thunderdome,trapped,wallsofparadis'

let socket: WebSocket | null = null
let requiresDownload: boolean = true
let downloadedFiles = 0
let filesToDownload = 0

function startIPCServer() {
    const server = Deno.serve({
        port: 0
    }, async (req) => {
        const url = new URL(req.url)
        
        if(url.pathname === '/connect') {
            const address = await req.text()

            connectClient(address)
        }

        if(url.pathname === '/run') {
            if(socket) {
                const body = await req.json()

                socket.send(JSON.stringify({ message: 'run', botA: body.botA, botB: body.botB, maps: body.maps, games: body.games, label: body.label }))

                uploadFiles()

                await setupBuild()

                socket!.send(JSON.stringify({ message: 'ready' }))
            }
        }

        return new Response(null, { status: 200 })
    })

    console.log(`[msg->ipc]${server.addr.port}`)
}

function connectClient(address: string) {
    console.log('Connecting to', address)

    socket = new WebSocket(`ws://` + address);

    socket.addEventListener("open", () => {
        console.log("Connected to server!");
        console.log(`[msg->connected]`)
    });

    socket.addEventListener('close', event => {
        console.log(`Connection closed ${event.reason}`)

        console.log(`[msg->disconnected]`)

        setTimeout(() => {
            connectClient(address)
        }, 1000);
    })

    socket.addEventListener('error', event => {
        console.log(`Connection error`, (event as ErrorEvent).message)
    })

    socket.addEventListener("message", async (event) => {
        const data: { message: string, [key: string]: any } = JSON.parse(event.data)

        if(data.message === 'status') { 
            console.log(`Server status: ${data.state}`)

            console.log(`[msg->status]${data.state}`)
        } else if(data.message === 'begin') { 
            console.log(`[msg->begin]`)
        } else if(data.message === 'startDownload') {
            console.log('Beginning file download...')
            console.log(`${data.count} files`)
            console.log(`hash: ${data.hash}`)

            const {count, hash} = indexDirectory(botsDirectory)

            requiresDownload = count !== data.count || hash.digest('hex') !== data.hash

            if(requiresDownload) {
                Deno.removeSync(botsDirectory, { recursive: true })
                Deno.mkdirSync(botsDirectory)

                filesToDownload = count
                downloadedFiles = 0
            } else {
                console.log('Hash matches! Does not require download.')

                await setupBuild()
                
                socket!.send(JSON.stringify({ message: 'ready' }))
            }
        } else if(data.message === 'file') {
            if(!requiresDownload) return

            console.log(`Received file: ${data.path}`)

            ensureDirectory(data.path)

            try {
                Deno.writeFileSync('./' + data.path, Uint8Array.from(atob(data.data), c => c.charCodeAt(0)))
            } catch {}

            downloadedFiles++

            if(filesToDownload == downloadedFiles) {
                await setupBuild()
            
                socket!.send(JSON.stringify({ message: 'ready' }))
            }
        } else if(data.message === 'runGames') {
            console.log(`Received request with maps: ${data.maps}`);
    
            const result1 = await runGames(data.maps, data.botA, data.botB)
            const result2 = await runGames(data.maps, data.botB, data.botA)
    
            socket!.send(JSON.stringify({
                message: 'result',
                winsA: result1.winsA + result2.winsB,
                winsB: result1.winsB + result2.winsA,
                id: data.id
            }));
        } else if(data.message === 'complete') {
            console.log('-------- RESULTS --------')

            const winRate = data.winsA / (data.winsA + data.winsB)
            const winPercent = Math.round(data.winsA / (data.winsA + data.winsB) * 100)
            const delta = winPercent - 50
            const stdError = Math.sqrt(winRate * (1 - winRate) / data.games)
            const error = stdError * 1.96
            const errorPercent = Math.round(error * 100)

            console.log(`A vs. B   ${data.winsA}-${data.winsB}   ${winPercent}%   Δ ${delta}%   ±${errorPercent}% (95%)`)

            console.log(`Run time took ${data.seconds} seconds   ${Math.floor((data.winsA + data.winsB) / data.seconds * 100) / 100} games/sec`)
        
            console.log(`[msg->complete]`)
            console.log(`[msg->history]${data.label}[botA]${data.botA}[botB]${data.botB}[winsA]${data.winsA}[winsB]${data.winsB}`)
        } else if(data.message === 'progress') {
            console.log(`[msg->progress]${data.progress}`)
            console.log(`[msg->eta]${data.eta}`)
        }
    });
}

function ensureDirectory(ensurePath: string) {
    const base = path.dirname(ensurePath)

    if(base === '.') return

    ensureDirectory(base)

    try {
        Deno.lstatSync('./' + base)
    } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) {
            throw err;
        }
    
        try {
            Deno.mkdirSync('./' + base)
        } catch{}
    }
}

function indexDirectory(directory: string, hash?: Hash): { count: number, hash: Hash } {
    let count = 0

    if(hash === undefined) hash = createHash('sha256')

    for(const entry of [...Deno.readDirSync(directory)].toSorted((a, b) => a.name.localeCompare(b.name))) {
        if(entry.isFile) {
            count++

            hash.update(Deno.readFileSync(path.join(directory, entry.name)))
        } else {
            const { count: subCount, hash: nextHash } = indexDirectory(path.join(directory, entry.name), hash)

            count += subCount
            hash = nextHash
        }
    }

    return {count, hash}
}

function uploadDirectory(directory: string) {
    if(!socket) return

    for(const entry of Deno.readDirSync(directory)) {
        if(entry.isFile) {
            const filePath = path.join(directory, entry.name).replaceAll('\\', '/')

            console.log(`Sending file ${filePath}`)

            const fileData = Deno.readFileSync(path.join(directory, entry.name))

            let binary = ''

            const chunkSize = 8192
            const chunks = fileData.length / chunkSize

            for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
                const chunk = fileData.slice(chunkIndex * chunkSize, chunkIndex * chunkSize + chunkSize)

                binary += String.fromCharCode(...chunk)
            }
            
            socket.send(JSON.stringify({ 
                message: 'file', 
                path: filePath,
                data: btoa(binary)
            }))
        } else {
            uploadDirectory(path.join(directory, entry.name))
        }
    }
}

function uploadFiles() {
    if(!socket) return
    
    const { count, hash } = indexDirectory(botsDirectory)

    socket.send(JSON.stringify({ message: 'startUpload', count, hash: hash.digest('hex') }))

    uploadDirectory(botsDirectory)

    socket.send(JSON.stringify({ message: 'finishUpload' }))
}

async function runGames(maps: string, playerA: string, playerB: string): Promise<{ winsA: number, winsB: number }> {
    const isWindows = Deno.build.os === "windows";
    const gradlewScript = isWindows ? "./gradlew.bat" : "./gradlew";

    const command = new Deno.Command(gradlewScript, {
        args: [
            'headlessNoBuild',
            `-Pmaps=${maps}`,
            `-PteamA=${playerA}`,
            `-PteamB=${playerB}`,
            `-PlanguageA=java`,
            `-PlanguageB=java`
        ]
    });

    command.spawn()

    const { stdout } = await command.output();

    const output = new TextDecoder().decode(stdout);

    const winLines = output.split('\n').filter(line => line.includes('[server]') && line.includes(' wins '))

    const winsA = winLines.filter(line => line.includes('(A)')).length
    const winsB = winLines.filter(line => line.includes('(B)')).length

    return {
        winsA: winsA,
        winsB: winsB
    }
}

async function setupBuild(): Promise<void> {
    const isWindows = Deno.build.os === "windows";
    const gradlewScript = isWindows ? "./gradlew.bat" : "./gradlew";

    const command = new Deno.Command(gradlewScript, {
        args: [':engine:build', ':example-bots:build']
    });

    const child = command.spawn()

    await child.status;
}

startIPCServer()
