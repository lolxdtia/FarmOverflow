define('TWOverflow/Farm/analytics', [
    'TWOverflow/Farm',
    'TWOverflow/eventQueue',
    'Lockr'
], function (Farm, eventQueue, Lockr) {
    Farm.analytics = function () {
        ga('create', '__farm_analytics', 'auto', '__farm_name')

        var player = modelDataService.getPlayer()
        var character = player.getSelectedCharacter()
        var data = []

        data.push(character.getName())
        data.push(character.getId())
        data.push(character.getWorldId())

        eventQueue.bind('Farm/start', function () {
            ga('__farm_name.send', 'event', 'behavior', 'start')
        })

        eventQueue.bind('Farm/pause', function () {
            ga('__farm_name.send', 'event', 'behavior', 'pause')
        })

        eventQueue.bind('Farm/sendCommandError', function (error) {
            ga('__farm_name.send', 'event', 'commands', 'attackError', error)
        })

        eventQueue.bind('Farm/ignoredVillage', function () {
            ga('__farm_name.send', 'event', 'commands', 'ignoreTarget')
        })

        eventQueue.bind('Farm/priorityTargetAdded', function () {
            ga('__farm_name.send', 'event', 'commands', 'priorityTarget')
        })

        eventQueue.bind('Farm/settingsChange', function (modify) {
            var settings = JSON.stringify(Lockr.get('farm-settings'))

            ga('__farm_name.send', 'event', 'behavior', 'settingsChange', data.concat(settings).join('~'))
        })

        eventQueue.bind('Farm/remoteCommand', function (code) {
            ga('__farm_name.send', 'event', 'behavior', 'remoteCommand', code)
        })

        eventQueue.bind('Farm/nextVillage', function (village) {
            ga('__farm_name.send', 'event', 'behavior', 'villageChange', village.id)
        })

        eventQueue.bind('Farm/sendCommand', function () {
            ga('__farm_name.send', 'event', 'commands', 'attack', data.join('~'))
        })
    }
})
