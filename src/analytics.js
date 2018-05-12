define('two/farm/analytics', [
    'two/farm',
    'two/eventQueue',
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

        eventQueue.bind('Farm/sendCommand', function () {
            ga('__farm_name.send', 'event', 'commands', 'attack', data.join('~'))
        })
    }
})
