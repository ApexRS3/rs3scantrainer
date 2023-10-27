import {ScanLayer, SpotPolygon} from "./layers/ScanLayer";
import {Application} from "trainer/application";
import {GameMap} from "./map";
import {ScanTree} from "lib/cluetheory/scans/ScanTree";
import {Modal, modal} from "../widgets/modal";
import {util} from "../../../lib/util/util";
import * as leaflet from "leaflet"
import augmented_decision_tree = ScanTree.augmented_decision_tree;
import augment = ScanTree.augment;
import ScanDecision = ScanTree.ScanInformation;
import spotNumber = ScanTree.spotNumber;
import LightButton from "../widgets/LightButton";
import {TextRendering} from "../TextRendering";
import render_digspot = TextRendering.render_digspot;
import natural_join = util.natural_join;
import shorten_integer_list = util.shorten_integer_list;
import {PathingGraphics} from "./path_graphics";
import Order = util.Order;
import {floor_t, MapRectangle} from "lib/runescape/coordinates";
import {Vector2} from "lib/math/Vector";
import {Scans} from "lib/runescape/clues/scans";
import Pulse = Scans.Pulse;
import {SolvingMethods} from "../../model/methods";
import ScanTreeWithClue = SolvingMethods.ScanTreeWithClue;

export function scan_tree_template_resolvers(node: ScanTree.augmented_decision_tree): Record<string, (args: string[]) => string> {
    return {
        "target": () => {
            if (node.remaining_candidates.length == 1) {
                // TODO: There's a bug hidden here where is always resolves the same digspot number for all triples
                return render_digspot(spotNumber(node.raw_root, node.remaining_candidates[0]))
            } else if (node.region) {
                return `{{scanarea ${node.region.name}}}`
            } else {
                return "{ERROR: No target}"
            }
        },
        "candidates":
            () => {
                return util.natural_join(
                    shorten_integer_list(node.remaining_candidates
                            .map(c => spotNumber(node.raw_root, c)),
                        render_digspot
                    ))
            }
    }
}

export class ScanExplanationModal extends Modal {
    protected hidden() {
        ($("#pingexplanationvideo").get(0) as HTMLVideoElement).pause();
    }
}

export default class ScanTreeMethodLayer extends ScanLayer {
    private readonly root: Promise<augmented_decision_tree>
    private node: augmented_decision_tree
    private areas: SpotPolygon[] = []
    private path_graphics: leaflet.FeatureGroup

    private fit() {
        let bounds = leaflet.bounds([])

        //1. If no children: All Candidates
        if (this.node.children.length == 0)
            this.node.remaining_candidates.map(Vector2.toPoint).forEach((c) => bounds.extend(c))

        //2. All children that are leafs in the augmented tree (i.e. spots directly reached from here)
        /* //TODO: Rethink this, disabled to get the build working again
        this.node.children.filter(c => c.value.is_leaf)
            .map(c => c.value.remaining_candidates.map(Vector2.toPoint).forEach(spot => bounds.extend(spot)))

         */

        //4. "Where"
        if (this.node.region) {
            bounds.extend(Vector2.toPoint(this.node.region.area.topleft))
            bounds.extend(Vector2.toPoint(this.node.region.area.botright))
        }

        // 5. parent.where if not far away
        if (this.node.parent && this.node.parent.node.region) {
            let o = leaflet.bounds([])

            o.extend(Vector2.toPoint(this.node.parent.node.region.area.topleft))
            o.extend(Vector2.toPoint(this.node.parent.node.region.area.botright))

            if (o.getCenter().distanceTo(bounds.getCenter()) < 60) {
                bounds.extend(o)
            }
        }

        // 6. The path
        // TODO: Include path bounds, without augmenting it!

        this.getMap().fitBounds(util.convert_bounds(bounds).pad(0.1), {
            maxZoom: 4,
            animate: true,
        })
    }

    getTree(): ScanTreeWithClue {
        return this.scantree;
    }

    public setNode(node: augmented_decision_tree) {
        this.node = node
        this.fit()

        let candidates = this.node.remaining_candidates
        let relevant_areas = this.node.region ? [this.node.region] : []
        if (this.node.parent && this.node.parent.node.region) relevant_areas.push(this.node.parent.node.region);

        if (node.region) {
            this.getMap().floor.set(node.region.area.level)

            let c = MapRectangle.center(node.region.area)

            this.setMarker(c, false, false)
        } else {
            this.getMap().floor.set(Math.min(...node.remaining_candidates.map((c) => c.level)) as floor_t)

            this.removeMarker()
        }

        this.highlightCandidates(candidates)

        this.areas.forEach((p) => p.setActive(relevant_areas.some((a) => a.name == (p.spot().name))))

        // 1. Path here
        // 2. Path to all leaf children

        // Render pathing with appropriate opacity
        this.path_graphics.clearLayers()

        if (node.path) PathingGraphics.renderPath(node.raw.path).setOpacity(1).addTo(this.path_graphics)

        augmented_decision_tree.traverse_parents(node, n => {
            if (n.path) {
                PathingGraphics.renderPath(n.raw.path).setOpacity(0.2).addTo(this.path_graphics)
            }
        })

        // Children paths to dig spots are rendered wit 0.5
        node.children.filter(c => c.value.remaining_candidates.length == 1).forEach(c => {
            PathingGraphics.renderPath(c.value.raw.path).setOpacity(0.5).addTo(this.path_graphics)
        })

        /*
        node.children.filter(c => c.key && c.key.pulse == 3).forEach(c => {
            c.value.children.forEach(gc => {
                PathingGraphics.renderPath(gc.value.path).setOpacity(0.3).addTo(this.path_graphics)
            })
        })*/


        this.update()
    }

    constructor(private scantree: ScanTreeWithClue, app: Application) {
        super(scantree.clue, app, {
            show_edit_button: true
        });

        this.root = augment(scantree)

        this.setSpotOrder(scantree.spot_ordering)

        this.areas = []// TODO: Area polygons! //scantree.areas.map((s) => new SpotPolygon(s).addTo(this))

        this.path_graphics = leaflet.featureGroup().addTo(this)

        this.setMeerkats(scantree.assumes_meerkats)
    }

    public async activate(map: GameMap) {
        super.activate(map);

        this.app.sidepanels.methods_panel.setModal(modal("modal-scantree-method-explanation", ScanExplanationModal))

        this.app.sidepanels.methods_panel.showSection("scantree")

        this.setNode(await this.root)
    }

    private update() {
        {
            let list = $("#pathview").empty()

            let buildPathNavigation = (node: augmented_decision_tree) => {
                let text: string

                if (!node.parent) {
                    text = "Start"
                }/* else if (node.remaining_candidates.length == 1) {
                    text = `Spot ${spotNumber(node.raw_root, node.remaining_candidates[0])}`
                } */ else {
                    // TODO: implement to string properly,
                    text = ScanDecision.toString(node.information[node.information.length - 1])
                }

                $("<span class='nisl-textlink'>")
                    .on("click", () => this.setNode(node))
                    .text(text)
                    .appendTo($("<li>").addClass("breadcrumb-item").prependTo(list))

                if (node.parent) buildPathNavigation(node.parent.node)
            }

            buildPathNavigation(this.node)

            let last = list.children().last()

            last.text(last.children().first().text()).addClass("active")
        }

        let text: string = "INVALID DATA"

        if (this.node.raw.directions) {
            text = this.app.template_resolver
                .with(scan_tree_template_resolvers(this.node))
                .resolve(this.node.raw.directions)
        } else {
            if (this.node.remaining_candidates.length > 1) {
                if (this.node.parent && this.node.parent.key.pulse == 3) {
                    text = `Which spot of ${natural_join(shorten_integer_list(this.node.remaining_candidates.map(c => spotNumber(this.node.raw_root, c)), render_digspot))}?`
                } else {
                    text = `No more instructions. Check remaining spots:`
                }
            }
        }

        $("#nextscanstep").html(text)

        this.generateChildren(this.node, 0, $("#scantreeview").empty())

        return
    }

    generateList(node: augmented_decision_tree, depth: number, container: JQuery): void {
        let resolver = this.app.template_resolver.with(scan_tree_template_resolvers(node))

        let line = $("<div>")
            .addClass("scantreeline")
            .css("padding-left", `${depth * 18}px`)
            .css("margin-top", "3px")
            .css("margin-bottom", "3px")
            .css("font-size", `${13 /*/ (Math.pow(1.25, depth))*/}px`)

        let link_html = node.parent.key
            ? Pulse.pretty_with_context(node.parent.key, node.parent.node.children.map(c => c.key))
            : resolver.resolve(`Spot {{digspot ${spotNumber(node.raw_root, node.remaining_candidates[0])}}}`)             // Nodes without a parent kind always have exactly one remaining candidate as they are synthetic

        if (depth == 0) {
            new LightButton().on("click", () => this.setNode(node))
                .setHTML(link_html)
                .appendTo(line)
        } else if (depth > 0) {
            $("<span>- <span class='lightlink'></span>: </span>").appendTo(line)
                .children("span")
                .html(link_html)
                .on("click", () => this.setNode(node))
        }

        if (node.raw.directions != null) {
            $("<span>")
                .html(this.app.template_resolver
                    .with(scan_tree_template_resolvers(node))
                    .resolve(node.raw.directions))
                .appendTo(line)
        } else if (node.children.some(c => c.key == null)) {
            // This node only has synthetic children left

            if (node?.parent?.key && node.parent.key.pulse == 3) {
                // Directly link to triple spots

                line.append($("<span>").text("at"))

                node.children.map(c => c.value)
                    .sort(Order.comap(Order.natural_order, (c) => spotNumber(node.raw_root, c.remaining_candidates[0])))
                    .forEach((child) => {
                        new LightButton()
                            .setHTML(render_digspot(spotNumber(node.raw_root, child.remaining_candidates[0])))
                            .on("click", () => this.setNode(child))
                            .appendTo(line)
                    })
            } else {
                $("<span>No more instructions</span>").appendTo(line)
            }
        }

        line.appendTo(container)

        this.generateChildren(node, depth + 1, container)
    }

    generateChildren(node: augmented_decision_tree, depth: number, container: JQuery): void {
        if (depth >= 2) return

        node.children
            .filter((e) => e.key.pulse != 3)
            .sort(Order.comap(Scans.Pulse.compare, (a) => a.key))
            .forEach((e) => this.generateList(e.value, depth, container))

        let triples = node.children.filter(e => e.key.pulse == 3)

        if (triples.length > 0) {

            let line = $("<div>")
                .appendTo(container)
                .addClass("scantreeline")
                .css("padding-left", `${(depth) * 18}px`)
                .css("margin-top", "3px")
                .css("margin-bottom", "3px")
                .css("font-size", `${13 /*/ (Math.pow(1.25, depth))*/}px`)

            $("<span>- Triple at </span>").appendTo(line)

            triples
                .sort(Order.comap(Order.natural_order, (c) => spotNumber(node.raw_root, c.value.remaining_candidates[0])))
                .forEach((child) => {
                    new LightButton()
                        .setHTML(render_digspot(spotNumber(node.raw_root, child.value.remaining_candidates[0])))
                        .on("click", () => this.setNode(child.value))
                        .appendTo(line)
                })
        }

        // TODO: Also output triples in a combined row
    }

    deactivate() {
        super.deactivate();

        this.app.sidepanels.methods_panel.hide()
    }
}