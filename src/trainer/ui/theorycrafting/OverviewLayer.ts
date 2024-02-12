import {Application} from "../../application";
import GameLayer from "../../../lib/gamemap/GameLayer";
import {ClueSpotIndex} from "../../../lib/runescape/clues/ClueIndex";
import * as tippy from "tippy.js";
import {clue_data} from "../../../data/clues";
import {AugmentedMethod, MethodPackManager} from "../../model/MethodPackManager";
import UtilityLayer from "../map/UtilityLayer";
import {ClueSpotFilter, FilterControl} from "./Filtering";
import {ClueOverviewMarker} from "./OverviewMarker";


export default class OverviewLayer extends GameLayer {
    filter_control: FilterControl

    public marker_index: ClueSpotIndex<{ markers: ClueOverviewMarker[] }>
    singleton_tooltip: tippy.Instance = null

    constructor(private app: Application, private edit_handler: (_: AugmentedMethod) => any) {
        super();

        this.filter_control = new FilterControl(MethodPackManager.instance(), this.edit_handler).addTo(this)

        this.marker_index = clue_data.spot_index.with(() => ({markers: []}))

        this.on("add", () => {
            this.filter_control.filtered_index_updated.on(() => this.updateVisibleMarkersByFilter())
            this.updateVisibleMarkersByFilter()
        })
    }

    private async updateVisibleMarkersByFilter() {
        await Promise.all(this.marker_index.flat().map(async c => {
                let visible = this.filter_control.index.get(c.for.clue.id, c.for.spot).visible

                if (!visible && c.markers.length > 0) {
                    c.markers.forEach(c => c.remove())
                    c.markers = []
                } else if (visible && c.markers.length == 0) {
                    c.markers = ClueOverviewMarker.forClue(c.for, MethodPackManager.instance(), this.edit_handler)
                    c.markers.forEach(m => m.addTo(this))
                }
            })
        )

        let instances = await Promise.all(
            this.marker_index
                .flat()
                .flatMap(c => c.markers.map(m => {
                    try {
                        return m.createTooltip()
                    } catch (e) {
                        return null
                    }
                }))
                .filter(i => i != null)
        )

        if (this.singleton_tooltip) {
            this.singleton_tooltip.destroy()
            this.singleton_tooltip = null
        }

        this.singleton_tooltip = tippy.createSingleton(instances, {
            interactive: true,
            interactiveBorder: 20,
            interactiveDebounce: 0.5,
            arrow: true,
            overrides: ["onShow", "onBeforeUpdate"],
            appendTo: () => document.body,
            delay: 0,
            animation: false,
        })

    }
}
