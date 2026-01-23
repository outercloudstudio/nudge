import { randomUUID } from "node:crypto";

let state: 'idle' | 'syncing' | 'running' = 'idle'

export type Client = {
	socket: WebSocket
    state: 'idle' | 'syncing' | 'ready' | 'running'
    runId: string | null
    syncId: string | null
}

const clients: Client[] = []

let botA = ''
let botB = ''
let maps = ''
let games = 0
let label = ''

let winsA = 0
let winsB = 0

let start = null

let fileCount = 0
let hash = ''

let files: Record<string, string> = {}

function startNodeServer() {
    Deno.serve((req) => {
        if (req.headers.get("upgrade") != "websocket") {
            return new Response(null, { status: 426 })
        }

        const { socket, response } = Deno.upgradeWebSocket(req)

        let client: Client | null = null

        socket.addEventListener("open", () => {
            client = {
                socket,
                state: 'idle',
                runId: null,
                syncId: null,
            }

            clients.push(client)

            console.log("A client connected!")
            console.log(`[msg->clients]${clients.length}`)

            socket.send(JSON.stringify({ message: 'status', state }))

            if(state == 'running') {
                const progress = (winsA + winsB) / games
                const duration = (Date.now() - start!) / 1000
                const eta = duration / progress - duration

                client.socket.send(JSON.stringify({ message: 'progress', progress, eta }))
            }
        })

        socket.addEventListener("message", async (event) => {
            const data: { message: string, [key: string]: any } = JSON.parse(event.data)

            if(data.message === 'run') {
                if(state !== 'idle') return

                botA = data.botA
                botB = data.botB
                maps = data.maps
                games = data.games
                label = data.label

                winsA = 0
                winsB = 0

                for(const client of clients) {
                    client.state = 'syncing'
                    
                    if(client.socket === socket) continue

                    client.socket.send(JSON.stringify({ message: 'begin' }))
                }

                state = 'syncing'

                console.log(`Waiting on ${clients.length} clients.`)
            } else if(data.message === 'ready') {
                if(state !== 'syncing') return

                client!.state = 'ready'

                const clientToSync = clients.find(client => client.state === 'syncing')
                if(clientToSync) {
                    console.log(`Waiting on ${clients.filter(otherClient => otherClient.state === 'syncing').length} clients.`)

                    syncClient(clientToSync)
                } else {
                    console.log('All clients ready!')

                    startRun()
                }
            } else if(data.message === 'startUpload') {
                if(state !== 'syncing') return

                console.log('Beginning file upload...')
                console.log(`${data.count} files`)
                console.log(`hash: ${data.hash}`)

                fileCount = data.count
                hash = data.hash
                files = {}
            } else if(data.message === 'file') {
                if(state !== 'syncing') return

                console.log(`Received file: ${data.path}`)

                files[data.path] = data.data
            } else if(data.message === 'finishUpload') {
                if(state !== 'syncing') return

                console.log('Finished file upload.')

                const clientToSync = clients.find(client => client.state === 'syncing')
                if(clientToSync) syncClient(clientToSync)
            } else if(data.message === 'result') {
                if(state !== 'running') return
                if(client!.state !== 'running') return
                if(data.id !== client!.runId)

                console.log(`Received result ${data.id}: ${data.winsA}-${data.winsB}`)

                winsA += data.winsA
                winsB += data.winsB

                if(winsA + winsB >= games) {
                    const endTime = Date.now()

                    const duration = endTime - start!

                    console.log('-------- RESULTS --------')

                    const winRate = winsA / (winsA + winsB)
                    const winPercent = Math.round(winsA / (winsA + winsB) * 100)
                    const delta = winPercent - 50
                    const stdError = Math.sqrt(winRate * (1 - winRate) / games)
                    const error = stdError * 1.96
                    const errorPercent = Math.round(error * 100)

                    console.log(`A vs. B   ${winsA}-${winsB}   ${winPercent}%   Δ ${delta}%   ±${errorPercent}% (95%)`)

                    const seconds = Math.round(duration / 1000)

                    console.log(`Run time took ${seconds} seconds   ${Math.floor((winsA + winsB) / seconds * 100) / 100} games/sec`)
                
                    for(const client of clients) {
                        client.socket.send(JSON.stringify({ message: 'complete', winsA, winsB, botA, botB, games, seconds, label }))
                        
                        client.state = 'idle'
                    }
                    
                    state = 'idle'
                } else {
                    const id = randomUUID()

                    client!.socket.send(JSON.stringify({ message: 'runGames', botA, botB, maps, id }))
                    client!.runId = id

                    const progress = (winsA + winsB) / games
                    const duration = (Date.now() - start!) / 1000
                    const eta = duration / progress - duration

                    for(const client of clients) {
                        client.socket.send(JSON.stringify({ message: 'progress', progress, eta }))
                    }
                }
            }
        })

        socket.addEventListener("close", (event) => {
            clients.splice(clients.indexOf(client!), 1)
            
            console.log("A client disconnected!");
            console.log(`[msg->clients]${clients.length}`)
            
            if(state === 'syncing') {
                const clientToSync = clients.find(client => client.state === 'syncing')

                if(clientToSync) {
                    console.log(`Waiting on ${clients.filter(otherClient => otherClient.state === 'syncing').length} clients.`)

                    syncClient(clientToSync)
                } else if(!clients.some(client => client.state === 'ready')) {
                    console.log('All syncing clients disconnected!')

                    state = 'idle'
                } else {
                    console.log('All clients ready!')

                    startRun()
                }
            } else if (state === 'running') {
                if(!clients.some(client => client.state === 'running')) {
                    console.log('All running clients disconnected!')

                    for(client of clients) {
                        console.log(client.state)
                    }

                    state = 'idle'
                }
            }
        })

        return response
    })
}

function syncClient(client: Client) {
    const id = randomUUID()

    client.syncId = id

    setTimeout(() => {
        if(client.state !== 'syncing') return
        if(client.syncId !== id) return

        console.log('Client syncing timed out! Disconnecting...')

        client.socket.close()
    }, 1200000);

    client.socket.send(JSON.stringify({ message: 'startDownload', count: fileCount, hash: hash }))
                    
    for(const [path, data] of Object.entries(files)) {
        client.socket.send(JSON.stringify({ message: 'file', path: path, data: data }))
    }
}

function startRun() {
    state = 'running'

    start = Date.now()

    for(const client of clients) {
        if(client.state !== 'ready') continue

        client.state = 'running'

        const id = randomUUID()

        client.socket.send(JSON.stringify({ message: 'runGames', botA, botB, maps, id }))
        client.runId = id
    }
}

function startIPCServer() {
    const server = Deno.serve({
        port: 0
    }, (req) => {
        return new Response(null, { status: 200 })
    })
}

startNodeServer()
startIPCServer()