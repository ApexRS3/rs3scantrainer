import {MapCoordinate, MapRectangle} from "lib/runescape/coordinates";
import {Path} from "lib/runescape/pathing";
import {Vector2} from "lib/math/Vector";
import {Scans} from "lib/runescape/clues/scans";
import * as lodash from "lodash";
import {Clues, ScanStep} from "../../runescape/clues";

export namespace ScanTree {
    import Pulse = Scans.Pulse;

    import movement_state = Path.movement_state;

    import area_pulse = Scans.area_pulse;
    import digSpotArea = Clues.digSpotArea;

    export type ScanRegion = {
        name: string
        area: MapRectangle
    }

    export type ScanTree = {
        spot_ordering: MapCoordinate[],
        assumes_meerkats: boolean,
        root: decision_tree
    }

    export type TreeWithClue = ScanTree & {
        clue: ScanStep
    }

    export type PulseInformation = Scans.Pulse & ({
        pulse: 3
        spot?: MapCoordinate
    } | { pulse: 1 | 2 })

    namespace PulseInformation {

        export function equals(a: PulseInformation, b: PulseInformation): boolean {
            return Pulse.equals(a, b) && !(a.pulse == 3 && (b.pulse == 3) && !MapCoordinate.eq2(a?.spot, b.spot))
        }
    }

    export type decision_tree = {
        path: Path.step[],
        region?: ScanRegion,
        directions: string,
        children: {
            key: PulseInformation,
            value: decision_tree
        }[]
    }

    export type completeness_t = "complete" | "incomplete_children" | "incomplete"
    export type correctness_t = "correct" | "correct_with_warnings" | "error" | "error_in_children"

    export function completeness_meta(completeness: ScanTree.completeness_t | ScanTree.correctness_t): { char: string, cls: string, desc: string } {
        let meta: Record<ScanTree.completeness_t | ScanTree.correctness_t, { char: string, cls: string, desc: string }> = {
            complete: {char: "\u2713", cls: "ctr-correct", desc: "This branch is complete."},
            correct: {char: "\u2713", cls: "ctr-correct", desc: "All paths are correct."},
            correct_with_warnings: {char: "\u2713", cls: "ctr-semicorrect", desc: "All paths are correct, but some have warnings."},
            error: {char: "\u2715", cls: "ctr-incorrect", desc: "There is an error in this path."},
            error_in_children: {char: "\u2715", cls: "ctr-semiincorrect", desc: "A child path has errors."},
            incomplete: {char: "?", cls: "ctr-incorrect", desc: "This branch is incomplete."},
            incomplete_children: {char: "?", cls: "ctr-semiincorrect", desc: "Branch has incomplete children."}
        }

        return meta[completeness]
    }

    export type augmented_decision_tree = {
        raw: decision_tree,
        raw_root: ScanTree,
        root: augmented_decision_tree,
        parent: {
            key: PulseInformation
            node: augmented_decision_tree,
        } | null,
        region?: ScanRegion,
        path: Path.augmented,
        depth: number,
        remaining_candidates: MapCoordinate[],
        information: ScanInformation[],
        children: {
            key: Scans.Pulse,
            value: augmented_decision_tree
        }[],
        completeness?: completeness_t,
        correctness?: correctness_t,
    }

    export namespace augmented {
        export function collect_parents(node: augmented_decision_tree, include_node: boolean = true): augmented_decision_tree[] {
            if (!node) return []

            let par = collect_parents(node.parent?.node, true)

            if (include_node) par.push(node)

            return par
        }

        export function traverse(tree: augmented_decision_tree, f: (_: augmented_decision_tree) => any, include_root: boolean = true): void {
            if (include_root && tree) f(tree)

            tree.children.forEach(c => traverse(c.value, f, true))
        }
    }

    export function traverse(tree: decision_tree, f: (_: decision_tree) => void): void {
        if (tree) f(tree)

        tree.children.forEach(c => traverse(c.value, f))
    }

    export namespace augmented_decision_tree {
        export function traverse(node: augmented_decision_tree, f: (_: augmented_decision_tree) => void) {
            f(node)

            node.children.forEach(c => traverse(c.value, f))
        }

        export function traverse_parents(node: augmented_decision_tree, f: (_: augmented_decision_tree) => void): void {
            if (node.parent == null) return

            f(node.parent.node)
            traverse_parents(node.parent.node, f)
        }
    }

    export function init_leaf(): decision_tree {
        return {
            children: [],
            directions: "Missing directions",
            path: [],
        }
    }

    export async function normalize(tree: TreeWithClue): Promise<TreeWithClue> {
        async function helper(node: decision_tree, candidates: MapCoordinate[], pre_state: Path.movement_state): Promise<void> {

            let region = node.region

            let augmented_path = await Path.augment(node.path, pre_state, candidates.length == 1 ? digSpotArea(candidates[0]) : region?.area)

            let area = region?.area ||
                MapRectangle.fromTile(augmented_path.post_state?.position?.tile)

            // Update children to remove all dead branches and add missing branches
            let pruned_children: {
                child: {
                    key: PulseInformation,
                    value: decision_tree
                },
                candidates: MapCoordinate[]
            }[] = (!area) ? []
                : spot_narrowing(candidates, area, assumedRange(tree))
                    .filter(n => n.narrowed_candidates.length > 0)
                    .map(({pulse, narrowed_candidates}) => {
                        return {
                            child: node.children.find(c => PulseInformation.equals(pulse, c.key)) || {
                                key: pulse,
                                value: init_leaf()
                            },
                            candidates: narrowed_candidates
                        }
                    })

            // When there is only one child, the current position produces no information at all
            // So there is no point in adding children, which is why they are removed by this statement
            if (pruned_children.length == 1) pruned_children = []

            node.children = pruned_children.map(c => c.child)

            pruned_children.forEach(({child, candidates}) => {
                // Propagate state recursively
                let cloned_state = augmented_path.post_state
                cloned_state.tick += 1 // Assume 1 tick reaction time between steps. Approximation, but may help to make timings and cooldowns more realistic

                helper(child.value, candidates, cloned_state)
            })
        }

        if (!tree.root) tree.root = init_leaf()

        await helper(tree.root, tree.clue.solution.candidates, Path.movement_state.start())

        return tree
    }

    export function assumedRange(tree: TreeWithClue): number {
        let r = tree.clue.range
        if (tree.assumes_meerkats) r += 5;
        return r
    }

    export function spotNumber(self: ScanTree.ScanTree, spot: MapCoordinate): number {
        return self.spot_ordering.findIndex((s) => Vector2.eq(s, spot)) + 1
    }

    export function analyze_correctness(tree: augmented_decision_tree): augmented_decision_tree {
        tree.children.forEach(c => analyze_correctness(c.value))

        let cs = tree.children.map(c => c.value)

        let issues = Path.collect_issues(tree.path)

        if (issues.some(i => i.level == 0)) tree.correctness = "error"
        else if (cs.some(c => c.correctness == "error" || c.correctness == "error_in_children")) tree.correctness = "error_in_children"
        else if (issues.some(i => i.level == 1) || cs.some(c => c.correctness == "correct_with_warnings")) tree.correctness = "correct_with_warnings"
        else tree.correctness = "correct"

        if (tree.remaining_candidates.length > 1 && cs.length == 0) tree.completeness = "incomplete"
        else if (cs.some(c => c.completeness == "incomplete" || c.completeness == "incomplete_children")) tree.completeness = "incomplete_children"
        else tree.completeness = "complete"

        return tree
    }

    export async function augment(tree: TreeWithClue, options: {
        analyze_completeness?: boolean
    } = {}): Promise<augmented_decision_tree> {
        async function helper(
            node: decision_tree,
            parent: { node: augmented_decision_tree, key: PulseInformation },
            depth: number,
            remaining_candidates: MapCoordinate[],
            information: ScanInformation[],
            start_state: Path.movement_state
        ): Promise<augmented_decision_tree> {

            let region = node.region

            let augmented_path = await Path.augment(node.path, start_state, remaining_candidates.length == 1 ? digSpotArea(remaining_candidates[0]) : region?.area)

            let t: augmented_decision_tree = {
                //directions: null,
                raw_root: tree,
                root: null,
                parent: parent,
                region: null,
                path: augmented_path,
                raw: node,
                depth: depth,
                remaining_candidates: remaining_candidates,
                information: information,
                children: []
            }

            let cloned_state = lodash.cloneDeep(t.path.post_state)
            cloned_state.tick += 1 // Assume 1 tick reaction time between steps. Approximation, but may help to make timings and cooldowns more realistic

            t.root = parent == null ? t : parent.node.root
            t.region = node.region || {
                area: MapRectangle.fromTile(t.path.post_state.position.tile),
                name: ""
            }

            if (node.children.length > 0) {
                let narrowing = spot_narrowing(remaining_candidates, t.region.area, assumedRange(tree))

                // The node is not a leaf node, handle all relevant children
                t.children = await Promise.all(node.children.map(async child => {
                    return {
                        key: child.key,
                        value: await helper(
                            child ? child.value : null,
                            {node: t, key: child.key},
                            depth + 1,
                            narrowing.find(n => PulseInformation.equals(n.pulse, child.key)).narrowed_candidates,
                            information.concat([{
                                area: t.region.area,
                                pulse: child.key.pulse,
                                different_level: child.key.different_level
                            }]),
                            cloned_state
                        )

                    }
                }))
            }

            return t
        }

        tree = await normalize(tree)    // TODO: This is probably something that can (and should) be combined

        let aug_tree = await helper(tree.root, null, 0, tree.clue.solution.candidates, [], movement_state.start())

        if (options.analyze_completeness) aug_tree = analyze_correctness(aug_tree)

        return aug_tree
    }

    export type ScanInformation = PulseInformation & {
        area: MapRectangle
    }

    export namespace ScanInformation {
        export function toString(decision: ScanInformation) {
            // TODO: Properly reimplement with context
            return `${Pulse.meta(decision).shorted}`
        }
    }

    export function spot_narrowing(candidates: MapCoordinate[], area: MapRectangle, range: number): {
        pulse: PulseInformation,
        narrowed_candidates: MapCoordinate[]
    }[] {
        return Pulse.all.flatMap((p) => {
            let remaining = narrow_down(candidates, {area: area, pulse: p.pulse, different_level: p.different_level}, range)

            if (p.pulse == 3) {
                return remaining.map(r => {
                    return {
                        pulse: {
                            pulse: 3,
                            different_level: p.different_level,
                            spot: r
                        },
                        narrowed_candidates: [r]
                    }
                })
            } else {
                return [{
                    pulse: p,
                    narrowed_candidates: remaining
                }]
            }
        })
    }

    export function narrow_down(candidates: MapCoordinate[], information: ScanInformation, range: number): MapCoordinate[] {
        return candidates.filter((s) => area_pulse(s, information.area, range).some((p2) => Pulse.equals(information, p2)))
    }
}