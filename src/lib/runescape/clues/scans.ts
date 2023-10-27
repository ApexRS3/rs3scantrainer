import {MapCoordinate, MapRectangle} from "../coordinates";
import {rangeRight} from "lodash";
import {util} from "../../util/util";
import {Rectangle, Vector2} from "lib/math/Vector";

export namespace Scans {

    export function get_pulse(spot: MapCoordinate, tile: MapCoordinate, range: number): Pulse {
        let d = distance(spot, tile)

        let p = 3 - Math.min(2, Math.floor(Math.max(0, (d - 1)) / range)) as 1 | 2 | 3

        if (p > 3) console.log("PANIC")

        let different_level = spot.level != tile.level || distance(complementSpot(spot), tile) <= range + 15

        return {
            pulse: p,
            different_level: different_level
        }
    }

    function distance(a: Vector2, b: Vector2): number {
        return Vector2.max_axis(Vector2.sub(a, b))
    }

    export function area_pulse(spot: MapCoordinate, area: MapRectangle, range: number): Pulse[] {
        let pulses: Pulse[]

        let max = get_pulse(spot, MapRectangle.clampInto(spot, area), range).pulse

        // This breaks if areas are so large they cover both cases. But in that case: Wtf are you doing?
        if (max == 1) {
            pulses = []

            let complement_spot = complementSpot(spot)

            if (spot.level != area.level || distance(complement_spot, Rectangle.clampInto(complement_spot, area)) <= (range + 15)) {
                // Any tile in area triggers different level
                pulses.push({
                    pulse: 1,
                    different_level: true
                })
            }

            if ((distance(complement_spot, area.topleft) > (range + 15)
                    || distance(complement_spot, area.botright) > (range + 15))
                && spot.level == area.level
            ) { // Any tile in area does not trigger different level
                pulses.push({
                    pulse: 1,
                    different_level: false
                })
            }
        } else {
            let min = Math.min(
                get_pulse(spot, MapRectangle.tl(area), range).pulse,
                get_pulse(spot, MapRectangle.br(area), range).pulse,
            )

            pulses = rangeRight(min, max + 1, 1).map((p: 1 | 2 | 3) => {
                return {
                    pulse: p,
                    different_level: spot.level != area.level
                }
            })
        }

        return pulses
    }

    export type Pulse = {
        pulse: 1 | 2 | 3,
        different_level: boolean
    }

    export namespace Pulse {
        import natural_order = util.Order.natural_order;
        export type hash_t = 0 | 1 | 2 | 3 | 4 | 5

        export function hash(pulse: Pulse): hash_t {
            return (pulse.pulse - 1) + (pulse.different_level ? 3 : 0) as hash_t
        }

        export function unhash(hash: hash_t): Pulse {
            return {
                pulse: (hash % 3) + 1 as 1 | 2 | 3,
                different_level: hash >= 3
            }
        }

        export function equals(a: Pulse, b: Pulse): boolean {
            return a.pulse == b.pulse && a.different_level == b.different_level
        }

        export let all: Pulse[] = [
            // CAREFUL: This is sorted by the hash of the pulse (0 to 5), and MUST stay this way to not break some optimized code!
            {pulse: 1, different_level: false},
            {pulse: 2, different_level: false},
            {pulse: 3, different_level: false},
            {pulse: 1, different_level: true},
            {pulse: 2, different_level: true},
            {pulse: 3, different_level: true},
        ]

        type meta = {
            pretty: string,
            short: string,
            shorted: string
        }

        export function meta(type: Pulse): meta {
            let pretty = ["Single", "Double", "Triple"][type.pulse - 1]

            // TODO: Clean this pos up

            if (type.different_level) {
                return {
                    pretty: type.pulse == 1 ? "Different Level" : pretty + " (DL)",
                    short: type.pulse == 1 ? "DL" : "DL" + type.pulse,
                    shorted: type.pulse == 1 ? "\"DL\"" : "\"DL\"" + type.pulse
                }
            } else {
                return {
                    pretty: pretty,
                    short: type.pulse.toString(),
                    shorted: type.pulse.toString()
                }
            }
        }

        export function pretty_with_context(type: Pulse, context: Pulse[]): string {
            let pretty = ["Single", "Double", "Triple"][type.pulse - 1]

            // Use the full word when it's not "different level"
            if (!type.different_level) {
                if (util.count(context, (p => p.different_level)) == context.length - 1) return "Too far" // Is the only non-different level
                else return pretty
            } else {
                let counterpart_exists = context.some(p => p.pulse == type.pulse && !p.different_level)

                if (!counterpart_exists) return pretty // If the non-different level counterpart does not exist, just use the pretty string

                if (util.count(context, (p => p.different_level)) == 1) return "Different level" // Is the only different level
                else return `Different Level (${pretty})`
            }
        }

        export function compare(a: Pulse, b: Pulse): number {
            return natural_order(hash(a), hash(b))
        }
    }

    export function complementSpot(spot: MapCoordinate) {
        return {
            x: spot.x,
            y: (spot.y + 6400) % 12800,
            level: spot.level
        }
    }
}