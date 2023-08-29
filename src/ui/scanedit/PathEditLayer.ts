import * as leaflet from "leaflet";
import {CustomControl} from "../map/CustomControl";
import Widget from "../widgets/Widget";
import {DrawAbilityInteraction} from "../map/interactions/DrawAbilityInteraction";
import MediumImageButton from "../widgets/MediumImageButton";
import DrawRunInteraction from "../map/interactions/DrawRunInteraction";
import {createStepGraphics} from "../map/path_graphics";
import Button from "../widgets/Button";
import {direction, MovementAbilities} from "../../model/movement";
import TemplateStringEdit from "../widgets/TemplateStringEdit";
import {scantrainer} from "../../application";
import MapCoordinateEdit from "../widgets/MapCoordinateEdit";
import SelectTileInteraction from "../map/interactions/SelectTileInteraction";
import Properties from "../widgets/Properties";
import LightButton from "../widgets/LightButton";
import Collapsible from "../widgets/modals/Collapsible";
import DirectionSelect from "../pathedit/DirectionSelect";
import ExportStringModal from "../widgets/modals/ExportStringModal";
import {export_string, import_string} from "../../util/exportString";
import ImportStringModal from "../widgets/modals/ImportStringModal";
import {GameMapControl} from "../map/map";
import InteractionSelect from "../pathedit/InteractionSelect";
import surge2 = MovementAbilities.surge2;
import escape2 = MovementAbilities.escape2;
import {Path} from "../../model/pathing";
import {TypedEmitter} from "../../skillbertssolver/eventemitter";
import TeleportSelect from "../pathedit/TeleportSelect";
import {Teleports} from "../../model/teleports";
import {teleport_data} from "../../data/teleport_data";
import Checkbox from "../widgets/Checkbox";
import {boxPolygon, tilePolygon} from "../map/polygon_helpers";
import {util} from "../../util/util";
import index = util.index;

class WarningWidget extends Widget {
    constructor(text: string) {
        super($(`<div class='step-issue-warning'><img src='assets/icons/warning.png' alt="warning"> ${text}</div>`));
    }
}

class StepEditWidget extends Widget<{
    "deleted": Path.step,
    "changed": Path.step,
    "up": Path.step,
    "down": Path.step,
}> {

    constructor(private parent: ControlWidget, private value: Path.augmented_step) {
        super()

        this.addClass("step-edit-component")

        this.on("changed", () => this.updatePreview())
        this.on("deleted", () => this.removePreview())

        new Widget($("<div class='path-step-edit-header'></div>"))
            .text(`T${value.pre_state.tick} - T${value.post_state.tick}: ${Path.title(value.raw)}`)
            .appendTo(this)

        {
            let control_row = new Widget().addClass("path-step-edit-widget-control-row").appendTo(this)

            let up = new Button().append($("<div><img src='assets/nis/arrow_up.png' title='Up'> Move up</div>")).appendTo(control_row)
                .on("click", () => this.emit("up", this.value.raw))
            let down = new Button().append($("<div><img src='assets/nis/arrow_down.png' title='Down'> Move down</div>")).appendTo(control_row)
                .on("click", () => this.emit("down", this.value.raw))

            new Button().append($("<div><img src='assets/icons/delete.png' title='Delete'> Remove</div>")).appendTo(control_row)
                .on("click", () => this.emit("deleted", this.value.raw))
            up.setEnabled(this.parent.value.steps.indexOf(this.value.raw) != 0)
            down.setEnabled(this.parent.value.steps.indexOf(this.value.raw) != this.parent.value.steps.length - 1)
        }

        let issues = c().addClass("step-edit-issues").appendTo(this)

        this.value.issues.forEach((i) => new WarningWidget(i).appendTo(issues))

        let props = new Properties().appendTo(this)

        props.header("Description")

        props.row(
            new TemplateStringEdit({
                resolver: scantrainer.template_resolver,
                generator: () => Path.auto_description(this.value.raw) // TODO
            })
                .setValue(value.raw.description)
                .on("changed", (v) => {
                    this.value.raw.description = v
                    this.emit("changed", this.value.raw)
                })
        )

        switch (this.value.raw.type) {
            case "ability":
                props.named("From", new MapCoordinateEdit(this.parent.parent.map.getActiveLayer(), this.value.raw.from))
                    .on("changed", (c) => {
                        (this.value.raw as Path.step_ability).from = c
                        this.emit("changed", this.value.raw)
                    })

                props.named("To", new MapCoordinateEdit(this.parent.parent.map.getActiveLayer(), this.value.raw.to))
                    .on("changed", (c) => {
                        (this.value.raw as Path.step_ability).to = c
                        this.emit("changed", this.value.raw)
                    })

                props.row(new LightButton("Redraw")
                    .on("click", () => {
                        let s = this.value.raw as Path.step_ability

                        if (this._preview) this._preview.remove()

                        new DrawAbilityInteraction(this.parent.parent.map.getActiveLayer(), s.ability)
                            .setStartPosition(s.from)
                            .tapEvents((e) => {
                                e
                                    .on("done", (new_s) => {
                                        Object.assign(s, new_s)
                                        this.updatePreview()
                                        this.emit("changed", this.value.raw)
                                    })
                                    .on("cancelled", () => {
                                        this._preview.addTo(this.parent._preview_layer)
                                    })
                            }).activate()
                    })
                )

                break;
            case "redclick":

                props.named("Where", new MapCoordinateEdit(this.parent.parent.map.getActiveLayer(), this.value.raw.where))
                    .on("changed", (c) => {
                        (this.value.raw as (Path.step_powerburst | Path.step_redclick)).where = c
                        this.emit("changed", this.value.raw)
                    })

                props.named("Action", new InteractionSelect()
                    .setValue(this.value.raw.how)
                    .on("selection_changed", v => {
                        (this.value.raw as Path.step_interact).how = v
                        this.emit("changed", this.value.raw)
                    })
                )
                break
            case "powerburst":

                props.named("Where", new MapCoordinateEdit(this.parent.parent.map.getActiveLayer(), this.value.raw.where))
                    .on("changed", (c) => {
                        (this.value.raw as (Path.step_powerburst | Path.step_redclick)).where = c
                        this.emit("changed", this.value.raw)
                    })

                break

            case "run":
                props.row(new LightButton("Repath")
                    .on("click", () => {
                        let s = this.value.raw as Path.step_ability

                        if (this._preview) this._preview.remove()

                        new DrawRunInteraction(this.parent.parent.map.getActiveLayer())
                            .setStartPosition(s.from)
                            .tapEvents((e) => {
                                e
                                    .on("done", (new_s) => {
                                        Object.assign(s, new_s)
                                        this.updatePreview()
                                        this.emit("changed", this.value.raw)
                                    })
                                    .on("cancelled", () => {
                                        this._preview.addTo(this.parent._preview_layer)
                                    })
                            }).activate()
                    })
                )
                break
            case "interaction":

                props.named("Ticks", c("<input type='number' class='nisinput' min='0'>")
                    .tapRaw((c) => c.val((this.value.raw as Path.step_interact).ticks).on("change", () => {
                        (this.value.raw as Path.step_interact).ticks = Number(c.val())
                        this.emit("changed", this.value.raw)
                    }))
                )

                props.named("Where", new MapCoordinateEdit(this.parent.parent.map.getActiveLayer(), this.value.raw.where))
                    .on("changed", (c) => {
                        (this.value.raw as Path.step_interact).where = c
                        this.emit("changed", this.value.raw)
                    })

                props.named("Ends up", new MapCoordinateEdit(this.parent.parent.map.getActiveLayer(), this.value.raw.ends_up.tile))
                    .on("changed", (c) => {
                        (this.value.raw as Path.step_interact).ends_up.tile = c
                        this.emit("changed", this.value.raw)
                    })

                props.named("Facing", new DirectionSelect()
                    .setValue(this.value.raw.ends_up.direction)
                    .on("selection_changed", v => {
                        (this.value.raw as Path.step_interact).ends_up.direction = v
                        this.emit("changed", this.value.raw)
                    })
                )

                props.named("Action", new InteractionSelect()
                    .setValue(this.value.raw.how)
                    .on("selection_changed", v => {
                        (this.value.raw as Path.step_interact).how = v
                        this.emit("changed", this.value.raw)
                    })
                )

                break
            case "orientation":
                props.named("Facing", new DirectionSelect()
                    .setValue(this.value.raw.direction)
                    .on("selection_changed", v => {
                        (this.value.raw as Path.step_orientation).direction = v
                        this.emit("changed", this.value.raw)
                    })
                )

                break
            case "teleport":
                let current = Teleports.find(teleport_data.getAllFlattened(), this.value.raw.id)

                props.named("Teleport", new TeleportSelect().setValue(current)
                    .on("selection_changed", v => {
                        (this.value.raw as Path.step_teleport).id = v.id
                        this.emit("changed", this.value.raw)
                    }))

                props.named("Override?", new Checkbox()
                    .setValue(this.value.raw.spot_override != null)
                    .on("changed", v => {

                        if (v) (this.value.raw as Path.step_teleport).spot_override = {x: 0, y: 0, level: 0}
                        else (this.value.raw as Path.step_teleport).spot_override = undefined

                        this.emit("changed", this.value.raw)
                    })
                )

                if (this.value.raw.spot_override) {
                    props.named("Coordinates", new MapCoordinateEdit(this.parent.parent.map.getActiveLayer(), this.value.raw.spot_override)
                        .on("changed", (c) => {
                            (this.value.raw as Path.step_teleport).spot_override = c
                            this.emit("changed", this.value.raw)
                        })
                    )
                }

                break

            // TODO: Override
            //      - Teleport
        }

        // TODO: Fix scroll events passing through
        // TODO: Add analytics
        // TODO: Action select

        this.updatePreview()
    }

    render() {

    }

    _preview: leaflet.Layer = null

    updatePreview() {
        this.removePreview()

        this._preview = createStepGraphics(this.value.raw).addTo(this.parent._preview_layer)
    }

    removePreview() {
        if (this._preview) {
            this._preview.remove()
            this._preview = null
        }
    }
}

class ControlWidget extends Widget<{
    saved: Path.raw,
    closed: null
}> {
    private augmented: Path.augmented

    _preview_layer: leaflet.FeatureGroup

    steps_collapsible: Collapsible
    step_widgets: StepEditWidget[] = []

    control: CustomControl

    constructor(public parent: PathEditor, public value: Path.raw) {
        super()

        this.addClass("path-edit-control")

        this.control = new CustomControl(this.container)

        this.steps_collapsible = new Collapsible().setTitle("Steps").appendTo(this)

        this.steps_collapsible.content_container.css2({
            "max-height": "400px",
            "overflow-y": "auto",
        })

        {
            let controls_collapsible = new Collapsible("Controls").appendTo(this)
            let props = new Properties().appendTo(controls_collapsible.content_container)

            let add_buttons = c("<div style='display: flex; flex-wrap: wrap'>")

            new MediumImageButton('assets/icons/surge.png').appendTo(add_buttons)
                .on("click", async () => {
                    if (this.augmented.post_state.position?.tile != null && this.augmented.post_state.position?.direction != null) {
                        let res = await surge2(this.augmented.post_state.position)

                        if (res) {
                            this.value.steps.push(Path.auto_describe({
                                type: "ability",
                                ability: "surge",
                                description: "Use {{surge}}",
                                from: this.augmented.post_state.position?.tile,
                                to: res.tile
                            }))

                            await this.update()

                            return
                        }
                    }

                    let interaction = new DrawAbilityInteraction(this.parent.map.getActiveLayer(), "surge")
                    if (this.augmented.post_state.position?.tile) interaction.setStartPosition(this.augmented.post_state.position?.tile)
                    interaction.events.on("done", (s) => {
                        this.value.steps.push(Path.auto_describe(s))
                        this.update()
                    })
                    interaction.activate()
                })
            new MediumImageButton('assets/icons/escape.png').appendTo(add_buttons)
                .on("click", async () => {

                    if (this.augmented.post_state.position?.tile != null && this.augmented.post_state.position?.direction != null) {
                        let res = await escape2(this.augmented.post_state.position)

                        if (res) {
                            this.value.steps.push(Path.auto_describe({
                                type: "ability",
                                ability: "escape",
                                description: "Use {{escape}}",
                                from: this.augmented.post_state.position?.tile,
                                to: res.tile
                            }))

                            await this.update()

                            return
                        }
                    }


                    let interaction = new DrawAbilityInteraction(this.parent.map.getActiveLayer(), "escape")
                    if (this.augmented.post_state.position?.tile) interaction.setStartPosition(this.augmented.post_state.position?.tile)
                    interaction.events.on("done", (s) => {
                        this.value.steps.push(Path.auto_describe(s))
                        this.update()
                    })
                    interaction.activate()
                })
            new MediumImageButton('assets/icons/dive.png').appendTo(add_buttons)
                .on("click", () => {
                    let interaction = new DrawAbilityInteraction(this.parent.map.getActiveLayer(), "dive")

                    if (this.augmented.post_state.position?.tile) interaction.setStartPosition(this.augmented.post_state.position?.tile)

                    interaction.events.on("done", (s) => {
                        this.value.steps.push(Path.auto_describe(s))
                        this.update()
                    })
                    interaction.activate()
                })
            new MediumImageButton('assets/icons/barge.png').appendTo(add_buttons)
                .on("click", () => {
                    let interaction = new DrawAbilityInteraction(this.parent.map.getActiveLayer(), "barge")
                    if (this.augmented.post_state.position?.tile) interaction.setStartPosition(this.augmented.post_state.position?.tile)
                    interaction.events.on("done", (s) => {
                        this.value.steps.push(Path.auto_describe(s))
                        this.update()
                    })
                    interaction.activate()
                })
            new MediumImageButton('assets/icons/run.png').appendTo(add_buttons)
                .on("click", () => {
                    let interaction = new DrawRunInteraction(this.parent.map.getActiveLayer())
                    if (this.augmented.post_state.position?.tile) interaction.setStartPosition(this.augmented.post_state.position?.tile)
                    interaction.events.on("done", (s) => {
                        this.value.steps.push(Path.auto_describe(s))
                        this.update()
                    })
                    interaction.activate()
                })

            new MediumImageButton('assets/icons/teleports/homeport.png').appendTo(add_buttons)
                .on("click", () => {
                        this.value.steps.push(Path.auto_describe({
                            description: "Teleport",
                            type: "teleport",
                            id: {
                                group: "home",
                                sub: "lumbridge"
                            }
                        }))

                        this.update()
                    }
                )
            new MediumImageButton('assets/icons/redclick.png').appendTo(add_buttons)
                .on("click", () => {
                    new SelectTileInteraction(this.parent.map.getActiveLayer())
                        .tapEvents((e) => e.on("selected", (t) => {
                            this.value.steps.push(Path.auto_describe({
                                type: "redclick",
                                description: "",
                                where: t,
                                how: Path.InteractionType.GENERIC
                            }))

                            this.update()
                        })).activate()
                })

            new MediumImageButton('assets/icons/accel.png').appendTo(add_buttons)
                .on("click", () => {
                    if (this.augmented.post_state.position?.tile) {
                        this.value.steps.push(Path.auto_describe({
                            type: "powerburst",
                            description: "Use a {{icon accel}}",
                            where: this.augmented.post_state.position.tile
                        }))

                        this.update()
                    } else {
                        new SelectTileInteraction(this.parent.map.getActiveLayer())
                            .tapEvents((e) => e.on("selected", (t) => {
                                this.value.steps.push(Path.auto_describe({
                                    type: "powerburst",
                                    description: "Use a {{icon accel}}",
                                    where: t
                                }))

                                this.update()
                            })).activate()
                    }
                })

            new MediumImageButton('assets/icons/shortcut.png').appendTo(add_buttons)
                .on("click", () => {

                    new SelectTileInteraction(this.parent.map.getActiveLayer())
                        .tapEvents((e) => e.on("selected", (t) => {
                            this.value.steps.push(Path.auto_describe({
                                type: "interaction",
                                ticks: 1,
                                description: "",
                                where: t,
                                ends_up: {
                                    direction: null,
                                    tile: {x: 0, y: 0, level: 0}
                                },
                                how: Path.InteractionType.GENERIC
                            }))

                            this.update()
                        })).activate()
                })

            new MediumImageButton('assets/icons/compass.png').appendTo(add_buttons)
                .on("click", () => {
                    this.value.steps.push(Path.auto_describe({
                        type: "orientation",
                        description: `Face ${direction.toString(1)}`,
                        direction: 1
                    }))

                    this.update()
                })

            props.named("Add Step", add_buttons)
            props.row(new LightButton("Autocomplete").tooltip("Hopefully coming soon").setEnabled(false))
            props.row(new LightButton("Show JSON")
                .on("click", () => ExportStringModal.do(JSON.stringify(this.value, null, 2))))
            props.row(new LightButton("Export")
                .on("click", () => ExportStringModal.do(export_string("path", 0, this.value)))
            )
            props.row(new LightButton("Import")
                .on("click", async () => {
                    this.value = await ImportStringModal.do((s) => import_string<Path.raw>("path", 0, s))
                    await this.update()
                }))

            props.row(new LightButton("Save").on("click", () => {
                this.emit("saved", this.value)
            }))
            props.row(new LightButton("Save and Close").on("click", () => {
                this.emit("saved", this.value)
                this.emit("closed", null)
            }))
            props.row(new LightButton("Close").on("click", () => {
                this.emit("closed", null)
            }))
        }

        this.container.on("click", (e) => e.stopPropagation())

        this.addClass("nis-map-control")

        this.resetPreviewLayer()

        this.update()
    }

    async update() {
        this.augmented = await Path.augment(this.value)

        this.resetPreviewLayer()

        this.step_widgets = []
        this.steps_collapsible.content_container.empty()

        if (this.augmented.steps.length == 0) {
            this.steps_collapsible.content_container.text("No steps yet.")
        }


        for (let step of this.augmented.steps) {
            this.step_widgets.push(
                new StepEditWidget(this, step).appendTo(this.steps_collapsible.content_container)
                    .on("deleted", (step) => {
                        this.value.steps.splice(this.value.steps.indexOf(step), 1)
                        this.update()
                    })
                    .on("up", (step) => {
                        let index = this.value.steps.indexOf(step)
                        let to_index = Math.max(0, index - 1)

                        if (index != to_index) {
                            this.value.steps.splice(to_index, 0, this.value.steps.splice(index, 1)[0])
                            this.update()
                        }
                    })
                    .on("down", (step) => {
                        let index = this.value.steps.indexOf(step)
                        let to_index = Math.min(this.value.steps.length - 1, index + 1)

                        if (index != to_index) {
                            this.value.steps.splice(to_index, 0, this.value.steps.splice(index, 1)[0])
                            this.update()
                        }
                    })
                    .on("changed", () => this.update())
            )
        }


        if (this.value.target) boxPolygon(this.value.target)
            .setStyle({
                color: "yellow"
            })
            .addTo(this._preview_layer)

        if (this.value?.start_state?.position?.tile) tilePolygon(this.value.start_state.position.tile)
            .setStyle({
                color: "red"
            })
            .addTo(this._preview_layer)

        this.augmented.post_state?.position?.tile

        if (this.augmented.post_state?.position?.tile) tilePolygon(this.augmented.post_state.position.tile)
            .setStyle({
                color: "orange"
            })
            .addTo(this._preview_layer)
    }

    removePreviewLayer() {
        if (this._preview_layer) {
            this._preview_layer.remove()
            this._preview_layer = null
        }
    }

    resetPreviewLayer() {
        this.removePreviewLayer()
        this._preview_layer = leaflet.featureGroup().addTo(this.parent.map.map)
    }
}

export class PathEditor extends TypedEmitter<{
    "active_changed": boolean
}> {
    control: ControlWidget
    current_options: PathEditor.options_t = null

    constructor(public map: GameMapControl) {
        super()
        this.control = null
    }

    public async load(path: Path.raw, options: PathEditor.options_t) {
        let before = this.current_options != null

        await this.reset()

        this.current_options = options

        if (!before) await this.emitAsync("active_changed", true)

        this.control = new ControlWidget(this, path)
            .on("saved", async (v) => await options.save_handler(v))
            .on("closed", async () => {
                await this.reset()
                await this.emitAsync("active_changed", false)
            })

        this.map.map.addControl(this.control.control.setPosition("topleft"))
    }

    public async reset() {
        if (this.control) {
            this.control.resetPreviewLayer()
            this.control.remove()
            this.control = null
        }

        if (this.current_options) {
            await this.current_options.close_handler()
            this.current_options = null
        }
    }
}

namespace PathEditor {
    export type options_t = {
        save_handler: (p: Path.raw) => any,
        close_handler: () => any
    }
}

/*

export default class PathEditLayer extends leaflet.FeatureGroup {
    control: ControlWidget

    constructor(public parent: ActiveLayer, value: Path.raw) {
        super()

        this.control = new ControlWidget(this, value)

        this.parent.addControl(this.control.control.setPosition("topleft"))
    }
}*/