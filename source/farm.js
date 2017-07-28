define('TWOverflow/Farm', [
    'TWOverflow/locale',
    'TWOverflow/Farm/Village',
    'helper/math',
    'conf/conf',
    'struct/MapData',
    'helper/mapconvert',
    'helper/time',
    'conf/locale',
    'Lockr'
], function (
    Locale,
    Village,
    $math,
    $conf,
    $mapData,
    $convert,
    $timeHelper,
    gameLocale,
    Lockr
) {
    /**
     * Previne do Farm ser executado mais de uma vez.
     *
     * @type {Boolean}
     */
    var initialized = false

    /**
     * Tempo de validade dos dados temporarios do FarmOverflow.
     * Dados como: índice dos alvos, lista de prioridades etc..
     *
     * Padrão de 30 minutos de tolerância.
     *
     * @type {Number}
     */
    var DATA_EXPIRE_TIME = 1000 * 60 * 30

    /**
     * Intervalo entre cada verificação de farm travado.
     * @see initPersistentRunning
     *
     * @type {Number}
     */
    var PERSISTENT_INTERVAL = 1000 * 60

    /**
     * Tempo de tolerância entre um ataque e outro para que possa
     * reiniciar os comandos automaticamente.
     *
     * @type {Number}
     */
    var PERSISTENT_TOLERANCE = 1000 * 60 * 5

    /**
     * Limpa qualquer text entre (, [, {, " & ' do nome dos presets
     * para serem idetificados com o mesmo nome.
     *
     * @type {RegEx}
     */
    var rpreset = /(\(|\{|\[|\"|\')[^\)\}\]\"\']+(\)|\}|\]|\"|\')/

    /**
     * Aldeias que prontas para serem usadas nos ataques.
     *
     * @type {Array}
     */
    var playerVillages = null

    /**
     * Lista de aldeias restantes até chegar o farm chegar à última
     * aldeia da lista. Assim que chegar a lista será resetada com
     * todas aldeias dispoíveis do jogador (sem as waitingVillages).
     *
     * @type {Array}
     */
    var leftVillages = []

    /**
     * Aldeia atualmente selecionada.
     *
     * @type {Object} VillageModel
     */
    var selectedVillage = null

    /**
     * Identifica se o jogador possui apenas uma aldeia disponível para atacar.
     *
     * @type {Boolean}
     */
    var singleVillage = null

    /**
     * Lista de todos aldeias alvos possíveis para cada aldeia do jogador.
     *
     * @type {Object}
     */
    var villagesTargets = {}

    /**
     * Aldeias alvo atualmente selecionada.
     *
     * @type {Object}
     */
    var selectedTarget = null

    /**
     * Callbacks usados pelos eventos que são disparados no decorrer do script.
     *
     * @type {Object}
     */
    var eventListeners = {}

    /**
     * Propriedade usada para permitir ou não o disparo de eventos.
     *
     * @type {Boolean}
     */
    var eventsEnabled = true

    /**
     * Propriedade usada para permitir ou não a exibição de notificações.
     *
     * @type {Boolean}
     */
    var notifsEnabled = true

    /**
     * Preset usado como referência para enviar os comandos
     *
     * @type {Array}
     */
    var selectedPresets = []

    /**
     * Objeto do group de referência para ignorar aldeias/alvos.
     *
     * @type {Object}
     */
    var groupIgnore = null

    /**
     * Objeto do group de referência para incluir alvos.
     *
     * @type {Object}
     */
    var groupInclude = null

    /**
     * Objeto do group de referência para filtrar aldeias usadas
     * pelo Farm.
     *
     * @type {Object}
     */
    var groupOnly = null

    /**
     * Lista de aldeias ignoradas
     *
     * @type {Array}
     */
    var ignoredVillages = []

    /**
     * Lista de aldeias que serão permitidas atacar, independente de outros
     * fatores a não ser a distância.
     *
     * @type {Array}
     */
    var includedVillages = []

    /**
     * Armazena todas aldeias que não estão em confições de enviar comandos.
     *
     * @type {Object}
     */
    var waitingVillages = {}

    /**
     * Indica se não há nenhuma aldeia disponível (todas aguardando tropas).
     *
     * @type {Boolean}
     */
    var globalWaiting = false

    /**
     * Armazena o último evento que fez o farm entrar em modo de espera.
     * Usado para atualizar a mensagem de status quando o farm é reiniciado
     * manualmente.
     *
     * @type {String}
     */
    var lastError = ''

    /**
     * Lista de alvos com prioridade no envio dos ataques.
     * Alvos são adicionados nessa lista quando farms voltam lotados.
     *
     * @type {Object.<array>}
     */
    var priorityTargets = {}

    /**
     * Status do Farm.
     *
     * @type {String}
     */
    var currentStatus = 'paused'

    /**
     * Armazena todos os últimos eventos ocorridos no Farm.
     *
     * @type {Array}
     */
    var lastEvents

    /**
     * Timestamp da última atividade do Farm como atques e
     * trocas de aldeias.
     *
     * @type {Number}
     */
    var lastActivity

    /**
     * Timestamp da última atividade do Farm como atques e
     * trocas de aldeias.
     *
     * @type {Number}
     */
    var lastAttack

    /**
     * Armazena os índices dos alvos de cada aldeia disponível.
     *
     * @type {Object}
     */
    var targetIndexes

    /**
     * Objeto com dados do jogador.
     *
     * @type {Object}
     */
    var $player

    /**
     * Lista de filtros chamados no momendo do carregamento de alvos do mapa.
     *
     * @type {Array}
     */
    var mapFilters = [
        // IDs negativos são localizações reservadas para os jogadores como
        // segunda aldeia em construção, convidar um amigo e deposito de recursos.
        function (target) {
            if (target.id < 0) {
                return true
            }
        },

        // Aldeia do próprio jogador
        function (target) {
            if (target.character_id === $player.getId()) {
                return true
            }
        },

        // Impossivel atacar alvos protegidos
        function (target) {
            if (target.attack_protection) {
                return true
            }
        },

        // Aldeias de jogadores são permitidas caso estejam
        // no grupo de incluidas.
        function (target) {
            if (target.character_id) {
                var included = includedVillages.includes(target.id)

                if (!included) {
                    return true
                }
            }
        },

        // Filtra aldeias pela pontuação
        function (target) {
            if (target.points < Farm.settings.minPoints) {
                return true
            }

            if (target.points > Farm.settings.maxPoints) {
                return true
            }
        },

        // Filtra aldeias pela distância
        function (target) {
            var coords = selectedVillage.position
            var distance = $math.actualDistance(coords, target)

            if (distance < Farm.settings.minDistance) {
                return true
            }

            if (distance > Farm.settings.maxDistance) {
                return true
            }
        }
    ]

    /**
     * Remove todas propriedades que tiverem valor zero.
     *
     * @param {Object} units - Unidades do preset a serem filtradas.
     */
    var cleanPresetUnits = function (units) {
        var pure = {}

        for (var unit in units) {
            if (units[unit] > 0) {
                pure[unit] = units[unit]
            }
        }

        return pure
    }

    /**
     * Salva no localStorage a lista dos últimos eventos ocorridos no Farm.
     */
    var updateLastEvents = function () {
        Lockr.set('farm-lastEvents', lastEvents)
    }

    /**
     * Atualiza o grupo de referência para ignorar aldeias e incluir alvos
     */
    var updateExceptionGroups = function () {
        var groups = modelDataService.getGroupList().getGroups()

        groupIgnore = Farm.settings.groupIgnore in groups
            ? groups[Farm.settings.groupIgnore]
            : false

        groupInclude = Farm.settings.groupInclude in groups
            ? groups[Farm.settings.groupInclude]
            : false

        groupOnly = Farm.settings.groupOnly in groups
            ? groups[Farm.settings.groupOnly]
            : false
    }

    /**
     * Atualiza a lista de aldeias ignoradas e incluidas
     */
    var updateExceptionVillages = function () {
        var groupList = modelDataService.getGroupList()

        ignoredVillages = []
        includedVillages = []

        if (groupIgnore) {
            ignoredVillages =
                groupList.getGroupVillageIds(groupIgnore.id)
        }

        if (groupInclude) {
            includedVillages =
                groupList.getGroupVillageIds(groupInclude.id)
        }
    }

    /**
     * Atualiza a lista de aldeias do jogador e filtra com base nos grupos (caso
     * estaja configurado...).
     */
    var updatePlayerVillages = function () {
        var villages = $player.getVillageList()
            .map(function (village) {
                return new Village(village)
            })
            .filter(function (village) {
                return !ignoredVillages.includes(village.id)
            })

        if (groupOnly) {
            var groupList = modelDataService.getGroupList()
            var groupVillages = groupList.getGroupVillageIds(groupOnly.id)

            villages = villages.filter(function (village) {
                return groupVillages.includes(village.id)
            })
        }

        playerVillages = villages
        singleVillage = playerVillages.length === 1
        selectedVillage = playerVillages[0]

        // Reinicia comandos imediatamente se liberar alguma aldeia
        // que nao esteja na lista de espera.
        if (Farm.commander.running && globalWaiting) {
            for (var i = 0; i < villages.length; i++) {
                var village = villages[i]

                if (!waitingVillages[village.id]) {
                    globalWaiting = false
                    Farm.commander.analyse()

                    break
                }
            }
        }

        Farm.trigger('villagesUpdate')
    }

    /**
     * Obtem preset apropriado para o script
     *
     * @param {Function} callback
     */
    var updatePresets = function (callback) {
        var update = function (rawPresets) {
            selectedPresets = []

            if (!Farm.settings.presetName) {
                if (callback) {
                    callback()
                }

                return
            }

            for (var id in rawPresets) {
                if (!rawPresets.hasOwnProperty(id)) {
                    continue
                }

                var name = rawPresets[id].name
                var cleanName = name.replace(rpreset, '').trim()

                if (cleanName === Farm.settings.presetName) {
                    rawPresets[id].cleanName = cleanName
                    rawPresets[id].units = cleanPresetUnits(rawPresets[id].units)

                    selectedPresets.push(rawPresets[id])
                }
            }

            if (callback) {
                callback()
            }
        }

        if (modelDataService.getPresetList().isLoaded()) {
            update(modelDataService.getPresetList().getPresets())
        } else {
            socketService.emit(routeProvider.GET_PRESETS, {}, function (data) {
                Farm.trigger('presetsLoaded')
                update(data.presets)
            })
        }
    }

    /**
     * Funções relacionadas com relatórios.
     */
    var reportListener = function () {
        var reportQueue = []

        /**
         * Adiciona o grupo de "ignorados" no alvo caso o relatório do
         * ataque tenha causado alguma baixa nas tropas.
         *
         * @param  {Object} report - Dados do relatório recebido.
         */
        var ignoredTargetHandler = function (report) {
            var target = targetExists(report.target_village_id)

            if (!target) {
                return false
            }

            ignoreVillage(target)

            return true
        }

        /**
         * Analisa a quantidade farmada dos relatórios e adiciona
         * a aldeia alvo na lista de prioridades.
         *
         * @param {Object} reportInfo - Informações básicas do relatório
         */
        var priorityHandler = function (reportInfo) {
            getReport(reportInfo.id, function (data) {
                var attack = data.ReportAttack
                var vid = attack.attVillageId
                var tid = attack.defVillageId

                if (!priorityTargets.hasOwnProperty(vid)) {
                    priorityTargets[vid] = []
                }

                // Caso o alvo já esteja na lista de prioridades
                // cancela...
                if (priorityTargets[vid].includes(tid)) {
                    return false
                }

                priorityTargets[vid].push(tid)

                Farm.trigger('priorityTargetAdded', [{
                    id: tid,
                    name: attack.defVillageName,
                    x: attack.defVillageX,
                    y: attack.defVillageY
                }])
            })
        }

        /**
         * Analisa todos relatórios adicionados na lista de espera.
         */
        var delayedPriorityHandler = function () {
            reportQueue.forEach(function (report) {
                priorityHandler(report)
            })

            reportQueue = []
        }

        /**
         * Analisa todos relatórios de ataques causados pelo Farm.
         *
         * @param  {Object} data - Dados do relatório recebido.
         */
        var reportHandler = function (event, data) {
            if (data.type !== 'attack') {
                return false
            }

            // data.result === 1 === 'nocasualties'
            if (Farm.settings.ignoreOnLoss && data.result !== 1) {
                ignoredTargetHandler(data)
            }

            if (Farm.settings.priorityTargets && data.haul === 'full') {
                if (windowManagerService.isTemplateOpen('report')) {
                    reportQueue.push(data)
                } else {
                    priorityHandler(data)
                }
            }
        }

        /**
         * Executa handlers com delay.
         *
         * Alguns relatórios são adicionados na lista de espera
         * por que quando carregados, o relatório que o jogador
         * está visualizando no momento será substituido pelo
         * carregado.
         *
         * @param {Object} event - Dados do evento rootScope.$broadcast
         * @param {String} templateName - Nome do template da janela que
         *   foi fechado.
         */
        var delayedReportHandler = function (event, templateName) {
            if (templateName === 'report') {
                delayedPriorityHandler()
            }
        }

        rootScope.$on(eventTypeProvider.REPORT_NEW, reportHandler)
        rootScope.$on(eventTypeProvider.WINDOW_CLOSED, delayedReportHandler)
    }

    /**
     * Funções relacionadas com mensagens.
     */
    var messageListener = function () {
        /**
         * Detecta mensagens do jogador enviadas para sí mesmo, afim de iniciar
         * e pausar o farm remotamente.
         *
         * @param  {[type]} data - Dados da mensagem recebida.
         */
        var remoteHandler = function (_, data) {
            var id = Farm.settings.remoteId

            if (data.participants.length !== 1 || data.title !== id) {
                return false
            }

            var userMessage = data.message.content.trim().toLowerCase()

            switch (userMessage) {
            case 'on':
            case 'start':
            case 'init':
            case 'begin':
                disableNotifs(function () {
                    Farm.stop()
                    Farm.start()
                })

                sendMessageReply(data.message_id, genStatusReply())
                Farm.trigger('remoteCommand', ['on'])

                break
            case 'off':
            case 'stop':
            case 'pause':
            case 'end':
                disableNotifs(function () {
                    Farm.stop()
                })

                sendMessageReply(data.message_id, genStatusReply())
                Farm.trigger('remoteCommand', ['off'])

                break
            case 'status':
            case 'current':
                sendMessageReply(data.message_id, genStatusReply())
                Farm.trigger('remoteCommand', ['status'])

                break
            }

            return false
        }

        rootScope.$on(eventTypeProvider.MESSAGE_SENT, remoteHandler)
    }

    /**
     * Funções relacionadas com grupos e presets.
     */
    var groupPresetListener = function () {
        /**
         * Detecta alterações e atualiza lista de predefinições
         * configuradas no script.
         */
        var updatePresetsHandler = function () {
            updatePresets()
            Farm.trigger('presetsChange')

            if (!selectedPresets.length) {
                if (Farm.commander.running) {
                    Farm.trigger('noPreset')
                    Farm.stop()
                }
            }
        }

        /**
         * Atualiza lista de grupos configurados no script.
         * Atualiza a lista de aldeias incluidas/ignoradas com base
         * nos grupos.
         */
        var updateGroupsHandler = function () {
            updateExceptionGroups()
            updateExceptionVillages()

            Farm.trigger('groupsChanged')
        }

        /**
         * Detecta grupos que foram adicionados nas aldeias.
         * Atualiza a lista de alvos e aldeias do jogador.
         *
         * @param  {Object} data - Dados do grupo retirado/adicionado.
         */
        var updateGroupVillages = function (_, data) {
            updatePlayerVillages()

            if (!groupInclude) {
                return false
            }

            if (groupInclude.id === data.group_id) {
                villagesTargets = {}
            }
        }

        rootScope.$on(eventTypeProvider.ARMY_PRESET_UPDATE, updatePresetsHandler)
        rootScope.$on(eventTypeProvider.ARMY_PRESET_DELETED, updatePresetsHandler)
        rootScope.$on(eventTypeProvider.GROUPS_UPDATED, updateGroupsHandler)
        rootScope.$on(eventTypeProvider.GROUPS_CREATED, updateGroupsHandler)
        rootScope.$on(eventTypeProvider.GROUPS_DESTROYED, updateGroupsHandler)
        rootScope.$on(eventTypeProvider.GROUPS_VILLAGE_LINKED, updateGroupVillages)
        rootScope.$on(eventTypeProvider.GROUPS_VILLAGE_UNLINKED, updateGroupVillages)
    }

    /**
     * Detecta todos eventos importantes para o funcionamento do FarmOverflow.
     */
    var generalListeners = function () {
        /**
         * Remove aldeias da lista de espera e detecta se todas as aldeias
         * estavam na lista de espera, reiniciando o ciclo de ataques.
         *
         * @param  {Object} data - Dados do comando.
         */
        var commandBackHandler = function (_, data) {
            var vid = data.origin.id

            if (waitingVillages[vid]) {
                delete waitingVillages[vid]

                if (globalWaiting) {
                    globalWaiting = false

                    if (Farm.settings.singleCycle) {
                        return false
                    }

                    if (Farm.commander.running) {
                        selectVillage(vid)

                        setTimeout(function () {
                            Farm.commander.analyse()
                        }, 10000)
                    }
                }

                return false
            }
        }

        /**
         * Detecta quando a conexão é reestabelecida, podendo
         * reiniciar o script.
         */
        var reconnectHandler = function () {
            if (Farm.commander.running) {
                setTimeout(function () {
                    disableNotifs(function () {
                        Farm.stop()
                        Farm.start()
                    })
                }, 5000)
            }
        }

        rootScope.$on(eventTypeProvider.COMMAND_RETURNED, commandBackHandler)
        rootScope.$on(eventTypeProvider.RECONNECT, reconnectHandler)
    }

    /**
     * Cria os eventos utilizados pelo FarmOverflow.
     */
    var bindEvents = function () {
        // Lista de eventos para atualizar o último status do Farm.
        Farm.bind('sendCommand', function () {
            updateLastAttack()
            currentStatus = 'attacking'
        })

        Farm.bind('noPreset', function () {
            currentStatus = 'paused'
        })

        Farm.bind('noUnits', function () {
            currentStatus = 'noUnits'
        })

        Farm.bind('noUnitsNoCommands', function () {
            currentStatus = 'noUnitsNoCommands'
        })

        Farm.bind('start', function () {
            currentStatus = 'attacking'
        })

        Farm.bind('pause', function () {
            currentStatus = 'paused'
        })

        Farm.bind('startLoadingTargers', function () {
            currentStatus = 'loadingTargets'
        })

        Farm.bind('endLoadingTargers', function () {
            currentStatus = 'analyseTargets'
        })

        Farm.bind('commandLimitSingle', function () {
            currentStatus = 'commandLimit'
        })

        Farm.bind('commandLimitMulti', function () {
            currentStatus = 'noVillages'
        })

        Farm.bind('singleCycleEnd', function () {
            currentStatus = 'singleCycleEnd'

            if (notifsEnabled && Farm.settings.singleCycleNotifs) {
                emitNotif('error', Locale('farm', 'events.singleCycleEnd'))
            }
        })

        Farm.bind('singleCycleEndNoVillages', function () {
            currentStatus = 'singleCycleEndNoVillages'

            if (notifsEnabled && Farm.settings.singleCycleNotifs) {
                emitNotif('error', Locale('farm', 'events.singleCycleEndNoVillages'))
            }[]
        })

        Farm.bind('singleCycleNext', function () {
            currentStatus = 'singleCycleNext'

            if (notifsEnabled && Farm.settings.singleCycleNotifs) {
                var next = $timeHelper.gameTime() + Farm.cycle.getInterval()

                emitNotif('success', Locale('farm', 'events.singleCycleNext', {
                    time: formatDate(next)
                }))
            }
        })
    }

    /**
     * Atualiza o timestamp do último ataque enviado com o Farm.
     */
    var updateLastAttack = function () {
        lastAttack = $timeHelper.gameTime()
        Lockr.set('farm-lastAttack', lastAttack)
    }

    /**
     * Desativa o disparo de eventos temporariamente.
     */
    var disableEvents = function (callback) {
        eventsEnabled = false
        callback()
        eventsEnabled = true
    }

    /**
     * Desativa o disparo de eventos temporariamente.
     */
    var disableNotifs = function (callback) {
        notifsEnabled = false
        callback()
        notifsEnabled = true
    }

    /**
     * Seleciona uma aldeia específica do jogador.
     *
     * @param {Number} vid - ID da aldeia à ser selecionada.
     * @return {Boolean}
     */
    var selectVillage = function (vid) {
        var i = playerVillages.indexOf(vid)

        if (i !== -1) {
            selectedVillage = playerVillages[i]

            return true
        }

        return false
    }

    /**
     * Ativa um lista de presets na aldeia selecionada.
     *
     * @param {Array} presetIds - Lista com os IDs dos presets
     * @param {Function} callback
     */
    var assignPresets = function (presetIds, callback) {
        socketService.emit(routeProvider.ASSIGN_PRESETS, {
            village_id: selectedVillage.id,
            preset_ids: presetIds
        }, callback)
    }

    /**
     * Adiciona a aldeia especificada no grupo de aldeias ignoradas
     *
     * @param {Object} target - Dados da aldeia a ser ignorada.
     */
    var ignoreVillage = function (target) {
        if (!groupIgnore) {
            return false
        }

        socketService.emit(routeProvider.GROUPS_LINK_VILLAGE, {
            group_id: groupIgnore.id,
            village_id: target.id
        }, function () {
            Farm.trigger('ignoredVillage', [target])
        })
    }

    /**
     * Verifica se o alvo está relacionado a alguma aldeia do jogador.
     *
     * @param {Number} targetId - ID da aldeia
     */
    var targetExists = function (targetId) {
        for (var vid in villagesTargets) {
            var villageTargets = villagesTargets[vid]

            for (var i = 0; i < villageTargets.length; i++) {
                var target = villageTargets[i]

                if (target.id === targetId) {
                    return target
                }
            }
        }

        return false
    }

    /**
     * Reseta a lista de aldeias em espera.
     */
    var resetWaitingVillages = function () {
        waitingVillages = {}
    }

    /**
     * Verifica se o último ataque efetuado pelo FarmOverflow
     * já passou do tempo determinado, para que assim tente
     * reiniciar os ataques novamente.
     *
     * Isso é necessário pois o jogo não responde os .emits
     * de sockets para enviar os ataques, fazendo com que o
     * farm fique travado em estado "Iniciado".
     * Problema de conexão, talvez?
     */
    var initPersistentRunning = function () {
        setInterval(function () {
            if (Farm.commander.running) {
                var toleranceTime = PERSISTENT_TOLERANCE

                // Caso o ciclo único de ataques estejam ativo
                // aumenta a tolerância para o tempo de intervalo
                // entre os ciclos + 1 minuto para que não tenha
                // o problema de reiniciar os ataques enquanto
                // o intervalo ainda não acabou.
                if (Farm.settings.singleCycle && Farm.cycle.intervalEnabled()) {
                    toleranceTime += Farm.cycle.getInterval() + (1000 * 60)
                }

                var gameTime = $timeHelper.gameTime()
                var passedTime = gameTime - lastAttack

                if (passedTime > toleranceTime) {
                    disableNotifs(function () {
                        Farm.stop()
                        Farm.start(true /*autoInit*/)
                    })
                }
            }
        }, PERSISTENT_INTERVAL)
    }

    /**
     * Carrega os dados de um relatório.
     *
     * @param {Number} reportId - ID do relatório
     * @param {Function} callback
     */
    var getReport = function (reportId, callback) {
        socketService.emit(routeProvider.REPORT_GET, {
            id: reportId
        }, callback)
    }

    /**
     * Envia um mensagem resposta para a mensagem indicada
     *
     * @param  {Number} message_id - Identificação da mensagem.
     * @param  {String} message - Corpo da mensagem.
     */
    var sendMessageReply = function (message_id, message) {
        socketService.emit(routeProvider.MESSAGE_REPLY, {
            message_id: message_id,
            message: message
        })
    }

    /**
     * Gera uma mensagem em código bb com o status atual do FarmOverflow
     *
     * @return {String}
     */
    var genStatusReply = function () {
        var localeStatus = Locale('farm', 'events.status')
        var localeVillage = Locale('farm', 'events.selectedVillage')
        var localeLast = Locale('farm', 'events.lastAttack')

        var statusReplaces = {}

        if (currentStatus === 'singleCycleNext') {
            var next = $timeHelper.gameTime() + Farm.cycle.getInterval()

            statusReplaces.time = formatDate(next)
        }

        var farmStatus = Locale('farm', 'events.' + currentStatus, statusReplaces)
        var villageLabel = genVillageLabel(selectedVillage)
        var last = formatDate(lastAttack)
        var vid = selectedVillage.id

        var message = []

        message.push('[b]', localeStatus, ':[/b] ', farmStatus, '[br]')
        message.push('[b]', localeVillage, ':[/b] ')
        message.push('[village=', vid, ']', villageLabel, '[/village][br]')
        message.push('[b]', localeLast, ':[/b] ', last)

        return message.join('')
    }

    /**
     * Analisa se o FarmOverflow ficou ocioso por um certo periodo
     * de tempo, permitindo que alguns dados sejam resetados.
     *
     * @return {Boolean} Se os dados expiraram ou não.
     */
    var isExpiredData = function () {
        var now = $timeHelper.gameTime()

        if (Farm.settings.singleCycle && Farm.cycle.intervalEnabled()) {
            if (now > (lastActivity + Farm.cycle.getInterval() + (60 * 1000))) {
                return true
            }
        } else if (now > lastActivity + DATA_EXPIRE_TIME) {
            return true
        }

        return false
    }

    /**
     * Obtem a lista de aldeias disponíveis para atacar
     *
     * @return {Array} Lista de aldeias disponíveis.
     */
    var getFreeVillages = function () {
        return playerVillages.filter(function (village) {
            return !waitingVillages[village.id]
        })
    }

    var Farm = {}

    /**
     * Versão do script.
     *
     * @type {String}
     */
    Farm.version = '__farm_version'

    Farm.init = function () {
        Locale.create('farm', __farm_locale, 'en')

        initialized = true

        /**
         * Configurações salvas localmente
         *
         * @type {Object}
         */
        var localSettings = Lockr.get('farm-settings', {}, true)

        /**
         * Configurações do jogador + configurações padrões
         *
         * @type {Object}
         */
        Farm.settings = angular.merge({}, {
            maxDistance: 10,
            minDistance: 0,
            maxTravelTime: '01:00:00',
            randomBase: 3, // segundos
            presetName: '',
            groupIgnore: 0,
            groupInclude: 0,
            groupOnly: 0,
            minPoints: 0,
            maxPoints: 12500,
            eventsLimit: 20,
            ignoreOnLoss: true,
            priorityTargets: true,
            eventAttack: true,
            eventVillageChange: true,
            eventPriorityAdd: true,
            eventIgnoredVillage: true,
            remoteId: 'remote',
            hotkeySwitch: 'shift+z',
            hotkeyWindow: 'z',
            singleCycle: false,
            singleCycleNotifs: false,
            singleCycleInterval: '00:00:00'
        }, localSettings)

        Farm.commander = Farm.createCommander()

        lastEvents = Lockr.get('farm-lastEvents', [], true)
        lastActivity = Lockr.get('farm-lastActivity', $timeHelper.gameTime(), true)
        lastAttack = Lockr.get('farm-lastAttack', -1, true)
        targetIndexes = Lockr.get('farm-indexes', {}, true)

        $player = modelDataService.getSelectedCharacter()

        updateExceptionGroups()
        updateExceptionVillages()
        updatePlayerVillages()
        updatePresets()
        reportListener()
        messageListener()
        groupPresetListener()
        generalListeners()
        bindEvents()
        initPersistentRunning()

        // Carrega pedaços da mapa quando chamado.
        // É disparado quando o método $mapData.loadTownDataAsync
        // é executado.
        $mapData.setRequestFn(function (args) {
            socketService.emit(routeProvider.MAP_GETVILLAGES, args)
        })
    }

    /**
     * Inicia os comandos.
     *
     * @return {Boolean}
     */
    Farm.start = function (autoInit) {
        if (!selectedPresets.length) {
            if (!autoInit && notifsEnabled) {
                emitNotif('error', Locale('farm', 'events.presetFirst'))
            }

            return false
        }

        if (!selectedVillage) {
            if (!autoInit && notifsEnabled) {
                emitNotif('error', Locale('farm', 'events.noSelectedVillage'))
            }

            return false
        }

        if (isExpiredData()) {
            priorityTargets = {}
            targetIndexes = {}
        }

        if (Farm.settings.singleCycle) {
            Farm.cycle.start(autoInit)
        } else {
            initNormalCycle()
        }

        Farm.updateActivity()

        return true
    }

    /**
     * Pausa os comandos.
     *
     * @return {Boolean}
     */
    Farm.stop = function () {
        clearTimeout(Farm.commander.timeoutId)
        clearTimeout(Farm.cycle.getTimeoutId())

        Farm.commander.running = false
        Farm.trigger('pause')

        if (notifsEnabled) {
            emitNotif('success', Locale('farm', 'general.paused'))
        }

        return true
    }

    /**
     * Alterna entre iniciar e pausar o script.
     */
    Farm.switch = function () {
        if (Farm.commander.running) {
            Farm.stop()
        } else {
            Farm.start()
        }
    }

    /**
     * Atualiza o timestamp da última atividade do Farm.
     */
    Farm.updateActivity = function () {
        lastActivity = $timeHelper.gameTime()
        Lockr.set('farm-lastActivity', lastActivity)
    }

    /**
     * Atualiza as novas configurações passados pelo usuário e as fazem
     * ter efeito caso o farm esteja em funcionamento.
     *
     * @param {Object} changes - Novas configurações.
     */
    Farm.updateSettings = function (changes) {
        var modify = {}

        // Valores que precisam ser resetados/modificados quando
        // configuração x é alterada.
        var updates = {
            groupIgnore: ['groups'],
            groupInclude: ['groups', 'targets'],
            groupOnly: ['groups', 'villages', 'targets'],
            presetName: ['preset'],
            minDistance: ['targets'],
            maxDistance: ['targets'],
            minPoints: ['targets'],
            maxPoints: ['targets'],
            eventsLimit: ['events'],
            eventAttack: ['events'],
            eventVillageChange: ['events'],
            eventPriorityAdd: ['events'],
            eventIgnoredVillage: ['events'],
            singleCycle: ['villages']
        }

        for (var key in changes) {
            if (changes[key] !== Farm.settings[key]) {
                var modifyKeys = updates[key]

                if (updates.hasOwnProperty(key)) {
                    for (var i = 0; i < modifyKeys.length; i++) {
                        modify[modifyKeys[i]] = true
                    }
                }
            }

            Farm.settings[key] = changes[key]
        }

        Lockr.set('farm-settings', Farm.settings)

        // Nenhuma alteração nas configurações
        if (angular.equals(modify, {})) {
            return false
        }

        if (modify.groups) {
            updateExceptionGroups()
            updateExceptionVillages()
        }

        if (modify.villages) {
            updatePlayerVillages()
        }

        if (modify.preset) {
            updatePresets()
            resetWaitingVillages()
        }

        if (modify.targets) {
            villagesTargets = {}
        }

        if (modify.events) {
            Farm.trigger('resetEvents')
        }

        if (Farm.commander.running) {
            disableEvents(function () {
                disableNotifs(function () {
                    Farm.stop()
                    Farm.start()
                })
            })
        }

        Farm.trigger('settingsChange', [modify])
    }

    /**
     * Seleciona o próximo alvo da aldeia.
     *
     * @param [_selectOnly] Apenas seleciona o alvo sem pular para o próximo.
     */
    Farm.nextTarget = function (_selectOnly) {
        var sid = selectedVillage.id

        // Caso a lista de alvos seja resetada no meio da execução.
        if (!villagesTargets[sid]) {
            Farm.commander.analyse()

            return false
        }

        var villageTargets = villagesTargets[sid]

        if (Farm.settings.priorityTargets && priorityTargets[sid]) {
            var priorityId

            while (priorityId = priorityTargets[sid].shift()) {
                if (ignoredVillages.includes(priorityId)) {
                    continue
                }

                for (var i = 0; i < villageTargets.length; i++) {
                    if (villageTargets[i].id === priorityId) {
                        selectedTarget = villageTargets[i]
                        return true
                    }
                }
            }
        }

        var index = targetIndexes[sid]
        var changed = false

        if (!_selectOnly) {
            index = ++targetIndexes[sid]
        }

        for (; index < villageTargets.length; index++) {
            var target = villageTargets[index]

            if (ignoredVillages.includes(target.id)) {
                Farm.trigger('ignoredTarget', [target])

                continue
            }

            selectedTarget = target
            changed = true

            break
        }

        if (changed) {
            targetIndexes[sid] = index
        } else {
            selectedTarget = villageTargets[0]
            targetIndexes[sid] = 0
        }

        Lockr.set('farm-indexes', targetIndexes)

        return true
    }

    /**
     * Verifica se a aldeia selecionada possui alvos e se tiver, atualiza
     * o objecto do alvo e o índice.
     */
    Farm.hasTarget = function () {
        var sid = selectedVillage.id
        var index = targetIndexes[sid]
        var targets = villagesTargets[sid]

        if (!targets.length) {
            return false
        }

        // Verifica se os indices não foram resetados por ociosidade do
        // FarmOverflow.
        // Ou se o índice selecionado possui alvo.
        // Pode acontecer quando o numero de alvos é reduzido em um
        // momento em que o Farm não esteja ativado.
        if (index === undefined || index > targets.length) {
            targetIndexes[sid] = index = 0
        }

        return !!targets[index]
    }

    /**
     * Obtem a lista de alvos para a aldeia selecionada.
     */
    Farm.getTargets = function (callback) {
        var coords = selectedVillage.position
        var sid = selectedVillage.id

        if (sid in villagesTargets) {
            return callback()
        }

        var filteredTargets = []

        // Carregando 25 campos a mais para preencher alguns setores
        // que não são carregados quando a aldeia se encontra na borda.
        var chunk = $conf.MAP_CHUNK_SIZE
        var x = coords.x - chunk
        var y = coords.y - chunk
        var w = chunk * 2
        var h = chunk * 2

        var load = function () {
            var loaded = $mapData.hasTownDataInChunk(x, y)

            if (loaded) {
                loop()
            } else {
                Farm.trigger('startLoadingTargers')

                var loads = $convert.scaledGridCoordinates(x, y, w, h, chunk)
                var length = loads.length
                var index = 0

                $mapData.loadTownDataAsync(x, y, w, h, function () {
                    if (++index === length) {
                        Farm.trigger('endLoadingTargers')

                        loop()
                    }
                })
            }

            return
        }

        var loop = function () {
            var sectors = $mapData.loadTownData(x, y, w, h, chunk)
            var i = sectors.length

            while (i--) {
                var sector = sectors[i]
                var sectorDataX = sector.data

                for (var sx in sectorDataX) {
                    var sectorDataY = sectorDataX[sx]

                    for (var sy in sectorDataY) {
                        var village = sectorDataY[sy]
                        var pass = filter(village)

                        if (pass) {
                            filteredTargets.push(pass)
                        }
                    }
                }
            }

            done()
        }

        var filter = function (target) {
            var pass = mapFilters.every(function (fn) {
                return !fn(target)
            })

            if (!pass) {
                return false
            }

            return {
                x: target.x,
                y: target.y,
                distance: $math.actualDistance(coords, target),
                id: target.id,
                name: target.name,
                pid: target.character_id
            }
        }

        var done = function () {
            if (filteredTargets.length === 0) {
                var hasVillages = Farm.nextVillage()

                if (hasVillages) {
                    Farm.getTargets(callback)
                } else {
                    Farm.trigger('noTargets')
                }

                return false
            }

            villagesTargets[sid] = filteredTargets.sort(function (a, b) {
                return a.distance - b.distance
            })

            if (targetIndexes.hasOwnProperty(sid)) {
                if (targetIndexes[sid] > villagesTargets[sid].length) {
                    targetIndexes[sid] = 0

                    Lockr.set('farm-indexes', targetIndexes)
                }
            } else {
                targetIndexes[sid] = 0

                Lockr.set('farm-indexes', targetIndexes)
            }

            callback()
        }

        return load()
    }

    var initNormalCycle = function () {
        Farm.commander = Farm.createCommander()
        Farm.commander.running = true

        Farm.trigger('start')

        if (notifsEnabled) {
            emitNotif('success', Locale('farm', 'general.started'))
        }

        if (getFreeVillages().length === 0) {
            if (singleVillage) {
                Farm.trigger('noUnits')
            } else {
                Farm.trigger('noVillages')
            }

            return
        }

        leftVillages = getFreeVillages()

        Farm.commander.analyse()
    }

    /**
     * Seleciona a próxima aldeia do jogador.
     *
     * @return {Boolean} Indica se houve troca de aldeia.
     */
    Farm.nextVillage = function () {
        if (singleVillage) {
            return false
        }

        if (Farm.settings.singleCycle) {
            return Farm.cycle.nextVillage()
        }

        var next = leftVillages.shift()

        if (next) {
            var availVillage = getFreeVillages().some(function (freeVillage) {
                return freeVillage.id === next.id
            })

            if (availVillage) {
                selectedVillage = next
                Farm.trigger('nextVillage', [selectedVillage])
                Farm.updateActivity()

                return true
            } else {
                return Farm.nextVillage()
            }
        } else {
            leftVillages = getFreeVillages()

            if (leftVillages.length) {
                return Farm.nextVillage()
            }

            if (singleVillage) {
                Farm.trigger('noUnits')
            } else {
                Farm.trigger('noVillages')
            }

            return false
        }
    }

    /**
     * Registra um evento.
     *
     * @param {String} event - Nome do evento.
     * @param {Function} handler - Função chamada quando o evento for disparado.
     */
    Farm.bind = function (event, handler) {
        if (!eventListeners.hasOwnProperty(event)) {
            eventListeners[event] = []
        }

        eventListeners[event].push(handler)
    }

    /**
     * Chama os eventos.
     *
     * @param {String} event - Nome do evento.
     * @param {Array} args - Argumentos que serão passados no callback.
     */
    Farm.trigger = function (event, args) {
        if (!eventsEnabled) {
            return
        }

        if (eventListeners.hasOwnProperty(event)) {
            eventListeners[event].forEach(function (handler) {
                handler.apply(Farm, args)
            })
        }
    }

    /**
     * Verifica se aldeia tem os presets necessários ativados na aldeia
     * e ativa os que faltarem.
     *
     * @param {Array} presetIds - Lista com os IDs dos presets
     * @param {Function} callback
     */
    Farm.checkPresets = function (callback) {
        if (!selectedPresets.length) {
            Farm.stop()
            Farm.trigger('noPreset')

            return false
        }

        var vid = selectedVillage.id
        var villagePresets = modelDataService.getPresetList().getPresetsByVillageId(vid)
        var needAssign = false
        var which = []

        selectedPresets.forEach(function (preset) {
            if (!villagePresets.hasOwnProperty(preset.id)) {
                needAssign = true
                which.push(preset.id)
            }
        })

        if (needAssign) {
            for (var id in villagePresets) {
                which.push(id)
            }

            assignPresets(which, callback)
        } else {
            callback()
        }
    }

    /**
     * Verifica se a aldeia atualmente selecionada tem os alvos carregados.
     *
     * @return {Boolean}
     */
    Farm.targetsLoaded = function () {
        return villagesTargets.hasOwnProperty(selectedVillage.id)
    }

    /**
     * Verifica se há alguma aldeia selecionada pelo FarmOverflow.
     *
     * @return {Boolean}
     */
    Farm.hasVillage = function () {
        return !!selectedVillage
    }

    /**
     * Verifica se a aldeia atualmente selecionada está em modo de espera.
     *
     * @return {Boolean}
     */
    Farm.isWaiting = function () {
        return waitingVillages.hasOwnProperty(selectedVillage.id)
    }

    /**
     * Verifica se a aldeia atualmente selecionada está ignorada.
     *
     * @return {Boolean}
     */
    Farm.isIgnored = function () {
        return ignoredVillages.includes(selectedVillage.id)
    }

    /**
     * Verifica se todas aldeias estão em modo de espera.
     *
     * @return {Boolean}
     */
    Farm.isAllWaiting = function () {
        for (var i = 0; i < playerVillages.length; i++) {
            var vid = playerVillages[i].id

            if (!waitingVillages.hasOwnProperty(vid)) {
                return false
            }
        }

        return true
    }

    /**
     * Atualiza o último status do FarmOverflow.
     *
     * @param {String} newLastEvents - Novo status
     */
    Farm.setLastEvents = function (newLastEvents) {
        lastEvents = newLastEvents

        updateLastEvents()
    }

    /**
     * Obtem o último status do FarmOverflow.
     *
     * @return {String}
     */
    Farm.getLastEvents = function () {
        return lastEvents
    }

    /**
     * Obtem a aldeia atualmente selecionada.
     *
     * @return {Object}
     */
    Farm.getSelectedVillage = function () {
        return selectedVillage
    }

    /**
     * Retorna se há apenas uma aldeia sendo utilizada pelo FarmOverflow.
     *
     * @return {Boolean}
     */
    Farm.isSingleVillage = function () {
        return singleVillage
    }

    /**
     * Obtem o alvo atualmente selecionado pelo FarmOverflow.
     *
     * @return {Object}
     */
    Farm.getSelectedTarget = function () {
        return selectedTarget
    }

    /**
     * Retorna se as notificações do FarmOverflow estão ativadas.
     *
     * @return {Boolean}
     */
    Farm.isNotifsEnabled = function () {
        return notifsEnabled
    }

    /**
     * Obtem o preset atualmente selecionado pelo FarmOverflow.
     *
     * @return {Array} Lista de presets que possuem a mesma identificação.
     */
    Farm.getSelectedPresets = function () {
        return selectedPresets
    }

    /**
     * Coloca uma aldeia em modo de espera.
     *
     * @param {Number} id - ID da aldeia.
     */
    Farm.setWaitingVillages = function (id) {
        waitingVillages[id] = true
    }

    /**
     * Obtem a lista de aldeias em modo de espera
     *
     * @return {Array}
     */
    Farm.getWaitingVillages = function () {
        return waitingVillages
    }

    /**
     * Coloca o FarmOverflow em modo de espera global, ou seja, todas aldeias
     * estão em modo de espera.
     */
    Farm.setGlobalWaiting = function () {
        globalWaiting = true
    }

    /**
     * Retorna se o FarmOverflow está em modo de espera global
     * (todas aldeias em modo de espera).
     *
     * @return {Boolean}
     */
    Farm.getGlobalWaiting = function () {
        return globalWaiting
    }

    /**
     * Obtem o último erro ocorrido no FarmOveflow.
     *
     * @return {String}
     */
    Farm.getLastError = function () {
        return lastError
    }

    /**
     * Altera a string do último erro ocorrigo no FarmOverflow.
     *
     * @param {String} error
     */
    Farm.setLastError = function (error) {
        lastError = error
    }

    /**
     * Retorna se o FarmOverflow já foi inicializado.
     *
     * @return {Boolean}
     */
    Farm.isInitialized = function () {
        return initialized
    }

    /**
     * Obtem o timestamp do último ataque realizado pelo FarmOverflow.
     *
     * @return {Number} Timestamp do último ataque.
     */
    Farm.getLastAttack = function () {
        return lastAttack
    }

    /**
     * Cria um novo controlador de comandos para o FarmOverflow.
     *
     * @return {Commander}
     */
    Farm.createCommander = function () {
        var Commander = require('TWOverflow/Farm/Commander')

        return new Commander()
    }

    /**
     * Altera a aldeia atualmente selecionada pelo FarmOverflow
     *
     * @param {Object} village - Aldeia a ser selecionada.
     */
    Farm.setSelectedVillage = function (village) {
        selectedVillage = village
    }

    // Funções públicas
    Farm.getFreeVillages = getFreeVillages
    Farm.disableNotifs = disableNotifs

    return Farm
})
