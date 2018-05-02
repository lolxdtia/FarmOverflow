define('two/farm/singleCycle', [
    'two/farm',
    'two/locale',
    'two/utils',
    'two/eventQueue'
], function (
    Farm,
    Locale,
    utils,
    eventQueue
) {
    /**
     * Lista de aldeias restantes no ciclo único
     *
     * @type {Array}
     */
    var villageList = []

    /**
     * ID do timeout dos intervalos do cíclo unico.
     * Usado para evitar a continuidade dos ataques depois que o
     * FarmOverflow for parado manualmente
     *
     * @type {Number}
     */
    var timeoutId = null

    var cycle = {}

    /**
     * Verifica se o intervalo está ativado baseado no especificado
     * pelo jogador.
     *
     * @return {Boolean}
     */
    cycle.intervalEnabled = function () {
        return !!cycle.getInterval()
    }

    /**
     * Inicia um ciclo de ataques utilizando todas aldeias aldeias
     * disponíveis apenas uma vez.
     *
     * @param  {Boolean} autoInit - Indica que o ciclo foi iniciado
     *   automaticamente depois do intervalo especificado nas
     *   configurações.
     */
    cycle.start = function (autoInit) {
        Farm.commander = Farm.createCommander()
        Farm.commander.running = true

        Farm.disableNotifs(function () {
            Farm.eventQueueTrigger('Farm/start')
        })

        var freeVillages = Farm.getFreeVillages()

        if (freeVillages.length === 0) {
            if (cycle.intervalEnabled()) {
                Farm.eventQueueTrigger('Farm/singleCycleNextNoVillages')
                cycle.setNextCycle()
            } else {
                // emit apenas uma notificação de erro
                Farm.eventQueueTrigger('Farm/singleCycleEndNoVillages')

                Farm.disableNotifs(function () {
                    Farm.stop()
                })
            }

            return
        }

        if (autoInit) {
            eventQueue.bind('Farm/singleCycleRestart')
        } else if (Farm.isNotifsEnabled()) {
            utils.emitNotif('success', Locale('farm', 'general.started'))
        }

        villageList = freeVillages

        Farm.commander.analyse()
    }

    /**
     * Lida com o final de um ciclo.
     */
    cycle.end = function () {
        if (cycle.intervalEnabled()) {
            Farm.eventQueueTrigger('Farm/singleCycleNext')
            cycle.setNextCycle()
        } else {
            Farm.eventQueueTrigger('Farm/singleCycleEnd')

            Farm.disableNotifs(function () {
                Farm.stop()
            })
        }

        return false
    }

    /**
     * Reinicia o ciclo depois do intervalo especificado
     * nas configurações.
     */
    cycle.setNextCycle = function () {
        var interval = cycle.getInterval()

        timeoutId = setTimeout(function () {
            cycle.start(true /*autoInit*/)
        }, interval)
    }

    /**
     * Seleciona a próxima aldeia do ciclo único.
     *
     * @return {Boolean} Indica se houve troca de aldeia.
     */
    cycle.nextVillage = function () {
        var next = villageList.shift()

        if (next) {
            var availVillage = Farm.getFreeVillages().some(function (free) {
                return free.id === next.id
            })

            if (!availVillage) {
                return cycle.nextVillage()
            }
        } else {
            return cycle.end()
        }

        Farm.setSelectedVillage(next)
        Farm.eventQueueTrigger('Farm/nextVillage', [next])

        return true
    }

    /**
     * Converte o tempo do intervalo entre os ciclos de ataques
     * de string para number.
     *
     * @return {Number|Boolean} Retora o tempo em milisegundos caso
     *   seja válido, false caso seja uma string inválida.
     */
    cycle.getInterval = function () {
        var interval = Farm.settings.singleCycleInterval
        var parseError = false

        if (!interval) {
            return false
        }

        interval = interval.split(/\:/g).map(function (time) {
            if (isNaN(parseError)) {
                parseError = true
            }

            return parseInt(time, 10)
        })

        if (parseError) {
            return false
        }

        interval = (interval[0] * 1000 * 60 * 60) // horas
            + (interval[1] * 1000 * 60) // minutos
            + (interval[2] * 1000) // segundos

        return interval
    }

    /**
     * Retorna o ID do timeout usado nos ciclos com intervalos.
     *
     * @return {Number|Null}
     */
    cycle.getTimeoutId = function () {
        return timeoutId
    }

    Farm.cycle = cycle
})
