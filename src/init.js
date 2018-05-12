require([
    'two/ready',
    'two/farm',
    'two/farm/ui',
    'two/farm/analytics',
    'two/farm/cycle'
], function (
    ready,
    Farm
) {
    if (Farm.isInitialized()) {
        return false
    }

    ready(function () {
        Farm.init()
        Farm.interface()
        Farm.analytics()
    })
})
