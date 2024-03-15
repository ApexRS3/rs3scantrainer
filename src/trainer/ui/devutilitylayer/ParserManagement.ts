import {GameLayer} from "../../../lib/gamemap/GameLayer";
import {FilteredLocLayer, LocInstanceEntity} from "./FilteredLocLayer";
import {GameMapContextMenuEvent} from "../../../lib/gamemap/MapEvents";
import {GameMapControl} from "../../../lib/gamemap/GameMapControl";
import ButtonRow from "../../../lib/ui/ButtonRow";
import {LocParsingTable, LocParsingTableData, ParserPairing} from "./cachetools/ParsingTable";
import KeyValueStore from "../../../lib/util/KeyValueStore";
import LightButton from "../widgets/LightButton";
import ExportStringModal from "../widgets/modals/ExportStringModal";
import {util} from "../../../lib/util/util";
import cleanedJSON = util.cleanedJSON;
import {Parsers3, parsers3} from "./cachetools/parsers3";
import {Parsing} from "./cachetools/Parsing";
import {CacheTypes} from "./cachetools/CacheTypes";
import LocDataFile = CacheTypes.LocDataFile;
import {FormModal} from "../../../lib/ui/controls/FormModal";
import {NisModal} from "../../../lib/ui/NisModal";
import {GameMap, GameMapWidget} from "../../../lib/gamemap/GameMap";
import {ParserPairingModal} from "./cachetools/ParserPairingModal";
import {filedownload} from "../../../oldlib";
import download = util.download;
import LocInstance = CacheTypes.LocInstance;

export class ParserManagementLayer extends GameLayer {
    loc_layer: FilteredLocLayer

    local_store_id = "devutility/locparsing/parserassociations"
    repo_version_number: number

    parsing_table: LocParsingTable
    data_file: LocDataFile

    constructor() {
        super();

        new GameMapControl({type: "gapless", position: "bottom-center"}, c())
            .setContent(
                new ButtonRow()
                    .buttons(
                        new LightButton("Export")
                            .onClick(() => {
                                download("parsingtable.json", cleanedJSON(this.parsing_table.data))
                            }),
                        new LightButton("Apply parsers")
                            .onClick(async () => {
                                const results = await Parsing.applyParsing(parsers3, this.data_file, this.parsing_table)

                                new ExportStringModal(cleanedJSON(results)).show()
                            }),
                        new LightButton("Test")
                            .onClick(async () => {

                                (new class extends NisModal {

                                    constructor() {
                                        super()
                                    }

                                    render() {
                                        super.render();

                                        this.body.append(new GameMapWidget(c().container))
                                    }
                                }).show()
                            })
                    )
            ).addTo(this)

        this.init()
    }

    async init() {

        let local_data: LocParsingTableData = await KeyValueStore.instance().get<LocParsingTableData>(this.local_store_id)
        let repo_data: LocParsingTableData = await (await fetch("map/parsing_associations.json")).json().catch(() => undefined)

        this.repo_version_number = repo_data?.version ?? -1

        let most_current_data: LocParsingTableData = {
            version: 0,
            associations: []
        }

        if (local_data?.version ?? -1 > most_current_data.version) most_current_data = local_data
        if (repo_data?.version ?? -1 > most_current_data.version) most_current_data = repo_data

        this.parsing_table = new LocParsingTable(most_current_data)

        this.parsing_table.version.subscribe(async () => {
            await KeyValueStore.instance().set(this.local_store_id, this.parsing_table.data)
        })

        this.data_file = await LocDataFile.fromURL("map/raw_loc_data.json")

        this.loc_layer = new FilteredLocLayer(this.data_file, this.parsing_table).addTo(this)
    }

    commitPairing(loc: LocInstance, pairing: ParserPairing) {
        this.parsing_table.setPairing(loc, pairing)
    }

    eventContextMenu(event: GameMapContextMenuEvent) {

        event.onPre(() => {
            if (event.active_entity instanceof LocInstanceEntity) {
                const instance = event.active_entity.instance

                const pairing = this.parsing_table.getPairing(instance)

                event.addForEntity({
                    type: "basic",
                    text: "Edit pairing",
                    handler: async () => {
                        let result = await new ParserPairingModal(instance, pairing).do()

                        if (result.type == "saved") {
                            this.commitPairing(instance, result.pairing)
                        }
                    }
                })

                if (this.parsing_table.getPairing(instance).group) {
                    event.addForEntity({
                        type: "basic",
                        text: "Remove pairing",
                        handler: () => this.commitPairing(instance, null)
                    })
                } else {
                    event.addForEntity({
                        type: "basic",
                        text: "Pair as standard door",
                        handler: () => {
                            this.commitPairing(instance, {
                                group: this.parsing_table.getGroup2(Parsers3.getById("west-facing-doors"), -1),
                                instance_group: null
                            })
                        }
                    })
                }
            }
        })
    }
}