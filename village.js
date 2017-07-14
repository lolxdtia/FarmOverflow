define('TWOverflow/Farm/Village', [
    'models/CommandListModel',
    'models/CommandModel',
    'conf/village'
], function (
    CommandListModel,
    CommandModel,
    VILLAGE_CONFIG
) {
    // 'READY_STATES' : {
    //     'COMPLETED'         : 'completed',
    //     'EFFECTS'           : 'effects',
    //     'BUILDINGS'         : 'buildings',
    //     'UNITS'             : 'units',
    //     'UNIT_QUEUE'        : 'unit_queue',
    //     'RESOURCES'         : 'resources',
    //     'TRADES'            : 'trades',
    //     'TIMELINE'          : 'timeline',
    //     'BUILDING_QUEUE'    : 'buildingQueue',
    //     'COMMANDS'          : 'commands',
    //     'OWN_COMMANDS'      : 'ownCommands',
    //     'FOREIGN_COMMANDS'  : 'foreignCommands',
    //     'SCOUTING'          : 'scouting',
    //     'SCOUTING_COMMANDS' : 'scoutingCommands'
    // }

    /**
     * @class
     *
     * @param {VillageModel} original - Objeto original da aldeia.
     */
    function Village (original) {
        this.original = original
        this.id = original.data.villageId
        this.x = original.data.x
        this.y = original.data.y
        this.name = original.data.name
        this.units = original.unitInfo.units
        this.position = original.getPosition()
    }

    Village.prototype.countCommands = function () {
        var commands = this.original.getCommandListModel()

        var outgoing = commands.getOutgoingCommands(true).length
        var incoming = commands.getIncomingCommands(true).length

        return outgoing + incoming
    }

    Village.prototype.updateCommands = function (callback) {
        var self = this

        socketService.emit(routeProvider.GET_OWN_COMMANDS, {
            village_id: self.id
        }, function (data) {
            var commandList = new CommandListModel([], self.id)

            for (var i = 0; i < data.commands.length; i++) {
                var command = new CommandModel(data.commands[i])

                commandList.add(command)
            }

            self.original.setCommandListModel(commandList)

            callback()
        })
    }

    Village.prototype.commandsLoaded = function () {
        return this.original.isReady(VILLAGE_CONFIG.OWN_COMMANDS)
    }

    Village.prototype.unitsLoaded = function () {
        return this.original.isReady(VILLAGE_CONFIG.UNITS)
    }

    Village.prototype.loaded = function () {
        if (!this.original.isReady()) {
            return false
        }

        if (!this.original.isInitialized()) {
            return false
        }

        return this.commandsLoaded() && this.unitsLoaded()
    }

    Village.prototype.load = function (callback) {
        var self = this

        return villageService.ensureVillageDataLoaded(this.id, function () {
            if (!self.original.isInitialized()) {
                villageService.initializeVillage(self.original)
            }

            callback()
        })
    }

    return Village
})
