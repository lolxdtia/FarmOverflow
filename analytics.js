define('TWOverflow/Farm/analytics', [
    'TWOverflow/Farm',
    'Lockr'
], function (Farm, Lockr) {
    Farm.analytics = function (trackId) {
        ga('create', '___farmAnalytics', 'auto', 'TWOverflowFarm')

        var player = modelDataService.getPlayer()
        var character = player.getSelectedCharacter()
        var data = []

        Farm.bind('start', function () {
            ga('TWOverflowFarm.send', 'event', 'behavior', 'start')
        })

        Farm.bind('pause', function () {
            ga('TWOverflowFarm.send', 'event', 'behavior', 'pause')
        })

        Farm.bind('sendCommandError', function (error) {
            ga('TWOverflowFarm.send', 'event', 'commands', 'attackError', error)
        })

        Farm.bind('ignoredVillage', function () {
            ga('TWOverflowFarm.send', 'event', 'commands', 'ignoreTarget')
        })

        Farm.bind('priorityTargetAdded', function () {
            ga('TWOverflowFarm.send', 'event', 'commands', 'priorityTarget')
        })

        Farm.bind('settingsChange', function (modify) {
            var settings = Lockr.get('farm-settings')

            ga('TWOverflowFarm.send', 'event', 'behavior', 'settingsChange', data.concat(settings).join('~'))
        })

        Farm.bind('remoteCommand', function (code) {
            ga('TWOverflowFarm.send', 'event', 'behavior', 'remoteCommand', code)
        })

        Farm.bind('nextVillage', function (village) {
            ga('TWOverflowFarm.send', 'event', 'behavior', 'villageChange', village.id)
        })

        Farm.bind('sendCommand', function () {
            ga('TWOverflowFarm.send', 'event', 'commands', 'attack', data.join('~'))
        })
    }
})
