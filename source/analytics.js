define('TWOverflow/Farm/analytics', [
    'TWOverflow/Farm',
    'Lockr'
], function (Farm, Lockr) {
    Farm.analytics = function () {
        ga('create', '__farm_analytics', 'auto', '__farm_name')

        var player = modelDataService.getPlayer()
        var character = player.getSelectedCharacter()
        var data = []

        data.push(character.getName())
        data.push(character.getId())
        data.push(character.getWorldId())

        Farm.bind('start', function () {
            ga('__farm_name.send', 'event', 'behavior', 'start')
        })

        Farm.bind('pause', function () {
            ga('__farm_name.send', 'event', 'behavior', 'pause')
        })

        Farm.bind('sendCommandError', function (error) {
            ga('__farm_name.send', 'event', 'commands', 'attackError', error)
        })

        Farm.bind('ignoredVillage', function () {
            ga('__farm_name.send', 'event', 'commands', 'ignoreTarget')
        })

        Farm.bind('priorityTargetAdded', function () {
            ga('__farm_name.send', 'event', 'commands', 'priorityTarget')
        })

        Farm.bind('settingsChange', function (modify) {
            var settings = Lockr.get('farm-settings')

            ga('__farm_name.send', 'event', 'behavior', 'settingsChange', data.concat(settings).join('~'))
        })

        Farm.bind('remoteCommand', function (code) {
            ga('__farm_name.send', 'event', 'behavior', 'remoteCommand', code)
        })

        Farm.bind('nextVillage', function (village) {
            ga('__farm_name.send', 'event', 'behavior', 'villageChange', village.id)
        })

        Farm.bind('sendCommand', function () {
            ga('__farm_name.send', 'event', 'commands', 'attack', data.join('~'))
        })
    }
})
