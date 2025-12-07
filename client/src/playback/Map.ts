import { flatbuffers, schema } from 'battlecode-schema'
import assert from 'assert'
import { Vector } from './Vector'
import Match from './Match'
import { MapEditorBrush, Symmetry } from '../components/sidebar/map-editor/MapEditorBrush'
import { packVecTable, parseVecTable } from './SchemaHelpers'
import { CheeseMinesBrush, WallsBrush, DirtBrush } from './Brushes'
import { TEAM_COLOR_NAMES } from '../constants'
import * as renderUtils from '../util/RenderUtil'
import { getImageIfLoaded } from '../util/ImageLoader'
import { ClientConfig } from '../client-config'
import { Colors, currentColors, getTeamColors } from '../colors'
import Round from './Round'

export type Dimension = {
    minCorner: Vector
    maxCorner: Vector
    width: number
    height: number
}

type SchemaPacket = {
    wallsOffset: number
    dirtOffset: number
    cheeseMinesOffset: number
}

type ResourcePatternData = {
    teamId: number
    center: Vector
    createRound: number
}

export class CurrentMap {
    public readonly staticMap: StaticMap
    public readonly dirt: Int8Array
    public readonly markers: [Int8Array, Int8Array] // Each team has markers
    public readonly trapData: Int8Array
    public readonly cheeseData: Int8Array
    public readonly resourcePatterns: ResourcePatternData[]

    get width(): number {
        return this.dimension.width
    }
    get height(): number {
        return this.dimension.height
    }
    get dimension(): Dimension {
        return this.staticMap.dimension
    }

    constructor(from: StaticMap | CurrentMap) {
        if (from instanceof StaticMap) {
            // Create current map from static map

            this.staticMap = from
            this.dirt = new Int8Array(from.initialDirt)
            this.markers = [new Int8Array(this.width * this.height), new Int8Array(this.width * this.height)]
            this.resourcePatterns = []
        } else {
            // Create current map from current map (copy)

            this.staticMap = from.staticMap
            this.dirt = new Int8Array(from.dirt)
            this.markers = [new Int8Array(from.markers[0]), new Int8Array(from.markers[1])]

            // Assumes ResourcePatternData is immutable
            this.resourcePatterns = [...from.resourcePatterns]
        }

        this.trapData = new Int8Array(this.width * this.height)
        this.cheeseData = new Int8Array(this.width * this.height)
    }

    indexToLocation(index: number): { x: number; y: number } {
        return this.staticMap.indexToLocation(index)
    }

    locationToIndex(x: number, y: number): number {
        return this.staticMap.locationToIndex(x, y)
    }

    locationToIndexUnchecked(x: number, y: number): number {
        return this.staticMap.locationToIndexUnchecked(x, y)
    }

    applySymmetry(point: Vector): Vector {
        return this.staticMap.applySymmetry(point)
    }

    copy(): CurrentMap {
        return new CurrentMap(this)
    }

    /**
     * Mutates this currentMap to reflect the given round.
     */
    applyRoundDelta(round: Round, delta: schema.Round | null): void {
        // Update resource patterns and remove if they have been broken
        const patternMask = 28873275
        for (let i = 0; i < this.resourcePatterns.length; i++) {
            const srp = this.resourcePatterns[i]
            let patternIdx = 0
            let patternFailed = false
            for (let y = srp.center.y + 2; y >= srp.center.y - 2; y--) {
                for (let x = srp.center.x - 2; x <= srp.center.x + 2; x++) {
                    const idx = this.locationToIndex(x, y)
                    const expectedDirt = ((patternMask >> patternIdx) & 1) + (srp.teamId - 1) * 2 + 1
                    const actualDirt = this.dirt[idx]
                    if (actualDirt !== expectedDirt) {
                        this.resourcePatterns[i] = this.resourcePatterns[this.resourcePatterns.length - 1]
                        this.resourcePatterns.pop()
                        i--
                        patternFailed = true
                        break
                    }
                    patternIdx++
                }

                if (patternFailed) break
            }
        }
    }

    draw(
        match: Match,
        ctx: CanvasRenderingContext2D,
        config: ClientConfig,
        selectedBodyID?: number,
        hoveredTile?: Vector
    ) {
        const dimension = this.dimension
        const teamColors = getTeamColors()
        for (let i = 0; i < dimension.width; i++) {
            for (let j = 0; j < dimension.height; j++) {
                const schemaIdx = this.locationToIndexUnchecked(i, j)
                const coords = renderUtils.getRenderCoords(i, j, dimension)

                // Render rounded (clipped) dirt
                const dirt = this.dirt[schemaIdx]
                if (dirt) {
                    if (config.enableFancyPaint) {
                        renderUtils.renderRounded(
                            ctx,
                            i,
                            j,
                            this,
                            this.dirt,
                            () => {
                                ctx.fillStyle = currentColors[Colors.DIRT_COLOR]
                                ctx.fillRect(coords.x, coords.y, 1.0, 1.0)
                            },
                            { x: true, y: false }
                        )
                    } else {
                        ctx.fillStyle = currentColors[Colors.DIRT_COLOR]
                        ctx.fillRect(coords.x, coords.y, 1.0, 1.0)
                    }
                }

                if (config.showPaintMarkers) {
                    // Scale text by 0.5 because sometimes 0.5px text does not work

                    const markerA = this.markers[0][schemaIdx]
                    if (markerA) {
                        ctx.fillStyle = teamColors[0]
                        const label = markerA === 1 ? '1' : '2' // Primary/secondary
                        ctx.font = '1px monospace'
                        ctx.scale(0.5, 0.5)
                        ctx.fillText(label, (coords.x + 0.05) * 2, (coords.y + 0.95) * 2)
                        ctx.scale(2, 2)
                    }

                    const markerB = this.markers[1][schemaIdx]
                    if (markerB) {
                        ctx.fillStyle = teamColors[1]
                        const label = markerB === 3 ? '1' : '2' // Primary/secondary
                        ctx.font = '1px monospace'
                        ctx.scale(0.5, 0.5)
                        ctx.fillText(label, (coords.x + 0.65) * 2, (coords.y + 0.95) * 2)
                        ctx.scale(2, 2)
                    }
                }
            }
        }

        if (config.showSRPOutlines || config.showSRPText) {
            ctx.globalAlpha = 1
            ctx.lineWidth = 0.05
            this.resourcePatterns.forEach((srp) => {
                const topLeftCoords = renderUtils.getRenderCoords(srp.center.x - 2, srp.center.y + 2, this.dimension)
                const roundsRemaining = Math.max(srp.createRound + 50 - match.currentRound.roundNumber, -1)
                if (roundsRemaining >= 0 && config.showSRPText) {
                    const label = roundsRemaining.toString()
                    ctx.fillStyle = 'white'
                    ctx.textAlign = 'right'
                    ctx.font = '1px monospace'
                    ctx.shadowColor = 'black'
                    ctx.shadowBlur = 4
                    ctx.scale(0.4, 0.4)
                    ctx.fillText(label, (topLeftCoords.x + 3) * 2.5, (topLeftCoords.y + 2.5) * 2.5)
                    ctx.scale(2.5, 2.5)
                    ctx.shadowColor = ''
                    ctx.shadowBlur = 0
                    ctx.textAlign = 'start'
                } else if (roundsRemaining === -1 && config.showSRPOutlines) {
                    ctx.strokeStyle = teamColors[srp.teamId - 1]
                    ctx.strokeRect(topLeftCoords.x, topLeftCoords.y, 5, 5)
                }
            })
        }
    }

    getTooltipInfo(square: Vector, match: Match): string[] {
        // Bounds check
        if (square.x >= this.width || square.y >= this.height) return []

        const schemaIdx = this.locationToIndex(square.x, square.y)

        const dirt = this.dirt[schemaIdx]
        const wall = this.staticMap.walls[schemaIdx]
        const cheeseMine = this.staticMap.cheeseMines.find((r) => r.x === square.x && r.y === square.y)
        const srp = this.resourcePatterns.find((r) => r.center.x === square.x && r.center.y === square.y)
        const markerA = this.markers[0][schemaIdx]
        const markerB = this.markers[1][schemaIdx]

        const info: string[] = []
        // for (let i = 0; i < match.game.teams.length; i++) {
        //     if (paint === i * 2 + 1) {
        //         info.push(`${TEAM_COLOR_NAMES[i]} Paint (Primary)`)
        //     } else if (paint === i * 2 + 2) {
        //         info.push(`${TEAM_COLOR_NAMES[i]} Paint (Secondary)`)
        //     }
        // }
        if (markerA) {
            info.push(`Silver Marker (${markerA === 1 ? 'Primary' : 'Secondary'})`)
        }
        if (markerB) {
            info.push(`Gold Marker (${markerB === 3 ? 'Primary' : 'Secondary'})`)
        }
        if (wall) {
            info.push('Wall')
        }
        if (cheeseMine) {
            info.push('Cheese Mine')
        }
        if (srp) {
            const roundsRemaining = Math.max(srp.createRound + 50 - match.currentRound.roundNumber, 0)
            if (roundsRemaining === 0) {
                info.push(`${TEAM_COLOR_NAMES[srp.teamId - 1]} SRP Center (Active)`)
            } else {
                info.push(`${TEAM_COLOR_NAMES[srp.teamId - 1]} SRP Center (${roundsRemaining} Rounds Left)`)
            }
        }

        return info
    }

    getEditorBrushes(round: Round) {
        const brushes: MapEditorBrush[] = [new DirtBrush(round), new CheeseMinesBrush(round), new WallsBrush(round)]
        return brushes.concat(this.staticMap.getEditorBrushes())
    }

    isEmpty(): boolean {
        return this.dirt.every((x) => x == 0) && this.staticMap.isEmpty()
    }

    /**
     * Creates a packet of flatbuffers data which will later be inserted
     * This and the next function are seperated due to how flatbuffers works
     */
    getSchemaPacket(builder: flatbuffers.Builder): SchemaPacket {
        const wallsOffset = schema.GameMap.createWallsVector(
            builder,
            Array.from(this.staticMap.walls).map((x) => !!x)
        )
        // not sure if this is right
        const dirtOffset = schema.GameMap.createDirtVector(
            builder,
            Array.from(this.staticMap.initialDirt).map((x) => !!x)
        )
        const cheeseMinesOffset = packVecTable(builder, this.staticMap.cheeseMines)

        return {
            wallsOffset,
            dirtOffset,
            cheeseMinesOffset
        }
    }

    /**
     * Inserts an existing packet of flatbuffers data into the given builder
     * This and the previous function are seperated due to how flatbuffers works
     */
    insertSchemaPacket(builder: flatbuffers.Builder, packet: SchemaPacket) {
        schema.GameMap.addWalls(builder, packet.wallsOffset)
        schema.GameMap.addDirt(builder, packet.dirtOffset)
        schema.GameMap.addCheeseMines(builder, packet.cheeseMinesOffset)
    }
}

export class StaticMap {
    constructor(
        public name: string,
        public readonly randomSeed: number, // I dont know what this is for
        public readonly symmetry: number,
        public readonly dimension: Dimension,
        public readonly walls: Int8Array,
        public readonly cheeseMines: Vector[],
        public readonly initialDirt: Int8Array,
        public readonly catWaypoints: Map<number, Vector[]>
    ) {
        if (symmetry < 0 || symmetry > 2 || !Number.isInteger(symmetry)) {
            throw new Error(`Invalid symmetry ${symmetry}`)
        }

        if (walls.length != dimension.width * dimension.height) {
            throw new Error('Invalid walls length')
        }
        if (initialDirt.length != dimension.width * dimension.height) {
            throw new Error('Invalid dirt length')
        }

        if (walls.some((x) => x !== 0 && x !== 1)) {
            throw new Error('Invalid walls value')
        }
        if (initialDirt.some((x) => x !== 0 && x !== 1)) {
            throw new Error('Invalid dirt value')
        }
    }

    static fromSchema(schemaMap: schema.GameMap) {
        const name = schemaMap.name() as string
        const randomSeed = schemaMap.randomSeed()
        const symmetry = schemaMap.symmetry()

        const size = schemaMap.size() ?? assert.fail('Map size() is missing')
        const minCorner = { x: 0, y: 0 }
        const maxCorner = { x: size.x(), y: size.y() }
        const dimension = {
            minCorner,
            maxCorner,
            width: maxCorner.x - minCorner.x,
            height: maxCorner.y - minCorner.y
        }

        const walls = schemaMap.wallsArray() ?? assert.fail('wallsArray() is null')
        const cheeseMines = parseVecTable(schemaMap.cheeseMines() ?? assert.fail('cheeseMines() is null'))
        const initialDirt = schemaMap.dirtArray() ?? assert.fail('dirtArray() is null')
        const catWaypointIds = schemaMap.catWaypointIdsArray() ?? assert.fail('catWaypointIdsArray() is null')
        const catWaypoints = new Map<number, Vector[]>()
        catWaypointIds.forEach((id, idx) => {
            catWaypoints.set(
                id,
                parseVecTable(schemaMap.catWaypointVecs(idx) ?? assert.fail(`catWaypointVecs(${idx}) is null`))
            )
        })

        return new StaticMap(name, randomSeed, symmetry, dimension, walls, cheeseMines, initialDirt, catWaypoints)
    }

    static fromParams(width: number, height: number, symmetry: Symmetry) {
        const name = 'Custom Map'
        const randomSeed = 0

        const minCorner = { x: 0, y: 0 }
        const maxCorner = { x: width, y: height }
        const dimension = {
            minCorner,
            maxCorner,
            width: maxCorner.x - minCorner.x,
            height: maxCorner.y - minCorner.y
        }

        const walls = new Int8Array(width * height)
        const cheeseMines: Vector[] = []
        const initialDirt = new Int8Array(width * height)
        const catWaypoints = new Map<number, Vector[]>()
        return new StaticMap(name, randomSeed, symmetry, dimension, walls, cheeseMines, initialDirt, catWaypoints)
    }

    get width(): number {
        return this.dimension.width
    }
    get height(): number {
        return this.dimension.height
    }

    indexToLocation(index: number): { x: number; y: number } {
        const x = index % this.width
        const y = (index - x) / this.width
        assert(x >= 0 && x < this.width, `x=${x} out of bounds for indexToLocation`)
        assert(y >= 0 && y < this.height, `y=${y} out of bounds for indexToLocation`)
        return { x, y }
    }

    locationToIndex(x: number, y: number): number {
        assert(x >= 0 && x < this.width, `x ${x} out of bounds`)
        assert(y >= 0 && y < this.height, `y ${y} out of bounds`)
        return Math.floor(y) * this.width + Math.floor(x)
    }

    locationToIndexUnchecked(x: number, y: number): number {
        return y * this.width + x
    }

    /**
     * Returns a point representing the reflection of the given point following the map's symmetry.
     */
    applySymmetry(point: Vector): Vector {
        switch (this.symmetry) {
            case Symmetry.VERTICAL:
                return { x: this.width - point.x - 1, y: point.y }
            case Symmetry.HORIZONTAL:
                return { x: point.x, y: this.height - point.y - 1 }
            case Symmetry.ROTATIONAL:
                return { x: this.width - point.x - 1, y: this.height - point.y - 1 }
            default:
                throw new Error(`Invalid symmetry ${this.symmetry}`)
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        // Fill background
        ctx.fillStyle = currentColors[Colors.TILE_COLOR]
        ctx.fillRect(
            this.dimension.minCorner.x,
            this.dimension.minCorner.y,
            this.dimension.width,
            this.dimension.height
        )

        const dirtImg = getImageIfLoaded('dirty.png')
        if (dirtImg) {
            ctx.drawImage(
                dirtImg,
                this.dimension.minCorner.x,
                this.dimension.minCorner.y,
                this.dimension.width,
                this.dimension.height
            )
        }

        for (let i = 0; i < this.dimension.width; i++) {
            for (let j = 0; j < this.dimension.height; j++) {
                const schemaIdx = this.locationToIndexUnchecked(i, j)
                const coords = renderUtils.getRenderCoords(i, j, this.dimension)

                // Render rounded (clipped) wall
                if (this.walls[schemaIdx]) {
                    renderUtils.renderRounded(ctx, i, j, this, this.walls, () => {
                        ctx.fillStyle = currentColors[Colors.WALLS_COLOR]
                        ctx.fillRect(coords.x, coords.y, 1.0, 1.0)
                    })
                }

                if (this.initialDirt[schemaIdx]) {
                    renderUtils.renderRounded(ctx, i, j, this, this.initialDirt, () => {
                        ctx.fillStyle = currentColors[Colors.DIRT_COLOR]
                        ctx.fillRect(coords.x, coords.y, 1.0, 1.0)
                    })
                }

                // Draw grid
                const showGrid = true
                if (showGrid) {
                    const thickness = 0.02
                    renderUtils.applyStyles(
                        ctx,
                        { strokeStyle: 'black', lineWidth: thickness, globalAlpha: 0.1 },
                        () => {
                            ctx.strokeRect(
                                coords.x + thickness / 2,
                                coords.y + thickness / 2,
                                1 - thickness,
                                1 - thickness
                            )
                        }
                    )
                }
            }
        }

        // Render cheese mines
        this.cheeseMines.forEach(({ x, y }) => {
            const coords = renderUtils.getRenderCoords(x, y, this.dimension)

            const imgPath = `cheese_mine.png`
            const cheeseMineImage = getImageIfLoaded(imgPath)
            renderUtils.renderCenteredImageOrLoadingIndicator(ctx, cheeseMineImage, coords, 1.0)
        })
    }

    isEmpty(): boolean {
        return this.walls.every((x) => x == 0) && this.cheeseMines.length == 0
    }

    getEditorBrushes(): MapEditorBrush[] {
        return []
    }
}
