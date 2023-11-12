import GameLayer from "lib/gamemap/GameLayer";
import {Shortcuts} from "lib/runescape/shortcuts";
import * as leaflet from "leaflet";
import {boxPolygon, boxPolygon2} from "../polygon_helpers";
import {RenderingUtility} from "../map/RenderingUtility";
import {Rectangle, Vector2} from "lib/math";
import {OpacityGroup} from "lib/gamemap/layers/OpacityLayer";
import {Path} from "lib/runescape/pathing";
import {arrow} from "../path_graphics";
import {Observable, ObservableArray, observe} from "../../../lib/reactive";
import {TileCoordinates, TileRectangle} from "../../../lib/runescape/coordinates";

export class ShortcutViewLayer extends GameLayer {
    constructor(public data: ObservableArray<Shortcuts.shortcut>) {
        super();

        data.element_added.on(s => {
            new ShortcutViewLayer.ShortcutPolygon(s).addTo(this)
        })

        this.renderAll()
    }

    private renderAll() {
        this.clearLayers()

        this.data.value().map(s => new ShortcutViewLayer.ShortcutPolygon(s).addTo(this))
    }

    getView(s: ObservableArray.ObservableArrayValue<Shortcuts.shortcut>): ShortcutViewLayer.ShortcutPolygon {
        return this.getLayers().find(v => (v instanceof ShortcutViewLayer.ShortcutPolygon) && v.data == s) as ShortcutViewLayer.ShortcutPolygon
    }
}

export namespace ShortcutViewLayer {
    export const COLORS = {
        interactive_area: "#72bb46",
        target_area: "#cca927",
        clickable_area: "#00ffff"
    }

    import InteractionType = Path.InteractionType;

    export class ShortcutPolygon extends OpacityGroup {
        public config = observe({

            // TODO: Instead of using this to hide parts of the preview, hide the entire preview while editing a part of it, make a copy and render it completely
            draw_clickable: true,
            hidden_actions: [],
            draw_target: true
        })

        constructor(public data: Observable<Shortcuts.shortcut>) {
            super();

            this.config.subscribe(() => this.render())
            data.subscribe(() => this.render())

            if (data instanceof ObservableArray.ObservableArrayValue<any>) {
                data.removed.on(() => this.remove())
            }

            this.setStyle({
                interactive: true,
            })

            this.render()
        }

        public render() {
            this.clearLayers()

            let shortcut = Shortcuts.normalize(this.data.value())

            for (let action of shortcut.actions.filter(a => !this.config.value().hidden_actions.includes(a))) {
                render_interactive_area(action.interactive_area)
                    .setStyle({interactive: true})
                    .addTo(this)

                if (this.config.value().draw_target) {
                    switch (action.movement.type) {
                        case "offset":
                            let center = TileRectangle.center(action.interactive_area, true)
                            let target = Vector2.add(center, action.movement.offset)

                            render_transport_arrow(center, target, action.movement.offset.level).addTo(this)
                            break;

                        case "fixed":
                            if (action.movement.relative) {

                                let center = TileRectangle.center(action.interactive_area, true)
                                let target = action.movement.target

                                render_transport_arrow(center, target, target.level - center.level).addTo(this)
                                break;
                            } else {
                                render_target_circle(action.movement.target).addTo(this)
                            }

                            break
                    }
                }
            }

            if (this.config.value().draw_clickable) {
                render_clickable(shortcut.clickable_area, shortcut.actions[0]?.cursor || "generic").addTo(this)
                    .setStyle({interactive: true})
            }
        }
    }

    export function render_clickable(area: Rectangle, cursor: InteractionType): OpacityGroup {
        return new OpacityGroup()
            .addLayer(leaflet.polygon(boxPolygon2(area), {
                color: COLORS.clickable_area,
                fillColor: COLORS.clickable_area,
                interactive: true
            }))
            .addLayer(RenderingUtility.interactionMarker(Rectangle.center(area, false), cursor)).setStyle({interactive: true})
    }

    export function render_interactive_area(area: Rectangle): OpacityGroup {
        return new OpacityGroup().addLayer(boxPolygon(area).setStyle({
            color: COLORS.interactive_area,
            fillColor: COLORS.interactive_area,
            interactive: true
        })).setStyle({interactive: true})
    }

    export function render_transport_arrow(from: Vector2, to: Vector2, level_offset: number): OpacityGroup {
        return new OpacityGroup().addLayer(arrow(from, to).setStyle({
            color: COLORS.interactive_area,
            weight: 4,
            dashArray: '10, 10'
        })).setStyle({interactive: true})

        // TODO: Level icons
    }

    export function render_target_circle(tile: TileCoordinates): leaflet.Circle {
        return leaflet.circle(Vector2.toLatLong(tile), {
            color: COLORS.target_area,
            weight: 4,
            dashArray: '10, 10',
            radius: 0.5
        })
    }
}