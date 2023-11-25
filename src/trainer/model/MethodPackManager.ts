import {MethodPack} from "./MethodPack";
import {SolvingMethods} from "./methods";
import Method = SolvingMethods.Method;
import {TileCoordinates} from "../../lib/runescape/coordinates";
import KeyValueStore from "../../lib/util/KeyValueStore";
import {uuid} from "../../oldlib";
import {ClueIndex} from "../../data/ClueIndex";
import {Clues} from "../../lib/runescape/clues";
import {default_scan_method_pack} from "../../data/methods";
import {clue_data} from "../../data/clues";

export type Pack = {
    type: "default" | "local"
    id: string,
    author: string,
    timestamp: number,
    name: string,
    description: string,
    methods: Method[]
}

export type AugmentedMethod<method_t extends Method = Method, step_t extends Clues.Step = Clues.Step> = { method: method_t, pack?: Pack, clue?: step_t }

export class MethodPackManager {
    public initialized: Promise<void>

    private local_pack_store = KeyValueStore.instance().variable<Pack[]>("data/local_methods")

    private default_packs: Pack[]
    private local_packs: Pack[]

    private index: ClueIndex<{ methods: AugmentedMethod[] }> = clue_data.index.with(() => ({methods: []}))

    constructor() {
        this.default_packs = [
            default_scan_method_pack
        ]

        this.initialized = this.local_pack_store.get().then(v => {
            this.local_packs = v || []
            this.invalidateIndex()
        })
    }

    private save(): Promise<void> {
        return this.local_pack_store.set(this.local_packs)
    }

    private invalidateIndex(): void {

        // TODO: For multi-spot clues there needs to be a hashed index to find methods by spot

        this.index.filtered().forEach(c => c.methods = [])

        this.all().forEach(p => {
            p.methods.forEach(m => {
                this.index.get(m.for?.clue)?.methods?.push({
                    method: m,
                    pack: p,
                    clue: clue_data.index.get(m.for.clue).clue
                })
            })
        })
    }

    all(): Pack[] {
        return [...this.default_packs, ...this.local_packs]
    }

    createPack(name: string): Pack {
        let n: Pack = {
            type: "local",
            author: "Anonymous",
            id: uuid(),
            name: name,
            description: "",
            timestamp: null, // TODO
            methods: []
        }

        this.local_packs.push(n)

        this.save()

        return n
    }

    copyPack(pack: MethodPack) {

    }

    deletePack() {

    }

    createMethod(pack_id: string, method: Method) {

    }

    deleteMethod(pack_id: string, method_id: string) {}

    getForClue(id: number): AugmentedMethod[] {
        // TODO: Include alternative and coordinates

        return this.index.get(id).methods
    }
}
