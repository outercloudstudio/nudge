import Round from './Round'
import { schema } from 'battlecode-schema'
import { unionToAction } from 'battlecode-schema/js/battlecode/schema/action'
import assert, { match } from 'assert'
import * as renderUtils from '../util/RenderUtil'
import { vectorAdd, vectorLength, vectorMultiply, vectorSub, vectorMultiplyInPlace, Vector } from './Vector'
import Match from './Match'
import { getImageIfLoaded } from '../util/ImageLoader'
import { Colors } from '../colors'

type ActionUnion = Exclude<ReturnType<typeof unionToAction>, null>

export default class Actions {
    actions: Action<ActionUnion>[] = []

    constructor() {}

    applyTurnDelta(round: Round, turn: schema.Turn): void {
        const robotId = turn.robotId()

        if (turn.actionsLength() > 0) {
            for (let i = 0; i < turn.actionsTypeLength(); i++) {
                const actionType = turn.actionsType(i)!
                const action =
                    unionToAction(actionType, (obj) => turn.actions(i, obj)) ??
                    assert.fail(`Failed to parse action ${i} with type ${actionType} on round ${round.roundNumber}`)

                // TODO: think about revisiting this
                const actionClass =
                    ACTION_DEFINITIONS[actionType] ??
                    assert.fail(`Action ${actionType} not found in ACTION_DEFINITIONS`)
                const newAction = new actionClass(robotId, action)

                this.actions.push(newAction)
                newAction.apply(round)
            }
        }
    }

    tickLifetimes(round: Round): void {
        // Tick lifetimes of applied actions
        for (let i = 0; i < this.actions.length; i++) {
            this.actions[i].duration--
            if (this.actions[i].duration == 0) {
                // If action render order matters, use this (slower)
                //this.actions.splice(i, 1)

                // Otherwise, this is faster
                this.actions[i] = this.actions[this.actions.length - 1]
                this.actions[i].finish(round)
                this.actions.pop()

                i--
            }
        }
    }

    copy(): Actions {
        const newActions = new Actions()
        newActions.actions = this.actions.map((action) => action.copy())
        return newActions
    }

    draw(match: Match, ctx: CanvasRenderingContext2D) {
        for (const action of this.actions) {
            action.draw(match, ctx)
        }
    }
}

export class Action<T extends ActionUnion> {
    constructor(
        protected robotId: number,
        protected actionData: T,
        public duration: number = 1
    ) {}

    /**
     * Applies this action to the round provided. If stat is provided, it will be mutated to reflect the action as well
     *
     * @param round the round to apply this action to
     * @param stat if provided, this action will mutate the stat to reflect the action
     */
    apply(round: Round): void {}

    draw(match: Match, ctx: CanvasRenderingContext2D) {}

    finish(round: Round): void {}

    copy(): Action<T> {
        // creates a new object using this object's prototype and all its parameters. this is a shallow copy, override this if you need a deep copy
        return Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this))
    }
}

export const ACTION_DEFINITIONS: Record<schema.Action, typeof Action<ActionUnion>> = {
    [schema.Action.NONE]: class NONE extends Action<ActionUnion> {
        apply(round: Round): void {
            throw new Error("yoo what !?! this shouldn't happen! :( (NONE action)")
        }
    },
    [schema.Action.CatFeed]: class CatFeedAction extends Action<schema.CatFeed> {
        draw(match: Match, ctx: CanvasRenderingContext2D): void {
            // chomping animation
            const src = match.currentRound.bodies.getById(this.robotId) // cat
            // const target = match.currentRound.bodies.getById(this.actionData.id()) // rat being eaten
            const coords = renderUtils.getRenderCoords(src.pos.x, src.pos.y, match.map.dimension, true)
            const random1 = ((src.pos.x * 491 + src.pos.y * 603 + match.currentRound.roundNumber * 343) / 100) % 1 // https://xkcd.com/221/
            const random2 = ((src.pos.x * 259 + src.pos.y * 429 + match.currentRound.roundNumber * 224) / 100) % 1
            const interpolationFactor = match.getInterpolationFactor()

            ctx.save()
            ctx.globalAlpha = 0.5 - 0.5 * interpolationFactor * interpolationFactor
            ctx.fillStyle = '#000000'
            ctx.font = '0.4px Arial'
            // parabolic trajectory.
            const fontX = coords.x + (4 * random1 - 2) * interpolationFactor - 0.5
            const fontY =
                coords.y - (2 + 4 * random2) * interpolationFactor + 8 * interpolationFactor * interpolationFactor - 0.5
            ctx.fillText('nom', fontX, fontY)
            src.imgPath = 'robots/cat/cat_feed.png' // is reset in `finish`.
            ctx.restore()
        }

        finish(round: Round): void {
            const src = round.bodies.getById(this.robotId)
            src.imgPath = 'robots/cat/cat.png'
        }
    },
    [schema.Action.RatAttack]: class AttackAction extends Action<schema.RatAttack> {
        draw(match: Match, ctx: CanvasRenderingContext2D): void {
            const srcBody = match.currentRound.bodies.getById(this.robotId)
            const dstBody = match.currentRound.bodies.getById(this.actionData.id())

            const from = srcBody.getInterpolatedCoords(match)
            const to = dstBody.getInterpolatedCoords(match)

            // Compute the start and end points for the animation projectile
            const dir = vectorSub(to, from)
            const len = vectorLength(dir)
            vectorMultiplyInPlace(dir, 1 / len)
            const projectileStart = vectorAdd(from, vectorMultiply(dir, len * match.getInterpolationFactor()))
            const projectileEnd = vectorAdd(
                from,
                vectorMultiply(dir, len * Math.min(match.getInterpolationFactor() + 0.2, 1.0))
            )

            // True direction
            renderUtils.renderLine(
                ctx,
                renderUtils.getRenderCoords(from.x, from.y, match.currentRound.map.staticMap.dimension),
                renderUtils.getRenderCoords(to.x, to.y, match.currentRound.map.staticMap.dimension),
                {
                    teamForOffset: srcBody.team,
                    color: srcBody.team.color,
                    lineWidth: 0.06,
                    opacity: 0.5,
                    renderArrow: false
                }
            )

            // Projectile animation
            renderUtils.renderLine(
                ctx,
                renderUtils.getRenderCoords(
                    projectileStart.x,
                    projectileStart.y,
                    match.currentRound.map.staticMap.dimension
                ),
                renderUtils.getRenderCoords(
                    projectileEnd.x,
                    projectileEnd.y,
                    match.currentRound.map.staticMap.dimension
                ),
                {
                    teamForOffset: srcBody.team,
                    color: srcBody.team.color,
                    lineWidth: 0.06,
                    opacity: 1.0,
                    renderArrow: false
                }
            )
        }
    },
    [schema.Action.RatNap]: class RatNapAction extends Action<schema.RatNap> {
        apply(round: Round): void {
            // move the target onto the source adjust target's size using scale factor
            const src = round.bodies.getById(this.robotId)
            const target = round.bodies.getById(this.actionData.id()) // rat getting napped
        }
        draw(match: Match, ctx: CanvasRenderingContext2D): void {
            //target rat moves onto src rat, circle around carried group thing
            const src = match.currentRound.bodies.getById(this.robotId)
            const target = match.currentRound.bodies.getById(this.actionData.id()) // rat getting napped
        }
    },
    [schema.Action.RatCollision]: class RatCollisionAction extends Action<schema.RatCollision> {
        draw(match: Match, ctx: CanvasRenderingContext2D): void {
            // animation for colliding time (rubble or something)
            const src = match.currentRound.bodies.getById(this.robotId)
            const pos = match.map.indexToLocation(this.actionData.loc())
            const coords = renderUtils.getRenderCoords(pos.x, pos.y, match.map.dimension, true)
        }
    },
    [schema.Action.PlaceDirt]: class PlaceDirtAction extends Action<schema.PlaceDirt> {
        apply(round: Round): void {
            // make dirt boolean
            round.map.dirt[this.actionData.loc()] = 1
        }
        draw(match: Match, ctx: CanvasRenderingContext2D): void {
            const body = match.currentRound.bodies.getById(this.robotId)
            const pos = body.getInterpolatedCoords(match)

            const target = match.map.indexToLocation(this.actionData.loc())
            renderUtils.renderLine(
                ctx,
                renderUtils.getRenderCoords(pos.x, pos.y, match.currentRound.map.staticMap.dimension),
                renderUtils.getRenderCoords(target.x, target.y, match.currentRound.map.staticMap.dimension),
                {
                    color: Colors.DIRT_COLOR.get(),
                    lineWidth: 0.04,
                    opacity: 0.4
                }
            )
        }
    },
    [schema.Action.BreakDirt]: class BreakDirtAction extends Action<schema.BreakDirt> {
        apply(round: Round): void {
            // remove the dirt
            const pos = round.map.indexToLocation(this.actionData.loc())

            round.map.dirt[this.actionData.loc()] = 0
        }
        draw(match: Match, ctx: CanvasRenderingContext2D): void {
            // dirt breaking animation
            const pos = match.map.indexToLocation(this.actionData.loc())
            const coords = renderUtils.getRenderCoords(pos.x, pos.y, match.map.dimension, true)
        }
    },
    [schema.Action.CheesePickup]: class CheesePickupAction extends Action<schema.CheesePickup> {
        apply(round: Round): void {
            // remove cheese from map and increment body cheese count
            const body = round.bodies.getById(this.robotId)
            const pos = round.map.indexToLocation(this.actionData.loc())

            const amt = round.map.cheeseData[this.actionData.loc()]
        }
        draw(match: Match, ctx: CanvasRenderingContext2D): void {
            // cheese pickup animation
            const body = match.currentRound.bodies.getById(this.robotId)
            const pos = match.map.indexToLocation(this.actionData.loc())
            const coords = renderUtils.getRenderCoords(pos.x, pos.y, match.map.dimension, true)
        }
    },
    [schema.Action.CheeseSpawn]: class CheeseSpawnAction extends Action<schema.CheeseSpawn> {
        apply(round: Round): void {
            // add cheese to map
            const body = round.bodies.getById(this.robotId)
            const pos = round.map.indexToLocation(this.actionData.loc())
            const amount = this.actionData.amount()

            round.map.cheeseData[this.actionData.loc()] = amount
        }
    },
    [schema.Action.CheeseTransfer]: class CheeseTransferAction extends Action<schema.CheeseTransfer> {
        apply(round: Round): void {
            // transfer cheese between bots
        }
    },
    [schema.Action.CatScratch]: class CatScratchAction extends Action<schema.CatScratch> {
        draw(match: Match, ctx: CanvasRenderingContext2D): void {
            // cat scratching animation

            const body = match.currentRound.bodies.getById(this.robotId)
            const pos = match.map.indexToLocation(this.actionData.loc())
            const coords = renderUtils.getRenderCoords(pos.x, pos.y, match.map.dimension, true)
            const reflected = body.pos.x < pos.x

            const interpolationFactor = match.getInterpolationFactor()
            ctx.strokeStyle = body.team.color
            ctx.globalAlpha = 0.3
            ctx.fillStyle = body.team.color
            ctx.beginPath()
            if (reflected) {
                ctx.arc(coords.x, coords.y, 0.5, -1 - 2 * interpolationFactor, -2 * interpolationFactor)
                ctx.arc(coords.x - 0.1, coords.y + 0.1, 0.5, -1 - 2 * interpolationFactor, -2 * interpolationFactor)
                ctx.arc(coords.x + 0.1, coords.y - 0.1, 0.5, -1 - 2 * interpolationFactor, -2 * interpolationFactor)
            } else {
                ctx.arc(coords.x, coords.y, 0.5, 2 * interpolationFactor, 1 + 2 * interpolationFactor)
                ctx.arc(coords.x + 0.1, coords.y + 0.1, 0.5, 2 * interpolationFactor, 1 + 2 * interpolationFactor)
                ctx.arc(coords.x - 0.1, coords.y - 0.1, 0.5, 2 * interpolationFactor, 1 + 2 * interpolationFactor)
            }
            ctx.stroke()
            ctx.globalAlpha = 1
        }
    },
    [schema.Action.CatPounce]: class CatPounceAction extends Action<schema.CatPounce> {
        apply(round: Round): void {
            // maybe move cat to target loc
            const body = round.bodies.getById(this.robotId)
            const startPos = round.map.indexToLocation(this.actionData.startLoc())
            const endPos = round.map.indexToLocation(this.actionData.endLoc())
        }
        draw(match: Match, ctx: CanvasRenderingContext2D): void {
            // cat pouncing animation
            const body = match.currentRound.bodies.getById(this.robotId)
            const startPos = match.map.indexToLocation(this.actionData.startLoc())
            const endPos = match.map.indexToLocation(this.actionData.endLoc())
            const startCoords = renderUtils.getRenderCoords(startPos.x, startPos.y, match.map.dimension, true)
            const endCoords = renderUtils.getRenderCoords(endPos.x, endPos.y, match.map.dimension, true)
        }
    },
    [schema.Action.PlaceTrap]: class PlaceTrapAction extends Action<schema.PlaceTrap> {
        apply(round: Round): void {
            // add a trap to map
            const body = round.bodies.getById(this.robotId)
            const pos = round.map.indexToLocation(this.actionData.loc())
            const teamId = body.team.id // there is also the `team` attribute of the action, but it seems to be unnecessary.

            round.map.trapData[this.actionData.loc()] = 1 + body.team.id // 1 for team 0, 2 for team 1
        }
    },
    [schema.Action.TriggerTrap]: class TriggerTrapAction extends Action<schema.TriggerTrap> {
        apply(round: Round): void {
            // remove trap from map
            const body = round.bodies.getById(this.robotId)
            const pos = round.map.indexToLocation(this.actionData.loc())
            const teamId = body.team.id // there is also the `team` attribute of the action, but it seems to be unnecessary.

            round.map.trapData[this.actionData.loc()] = 0 // remove trap
        }
        draw(match: Match, ctx: CanvasRenderingContext2D): void {
            // trap triggering animation
            const body = match.currentRound.bodies.getById(this.robotId)
            const pos = match.map.indexToLocation(this.actionData.loc())
            const coords = renderUtils.getRenderCoords(pos.x, pos.y, match.map.dimension, true)
            const teamId = body.team.id

            ctx.strokeStyle = body.team.color
            ctx.globalAlpha = 0.3
            ctx.fillStyle = body.team.color
            ctx.beginPath()
            ctx.arc(coords.x, coords.y - 0.25, 0.5, Math.PI, (1 + 0.5 * match.getInterpolationFactor()) * Math.PI)
            ctx.arc(coords.x, coords.y - 0.25, 0.5, 0, 0.5 * match.getInterpolationFactor() * Math.PI, true)
            ctx.fill()
            ctx.stroke()
            ctx.globalAlpha = 1
        }
    },
    [schema.Action.ThrowRat]: class ThrowRatAction extends Action<schema.ThrowRat> {
        // TODO
    },
    [schema.Action.UpgradeToRatKing]: class UpgradeToRatKingAction extends Action<schema.UpgradeToRatKing> {
        // TODO
    },
    [schema.Action.RatSqueak]: class RatSqueakAction extends Action<schema.RatSqueak> {
        // TODO
    },
    [schema.Action.DamageAction]: class DamageAction extends Action<schema.DamageAction> {
        apply(round: Round): void {
            const src = round.bodies.getById(this.robotId)
            const target = round.bodies.getById(this.actionData.id())

            const damage = this.actionData.damage()
            target.hp = Math.max(target.hp - damage, 0)
        }
    },
    [schema.Action.SpawnAction]: class SpawnAction extends Action<schema.SpawnAction> {
        apply(round: Round): void {
            round.bodies.spawnBodyFromAction(this.actionData)
        }
    },
    [schema.Action.DieAction]: class DieAction extends Action<schema.DieAction> {
        apply(round: Round): void {
            if (this.actionData.dieType() === schema.DieType.EXCEPTION) {
                // TODO: revisit this
                console.log(`Robot ${this.robotId} has died due to an exception`)
            }

            round.bodies.markBodyAsDead(this.actionData.id())
        }
    },
    [schema.Action.IndicatorStringAction]: class IndicatorStringAction extends Action<schema.IndicatorStringAction> {
        apply(round: Round): void {
            const body = round.bodies.getById(this.robotId)
            const string = this.actionData.value()!
            body.indicatorString = string
        }
    },
    [schema.Action.IndicatorDotAction]: class IndicatorDotAction extends Action<schema.IndicatorDotAction> {
        apply(round: Round): void {
            const loc = this.actionData.loc()
            const vectorLoc = round.map.indexToLocation(loc)

            const body = round.bodies.getById(this.robotId)
            body.indicatorDots.push({
                location: vectorLoc,
                color: renderUtils.colorToHexString(this.actionData.colorHex())
            })
        }
    },
    [schema.Action.IndicatorLineAction]: class IndicatorLineAction extends Action<schema.IndicatorLineAction> {
        apply(round: Round): void {
            const starts = round.map.indexToLocation(this.actionData.startLoc())
            const ends = round.map.indexToLocation(this.actionData.endLoc())

            const body = round.bodies.getById(this.robotId)
            body.indicatorLines.push({
                start: starts,
                end: ends,
                color: renderUtils.colorToHexString(this.actionData.colorHex())
            })
        }
    }
}
