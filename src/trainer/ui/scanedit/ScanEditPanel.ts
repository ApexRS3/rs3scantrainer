import TreeEdit from "./TreeEdit";
import {TileCoordinates} from "lib/runescape/coordinates/TileCoordinates";
import ExportStringModal from "../widgets/modals/ExportStringModal";
import ImportStringModal from "../widgets/modals/ImportStringModal";
import {ExportImport} from "lib/util/exportString";
import imp = ExportImport.imp;
import exp = ExportImport.exp;
import {ScanTrainerCommands} from "trainer/application";
import {QueryLinks} from "trainer/query_functions";
import ScanEditor from "./ScanEditor";
import {omit} from "lodash";
import {SolvingMethods} from "../../model/methods";
import ScanTreeMethod = SolvingMethods.ScanTreeMethod;
import {SidePanel} from "../SidePanelControl";
import {C} from "../../../lib/ui/constructors";
import hbox = C.hbox;
import LightButton from "../widgets/LightButton";

export default class ScanEditPanel extends SidePanel {
    tree_edit: TreeEdit

    candidates: TileCoordinates[]

    constructor(public parent: ScanEditor) {
        super()

        this.title.set("Scan Tree Edit")

        {
            hbox(
                new LightButton("Show JSON")
                    .on("click", () => {
                        ExportStringModal.do(JSON.stringify(withoutClue(this.parent.builder.tree), null, 2))
                    }),

                new LightButton("Export")
                    .on("click", () => {
                        ExportStringModal.do(exp({
                            type: "scantree",
                            version: 0
                        }, true, true)(withoutClue(this.parent.builder.tree)), "Copy the string below to share this scan route.")
                    }),

                new LightButton("Import")
                    .on("click", () => {
                        ImportStringModal.do((s) => {
                            let i = imp<ScanTreeMethod>({expected_type: "scantree", expected_version: 0})(s)

                            if (i.clue_id != this.parent.options.clue.id) throw new Error("This method is not for the currently loaded clue")

                            return withClue(i, this.parent.options.clue)
                        })
                            .then((obj: ScanTreeWithClue) => this.parent.builder.set(obj))
                    }),

                new LightButton("Try")
                    .tooltip('Open the route in training mode.')
                    .on("click", () => {

                        this.parent.app.showMethod(this.parent.builder.tree)
                    }),

                new LightButton("Share")
                    .on("click", () => {
                        ExportStringModal.do(QueryLinks.link(ScanTrainerCommands.load_method, {method: omit(this.parent.builder.tree, "clue")}), "The link below is a direct link to this method.")
                    })
            ).addClass("ctr-button-container").appendTo(this.container)
        }

        this.tree_edit = new TreeEdit(this, this.parent.builder.tree.root)
            .css("overflow-y", "auto")

        //new Collapsible("Movement Tree", this.tree_edit).addClass("fullwidth-in-panel").appendTo(this)
        this.tree_edit.appendTo(this)

        this.candidates = this.parent.options.clue.spots
    }
}